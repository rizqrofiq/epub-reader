import { tool, jsonSchema, type ToolSet } from "ai";
import { createClient } from "@/lib/supabase/server";
import { decryptKey } from "@/lib/ai/crypto";
import { getProviderMeta, isProviderId } from "@/lib/ai/provider";
import type { BookSource } from "@/lib/ai/provider";
import { streamAnswer } from "@/lib/ai/stream";
import { summarizeHistory } from "@/lib/ai/summary";
import { isBookIndexed, searchBookChunks, type BookPassage } from "@/lib/rag/server";

function snippet(text: string): string {
  return text.length > 160 ? text.slice(0, 160) + "…" : text;
}
// How many recent turns to always include verbatim. Older turns are replaced
// by the harness summary.
const RECENT_TURNS = 20;

type Mode = "explain" | "factcheck" | "ask";

interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

interface AskBody {
  mode?: Mode;
  selectedText?: string;
  question?: string;
  bookTitle?: string;
  chapterLabel?: string;
  // Session context
  sessionId?: string;
  bookId?: string;
  history?: HistoryMessage[];
  contextSummary?: string | null;
  // User-controlled web-search toggle (fact-check always searches regardless).
  webSearch?: boolean;
}

function buildSystem(
  body: AskBody,
  webSearch: boolean,
  hasBook: boolean,
): string {
  const where = [
    body.bookTitle ? `the book "${body.bookTitle}"` : "a book",
    body.chapterLabel ? `(${body.chapterLabel})` : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Make the answer's behavior match the web-search toggle, so the grounding
  // badge ("Searched the web" vs "model's own knowledge") is truthful: when on,
  // push the model to actually search; when off, forbid pretending it did.
  const webRule = webSearch
    ? `Web search is ON: actively search the web to verify factual claims, dates, names and anything that may be current, and cite the sources you used. Prefer searching over answering from memory for factual questions.`
    : `Web search is OFF: answer only from your own knowledge and the provided context. Do not claim or imply that you searched the web, and do not invent sources.`;

  const bookRule = hasBook
    ? ` The book the user is reading is searchable: for any question about the book, call the search_book tool to find relevant passages and ground your answer in the book's real content before relying on general knowledge.`
    : "";

  return (
    `You are a reading companion embedded in an e-reader. ` +
    `The user is reading ${where}. ` +
    `Be concise and clear. Do not pad with preamble — answer directly. ${webRule}${bookRule} ` +
    `Format your answer in Markdown: use **bold** for emphasis, bullet or numbered lists for multiple points, ` +
    `and short headings only when they genuinely help. Keep it tight — prefer prose for short answers. ` +
    `For any math, use LaTeX delimited by $…$ for inline and $$…$$ for display equations (e.g. $L = kY - hi$).`
  );
}

function buildUserMessage(
  body: AskBody,
  allowWeb: boolean,
): {
  text: string; // full prompt sent to Claude (may include passage context)
  displayText: string; // clean label shown in chat UI and stored in DB
  webSearch: boolean;
  effort: "low" | "medium" | "high";
} {
  const passage = body.selectedText
    ? `Highlighted passage:\n"""\n${body.selectedText.slice(0, 6000)}\n"""\n\n`
    : "";

  // Web search is opt-in via the UI toggle (fact-check wants it by default), but
  // only when the provider actually supports it — otherwise we'd tell the model
  // to search with no tool wired up, which yields an empty response.
  const wantsWeb = !!body.webSearch && allowWeb;

  if (body.mode === "factcheck") {
    return {
      text: `${passage}Fact-check the claims in this passage. ${allowWeb ? "Search the web to verify, and cite sources for anything you confirm or refute. " : ""}Note clearly what is accurate, what is wrong, and what is uncertain.`,
      displayText: body.selectedText
        ? `Fact-check: "${body.selectedText.slice(0, 80)}..."`
        : "Fact-check this passage",
      webSearch: allowWeb,
      effort: "high",
    };
  }
  if (body.mode === "explain") {
    return {
      text: `${passage}Explain this passage clearly — what it means and why it matters. Use plain language.`,
      displayText: body.selectedText
        ? `Explain: "${body.selectedText.slice(0, 80)}..."`
        : "Explain this passage",
      webSearch: wantsWeb,
      effort: "medium",
    };
  }
  // "ask" mode — free-form question. The highlighted passage (if any) is pinned
  // background context, NOT the subject. Earlier this prepended the passage
  // before the question, which made the model re-explain the passage instead of
  // answering follow-ups — so we frame it explicitly as optional reference.
  const question = body.question || "Explain this.";
  const context = body.selectedText
    ? `For context, the user has this passage pinned from their book:\n"""\n${body.selectedText.slice(0, 6000)}\n"""\n\n` +
      `Answer the question below directly and conversationally. Only use the passage if it's relevant, and don't restate or summarize it unless asked.\n\n`
    : "";
  return {
    text: `${context}Question: ${question}`,
    displayText: question,
    webSearch: wantsWeb,
    effort: "high",
  };
}

/** Build the messages array for Claude, injecting the harness summary when
 *  the history exceeds RECENT_TURNS. */
function buildMessages(
  history: HistoryMessage[],
  newUserMsg: string,
  contextSummary: string | null | undefined,
): { role: "user" | "assistant"; content: string }[] {
  const recent = history.slice(-RECENT_TURNS);
  const hasOlderHistory = history.length > RECENT_TURNS;

  const messages: { role: "user" | "assistant"; content: string }[] = [];

  // Inject the harness summary as a synthetic exchange at the top
  if (hasOlderHistory && contextSummary) {
    messages.push({
      role: "user",
      content: `[Earlier conversation summary]\n${contextSummary}`,
    });
    messages.push({
      role: "assistant",
      content: "Understood. I'll keep that context in mind.",
    });
  }

  messages.push(...recent);
  messages.push({ role: "user", content: newUserMsg });

  return messages;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
    });
  }

  const body = (await request.json().catch(() => ({}))) as AskBody;
  if (!body.selectedText && body.mode !== "ask") {
    return new Response(JSON.stringify({ error: "No text provided" }), {
      status: 400,
    });
  }

  // Use the user's explicitly-active credential; fall back to the most-recently
  // updated one (also covers older DBs without the is_active column).
  const credSelect = "provider, encrypted_key, model, base_url";
  const active = await supabase
    .from("ai_credentials")
    .select(credSelect)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  let cred = active.data;
  if (!cred) {
    const recent = await supabase
      .from("ai_credentials")
      .select(credSelect)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    cred = recent.data;
  }

  if (!cred) {
    return new Response(
      JSON.stringify({ error: "No AI provider configured" }),
      { status: 412 },
    );
  }

  let apiKey: string;
  try {
    apiKey = await decryptKey(cred.encrypted_key);
  } catch {
    return new Response(
      JSON.stringify({ error: "Failed to decrypt API key" }),
      { status: 500 },
    );
  }

  if (!isProviderId(cred.provider)) {
    return new Response(
      JSON.stringify({ error: `Unsupported provider: ${cred.provider}` }),
      { status: 412 },
    );
  }
  const providerId = cred.provider;
  const providerMeta = getProviderMeta(providerId);
  const model = cred.model || providerMeta?.defaultModel;
  if (!model) {
    return new Response(
      JSON.stringify({ error: "No model configured for this provider" }),
      { status: 412 },
    );
  }
  const allowWeb = providerMeta?.supportsWebSearch ?? false;
  const { text: userMsgText, webSearch, effort } = buildUserMessage(
    body,
    allowWeb,
  );

  // ── RAG: expose the book as a search_book tool the model calls on demand ────
  // Resolve which book this turn is about (explicit, or via the session).
  let bookId = body.bookId ?? null;
  if (!bookId && body.sessionId) {
    const { data: s } = await supabase
      .from("ai_chat_sessions")
      .select("book_id")
      .eq("id", body.sessionId)
      .eq("user_id", user.id)
      .maybeSingle();
    bookId = s?.book_id ?? null;
  }

  // Passages the model retrieves via the tool — collected for the UI + badge.
  const collectedBookSources: BookSource[] = [];
  let bookTool: ToolSet | undefined;
  const hasBook = await isBookIndexed(supabase, user.id, bookId);
  if (hasBook && bookId) {
    const theBookId = bookId;
    bookTool = {
      search_book: tool({
        description:
          "Search the full text of the book the user is currently reading and " +
          "return the most relevant passages. Use it for any question about the " +
          "book to ground your answer in its actual content before relying on " +
          "general knowledge. Pass CONCISE KEYWORDS (names, terms, numbers) — " +
          "not a full sentence. If nothing relevant comes back, retry with " +
          "simpler or alternative keywords before concluding the book doesn't " +
          "cover it.",
        inputSchema: jsonSchema<{ query: string }>({
          type: "object",
          properties: {
            query: {
              type: "string",
              description:
                "Concise search keywords, e.g. 'komisaris utama' — not a full question.",
            },
          },
          required: ["query"],
          additionalProperties: false,
        }),
        execute: async ({ query }) => {
          let passages: BookPassage[];
          try {
            passages = await searchBookChunks(
              supabase,
              user.id,
              theBookId,
              query,
            );
          } catch {
            return (
              "Book search is unavailable right now (the search index may not be " +
              "set up). Tell the user book search isn't working rather than " +
              "claiming the book doesn't contain this information."
            );
          }
          for (const p of passages) {
            const snip = snippet(p.content);
            if (
              !collectedBookSources.some(
                (s) => s.chapter === p.chapter && s.snippet === snip,
              )
            ) {
              collectedBookSources.push({
                chapter: p.chapter,
                cfi: p.cfi,
                snippet: snip,
              });
            }
          }
          if (!passages.length) return "No matching passages found in the book.";
          return passages
            .map((p, i) => `[${i + 1}] (${p.chapter}) ${p.content}`)
            .join("\n\n");
        },
      }),
    };
  }

  const system = buildSystem(body, webSearch, hasBook);

  // ── Harness: summarise old turns before building the message array ─────────
  const history: HistoryMessage[] = body.history ?? [];
  let contextSummary = body.contextSummary ?? null;
  const needsSummary = history.length > RECENT_TURNS;

  if (needsSummary) {
    const oldTurns = history.slice(0, history.length - RECENT_TURNS);
    try {
      contextSummary = await summarizeHistory({
        providerId,
        apiKey,
        baseUrl: cred.base_url || undefined,
        model,
        oldTurns,
        existingSummary: contextSummary,
      });
      // Persist the updated summary back to the session
      if (body.sessionId) {
        await supabase
          .from("ai_chat_sessions")
          .update({ context_summary: contextSummary })
          .eq("id", body.sessionId)
          .eq("user_id", user.id);
      }
    } catch {
      // Non-fatal — fall back to sending only recent turns
    }
  }

  const messages = buildMessages(history, userMsgText, contextSummary);

  const encoder = new TextEncoder();
  let assistantCitations: { url: string; title: string }[] = [];
  // Whether a provider-executed WEB search ran this turn (excludes search_book).
  let searchedWeb = false;

  const stream = new ReadableStream({
    async start(controller) {
      const ping = () => controller.enqueue(encoder.encode(": ping\n\n"));
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      // Flush HTTP headers immediately (avoids "pending" in browser).
      ping();

      try {
        for await (const ev of streamAnswer(
          {
            providerId,
            apiKey,
            baseUrl: cred.base_url || undefined,
            model,
            system,
            messages,
            webSearch,
            effort,
          },
          bookTool,
        )) {
          if (ev.type === "thinking") {
            ping(); // keep-alive during thinking phase
          } else if (ev.type === "text") {
            send(ev);
          } else if (ev.type === "tool") {
            // search_book is our book lookup; anything else is a web search.
            if (ev.name !== "search_book") {
              searchedWeb = true;
              send(ev); // lets the UI show "Searching the web…" live
            }
          } else if (ev.type === "citations") {
            assistantCitations = ev.citations;
            send(ev);
          } else if (ev.type === "done") {
            // Emit how this answer was grounded just before closing it out.
            // Citations imply a web search ran even without a tool-call event.
            const usedWeb = searchedWeb || assistantCitations.length > 0;
            const usedBook = collectedBookSources.length > 0;
            const kind = usedWeb
              ? "web"
              : usedBook
                ? "book"
                : body.selectedText
                  ? "passage"
                  : "model";
            if (usedBook)
              send({ type: "bookSources", sources: collectedBookSources });
            send({
              type: "grounding",
              kind,
              sources: kind === "book"
                ? collectedBookSources.length
                : assistantCitations.length,
            });
            send(ev);
          } else {
            send(ev);
          }
        }
      } catch (err) {
        send({
          type: "error",
          error: err instanceof Error ? err.message : "AI request failed",
        });
      } finally {
        // Persistence of both turns happens in an after() callback (registered
        // below) rather than here — doing DB writes inside the streaming
        // response gets them dropped on Cloudflare Workers once the stream ends.
        // Emit updated summary so the client can cache it.
        try {
          if (needsSummary && contextSummary) {
            send({ type: "summary", contextSummary });
          }
        } catch {
          // controller may already be closed/errored
        }
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  // Note: chat turns are persisted by the client over normal POST requests to
  // /api/ai/sessions/[id]/messages — NOT here. Writing inside this streaming
  // response dropped the messages on Cloudflare Workers once the stream closed.

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

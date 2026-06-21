import { createClient } from "@/lib/supabase/server";
import { decryptKey } from "@/lib/ai/crypto";
import { getProvider, PROVIDERS } from "@/lib/ai/provider";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

// Persists the user's turn and auto-titles the session. Awaited inside the
// stream so the write completes within the request lifecycle (Cloudflare
// Workers drop un-awaited promises once the response ends).
async function persistUserTurn(
  supabase: SupabaseClient,
  sessionId: string,
  userDisplayText: string,
): Promise<void> {
  const { error } = await supabase.from("ai_chat_messages").insert({
    session_id: sessionId,
    role: "user",
    content: userDisplayText,
  });
  if (error) {
    throw new Error(`user message insert: ${error.message} (${error.code})`);
  }
  const { data: session } = await supabase
    .from("ai_chat_sessions")
    .select("title")
    .eq("id", sessionId)
    .single();
  await supabase
    .from("ai_chat_sessions")
    .update({
      ...(session?.title === "New chat"
        ? { title: userDisplayText.slice(0, 60) }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);
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
  history?: HistoryMessage[];
  contextSummary?: string | null;
}

function buildSystem(body: AskBody): string {
  const where = [
    body.bookTitle ? `the book "${body.bookTitle}"` : "a book",
    body.chapterLabel ? `(${body.chapterLabel})` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    `You are a reading companion embedded in an e-reader. ` +
    `The user is reading ${where}. ` +
    `Be concise and clear. When you use web search, cite your sources. Do not pad with preamble — answer directly. ` +
    `Do not use markdown syntax (no **, no ##, no backticks, no bullet dashes) — write in plain prose only.`
  );
}

function buildUserMessage(body: AskBody): {
  text: string; // full prompt sent to Claude (may include passage context)
  displayText: string; // clean label shown in chat UI and stored in DB
  webSearch: boolean;
  effort: "low" | "medium" | "high";
} {
  const passage = body.selectedText
    ? `Highlighted passage:\n"""\n${body.selectedText.slice(0, 6000)}\n"""\n\n`
    : "";

  if (body.mode === "factcheck") {
    return {
      text: `${passage}Fact-check the claims in this passage. Search the web to verify, and cite sources for anything you confirm or refute. Note clearly what is accurate, what is wrong, and what is uncertain.`,
      displayText: body.selectedText
        ? `Fact-check: "${body.selectedText.slice(0, 80)}..."`
        : "Fact-check this passage",
      webSearch: true,
      effort: "high",
    };
  }
  if (body.mode === "explain") {
    return {
      text: `${passage}Explain this passage clearly — what it means and why it matters. Use plain language.`,
      displayText: body.selectedText
        ? `Explain: "${body.selectedText.slice(0, 80)}..."`
        : "Explain this passage",
      webSearch: false,
      effort: "medium",
    };
  }
  // "ask" mode — free-form question
  const question = body.question || "Explain this.";
  return {
    text: `${passage}${question}`,
    displayText: question,
    webSearch: true,
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

/** Generate a summary of old turns using a fast, cheap model call.
 *  This is the "harness" — it compresses history > RECENT_TURNS into a
 *  paragraph so the full conversation context is never lost. */
async function generateSummary(
  apiKey: string,
  baseUrl: string | undefined,
  oldTurns: HistoryMessage[],
  existingSummary: string | null | undefined,
): Promise<string> {
  const client = new Anthropic({
    apiKey,
    ...(baseUrl ? { baseURL: baseUrl } : {}),
  });

  const prior = existingSummary
    ? `Previous summary:\n${existingSummary}\n\n`
    : "";

  const turns = oldTurns
    .map((m) => `${m.role === "user" ? "User" : "AI"}: ${m.content}`)
    .join("\n\n");

  const msg = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content:
          `${prior}Summarize the following conversation turns into 2-4 concise paragraphs. ` +
          `Preserve key questions, passages discussed, and conclusions. ` +
          `Write in third-person ("the user asked…", "the AI explained…").\n\n` +
          turns,
      },
    ],
  });

  return msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");
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

  // Load the user's most-recently-updated AI credential.
  const { data: cred } = await supabase
    .from("ai_credentials")
    .select("provider, encrypted_key, model, base_url")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

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

  const providerMeta = PROVIDERS.find((p) => p.id === cred.provider);
  const model = cred.model || providerMeta?.defaultModel || "claude-opus-4-5";
  const system = buildSystem(body);
  const {
    text: userMsgText,
    displayText: userDisplayText,
    webSearch,
    effort,
  } = buildUserMessage(body);

  // ── Harness: summarise old turns before building the message array ─────────
  const history: HistoryMessage[] = body.history ?? [];
  let contextSummary = body.contextSummary ?? null;
  const needsSummary = history.length > RECENT_TURNS;

  if (needsSummary && cred.provider === "anthropic") {
    const oldTurns = history.slice(0, history.length - RECENT_TURNS);
    try {
      contextSummary = await generateSummary(
        apiKey,
        cred.base_url || undefined,
        oldTurns,
        contextSummary,
      );
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

  // Persist the user's turn concurrently with streaming. We hold the promise
  // and await it in the stream's finally so the write isn't dropped on Workers.
  const sessionId = body.sessionId;
  // Resolves to an error string if the write failed, else null. We surface it
  // as a non-fatal `warn` event so the real cause is visible in the console.
  const userPersist: Promise<string | null> = sessionId
    ? persistUserTurn(supabase, sessionId, userDisplayText).then(
        () => null,
        (e) => (e instanceof Error ? e.message : String(e)),
      )
    : Promise.resolve(null);

  const provider = await getProvider(cred.provider);
  const encoder = new TextEncoder();
  let assistantText = "";
  let assistantCitations: unknown[] = [];

  const stream = new ReadableStream({
    async start(controller) {
      const ping = () => controller.enqueue(encoder.encode(": ping\n\n"));
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      // Flush HTTP headers immediately (avoids "pending" in browser).
      ping();

      console.log(apiKey, cred.base_url);

      try {
        for await (const ev of provider.streamAnswer({
          apiKey,
          baseUrl: cred.base_url || undefined,
          model,
          system,
          messages,
          webSearch,
          effort,
        })) {
          if (ev.type === "thinking") {
            ping(); // keep-alive during thinking phase
          } else if (ev.type === "text") {
            assistantText += ev.text;
            send(ev);
          } else if (ev.type === "citations") {
            assistantCitations = ev.citations;
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
        // Persist BOTH turns before closing the response. On Cloudflare Workers
        // anything not awaited within the request lifecycle is dropped once the
        // response ends — which is why reopened sessions had no messages.
        try {
          const userErr = await userPersist;
          let asstErr: string | null = null;
          if (sessionId && assistantText) {
            const { error } = await supabase.from("ai_chat_messages").insert({
              session_id: sessionId,
              role: "assistant",
              content: assistantText,
              citations: assistantCitations,
            });
            if (error)
              asstErr = `assistant message insert: ${error.message} (${error.code})`;
          }
          const persistErr = userErr || asstErr;
          if (persistErr) {
            try {
              send({
                type: "warn",
                warn: `Persistence failed — ${persistErr}`,
              });
            } catch {
              // controller may already be closed
            }
          }
        } catch (e) {
          // non-fatal — don't fail the response on a persistence error
          try {
            send({
              type: "warn",
              warn: `Persistence failed — ${e instanceof Error ? e.message : String(e)}`,
            });
          } catch {
            // controller may already be closed
          }
        }
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

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

import OpenAI from "openai";
import type { AIProvider, Citation } from "@/lib/ai/provider";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractCitations(response: any): Citation[] {
  const out: Citation[] = [];
  const seen = new Set<string>();
  for (const item of response?.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type !== "output_text") continue;
      for (const ann of content.annotations ?? []) {
        if (ann?.type === "url_citation" && ann.url && !seen.has(ann.url)) {
          seen.add(ann.url);
          out.push({ url: ann.url, title: ann.title || ann.url });
        }
      }
    }
  }
  return out;
}

// OpenAI's model list includes embeddings, TTS, image, moderation, etc. Keep
// the chat-capable families. Third-party gateways (OpenRouter) return their own
// ids, so don't over-filter — keep anything that isn't an obvious non-chat type.
function isChatModel(id: string): boolean {
  const lower = id.toLowerCase();
  const exclude = [
    "embedding",
    "whisper",
    "tts",
    "audio",
    "dall-e",
    "image",
    "moderation",
    "realtime",
    "transcribe",
    "search",
    "rerank",
  ];
  return !exclude.some((x) => lower.includes(x));
}

export const openaiProvider: AIProvider = {
  async listModels({ apiKey, baseUrl }) {
    const client = new OpenAI({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    });
    const res = await client.models.list();
    const out: { id: string; label: string }[] = [];
    for (const m of res.data) {
      if (isChatModel(m.id)) out.push({ id: m.id, label: m.id });
    }
    out.sort((a, b) => a.id.localeCompare(b.id));
    return out;
  },

  async *streamAnswer({ apiKey, baseUrl, model, system, messages, webSearch }) {
    const client = new OpenAI({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    });

    try {
      const stream = await client.responses.create({
        model,
        instructions: system,
        input: messages.map((m) => ({ role: m.role, content: m.content })),
        // OpenAI's native web search (Responses API). If a model rejects
        // "web_search", it may need "web_search_preview".
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: webSearch ? ([{ type: "web_search" }] as any) : [],
        stream: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for await (const event of stream as any) {
        if (event.type === "response.output_text.delta") {
          yield { type: "text", text: event.delta };
        } else if (event.type === "response.completed") {
          const citations = extractCitations(event.response);
          if (citations.length) yield { type: "citations", citations };
        }
      }

      yield { type: "done" };
    } catch (err) {
      const message =
        err instanceof OpenAI.APIError
          ? `${err.status ?? ""} ${err.message}`.trim()
          : err instanceof Error
            ? err.message
            : "AI request failed";
      yield { type: "error", error: message };
    }
  },
};

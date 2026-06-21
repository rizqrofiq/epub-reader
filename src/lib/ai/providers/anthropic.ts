import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, Citation } from "@/lib/ai/provider";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractCitations(message: any): Citation[] {
  const out: Citation[] = [];
  const seen = new Set<string>();
  for (const block of message?.content ?? []) {
    if (block.type !== "text" || !Array.isArray(block.citations)) continue;
    for (const c of block.citations) {
      if (c?.type === "web_search_result_location" && c.url && !seen.has(c.url)) {
        seen.add(c.url);
        out.push({ url: c.url, title: c.title || c.url });
      }
    }
  }
  return out;
}

export const anthropicProvider: AIProvider = {
  async listModels({ apiKey, baseUrl }) {
    const client = new Anthropic({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    });
    const out: { id: string; label: string }[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const m of client.models.list() as any) {
      out.push({ id: m.id, label: m.display_name || m.id });
    }
    return out;
  },

  async *streamAnswer({
    apiKey,
    baseUrl,
    model,
    system,
    messages,
    webSearch,
    effort,
  }) {
    const client = new Anthropic({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    });

    try {
      const stream = client.messages.stream({
        model,
        max_tokens: 8000,
        thinking: { type: "adaptive" },
        ...(effort ? { output_config: { effort } } : {}),
        system,
        messages,
        // Native server-side web search — runs on Anthropic's side and returns
        // results with citations woven into the text blocks.
        tools: webSearch
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ([{ type: "web_search_20260209", name: "web_search" }] as any)
          : [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "thinking_delta"
        ) {
          // Signal to the route that thinking is in progress so it can send
          // SSE keep-alive pings (stops the browser showing the request as pending).
          yield { type: "thinking" };
        } else if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield { type: "text", text: event.delta.text };
        }
      }

      const final = await stream.finalMessage();
      const citations = extractCitations(final);
      if (citations.length) yield { type: "citations", citations };
      yield { type: "done" };
    } catch (err) {
      const message =
        err instanceof Anthropic.APIError
          ? `${err.status ?? ""} ${err.message}`.trim()
          : err instanceof Error
            ? err.message
            : "AI request failed";
      yield { type: "error", error: message };
    }
  },
};

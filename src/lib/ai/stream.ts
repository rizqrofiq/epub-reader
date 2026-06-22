// One streaming implementation for every provider. The Vercel AI SDK normalises
// each provider's wire format into a single `fullStream` of typed parts, so this
// file never branches on provider — it just translates SDK parts into our SSE
// `AIStreamEvent` contract.

import { streamText, stepCountIs, type ModelMessage, type ToolSet } from "ai";
import { buildRuntime } from "./registry";
import type { AskParams, AIStreamEvent, Citation } from "./provider";

const MAX_OUTPUT_TOKENS = 8000;
const MAX_STEPS = 5;

export async function* streamAnswer(
  params: AskParams,
  extraTools?: ToolSet,
): AsyncGenerator<AIStreamEvent> {
  const { providerId, apiKey, baseUrl, model, system, messages, webSearch, effort } =
    params;

  try {
    const runtime = buildRuntime(providerId, {
      apiKey,
      baseUrl,
      model,
      webSearch,
      effort,
    });

    const tools: ToolSet | undefined =
      runtime.tools || extraTools
        ? { ...(runtime.tools ?? {}), ...(extraTools ?? {}) }
        : undefined;

    const result = streamText({
      model: runtime.model,
      system,
      messages: messages as ModelMessage[],
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      stopWhen: stepCountIs(MAX_STEPS),
      ...(tools ? { tools } : {}),
      ...(runtime.providerOptions
        ? { providerOptions: runtime.providerOptions }
        : {}),
    });

    const citations: Citation[] = [];
    const seen = new Set<string>();

    for await (const part of result.fullStream) {
      switch (part.type) {
        case "text-delta":
          if (part.text) yield { type: "text", text: part.text };
          break;
        case "reasoning-start":
        case "reasoning-delta":
          yield { type: "thinking" };
          break;
        case "tool-call":
          yield { type: "tool", name: part.toolName };
          break;
        case "source":
          if (part.sourceType === "url" && part.url && !seen.has(part.url)) {
            seen.add(part.url);
            citations.push({ url: part.url, title: part.title || part.url });
          }
          break;
        case "error":
          throw part.error;
      }
    }

    if (citations.length) yield { type: "citations", citations };
    yield { type: "done" };
  } catch (err) {
    yield { type: "error", error: normalizeError(err) };
  }
}

function normalizeError(err: unknown): string {
  if (err instanceof Error) {
    const status = (err as { statusCode?: number }).statusCode;
    return status ? `${status} ${err.message}` : err.message;
  }
  if (typeof err === "string") return err;
  return "AI request failed";
}

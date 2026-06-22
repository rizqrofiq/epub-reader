// The single place that maps a ProviderId onto its Vercel AI SDK wiring:
// the language model, an optional native web-search tool, and provider-specific
// options (e.g. extended thinking / reasoning effort). Everything downstream
// (`stream.ts`) is provider-agnostic.

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel, ToolSet, streamText } from "ai";
import type { ProviderId } from "./provider";

type ProviderOptions = NonNullable<
  Parameters<typeof streamText>[0]["providerOptions"]
>;

export interface RuntimeParams {
  apiKey: string;
  baseUrl?: string;
  model: string;
  webSearch: boolean;
  effort?: "low" | "medium" | "high";
}

export interface ProviderRuntime {
  model: LanguageModel;
  tools?: ToolSet;
  providerOptions?: ProviderOptions;
}

export function buildRuntime(
  providerId: ProviderId,
  { apiKey, baseUrl, model, webSearch, effort }: RuntimeParams,
): ProviderRuntime {
  switch (providerId) {
    case "anthropic": {
      const anthropic = createAnthropic({
        apiKey,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
      });
      return {
        model: anthropic(model),
        tools: webSearch
          ? { web_search: anthropic.tools.webSearch_20260209({ maxUses: 5 }) }
          : undefined,
        providerOptions: { anthropic: { thinking: { type: "adaptive" } } },
      };
    }

    case "openai": {
      const openai = createOpenAI({
        apiKey,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
      });
      return {
        model: openai.responses(model),
        tools: webSearch ? { web_search: openai.tools.webSearch() } : undefined,
        providerOptions: effort ? { openai: { reasoningEffort: effort } } : undefined,
      };
    }

    case "google": {
      const google = createGoogleGenerativeAI({
        apiKey,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
      });
      return {
        model: google(model),
        tools: webSearch ? { google_search: google.tools.googleSearch({}) } : undefined,
      };
    }

    case "compatible": {
      if (!baseUrl) {
        throw new Error("A base URL is required for OpenAI-compatible providers");
      }
      const compatible = createOpenAICompatible({
        name: "custom",
        apiKey,
        baseURL: baseUrl,
      });
      return { model: compatible(model) };
    }
  }
}

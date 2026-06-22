// Provider-agnostic seam. Every provider is driven through the Vercel AI SDK
// (`streamText`), so adding one means: a registry entry (`registry.ts`, the SDK
// wiring), a behavioral entry below, and a fallback model list (`catalog.ts`).

import { MODEL_CATALOG } from "./catalog";

export interface Citation {
  url: string;
  title: string;
}

// Wire format sent to the browser over SSE. Unchanged across providers.
export type AIStreamEvent =
  | { type: "text"; text: string }
  | { type: "thinking" }
  // A provider-executed tool ran (e.g. native web search). Used to tell whether
  // an answer was grounded in a real search vs. the model's own knowledge.
  | { type: "tool"; name: string }
  | { type: "citations"; citations: Citation[] }
  | { type: "done" }
  | { type: "error"; error: string };

// How an answer was grounded, surfaced to the user as a badge.
// "web" — a web search ran; "book" — retrieved from the indexed book text;
// "passage" — answered with the highlighted passage as context, no search;
// "model" — none of the above, i.e. the model's own knowledge.
export type GroundingKind = "web" | "book" | "passage" | "model";

export interface Grounding {
  kind: GroundingKind;
  sources: number;
}

export interface BookSource {
  chapter: string;
  cfi: string;
  snippet: string;
}

export type ProviderId = "anthropic" | "openai" | "google" | "compatible";

export interface AskParams {
  providerId: ProviderId;
  apiKey: string;
  baseUrl?: string;
  model: string;
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  webSearch: boolean;
  effort?: "low" | "medium" | "high";
}

export interface ProviderMeta {
  id: ProviderId;
  label: string;
  models: { id: string; label: string }[];
  defaultModel: string;
  keyHint: string;
  requiresBaseUrl: boolean;
  supportsWebSearch: boolean;
}

const PROVIDER_BEHAVIOR: Omit<ProviderMeta, "models" | "defaultModel">[] = [
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    keyHint: "sk-ant-...",
    requiresBaseUrl: false,
    supportsWebSearch: true,
  },
  {
    id: "openai",
    label: "OpenAI (GPT)",
    keyHint: "sk-...",
    requiresBaseUrl: false,
    supportsWebSearch: true,
  },
  {
    id: "google",
    label: "Google (Gemini)",
    keyHint: "AIza...",
    requiresBaseUrl: false,
    supportsWebSearch: true,
  },
  {
    id: "compatible",
    label: "OpenAI-compatible (OpenRouter, Groq, local…)",
    keyHint: "Provider API key",
    requiresBaseUrl: true,
    supportsWebSearch: false,
  },
];

export const PROVIDERS: ProviderMeta[] = PROVIDER_BEHAVIOR.map((p) => ({
  ...p,
  models: MODEL_CATALOG[p.id].models,
  defaultModel: MODEL_CATALOG[p.id].defaultModel,
}));

export const PROVIDER_IDS = new Set<string>(PROVIDERS.map((p) => p.id));

export function getProviderMeta(id: string): ProviderMeta | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function isProviderId(id: string): id is ProviderId {
  return PROVIDER_IDS.has(id);
}

// Provider-agnostic seam. Claude is implemented now; other providers can add a
// module exporting the same AIProvider shape and register in `getProvider`.

export interface Citation {
  url: string;
  title: string;
}

export type AIStreamEvent =
  | { type: "text"; text: string }
  | { type: "thinking" }
  | { type: "citations"; citations: Citation[] }
  | { type: "done" }
  | { type: "error"; error: string };

export interface AskParams {
  apiKey: string;
  baseUrl?: string;
  model: string;
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  webSearch: boolean;
  effort?: "low" | "medium" | "high";
}

export interface ListModelsParams {
  apiKey: string;
  baseUrl?: string;
}

export interface AIProvider {
  streamAnswer(params: AskParams): AsyncGenerator<AIStreamEvent>;
  listModels(params: ListModelsParams): Promise<{ id: string; label: string }[]>;
}

export type ProviderId = "anthropic" | "openai";

export const PROVIDERS: {
  id: ProviderId;
  label: string;
  models: { id: string; label: string }[];
  defaultModel: string;
  keyHint: string;
}[] = [
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    models: [
      { id: "claude-opus-4-8", label: "Claude Opus 4.8" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    ],
    defaultModel: "claude-opus-4-8",
    keyHint: "sk-ant-...",
  },
  {
    id: "openai",
    label: "OpenAI (GPT)",
    models: [
      { id: "gpt-5", label: "GPT-5" },
      { id: "gpt-4.1", label: "GPT-4.1" },
      { id: "gpt-4o", label: "GPT-4o" },
    ],
    defaultModel: "gpt-5",
    keyHint: "sk-...",
  },
];

export async function getProvider(id: string): Promise<AIProvider> {
  switch (id) {
    case "anthropic": {
      const { anthropicProvider } = await import("./providers/anthropic");
      return anthropicProvider;
    }
    case "openai": {
      const { openaiProvider } = await import("./providers/openai");
      return openaiProvider;
    }
    default:
      throw new Error(`Unsupported provider: ${id}`);
  }
}

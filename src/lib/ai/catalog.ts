import type { ProviderId } from "./provider";

export interface CatalogEntry {
  models: { id: string; label: string }[];
  defaultModel: string;
}

export const MODEL_CATALOG: Record<ProviderId, CatalogEntry> = {
  anthropic: {
    models: [
      { id: "claude-opus-4-8", label: "Claude Opus 4.8" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    ],
    defaultModel: "claude-opus-4-8",
  },

  openai: {
    models: [
      { id: "gpt-5", label: "GPT-5" },
      { id: "gpt-4.1", label: "GPT-4.1" },
      { id: "gpt-4o", label: "GPT-4o" },
    ],
    defaultModel: "gpt-5",
  },

  google: {
    models: [
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    ],
    defaultModel: "gemini-2.5-flash",
  },

  compatible: {
    models: [
      { id: "openai/gpt-4o", label: "openai/gpt-4o (OpenRouter)" },
      { id: "openai/gpt-4o-mini", label: "openai/gpt-4o-mini (OpenRouter)" },
      { id: "anthropic/claude-sonnet-4.5", label: "anthropic/claude-sonnet-4.5 (OpenRouter)" },
      { id: "google/gemini-2.5-flash", label: "google/gemini-2.5-flash (OpenRouter)" },
      { id: "deepseek/deepseek-chat", label: "deepseek/deepseek-chat (OpenRouter)" },
      { id: "meta-llama/llama-3.3-70b-instruct", label: "meta-llama/llama-3.3-70b-instruct (OpenRouter)" },
      { id: "llama-3.3-70b-versatile", label: "llama-3.3-70b-versatile (Groq)" },
      { id: "qwen/qwen-2.5-72b-instruct", label: "qwen/qwen-2.5-72b-instruct (OpenRouter)" },
    ],
    defaultModel: "openai/gpt-4o",
  },
};

// Best-effort model discovery. Each provider exposes a simple GET endpoint, so
// we hit it directly rather than pulling in a heavyweight SDK. Callers fall back
// to the curated `PROVIDERS[].models` list (or free-form input) when this fails.

import type { ProviderId } from "./provider";

export interface ListModelsParams {
  apiKey: string;
  baseUrl?: string;
}

type Model = { id: string; label: string };

// OpenAI's catalog mixes in embeddings, audio, image, moderation, etc. Keep the
// chat-capable families. Third-party gateways return their own ids — don't
// over-filter, just drop the obvious non-chat types.
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
    "rerank",
  ];
  return !exclude.some((x) => lower.includes(x));
}

function trimSlash(u: string): string {
  return u.replace(/\/+$/, "");
}

function modelsEndpoint(base: string, versioned: boolean): string {
  const b = trimSlash(base);
  if (b.endsWith("/models")) return b;
  if (versioned && !/\/v\d+(beta)?$/.test(b)) return `${b}/v1/models`;
  return `${b}/models`;
}

async function fetchJson(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 200)}` : ""}`);
  }
  return res.json();
}

export async function listModels(
  providerId: ProviderId,
  { apiKey, baseUrl }: ListModelsParams,
): Promise<Model[]> {
  switch (providerId) {
    case "anthropic": {
      const url = modelsEndpoint(baseUrl || "https://api.anthropic.com", true);
      const json = (await fetchJson(url, {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      })) as { data?: { id: string; display_name?: string }[] };
      return (json.data ?? []).map((m) => ({
        id: m.id,
        label: m.display_name || m.id,
      }));
    }

    case "google": {
      const base = trimSlash(baseUrl || "https://generativelanguage.googleapis.com/v1beta");
      const json = (await fetchJson(
        `${base}/models?key=${encodeURIComponent(apiKey)}&pageSize=200`,
        {},
      )) as {
        models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[];
      };
      return (json.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent") ?? true)
        .map((m) => ({
          id: m.name.replace(/^models\//, ""),
          label: m.displayName || m.name.replace(/^models\//, ""),
        }));
    }

    case "openai":
    case "compatible": {
      const url = modelsEndpoint(baseUrl || "https://api.openai.com/v1", true);
      const json = (await fetchJson(url, {
        Authorization: `Bearer ${apiKey}`,
      })) as { data?: { id: string }[] };
      return (json.data ?? [])
        .filter((m) => isChatModel(m.id))
        .map((m) => ({ id: m.id, label: m.id }))
        .sort((a, b) => a.id.localeCompare(b.id));
    }
  }
}

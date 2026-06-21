import type { Citation } from "@/lib/ai/provider";

export interface AskHandlers {
  onText: (chunk: string) => void;
  onCitations?: (citations: Citation[]) => void;
  onError?: (error: string) => void;
  onDone?: () => void;
  onSummary?: (contextSummary: string) => void;
}

export interface AskRequest {
  mode: "explain" | "factcheck" | "ask";
  selectedText: string;
  question?: string;
  bookTitle?: string;
  chapterLabel?: string;
  // Session context for multi-turn + persistence
  sessionId?: string;
  history?: { role: "user" | "assistant"; content: string }[];
  contextSummary?: string | null;
}

// Streams an AI answer from /api/ai/ask, parsing the SSE events.
export async function askAI(
  req: AskRequest,
  handlers: AskHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/ai/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });

  if (!res.ok || !res.body) {
    const { error } = (await res.json().catch(() => ({}))) as {
      error?: string;
    };
    handlers.onError?.(
      res.status === 412
        ? "No AI provider configured. Add your API key in AI settings."
        : error || `Request failed (${res.status})`,
    );
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const json = line.slice(5).trim();
      if (!json) continue;
      try {
        const ev = JSON.parse(json);
        if (ev.type === "text") handlers.onText(ev.text);
        else if (ev.type === "citations") handlers.onCitations?.(ev.citations);
        else if (ev.type === "error") handlers.onError?.(ev.error);
        else if (ev.type === "warn") console.warn("[askAI]", ev.warn);
        else if (ev.type === "summary") handlers.onSummary?.(ev.contextSummary);
        else if (ev.type === "done") handlers.onDone?.();
      } catch {
        // ignore malformed chunk
      }
    }
  }
}

export interface AiCredential {
  provider: string;
  model: string | null;
  base_url: string | null;
  updated_at: string;
}

export async function getAiCredentials(): Promise<AiCredential[]> {
  const res = await fetch("/api/ai/credentials");
  if (!res.ok) return [];
  const { credentials } = (await res.json()) as { credentials: AiCredential[] };
  return credentials;
}

export async function saveAiCredential(
  provider: string,
  apiKey: string,
  model: string,
  baseUrl?: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/ai/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, apiKey, model, baseUrl }),
  });
  if (res.ok) return { ok: true };
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: false, error: json.error || `Save failed (${res.status})` };
}

export async function fetchModels(
  provider: string,
  apiKey?: string,
  baseUrl?: string,
): Promise<{ models: { id: string; label: string }[]; error?: string }> {
  const res = await fetch("/api/ai/models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, apiKey, baseUrl }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    models?: { id: string; label: string }[];
    error?: string;
  };
  if (!res.ok) return { models: [], error: json.error || "Failed to load" };
  return { models: json.models || [] };
}

export async function deleteAiCredential(provider: string): Promise<void> {
  await fetch(`/api/ai/credentials?provider=${encodeURIComponent(provider)}`, {
    method: "DELETE",
  });
}

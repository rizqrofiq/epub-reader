export interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: { url: string; title: string }[];
  quote?: string | null;
  book_sources?: { chapter: string; cfi: string; snippet: string }[] | null;
  created_at: string;
}

export async function getSessions(bookId: string): Promise<ChatSession[]> {
  const res = await fetch(`/api/ai/sessions?bookId=${encodeURIComponent(bookId)}`);
  if (!res.ok) return [];
  const { sessions } = (await res.json()) as { sessions: ChatSession[] };
  return sessions;
}

export async function createSession(bookId: string): Promise<string | null> {
  const res = await fetch("/api/ai/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookId }),
  });
  if (!res.ok) return null;
  const { sessionId } = (await res.json()) as { sessionId: string };
  return sessionId;
}

export async function deleteSession(id: string): Promise<void> {
  await fetch(`/api/ai/sessions/${id}`, { method: "DELETE" });
}

// Persist one chat turn. Called from the client so the write runs as a normal
// request (the AI stream's own writes were being dropped on Workers).
export async function saveChatMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  opts?: {
    citations?: { url: string; title: string }[];
    quote?: string;
    bookSources?: { chapter: string; cfi: string; snippet: string }[];
  },
): Promise<boolean> {
  try {
    const res = await fetch(`/api/ai/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role,
        content,
        citations: opts?.citations,
        quote: opts?.quote,
        bookSources: opts?.bookSources,
      }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      console.error("[saveChatMessage] failed", res.status, j.error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[saveChatMessage] error", e);
    return false;
  }
}

export async function getSessionMessages(
  sessionId: string,
): Promise<{ messages: ChatMessage[]; contextSummary: string | null }> {
  const res = await fetch(`/api/ai/sessions/${sessionId}/messages`);
  if (!res.ok) {
    console.warn("[getSessionMessages] request failed", res.status);
    return { messages: [], contextSummary: null };
  }
  const data = (await res.json()) as {
    messages: ChatMessage[];
    contextSummary: string | null;
    debug?: { count: number; error: string | null };
  };
  if (data.debug?.error || data.debug?.count === 0) {
    console.warn("[getSessionMessages] debug", data.debug);
  }
  return data;
}

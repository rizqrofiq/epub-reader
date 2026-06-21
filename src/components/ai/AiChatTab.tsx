"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { askAI } from "@/lib/ai/client";
import {
  getSessions,
  createSession,
  deleteSession,
  getSessionMessages,
  type ChatSession,
  type ChatMessage,
} from "@/lib/ai/sessions";
import type { Citation } from "@/lib/ai/provider";

interface UIMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  quote?: string; // highlighted passage that was selected when this message was sent
  citations?: Citation[];
  thinking?: boolean;
  error?: string;
}

interface AiChatTabProps {
  bookId: string;
  bookTitle?: string;
  chapterLabel?: string;
  pendingText?: string | null;
  onPendingConsumed?: () => void;
}

type Mode = "explain" | "factcheck" | "ask";
type View = "history" | "chat";

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function AiChatTab({
  bookId,
  bookTitle,
  chapterLabel,
  pendingText,
  onPendingConsumed,
}: AiChatTabProps) {
  const [view, setView] = useState<View>("history");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [contextSummary, setContextSummary] = useState<string | null>(null);
  const [history, setHistory] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const [input, setInput] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load sessions on mount
  useEffect(() => {
    setSessionsLoading(true);
    getSessions(bookId).then((s) => {
      setSessions(s);
      setSessionsLoading(false);
    });
  }, [bookId]);

  // Keep a ref to view so the pendingText effect always reads the live value,
  // not a stale closure captured at mount time.
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // When the reader sends selected text via "Ask AI", jump into a chat.
  useEffect(() => {
    if (!pendingText) return;
    setSelectedText(pendingText);
    onPendingConsumed?.();
    // If no active session is open, create one automatically.
    if (viewRef.current === "history") {
      openNewSession();
    }
    // openNewSession is stable (useCallback with [bookId]); pendingText is the
    // only value that should re-trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingText]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  // ── Session management ─────────────────────────────────────────────────────

  const openNewSession = useCallback(async () => {
    const id = await createSession(bookId);
    if (!id) return;
    setActiveSessionId(id);
    setMessages([]);
    setHistory([]);
    setContextSummary(null);
    setInput("");
    // NOTE: intentionally do NOT clear selectedText here —
    // it needs to survive into the chat view so the user sees their highlight.
    setView("chat");
    setSessions((prev) => [
      {
        id,
        title: "New chat",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      ...prev,
    ]);
    setTimeout(() => textareaRef.current?.focus(), 100);
  }, [bookId]);

  const openSession = useCallback(async (session: ChatSession) => {
    setLoadingSessionId(session.id);
    // Fetch messages first — then flip to chat view so we never show the
    // empty-state while waiting for the network response.
    const result = await getSessionMessages(session.id);
    console.log("[openSession] fetched for", session.id, result);

    const { messages: dbMessages, contextSummary: summary } = result;

    const uiMessages: UIMessage[] = dbMessages.map((m: ChatMessage) => ({
      id: m.id,
      role: m.role,
      text: m.content,
      citations: m.citations,
    }));

    const historyMessages = dbMessages.map((m: ChatMessage) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    console.log("[openSession] uiMessages:", uiMessages.length, uiMessages);

    // Set everything at once, then switch view — React batches these.
    setLoadingSessionId(null);
    setActiveSessionId(session.id);
    setMessages(uiMessages);
    setHistory(historyMessages);
    setContextSummary(summary);
    setLoading(false);
    setView("chat");

    setTimeout(() => textareaRef.current?.focus(), 100);
  }, []);

  const handleDeleteSession = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setDeletingId(id);
      await deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      setDeletingId(null);
    },
    [],
  );

  const backToHistory = useCallback(() => {
    abortRef.current?.abort();
    setView("history");
    setActiveSessionId(null);
    setMessages([]);
    setHistory([]);
    setContextSummary(null);
    setSelectedText("");
    setInput("");
    setLoading(false);
    // Refresh list
    getSessions(bookId).then(setSessions);
  }, [bookId]);

  // ── Messaging ──────────────────────────────────────────────────────────────

  const appendChunk = (id: string, chunk: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, text: m.text + chunk, thinking: false } : m,
      ),
    );
  };

  const finalizeMessage = (id: string, update: Partial<UIMessage>) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...update } : m)),
    );
  };

  const send = useCallback(
    (mode: Mode) => {
      if (loading || !activeSessionId) return;

      const userText =
        mode === "ask"
          ? input.trim()
          : mode === "explain"
            ? "Explain this passage"
            : "Fact-check this passage";

      if (!userText && !selectedText) return;

      const userMsg: UIMessage = {
        id: crypto.randomUUID(),
        role: "user",
        text: userText,
        quote: selectedText || undefined,
      };

      const assistantId = crypto.randomUUID();
      const assistantMsg: UIMessage = {
        id: assistantId,
        role: "assistant",
        text: "",
        thinking: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);

      // Build history snapshot for this request
      const currentHistory = [
        ...history,
        { role: "user" as const, content: userText },
      ];

      if (mode === "ask") {
        setInput("");
        if (textareaRef.current) textareaRef.current.style.height = "auto";
      }
      setLoading(true);

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      askAI(
        {
          mode,
          selectedText: selectedText || userText,
          question: mode === "ask" ? input.trim() : undefined,
          bookTitle,
          chapterLabel,
          sessionId: activeSessionId,
          history: currentHistory,
          contextSummary,
        },
        {
          onText: (chunk) => appendChunk(assistantId, chunk),
          onCitations: (c) =>
            finalizeMessage(assistantId, { citations: c, thinking: false }),
          onSummary: (s) => setContextSummary(s),
          onError: (e) => {
            finalizeMessage(assistantId, {
              error: e,
              thinking: false,
              text: "",
            });
            setLoading(false);
          },
          onDone: () => {
            finalizeMessage(assistantId, { thinking: false });
            setLoading(false);
            // Update session title in list if it was "New chat"
            setSessions((prev) =>
              prev.map((s) =>
                s.id === activeSessionId && s.title === "New chat"
                  ? {
                      ...s,
                      title: userText.slice(0, 60),
                      updated_at: new Date().toISOString(),
                    }
                  : s,
              ),
            );
            // Append to history so next message includes this exchange
            setHistory((prev) => [
              ...prev,
              { role: "user", content: userText },
            ]);
          },
        },
        ctrl.signal,
      ).catch(() => setLoading(false));
    },
    [
      loading,
      activeSessionId,
      input,
      selectedText,
      bookTitle,
      chapterLabel,
      history,
      contextSummary,
    ],
  );

  // Append assistant text to history once streaming done
  const prevMessagesRef = useRef(messages);
  useEffect(() => {
    const prev = prevMessagesRef.current;
    const curr = messages;
    if (prev.length < curr.length) {
      const last = curr[curr.length - 1];
      if (
        last.role === "assistant" &&
        !last.thinking &&
        last.text &&
        prev.find((m) => m.id === last.id) === undefined
      ) {
        // New assistant message completed
      }
    }
    prevMessagesRef.current = curr;
  }, [messages]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !loading) send("ask");
    }
  };

  const isLastMessage = (id: string) =>
    messages[messages.length - 1]?.id === id;

  // ── Render ─────────────────────────────────────────────────────────────────

  if (view === "history") {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
          <p className="text-xs font-medium text-white/50 uppercase tracking-wider">
            Conversations
          </p>
          <button
            onClick={openNewSession}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#3ECF8E]/15 hover:bg-[#3ECF8E]/25 text-[#3ECF8E] text-xs font-medium transition-all cursor-pointer"
          >
            <span className="material-symbols-rounded !text-[14px]">add</span>
            New chat
          </button>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto py-2">
          {sessionsLoading ? (
            <div className="flex items-center justify-center py-12">
              <span className="material-symbols-rounded !text-[20px] text-white/20 animate-spin">
                progress_activity
              </span>
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 px-6 py-12 text-center">
              <div className="w-10 h-10 rounded-full bg-[#3ECF8E]/10 flex items-center justify-center">
                <span className="material-symbols-rounded text-[#3ECF8E] !text-[20px]">
                  auto_awesome
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-white/60">
                  No conversations yet
                </p>
                <p className="text-xs text-white/30 mt-1">
                  Start a new chat or highlight text in the book
                </p>
              </div>
              <button
                onClick={openNewSession}
                className="mt-2 px-4 py-2 rounded-xl bg-[#3ECF8E]/15 hover:bg-[#3ECF8E]/25 text-[#3ECF8E] text-sm transition-all cursor-pointer"
              >
                Start chatting
              </button>
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => {
                  if (!loadingSessionId) openSession(session);
                }}
                className={`group flex items-center gap-3 px-4 py-3 transition-all cursor-pointer ${
                  loadingSessionId === session.id
                    ? "opacity-60"
                    : "hover:bg-white/5"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/80 truncate">
                    {session.title}
                  </p>
                  <p className="text-xs text-white/30 mt-0.5">
                    {formatDate(session.updated_at)}
                  </p>
                </div>
                {loadingSessionId === session.id ? (
                  <span className="material-symbols-rounded !text-[16px] text-white/30 animate-spin">
                    progress_activity
                  </span>
                ) : (
                  <button
                    onClick={(e) => handleDeleteSession(e, session.id)}
                    disabled={deletingId === session.id}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-white/25 hover:text-red-400 hover:bg-red-400/10 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <span className="material-symbols-rounded !text-[14px]">
                      {deletingId === session.id ? "progress_activity" : "delete"}
                    </span>
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // Chat view
  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/8 flex-shrink-0">
        <button
          onClick={backToHistory}
          className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-all cursor-pointer"
        >
          <span className="material-symbols-rounded !text-[16px]">
            arrow_back
          </span>
        </button>
        <p className="flex-1 text-xs text-white/50 truncate">
          {sessions.find((s) => s.id === activeSessionId)?.title ?? "New chat"}
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
            <div className="w-10 h-10 rounded-full bg-[#3ECF8E]/10 flex items-center justify-center">
              <span className="material-symbols-rounded text-[#3ECF8E] !text-[20px]">
                auto_awesome
              </span>
            </div>
            <div>
              <p className="text-sm font-medium text-white/70">
                Ask about this book
              </p>
              <p className="text-xs text-white/35 mt-1 leading-relaxed">
                Highlight text and tap "Ask AI", or type a question below
              </p>
            </div>
            {selectedText && (
              <div className="w-full mt-2 flex gap-2">
                <button
                  onClick={() => send("explain")}
                  disabled={loading}
                  className="flex-1 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white/60 hover:text-white hover:bg-white/8 transition-all cursor-pointer disabled:opacity-40"
                >
                  Explain
                </button>
                <button
                  onClick={() => send("factcheck")}
                  disabled={loading}
                  className="flex-1 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white/60 hover:text-white hover:bg-white/8 transition-all cursor-pointer disabled:opacity-40"
                >
                  Fact-check
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="px-4 py-4 space-y-6">
            {messages.map((msg) => (
              <div key={msg.id}>
                {msg.role === "user" ? (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] space-y-1.5">
                      {/* Quoted passage */}
                      {msg.quote && (
                        <div className="flex items-start gap-1.5 px-3 py-2 rounded-sm rounded-tr-xl rounded-br-sm bg-white/4 relative before:content-[''] before:absolute before:bg-[#3ECF8E]/40 before:w-1 before:h-[80%] before:top-[10%] before:left-0 before:rounded-sm">
                          <span className="material-symbols-rounded !text-[12px] text-[#3ECF8E]/50 mt-0.5 flex-shrink-0">
                            format_quote
                          </span>
                          <p className="text-xs text-white/40 italic leading-relaxed line-clamp-3">
                            {msg.quote}
                          </p>
                        </div>
                      )}
                      {/* User question */}
                      {msg.text && (
                        <div className="px-4 py-2.5 rounded-2xl rounded-tr-md bg-white/8 border border-white/10 text-sm text-white/90 leading-relaxed whitespace-pre-wrap">
                          {msg.text}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-[#3ECF8E]/20 flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-rounded !text-[12px] text-[#3ECF8E]">
                          auto_awesome
                        </span>
                      </div>
                      <span className="text-xs font-medium text-white/40">
                        AI
                      </span>
                    </div>
                    <div className="pl-7">
                      {msg.thinking && !msg.text ? (
                        <div className="flex items-center gap-1.5 h-5">
                          {[0, 150, 300].map((delay) => (
                            <span
                              key={delay}
                              className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce"
                              style={{ animationDelay: `${delay}ms` }}
                            />
                          ))}
                        </div>
                      ) : msg.error ? (
                        <p className="text-sm text-red-400/80 leading-relaxed">
                          {msg.error}
                        </p>
                      ) : (
                        <div className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
                          {msg.text}
                          {loading && isLastMessage(msg.id) && (
                            <span className="inline-block w-0.5 h-4 ml-0.5 bg-[#3ECF8E]/60 animate-pulse align-text-bottom" />
                          )}
                        </div>
                      )}
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-white/8 space-y-1.5">
                          <p className="text-[10px] uppercase tracking-widest text-white/25 font-medium">
                            Sources
                          </p>
                          {msg.citations.map((c, i) => (
                            <a
                              key={`${c.url}-${i}`}
                              href={c.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-start gap-2 group"
                            >
                              <span className="text-[10px] text-white/25 mt-0.5 font-mono flex-shrink-0">
                                {i + 1}
                              </span>
                              <span className="text-xs text-white/40 group-hover:text-[#3ECF8E] transition-colors truncate leading-relaxed">
                                {c.title || c.url}
                              </span>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Bottom area */}
      <div className="flex-shrink-0 px-3 pb-3 space-y-2">
        {selectedText && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-sm bg-white/4 border border-white/8">
            <span className="material-symbols-rounded !text-[13px] text-[#3ECF8E]/60 mt-0.5 flex-shrink-0">
              format_quote
            </span>
            <p className="flex-1 text-xs text-white/45 italic line-clamp-2 leading-relaxed">
              {selectedText}
            </p>
            <button
              onClick={() => setSelectedText("")}
              className="text-white/20 hover:text-white/50 transition-colors flex-shrink-0 cursor-pointer mt-0.5"
            >
              <span className="material-symbols-rounded !text-[13px]">
                close
              </span>
            </button>
          </div>
        )}
        {selectedText && messages.length > 0 && (
          <div className="flex gap-2">
            <button
              onClick={() => send("explain")}
              disabled={loading}
              className="flex-1 py-1.5 rounded-sm border border-white/10 text-xs text-white/50 hover:text-white hover:border-white/20 transition-all cursor-pointer disabled:opacity-40"
            >
              Explain
            </button>
            <button
              onClick={() => send("factcheck")}
              disabled={loading}
              className="flex-1 py-1.5 rounded-sm border border-white/10 text-xs text-white/50 hover:text-white hover:border-white/20 transition-all cursor-pointer disabled:opacity-40"
            >
              Fact-check
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 px-3 py-2 rounded-sm bg-white/5 border border-white/10 focus-within:border-white/20 transition-colors">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={loading}
            placeholder={
              selectedText ? "Ask about the selection…" : "Ask anything…"
            }
            className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-white/25 resize-none leading-relaxed disabled:opacity-50 max-h-[120px] overflow-y-auto"
          />
          <button
            onClick={() => {
              if (input.trim() && !loading) send("ask");
            }}
            disabled={loading || !input.trim()}
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-sm bg-[#3ECF8E] hover:bg-[#2BA872] text-[#0f0f0f] transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-rounded !text-[14px]">
              arrow_upward
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

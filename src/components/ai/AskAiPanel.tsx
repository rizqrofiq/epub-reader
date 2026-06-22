"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { askAI } from "@/lib/ai/client";
import type { Citation, Grounding } from "@/lib/ai/provider";
import Markdown from "./Markdown";
import GroundingBadge from "./GroundingBadge";

interface AskAiPanelProps {
  isOpen: boolean;
  selectedText: string;
  bookTitle?: string;
  chapterLabel?: string;
  onClose: () => void;
}

type Mode = "explain" | "factcheck" | "ask";

export default function AskAiPanel({
  isOpen,
  selectedText,
  bookTitle,
  chapterLabel,
  onClose,
}: AskAiPanelProps) {
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState<Citation[]>([]);
  const [grounding, setGrounding] = useState<Grounding | undefined>(undefined);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setAnswer("");
    setCitations([]);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isOpen) reset();
    return () => abortRef.current?.abort();
  }, [isOpen, reset]);

  const run = useCallback(
    (mode: Mode) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setAnswer("");
      setCitations([]);
      setGrounding(undefined);
      setSearching(false);
      setError(null);
      setLoading(true);
      askAI(
        {
          mode,
          selectedText,
          question: mode === "ask" ? question : undefined,
          bookTitle,
          chapterLabel,
        },
        {
          onText: (chunk) => setAnswer((a) => a + chunk),
          onTool: () => setSearching(true),
          onGrounding: (g) => {
            setGrounding(g);
            setSearching(false);
          },
          onCitations: (c) => setCitations(c),
          onError: (e) => {
            setError(e);
            setLoading(false);
          },
          onDone: () => setLoading(false),
        },
        ctrl.signal,
      ).catch(() => setLoading(false));
    },
    [selectedText, question, bookTitle, chapterLabel],
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[72] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg max-h-[85vh] flex flex-col bg-bg-secondary border border-border rounded-t-xl sm:rounded-sm shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between p-4 pb-3 border-b border-border">
          <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
            <span className="material-symbols-rounded sm text-accent">
              auto_awesome
            </span>
            Ask AI
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-sm text-text-tertiary hover:text-text-primary hover:bg-bg-elevated transition-all duration-200 cursor-pointer"
          >
            <span className="material-symbols-rounded">close</span>
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-4">
          <blockquote className="border-l-2 border-accent/50 pl-3 py-1 text-sm text-text-secondary italic max-h-28 overflow-y-auto">
            {selectedText}
          </blockquote>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => run("explain")}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-bg-elevated border border-border text-sm text-text-primary hover:border-accent/40 transition-all duration-200 cursor-pointer disabled:opacity-50"
            >
              <span className="material-symbols-rounded sm">lightbulb</span>
              Explain
            </button>
            <button
              onClick={() => run("factcheck")}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-bg-elevated border border-border text-sm text-text-primary hover:border-accent/40 transition-all duration-200 cursor-pointer disabled:opacity-50"
            >
              <span className="material-symbols-rounded sm">fact_check</span>
              Fact-check
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && question.trim() && !loading)
                  run("ask");
              }}
              placeholder="Ask anything about this…"
              className="flex-1 rounded-sm bg-bg-elevated border border-border px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent transition-colors"
            />
            <button
              onClick={() => run("ask")}
              disabled={loading || !question.trim()}
              className="flex items-center justify-center w-10 h-10 rounded-sm bg-accent hover:bg-accent-hover text-bg-primary transition-all duration-200 cursor-pointer disabled:opacity-50"
            >
              <span className="material-symbols-rounded sm">send</span>
            </button>
          </div>

          {error && (
            <div className="p-3 rounded-sm bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              {error}
            </div>
          )}

          {(answer || loading) && (
            <div className="rounded-sm bg-bg-elevated/60 border border-border p-3">
              <div className="text-sm text-text-primary leading-relaxed">
                <Markdown>{answer}</Markdown>
                {loading && (
                  <span className="inline-block w-2 h-4 ml-0.5 bg-accent/70 animate-pulse align-middle" />
                )}
              </div>

              {(grounding || searching) && (
                <div className="mt-2">
                  <GroundingBadge grounding={grounding} searching={searching} />
                </div>
              )}

              {citations.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                  <p className="text-xs text-text-tertiary uppercase tracking-wider">
                    Sources
                  </p>
                  {citations.map((c, i) => (
                    <a
                      key={`${c.url}-${i}`}
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-xs text-accent hover:underline truncate"
                    >
                      {i + 1}. {c.title}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

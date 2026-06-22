"use client";

import type { Grounding } from "@/lib/ai/provider";

// A small per-answer indicator of how grounded the response is. Shows a live
// "Searching…" state while a web search runs, then settles into one of:
//   web     — verified against real web sources (with a count)
//   passage — answered using the highlighted passage as context
//   model   — the model's own knowledge, NOT verified (warning tone)
export default function GroundingBadge({
  grounding,
  searching,
}: {
  grounding?: Grounding;
  searching?: boolean;
}) {
  if (searching && !grounding) {
    return (
      <Row icon="progress_activity" tone="muted" spin>
        Searching the web…
      </Row>
    );
  }
  if (!grounding) return null;

  if (grounding.kind === "web") {
    return (
      <Row icon="travel_explore" tone="accent">
        Searched the web ·{" "}
        {grounding.sources > 0
          ? `${grounding.sources} source${grounding.sources === 1 ? "" : "s"}`
          : "no sources found"}
      </Row>
    );
  }
  if (grounding.kind === "book") {
    return (
      <Row icon="menu_book" tone="accent">
        Grounded in the book ·{" "}
        {grounding.sources} excerpt{grounding.sources === 1 ? "" : "s"}
      </Row>
    );
  }
  if (grounding.kind === "passage") {
    return (
      <Row icon="format_quote" tone="muted">
        Based on your highlighted passage
      </Row>
    );
  }
  return (
    <Row icon="warning" tone="warn">
      From the model&apos;s own knowledge — not verified against the book
    </Row>
  );
}

function Row({
  icon,
  tone,
  spin,
  children,
}: {
  icon: string;
  tone: "accent" | "muted" | "warn";
  spin?: boolean;
  children: React.ReactNode;
}) {
  const color =
    tone === "accent"
      ? "text-accent"
      : tone === "warn"
        ? "text-amber-400/80"
        : "text-text-tertiary";
  return (
    <div
      className={`flex items-center gap-1.5 text-[11px] ${color}`}
      title="How this answer was grounded"
    >
      <span
        className={`material-symbols-rounded !text-[13px] ${spin ? "animate-spin" : ""}`}
      >
        {icon}
      </span>
      <span className="leading-none">{children}</span>
    </div>
  );
}

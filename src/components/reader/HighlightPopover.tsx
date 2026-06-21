"use client";

const COLORS = [
  { name: "Emerald", hex: "#3ECF8E" },
  { name: "Amber", hex: "#F59E0B" },
  { name: "Sky", hex: "#38BDF8" },
  { name: "Rose", hex: "#FB7185" },
  { name: "Violet", hex: "#A78BFA" },
];

interface HighlightPopoverProps {
  x: number;
  y: number;
  isVisible: boolean;
  onHighlight: (color: string) => void;
  onBookmark: () => void;
  onCopy: () => void;
  onAddNote: (color: string) => void;
  onAskAI?: () => void;
  onClose: () => void;
}

export default function HighlightPopover({
  x,
  y,
  isVisible,
  onHighlight,
  onBookmark,
  onCopy,
  onAddNote,
  onAskAI,
  onClose,
}: HighlightPopoverProps) {
  if (!isVisible) return null;

  const clampedX = Math.max(120, Math.min(x, window.innerWidth - 120));
  const clampedY = Math.max(80, y);

  return (
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />

      <div
        className="fixed z-[61] animate-scale-in"
        style={{
          left: `${clampedX}px`,
          top: `${clampedY}px`,
          transform: "translate(-50%, -100%)",
        }}
      >
        <div className="bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/15 rounded-sm shadow-2xl p-3 min-w-[200px]">
          <div className="flex items-center justify-center gap-2.5 mb-3">
            {COLORS.map((color) => (
              <button
                key={color.name}
                onClick={() => onHighlight(color.hex)}
                className="w-7 h-7 rounded-full border-2 border-transparent hover:border-white/40 transition-all duration-200 hover:scale-110 cursor-pointer"
                style={{ backgroundColor: color.hex }}
                title={`Highlight ${color.name}`}
              />
            ))}
          </div>

          <div className="h-px bg-white/10 mb-2" />

          <div className="flex items-center justify-center gap-1">
            {onAskAI && (
              <button
                onClick={onAskAI}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs text-accent hover:bg-accent/10 transition-all duration-200 cursor-pointer"
                title="Ask AI"
              >
                <span className="material-symbols-rounded sm">
                  auto_awesome
                </span>
                Ask AI
              </button>
            )}
            <button
              onClick={() => onAddNote(COLORS[0].hex)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs text-white/70 hover:text-white hover:bg-white/10 transition-all duration-200 cursor-pointer"
              title="Add Note"
            >
              <span className="material-symbols-rounded sm">edit_note</span>
              Note
            </button>
            <button
              onClick={onBookmark}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs text-white/70 hover:text-white hover:bg-white/10 transition-all duration-200 cursor-pointer"
              title="Bookmark"
            >
              <span className="material-symbols-rounded sm">bookmark_add</span>
              Bookmark
            </button>
            <button
              onClick={onCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs text-white/70 hover:text-white hover:bg-white/10 transition-all duration-200 cursor-pointer"
              title="Copy"
            >
              <span className="material-symbols-rounded sm">content_copy</span>
              Copy
            </button>
          </div>

          <div className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-3 h-3 rotate-45 bg-[#1a1a1a]/95 border-r border-b border-white/15" />
        </div>
      </div>
    </>
  );
}

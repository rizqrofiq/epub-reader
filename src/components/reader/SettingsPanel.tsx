"use client";

import { useReaderStore, type ReaderTheme, type FontFamily, type LineHeight, type PageLayout } from "@/stores/reader-store";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const THEMES: { id: ReaderTheme; label: string; bg: string; text: string; border: string }[] = [
  { id: "dark", label: "Dark", bg: "#0f0f0f", text: "#f2f2f2", border: "#2a2a2a" },
  { id: "light", label: "Light", bg: "#fafafa", text: "#171717", border: "#e5e5e5" },
  { id: "sepia", label: "Sepia", bg: "#e2d5b7", text: "#3d2e1a", border: "#c4b799" },
];

export default function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const {
    theme, setTheme,
    fontSize, setFontSize,
    fontFamily, setFontFamily,
    lineHeight, setLineHeight,
    layout, setLayout,
  } = useReaderStore();

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed top-16 right-4 z-50 w-72 bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/15 rounded-md shadow-2xl animate-scale-in overflow-hidden">
        <div className="p-5 space-y-5">
          <div>
            <label className="text-xs font-medium text-white/50 uppercase tracking-wider mb-3 block">
              Theme
            </label>
            <div className="flex gap-3">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`flex-1 flex flex-col items-center gap-1.5 p-3 rounded-md border-2 transition-all duration-200 cursor-pointer ${
                    theme === t.id
                      ? "border-[#3ECF8E]"
                      : "border-transparent hover:border-white/20"
                  }`}
                >
                  <div
                    className="w-8 h-8 rounded-full border"
                    style={{
                      backgroundColor: t.bg,
                      borderColor: t.border,
                    }}
                  >
                    <div
                      className="w-full h-full rounded-full flex items-center justify-center text-[10px] font-bold"
                      style={{ color: t.text }}
                    >
                      Aa
                    </div>
                  </div>
                  <span className="text-xs text-white/60">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="h-px bg-white/10" />

          <div>
            <label className="text-xs font-medium text-white/50 uppercase tracking-wider mb-3 block">
              Font
            </label>
            <div className="flex gap-2">
              {(
                [
                  { id: "sans" as FontFamily, label: "Sans", font: "Instrument Sans" },
                  { id: "serif" as FontFamily, label: "Serif", font: "Newsreader" },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFontFamily(f.id)}
                  className={`flex-1 py-2.5 rounded-md text-sm font-medium transition-all duration-200 cursor-pointer ${
                    fontFamily === f.id
                      ? "bg-[#3ECF8E]/15 text-[#3ECF8E] border border-[#3ECF8E]/30"
                      : "bg-white/5 text-white/60 border border-transparent hover:bg-white/10"
                  }`}
                  style={{
                    fontFamily:
                      f.id === "serif"
                        ? "'Newsreader', serif"
                        : "'Instrument Sans', sans-serif",
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-px bg-white/10" />

          <div>
            <label className="text-xs font-medium text-white/50 uppercase tracking-wider mb-3 block">
              Size
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setFontSize(fontSize - 1)}
                disabled={fontSize <= 14}
                className="w-9 h-9 rounded-md bg-white/5 border border-white/10 flex items-center justify-center text-white/70 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer"
              >
                <span className="material-symbols-rounded sm">
                  text_decrease
                </span>
              </button>
              <span className="flex-1 text-center text-sm text-white font-medium tabular-nums">
                {fontSize}px
              </span>
              <button
                onClick={() => setFontSize(fontSize + 1)}
                disabled={fontSize >= 28}
                className="w-9 h-9 rounded-md bg-white/5 border border-white/10 flex items-center justify-center text-white/70 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer"
              >
                <span className="material-symbols-rounded sm">
                  text_increase
                </span>
              </button>
            </div>
          </div>

          <div className="h-px bg-white/10" />

          <div>
            <label className="text-xs font-medium text-white/50 uppercase tracking-wider mb-3 block">
              Spacing
            </label>
            <div className="flex gap-2">
              {(
                [
                  { id: "compact" as LineHeight, label: "Compact" },
                  { id: "normal" as LineHeight, label: "Normal" },
                  { id: "relaxed" as LineHeight, label: "Relaxed" },
                ] as const
              ).map((lh) => (
                <button
                  key={lh.id}
                  onClick={() => setLineHeight(lh.id)}
                  className={`flex-1 py-2 rounded-md text-xs font-medium transition-all duration-200 cursor-pointer ${
                    lineHeight === lh.id
                      ? "bg-[#3ECF8E]/15 text-[#3ECF8E] border border-[#3ECF8E]/30"
                      : "bg-white/5 text-white/60 border border-transparent hover:bg-white/10"
                  }`}
                >
                  {lh.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-px bg-white/10" />

          <div>
            <label className="text-xs font-medium text-white/50 uppercase tracking-wider mb-3 block">
              Layout
            </label>
            <div className="flex gap-2">
              {(
                [
                  { id: "single" as PageLayout, label: "Single", icon: "description" },
                  { id: "double" as PageLayout, label: "Book", icon: "menu_book" },
                ] as const
              ).map((l) => (
                <button
                  key={l.id}
                  onClick={() => setLayout(l.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-md text-sm font-medium transition-all duration-200 cursor-pointer ${
                    layout === l.id
                      ? "bg-[#3ECF8E]/15 text-[#3ECF8E] border border-[#3ECF8E]/30"
                      : "bg-white/5 text-white/60 border border-transparent hover:bg-white/10"
                  }`}
                >
                  <span className="material-symbols-rounded sm">{l.icon}</span>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

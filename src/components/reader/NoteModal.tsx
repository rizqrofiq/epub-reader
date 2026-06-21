"use client";

import { useEffect, useRef, useState } from "react";

const COLORS = [
  { name: "Emerald", hex: "#3ECF8E" },
  { name: "Amber", hex: "#F59E0B" },
  { name: "Sky", hex: "#38BDF8" },
  { name: "Rose", hex: "#FB7185" },
  { name: "Violet", hex: "#A78BFA" },
];

interface NoteModalProps {
  isOpen: boolean;
  selectedText: string;
  initialColor: string;
  onSave: (note: string, color: string) => void;
  onClose: () => void;
}

export default function NoteModal({
  isOpen,
  selectedText,
  initialColor,
  onSave,
  onClose,
}: NoteModalProps) {
  const [note, setNote] = useState("");
  const [color, setColor] = useState(initialColor);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setNote("");
    setColor(initialColor);
    const t = setTimeout(() => textareaRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [isOpen, initialColor]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const trimmed = note.trim();
        if (trimmed) onSave(trimmed, color);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, note, color, onClose, onSave]);

  if (!isOpen) return null;

  const handleSave = () => {
    const trimmed = note.trim();
    if (!trimmed) return;
    onSave(trimmed, color);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md bg-bg-secondary border border-border rounded-sm shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between p-5 pb-0">
          <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
            <span className="material-symbols-rounded sm text-accent">
              edit_note
            </span>
            Add Note
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-sm text-text-tertiary hover:text-text-primary hover:bg-bg-elevated transition-all duration-200 cursor-pointer"
          >
            <span className="material-symbols-rounded">close</span>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <blockquote
            className="border-l-2 pl-3 py-1 text-sm text-text-secondary italic max-h-24 overflow-y-auto"
            style={{ borderColor: color }}
          >
            {selectedText}
          </blockquote>

          <textarea
            ref={textareaRef}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Write your note..."
            rows={4}
            className="w-full resize-none rounded-sm bg-bg-elevated border border-border px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent transition-colors"
          />

          <div className="flex items-center gap-2.5">
            <span className="text-xs text-text-tertiary mr-1">Color</span>
            {COLORS.map((c) => (
              <button
                key={c.name}
                onClick={() => setColor(c.hex)}
                className="w-6 h-6 rounded-full transition-all duration-200 hover:scale-110 cursor-pointer"
                style={{
                  backgroundColor: c.hex,
                  outline: color === c.hex ? `2px solid ${c.hex}` : "none",
                  outlineOffset: "2px",
                }}
                title={c.name}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 p-5 pt-0">
          <span className="mr-auto text-xs text-text-tertiary">
            ⌘/Ctrl + Enter
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-sm text-sm text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-all duration-200 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!note.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-sm bg-accent hover:bg-accent-hover text-bg-primary text-sm font-medium transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save Note
          </button>
        </div>
      </div>
    </div>
  );
}

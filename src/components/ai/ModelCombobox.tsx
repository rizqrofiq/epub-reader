"use client";

import { useEffect, useRef, useState } from "react";

interface ModelComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: { id: string; label: string }[];
  placeholder?: string;
}

// Searchable model picker: filters as you type, accepts free-form input (for
// custom model IDs), and falls back to whatever options are passed in.
export default function ModelCombobox({
  value,
  onChange,
  options,
  placeholder,
}: ModelComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // When open, filter by the typed query; otherwise show the current value.
  const display = open ? query : value;
  const q = query.trim().toLowerCase();
  const filtered = (
    q
      ? options.filter(
          (m) =>
            m.id.toLowerCase().includes(q) || m.label.toLowerCase().includes(q),
        )
      : options
  ).slice(0, 50);

  return (
    <div ref={ref} className="relative">
      <input
        value={display}
        placeholder={placeholder}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value); // allow free-form custom model IDs
          setOpen(true);
        }}
        className="w-full appearance-none rounded-sm bg-bg-elevated border border-border pl-3 pr-9 py-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
      />
      <span className="material-symbols-rounded sm pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary">
        {open ? "search" : "expand_more"}
      </span>

      {open && filtered.length > 0 && (
        <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-sm bg-bg-elevated border border-border shadow-xl">
          {filtered.map((m) => (
            <button
              key={m.id}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(m.id);
                setQuery("");
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer ${
                m.id === value
                  ? "bg-accent/15 text-accent"
                  : "text-text-primary hover:bg-surface-hover"
              }`}
            >
              <span className="truncate block">{m.label}</span>
              {m.label !== m.id && (
                <span className="text-[11px] text-text-tertiary truncate block">
                  {m.id}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

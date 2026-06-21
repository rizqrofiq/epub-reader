"use client";

import { useEffect } from "react";

interface ConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose, onConfirm]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div className="relative w-full max-w-sm bg-bg-secondary border border-border rounded-sm shadow-2xl animate-scale-in p-5">
        {title && (
          <h2 className="text-base font-semibold text-text-primary mb-1">
            {title}
          </h2>
        )}
        <p className="text-sm text-text-secondary">{message}</p>
        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-sm text-sm text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-all duration-200 cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-sm text-sm font-medium transition-all duration-200 cursor-pointer ${
              destructive
                ? "bg-destructive hover:bg-destructive-hover text-white"
                : "bg-accent hover:bg-accent-hover text-bg-primary"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

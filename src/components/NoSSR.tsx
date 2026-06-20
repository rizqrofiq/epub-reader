"use client";

import { useState, useEffect, type ReactNode } from "react";

/**
 * Renders children only after the component has mounted on the client.
 *
 * The server and the client's first render both produce `fallback`, so they
 * match — then the real UI swaps in after hydration. This sidesteps the entire
 * class of hydration mismatches for pages that are inherently client-only
 * (auth/session, IndexedDB, localStorage, window/matchMedia, time-of-day).
 */
export default function NoSSR({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <>{mounted ? children : fallback}</>;
}

export function FullScreenSpinner() {
  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center">
      <span className="material-symbols-rounded text-accent animate-spin !text-[32px]">
        progress_activity
      </span>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { flushOutbox } from "@/lib/offline-queue";

/**
 * Replays queued offline writes: once on mount, and whenever connectivity
 * returns. Mounted globally in the root layout.
 */
export default function OfflineSync() {
  useEffect(() => {
    const supabase = createClient();
    const flush = () => {
      flushOutbox(supabase).catch(() => {});
    };

    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, []);

  return null;
}

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { encryptKey } from "@/lib/ai/crypto";
import { isProviderId } from "@/lib/ai/provider";

type CredRow = {
  provider: string;
  model: string | null;
  base_url: string | null;
  updated_at: string;
  is_active?: boolean;
};

// Make `provider` the single active credential for the user. Deactivate the
// others first to keep exactly one active. No-ops on older DBs missing the
// column so saving still works before the migration is run.
async function setActiveProvider(
  supabase: SupabaseClient,
  userId: string,
  provider: string,
): Promise<void> {
  const off = await supabase
    .from("ai_credentials")
    .update({ is_active: false })
    .eq("user_id", userId)
    .neq("provider", provider);
  if (off.error) {
    if (/is_active/i.test(off.error.message)) return; // column not migrated yet
    return;
  }
  await supabase
    .from("ai_credentials")
    .update({ is_active: true })
    .eq("user_id", userId)
    .eq("provider", provider);
}

// Lists configured providers + model. Never returns the key itself.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Active credential first, then most-recently-updated. Retry without is_active
  // for older DBs that haven't run the migration yet.
  const withActive = await supabase
    .from("ai_credentials")
    .select("provider, model, base_url, updated_at, is_active")
    .eq("user_id", user.id)
    .order("is_active", { ascending: false })
    .order("updated_at", { ascending: false });

  let credentials = withActive.data as CredRow[] | null;
  if (withActive.error && /is_active/i.test(withActive.error.message)) {
    const without = await supabase
      .from("ai_credentials")
      .select("provider, model, base_url, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    credentials = without.data as CredRow[] | null;
  }

  return NextResponse.json({ credentials: credentials || [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { provider, apiKey, model, baseUrl } = (await request
    .json()
    .catch(() => ({}))) as {
    provider?: string;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  };

  if (!provider || !isProviderId(provider)) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  const trimmedKey = apiKey?.trim() ?? "";

  // Optional custom endpoint (OpenRouter, Azure, local models, proxies).
  let base_url: string | null = null;
  if (baseUrl && baseUrl.trim()) {
    try {
      const u = new URL(baseUrl.trim());
      if (u.protocol !== "https:" && u.protocol !== "http:") {
        throw new Error("bad protocol");
      }
      base_url = u.toString().replace(/\/$/, "");
    } catch {
      return NextResponse.json({ error: "Invalid base URL" }, { status: 400 });
    }
  }

  // No key supplied → update model/base_url on the existing credential without
  // touching the stored key (so changing the model doesn't require re-entry).
  if (!trimmedKey) {
    const { data: existing } = await supabase
      .from("ai_credentials")
      .select("provider")
      .eq("user_id", user.id)
      .eq("provider", provider)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json(
        { error: "Enter your API key to configure this provider." },
        { status: 400 },
      );
    }
    const { error } = await supabase
      .from("ai_credentials")
      .update({
        model: model || null,
        base_url,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("provider", provider);
    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to update" },
        { status: 500 },
      );
    }
    await setActiveProvider(supabase, user.id, provider);
    return NextResponse.json({ ok: true });
  }

  if (trimmedKey.length < 8) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 400 });
  }

  let encrypted_key: string;
  try {
    encrypted_key = await encryptKey(trimmedKey);
  } catch {
    return NextResponse.json(
      { error: "Server encryption is not configured" },
      { status: 503 },
    );
  }

  const { error } = await supabase.from("ai_credentials").upsert(
    {
      user_id: user.id,
      provider,
      encrypted_key,
      model: model || null,
      base_url,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" },
  );

  if (error) {
    console.error("[ai/credentials] upsert error:", error.message, error.code, error.details);
    return NextResponse.json({ error: error.message || "Failed to save" }, { status: 500 });
  }

  // Saving a provider makes it the active one.
  await setActiveProvider(supabase, user.id, provider);

  return NextResponse.json({ ok: true });
}

// Set an already-configured provider as active without re-entering its key.
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { provider } = (await request.json().catch(() => ({}))) as {
    provider?: string;
  };
  if (!provider || !isProviderId(provider)) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  const { data: cred } = await supabase
    .from("ai_credentials")
    .select("provider")
    .eq("user_id", user.id)
    .eq("provider", provider)
    .maybeSingle();
  if (!cred) {
    return NextResponse.json(
      { error: "That provider isn't configured" },
      { status: 404 },
    );
  }

  await setActiveProvider(supabase, user.id, provider);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const provider = new URL(request.url).searchParams.get("provider");
  if (!provider) {
    return NextResponse.json({ error: "Missing provider" }, { status: 400 });
  }

  await supabase
    .from("ai_credentials")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", provider);

  return NextResponse.json({ ok: true });
}

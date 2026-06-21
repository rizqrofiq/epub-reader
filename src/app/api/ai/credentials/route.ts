import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptKey } from "@/lib/ai/crypto";
import { PROVIDERS } from "@/lib/ai/provider";

const PROVIDER_IDS = new Set(PROVIDERS.map((p) => p.id));

// Lists configured providers + model. Never returns the key itself.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data } = await supabase
    .from("ai_credentials")
    .select("provider, model, base_url, updated_at")
    .eq("user_id", user.id);

  return NextResponse.json({ credentials: data || [] });
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

  if (!provider || !PROVIDER_IDS.has(provider as never)) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }
  if (!apiKey || apiKey.length < 8) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 400 });
  }

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

  let encrypted_key: string;
  try {
    encrypted_key = await encryptKey(apiKey.trim());
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

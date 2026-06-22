import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptKey } from "@/lib/ai/crypto";
import { isProviderId } from "@/lib/ai/provider";
import { listModels } from "@/lib/ai/models";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { provider, apiKey, baseUrl } = (await request
    .json()
    .catch(() => ({}))) as {
    provider?: string;
    apiKey?: string;
    baseUrl?: string;
  };

  if (!provider || !isProviderId(provider)) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  // Use a freshly-typed key if given; otherwise fall back to the saved one.
  let key = apiKey?.trim();
  let url = baseUrl?.trim() || undefined;
  if (!key) {
    const { data: cred } = await supabase
      .from("ai_credentials")
      .select("encrypted_key, base_url")
      .eq("user_id", user.id)
      .eq("provider", provider)
      .single();
    if (!cred) {
      return NextResponse.json(
        { error: "No saved key — enter your API key first" },
        { status: 412 },
      );
    }
    try {
      key = await decryptKey(cred.encrypted_key);
    } catch {
      return NextResponse.json({ error: "Decrypt failed" }, { status: 500 });
    }
    url = url || cred.base_url || undefined;
  }

  try {
    const models = await listModels(provider, { apiKey: key, baseUrl: url });
    return NextResponse.json({ models });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to list models",
      },
      { status: 502 },
    );
  }
}

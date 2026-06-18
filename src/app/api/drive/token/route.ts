import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: cred } = await supabase
    .from("google_credentials")
    .select("refresh_token")
    .eq("user_id", user.id)
    .single();

  if (!cred?.refresh_token) {
    return NextResponse.json(
      { error: "No Google credentials found. Please sign in with Google again." },
      { status: 404 }
    );
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: cred.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));

    // Refresh token revoked or expired — drop it so the user re-authenticates.
    if (detail?.error === "invalid_grant") {
      await supabase.from("google_credentials").delete().eq("user_id", user.id);
      return NextResponse.json(
        { error: "Google access revoked. Please sign in with Google again." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Failed to refresh Google token" },
      { status: 502 }
    );
  }

  const data = await res.json();
  return NextResponse.json({ access_token: data.access_token });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const session = data.session;
      const refreshToken = session?.provider_refresh_token;

      if (session && refreshToken) {
        await supabase.from("google_credentials").upsert(
          {
            user_id: session.user.id,
            refresh_token: refreshToken,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(
    `${origin}/auth?error=Could not authenticate user`
  );
}

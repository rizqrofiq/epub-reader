import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { presignR2Url } from "@/lib/r2/presign";
import { getR2Config, epubObjectKey } from "@/lib/r2/config";

const HASH_RE = /^[a-f0-9]{64}$/;

export async function GET(request: Request) {
  const config = getR2Config();
  if (!config) {
    return NextResponse.json({ error: "Cloud storage not configured" }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const fileHash = new URL(request.url).searchParams.get("fileHash");
  if (!fileHash || !HASH_RE.test(fileHash)) {
    return NextResponse.json({ error: "Invalid fileHash" }, { status: 400 });
  }

  const key = epubObjectKey(user.id, fileHash);
  const url = await presignR2Url(config, {
    method: "GET",
    key,
    expiresIn: 900,
    now: new Date(),
  });

  return NextResponse.json({ url });
}

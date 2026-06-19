import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { presignR2Url } from "@/lib/r2/presign";
import { getR2Config, epubObjectKey, getQuota } from "@/lib/r2/config";

const HASH_RE = /^[a-f0-9]{64}$/;

export async function POST(request: Request) {
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

  const { fileHash, fileSize } = (await request.json().catch(() => ({}))) as {
    fileHash?: string;
    fileSize?: number;
  };
  if (!fileHash || !HASH_RE.test(fileHash)) {
    return NextResponse.json({ error: "Invalid fileHash" }, { status: 400 });
  }

  // Quota enforcement. A re-upload of an existing hash doesn't add storage, so
  // only count it against quota when it's genuinely new content.
  const { maxBooks, maxBytes } = getQuota();
  const { data: existing } = await supabase
    .from("books")
    .select("file_hash, file_size")
    .eq("user_id", user.id);

  const rows = existing || [];
  const alreadyStored = rows.some((b) => b.file_hash === fileHash);

  if (!alreadyStored) {
    if (rows.length >= maxBooks) {
      return NextResponse.json(
        { error: `Book limit reached (${maxBooks}). Delete some books to free space.` },
        { status: 403 },
      );
    }

    const usedBytes = rows.reduce((sum, b) => sum + (b.file_size || 0), 0);
    if (usedBytes + (fileSize || 0) > maxBytes) {
      return NextResponse.json(
        { error: "Storage quota exceeded. Delete some books to free space." },
        { status: 403 },
      );
    }
  }

  const key = epubObjectKey(user.id, fileHash);
  const url = await presignR2Url(config, {
    method: "PUT",
    key,
    expiresIn: 900,
    now: new Date(),
  });

  return NextResponse.json({ url, storageKey: key });
}

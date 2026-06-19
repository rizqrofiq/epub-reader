import type { PresignConfig } from "./presign";

export function getR2Config(): PresignConfig | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

export function epubObjectKey(userId: string, fileHash: string): string {
  return `epubs/${userId}/${fileHash}.epub`;
}

export function getQuota() {
  const maxBooks = Number(process.env.R2_MAX_BOOKS_PER_USER) || 500;
  const maxBytes =
    Number(process.env.R2_MAX_BYTES_PER_USER) || 2 * 1024 * 1024 * 1024; // 2 GB
  return { maxBooks, maxBytes };
}

// AES-GCM encryption for BYOK API keys, using a server-side secret. The stored
// value is `base64(iv).base64(ciphertext)`. Decryption requires
// AI_KEY_ENCRYPTION_KEY (base64-encoded 32 bytes), so a DB dump alone is useless.

function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64decode(str: string): Uint8Array<ArrayBuffer> {
  const bin = atob(str);
  const buf = new ArrayBuffer(bin.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getKey(): Promise<CryptoKey> {
  const raw = process.env.AI_KEY_ENCRYPTION_KEY;
  if (!raw) throw new Error("AI_KEY_ENCRYPTION_KEY is not configured");
  const keyBytes = b64decode(raw);
  if (keyBytes.length !== 32) {
    throw new Error("AI_KEY_ENCRYPTION_KEY must be base64 of exactly 32 bytes");
  }
  return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptKey(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `${b64encode(iv)}.${b64encode(new Uint8Array(ct))}`;
}

export async function decryptKey(stored: string): Promise<string> {
  const [ivPart, ctPart] = stored.split(".");
  if (!ivPart || !ctPart) throw new Error("Malformed encrypted key");
  const key = await getKey();
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(ivPart) },
    key,
    b64decode(ctPart),
  );
  return new TextDecoder().decode(pt);
}

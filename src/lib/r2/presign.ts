const ENC = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(data: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", ENC.encode(data)));
}

async function hmac(key: BufferSource, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, ENC.encode(data));
}

// RFC 3986 encoding; the path keeps "/" unescaped, query values do not.
function uriEncode(str: string, encodeSlash: boolean): string {
  let out = "";
  for (const ch of str) {
    if (/[A-Za-z0-9\-._~]/.test(ch)) {
      out += ch;
    } else if (ch === "/" && !encodeSlash) {
      out += "/";
    } else {
      for (const byte of ENC.encode(ch)) {
        out += "%" + byte.toString(16).toUpperCase().padStart(2, "0");
      }
    }
  }
  return out;
}

export interface PresignConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export interface PresignOptions {
  method: "GET" | "PUT" | "DELETE";
  key: string;
  expiresIn?: number;
  now: Date;
}

export async function presignR2Url(
  config: PresignConfig,
  options: PresignOptions,
): Promise<string> {
  const { accountId, accessKeyId, secretAccessKey, bucket } = config;
  const { method, key, expiresIn = 900, now } = options;

  const host = `${accountId}.r2.cloudflarestorage.com`;
  const region = "auto";
  const service = "s3";

  const amzDate = now
    .toISOString()
    .replace(/[:-]/g, "")
    .replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalUri = `/${uriEncode(bucket, true)}/${uriEncode(key, false)}`;

  const params: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresIn),
    "X-Amz-SignedHeaders": "host",
  };

  const canonicalQuery = Object.keys(params)
    .sort()
    .map((k) => `${uriEncode(k, true)}=${uriEncode(params[k], true)}`)
    .join("&");

  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = await hmac(ENC.encode(`AWS4${secretAccessKey}`), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  const signature = toHex(await hmac(kSigning, stringToSign));

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

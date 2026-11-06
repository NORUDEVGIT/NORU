/**
 * Short-lived proof that this process already accepted a new password and only
 * the flag clear still needs to finish. The proof is not a password or a recovery token.
 */
const RESUME_MS = 10 * 60 * 1000;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

async function sign(key: string, value: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function signPasswordResume(userId: string, key: string, now = Date.now()): Promise<string> {
  const body = `${userId}.${now + RESUME_MS}`;
  return `${body}.${await sign(key, body)}`;
}

export async function passwordResumeValid(
  userId: string,
  proof: string,
  key: string,
  now = Date.now(),
): Promise<boolean> {
  const parts = proof.split(".");
  if (parts.length !== 3) return false;
  const [id, exp, signature] = parts;
  if (id !== userId || !exp || !signature) return false;
  if (!/^\d+$/.test(exp) || Number(exp) < now) return false;
  return safeEqual(signature, await sign(key, `${id}.${exp}`));
}

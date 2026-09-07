/**
 * Server-only helpers for guest order tracking.
 *
 * A guest who orders anonymously has no account, so we cannot authorise them
 * with `auth.uid()`. Instead placeOrder mints a 256-bit random tracking token,
 * stores ONLY its SHA-256 hash on the order row, and returns the raw token to
 * the ordering browser exactly once. Reading the order later requires
 * presenting that token, so sequential order numbers/ids grant no access.
 */

/** 256 bits of CSPRNG entropy, hex encoded. Unguessable and per-order. */
export function newTrackingToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashTrackingToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Length-independent, constant-time-ish comparison of two hex digests. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

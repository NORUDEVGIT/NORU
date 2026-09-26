/**
 * Server-side PostgREST fetch for user-scoped Supabase clients.
 * Generated auth-middleware must not drop the caller JWT on RPC POSTs.
 */

export function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

export type AuthHeaderKind = "absent" | "publishable" | "user-jwt" | "other";

export function classifyAuthorization(
  authorization: string | null,
  supabaseKey: string,
): AuthHeaderKind {
  if (!authorization) return "absent";
  if (authorization === `Bearer ${supabaseKey}`) return "publishable";
  if (authorization.startsWith("Bearer eyJ")) return "user-jwt";
  if (authorization.startsWith("Bearer ")) return "other";
  return "other";
}

export function applyUserScopedHeaders(input: {
  supabaseKey: string;
  userAccessToken: string | null;
  incoming: Headers;
}): Headers {
  const headers = new Headers(input.incoming);

  if (
    isNewSupabaseApiKey(input.supabaseKey) &&
    headers.get("Authorization") === `Bearer ${input.supabaseKey}`
  ) {
    headers.delete("Authorization");
  }

  if (input.userAccessToken) {
    headers.set("Authorization", `Bearer ${input.userAccessToken}`);
  }

  headers.set("apikey", input.supabaseKey);
  return headers;
}

export function createUserScopedFetch(
  supabaseKey: string,
  userAccessToken: string | null,
): typeof fetch {
  return (input, init) => {
    const incoming = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => incoming.set(key, value));
    }
    const headers = applyUserScopedHeaders({
      supabaseKey,
      userAccessToken,
      incoming,
    });
    return fetch(input, { ...init, headers });
  };
}

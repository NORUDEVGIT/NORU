export interface RestaurantTableQrRoute {
  restaurantSlug: string;
  qrToken: string;
}

export type RestaurantTableQrParseResult =
  | { ok: true; route: RestaurantTableQrRoute; hostname: string | null; pathname: string }
  | {
      ok: false;
      reason: "empty" | "unsupported-scheme" | "untrusted-origin" | "invalid-route";
      hostname: string | null;
      pathname: string | null;
    };

const RESTAURANT_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;
const QR_TOKEN = /^[a-f0-9]{20,128}$/i;
const TABLE_QR_PATH = /^\/r\/([^/]+)\/t\/([^/]+)\/?$/;

// These are public routing origins, never credentials. Deployments with a
// custom domain should set VITE_PUBLIC_APP_URL; preview builds can set
// VITE_PUBLIC_PREVIEW_URL. The fallback preserves already printed codes.
const configuredOrigins = [
  import.meta.env["VITE_PUBLIC_APP_URL"],
  import.meta.env["VITE_PUBLIC_PREVIEW_URL"],
  "https://elegant-eat-app.lovable.app",
  "https://id-preview--9c601da0-c98a-448e-8c17-94c1dff00906.lovable.app",
  "https://9c601da0-c98a-448e-8c17-94c1dff00906.lovableproject.com",
];

function normalizeOrigin(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

export function getRestaurantTableQrOrigin(): string {
  const configured = normalizeOrigin(import.meta.env["VITE_PUBLIC_APP_URL"]);
  if (configured) return configured;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export function buildRestaurantTableQrPath({
  restaurantSlug,
  qrToken,
}: RestaurantTableQrRoute): string {
  return `/r/${encodeURIComponent(restaurantSlug)}/t/${encodeURIComponent(qrToken)}`;
}

export function buildRestaurantTableQrUrl(
  route: RestaurantTableQrRoute,
  origin = getRestaurantTableQrOrigin(),
): string {
  return `${origin.replace(/\/$/, "")}${buildRestaurantTableQrPath(route)}`;
}

function trustedOrigins(currentOrigin?: string): Set<string> {
  const origins = configuredOrigins
    .map(normalizeOrigin)
    .filter((origin): origin is string => origin !== null);
  const current = normalizeOrigin(currentOrigin);
  if (current) origins.push(current);
  return new Set(origins);
}

/**
 * Checks only whether a scanned value is a trusted internal table-route URL.
 * Restaurant/table/token existence remains a server-side responsibility.
 */
export function parseRestaurantTableQrValue(
  raw: string,
  currentOrigin = typeof window === "undefined" ? undefined : window.location.origin,
): RestaurantTableQrParseResult {
  const value = raw.trim();
  if (!value) return { ok: false, reason: "empty", hostname: null, pathname: null };

  let hostname: string | null = null;
  let pathname: string;

  if (value.startsWith("/")) {
    pathname = value;
  } else {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return { ok: false, reason: "unsupported-scheme", hostname: null, pathname: null };
    }
    hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return { ok: false, reason: "unsupported-scheme", hostname, pathname: url.pathname };
    }
    if (!trustedOrigins(currentOrigin).has(url.origin)) {
      return { ok: false, reason: "untrusted-origin", hostname, pathname: url.pathname };
    }
    pathname = url.pathname;
  }

  const match = TABLE_QR_PATH.exec(pathname);
  if (!match) return { ok: false, reason: "invalid-route", hostname, pathname };

  let restaurantSlug: string;
  let qrToken: string;
  try {
    restaurantSlug = decodeURIComponent(match[1] ?? "");
    qrToken = decodeURIComponent(match[2] ?? "");
  } catch {
    return { ok: false, reason: "invalid-route", hostname, pathname };
  }

  if (!RESTAURANT_SLUG.test(restaurantSlug) || !QR_TOKEN.test(qrToken)) {
    return { ok: false, reason: "invalid-route", hostname, pathname };
  }

  return { ok: true, route: { restaurantSlug, qrToken }, hostname, pathname };
}
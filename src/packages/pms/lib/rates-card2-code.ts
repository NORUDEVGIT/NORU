/**
 * Rate Plan code suggestion from Rate Category + Room Type.
 * Matches hotel_rate_plans setupCode: uppercase letters, numbers, underscores; max 30.
 * Client convenience only — server uniqueness remains authoritative.
 */

const CODE_MAX = 30;
const CODE_PATTERN = /^[A-Z0-9_]{1,30}$/;

/** Category-level abbreviations when the category code/name is long or promotional. */
const CATEGORY_TOKEN_MAP: Record<string, string> = {
  promotional: "PROMO",
  promo: "PROMO",
};

/**
 * Room-type word abbreviations — prefer short meaningful tokens.
 * KING / TWIN / SUITE kept readable (not KNG / TWN / STE) for Rate Plan codes.
 */
const ROOM_WORD_MAP: Record<string, string> = {
  deluxe: "DLX",
  standard: "STD",
  twin: "TWIN",
  king: "KING",
  queen: "QUEEN",
  suite: "SUITE",
  junior: "JR",
  double: "DBL",
  single: "SGL",
  family: "FAM",
  executive: "EXE",
  superior: "SUP",
};

const SKIP_ROOM_WORDS = new Set(["room", "rooms", "type", "types", "and", "the", "a", "an"]);

export const RATE_PLAN_CODE_STAFF_HINT =
  "Use 1–30 letters, numbers, or underscores.";

export function isValidRatePlanCode(code: string): boolean {
  return CODE_PATTERN.test(code.trim().toUpperCase());
}

function normalizeTokenSource(value: string): string[] {
  return value
    .trim()
    .split(/[\s\-_/&+,.;:]+/)
    .map((part) => part.replace(/[^a-zA-Z0-9]/g, ""))
    .filter(Boolean);
}

function categoryToken(categoryCode: string): string {
  const parts = normalizeTokenSource(categoryCode);
  if (parts.length === 0) return "";

  const tokens = parts.map((part) => {
    const mapped = CATEGORY_TOKEN_MAP[part.toLowerCase()];
    if (mapped) return mapped;
    return part.toUpperCase();
  });

  return tokens
    .join("_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function roomTypeTokens(roomTypeName: string): string[] {
  const parts = normalizeTokenSource(roomTypeName).filter(
    (part) => !SKIP_ROOM_WORDS.has(part.toLowerCase()),
  );
  if (parts.length === 0) return [];

  return parts.map((part) => {
    const mapped = ROOM_WORD_MAP[part.toLowerCase()];
    if (mapped) return mapped;
    // Short words stay whole; longer unknown words take a 3-letter stem.
    if (part.length <= 4) return part.toUpperCase();
    return part.slice(0, 3).toUpperCase();
  });
}

function joinUnderCap(tokens: string[], max: number): string {
  const kept: string[] = [];
  for (const token of tokens) {
    if (!token) continue;
    const next = kept.length === 0 ? token : `${kept.join("_")}_${token}`;
    if (next.length > max) break;
    kept.push(token);
  }
  if (kept.length > 0) return kept.join("_");
  // Single oversized token — hard truncate as last resort.
  const first = tokens.find(Boolean) ?? "";
  return first.slice(0, max).replace(/_+$/g, "");
}

/**
 * Suggest a Rate Plan code from category code + room type name.
 * e.g. BAR + "Standard King Room" → "BAR_STD_KING"
 * e.g. CORPORATE + "Deluxe Twin Room" → "CORPORATE_DLX_TWIN"
 * e.g. PROMOTIONAL + "Junior Suite" → "PROMO_JR_SUITE"
 */
export function suggestRatePlanCode(categoryCode: string, roomTypeName: string): string {
  const category = categoryToken(categoryCode);
  const roomTokens = roomTypeTokens(roomTypeName);
  const tokens = [category, ...roomTokens].filter(Boolean);
  if (tokens.length === 0) return "";
  return joinUnderCap(tokens, CODE_MAX);
}

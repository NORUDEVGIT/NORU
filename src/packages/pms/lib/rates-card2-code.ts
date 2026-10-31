/**
 * Suggests a Rate Plan code from the user-entered rate plan name.
 * Client convenience only — server uniqueness remains authoritative.
 */

const RATE_WORD_MAP: Record<string, string> = {
  best: "BAR",
  available: "BAR",
  rate: "RATE",
  bar: "BAR",
  standard: "STD",
  flexible: "FLEX",
  flex: "FLEX",
  non: "NON",
  refundable: "REF",
  refund: "REF",
  breakfast: "BB",
  dinner: "HB",
  inclusive: "INC",
  promotional: "PROMO",
  promo: "PROMO",
  package: "PKG",
  seasonal: "SEAS",
  corporate: "CORP",
  direct: "DIR",
  member: "MBR",
  early: "EARLY",
  bird: "BIRD",
  weekend: "WKND",
  weekly: "WKLY",
  monthly: "MTHLY",
};

const CODE_MAX = 20;

export function suggestRatePlanCode(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";

  const lower = trimmed.toLowerCase();
  if (lower === "best available rate" || lower === "best available") return "BAR";
  if (lower === "standard rate") return "STD-RATE";
  if (lower === "bed and breakfast" || lower === "bed & breakfast") return "BB";
  if (lower === "non-refundable" || lower === "non refundable") return "NON-REF";

  const parts = trimmed
    .split(/[\s\-_/]+/)
    .map((part) => part.replace(/[^a-zA-Z0-9]/g, ""))
    .filter(Boolean);
  if (parts.length === 0) return "";

  const tokens = parts.map((part) => {
    const mapped = RATE_WORD_MAP[part.toLowerCase()];
    if (mapped) return mapped;
    return part.slice(0, 3).toUpperCase();
  });

  const uniqueTokens: string[] = [];
  for (const t of tokens) {
    if (uniqueTokens[uniqueTokens.length - 1] !== t) {
      uniqueTokens.push(t);
    }
  }

  let code = uniqueTokens.join("-");
  if (code.length > CODE_MAX) code = code.slice(0, CODE_MAX).replace(/-$/, "");
  return code;
}

/**
 * Card 2 Room Type code suggestion from a display name.
 * Client convenience only — server/DB uniqueness remains authoritative.
 */

const WORD_MAP: Record<string, string> = {
  deluxe: "DLX",
  standard: "STD",
  twin: "TWN",
  king: "KNG",
  queen: "QN",
  suite: "STE",
  double: "DBL",
  single: "SGL",
  family: "FAM",
  executive: "EXE",
  superior: "SUP",
  junior: "JR",
};

const CODE_MAX = 20;

export function suggestRoomTypeCode(name: string): string {
  const parts = name
    .trim()
    .split(/[\s\-_/]+/)
    .map((part) => part.replace(/[^a-zA-Z0-9]/g, ""))
    .filter(Boolean);
  if (parts.length === 0) return "";

  const tokens = parts.map((part) => {
    const mapped = WORD_MAP[part.toLowerCase()];
    if (mapped) return mapped;
    return part.slice(0, 3).toUpperCase();
  });

  let code = tokens.join("-");
  if (code.length > CODE_MAX) code = code.slice(0, CODE_MAX).replace(/-$/, "");
  return code;
}

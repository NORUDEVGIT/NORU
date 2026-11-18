/**
 * Package Master code suggestion from a display name.
 * Matches pms_packages setupCode: uppercase letters, numbers, underscores; max 20.
 * Client convenience only — server uniqueness remains authoritative.
 */

const CODE_MAX = 20;
const CODE_PATTERN = /^[A-Z0-9_]{1,20}$/;

/** Words that are catalogue noise for package codes (see staff examples). */
const SKIP_WORDS = new Set(["package", "packages"]);

export const PACKAGE_CODE_STAFF_HINT =
  "Use 1–20 letters, numbers, or underscores only.";

export function isValidPackageCode(code: string): boolean {
  return CODE_PATTERN.test(code.trim().toUpperCase());
}

/**
 * Suggest a package code from a name.
 * e.g. "Airport Transfer Package" → "AIRPORT_TRANSFER"
 * e.g. "Spa & Wellness Package" → "SPA_WELLNESS"
 */
export function suggestPackageCode(name: string): string {
  const parts = name
    .trim()
    .split(/[\s\-_/&+,.;:]+/)
    .map((part) => part.replace(/[^a-zA-Z0-9]/g, ""))
    .filter(Boolean)
    .filter((part) => !SKIP_WORDS.has(part.toLowerCase()));

  if (parts.length === 0) return "";

  let code = parts
    .map((part) => part.toUpperCase())
    .join("_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (code.length > CODE_MAX) {
    code = code.slice(0, CODE_MAX).replace(/_+$/g, "");
  }

  return code;
}

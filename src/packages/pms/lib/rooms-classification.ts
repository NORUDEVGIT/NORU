/**
 * NORU PMS — Room Type Classifications (Room Categories & Room Classes).
 *
 * Canonical master lists from the approved NORU Requirements Document.
 * Provides 3-way duplicate prevention, list merging, and merge-safe persistence.
 */

import {
  parsePropertySetupStatus,
  type PropertySetupStatus,
} from "./pms-property-setup-card1.ts";

export const PREDEFINED_ROOM_CATEGORIES = [
  "Single Room",
  "Double Room",
  "Twin Room",
  "Triple Room",
  "Quadruple Room",
  "Family Room",
  "Studio",
  "Suite",
  "Junior Suite",
  "Executive Suite",
  "Presidential Suite",
  "Connecting Room",
  "Accessible Room",
  "Villa",
  "Apartment",
  "Dormitory",
] as const;

export type PredefinedRoomCategory = (typeof PREDEFINED_ROOM_CATEGORIES)[number];

export const PREDEFINED_ROOM_CLASSES = [
  "Standard",
  "Superior",
  "Deluxe",
  "Executive",
  "Premium",
  "Luxury",
  "Business",
  "Presidential",
] as const;

export type PredefinedRoomClass = (typeof PREDEFINED_ROOM_CLASSES)[number];

/**
 * Case-insensitive comparison checking if candidate matches any existing entry.
 * Supports either (existing, candidate) or (candidate, existing).
 */
export function isDuplicateClassification(
  a: readonly string[] | string,
  b: readonly string[] | string,
): boolean {
  let existing: readonly string[];
  let candidate: string;

  if (Array.isArray(a) && typeof b === "string") {
    existing = a;
    candidate = b;
  } else if (typeof a === "string" && Array.isArray(b)) {
    existing = b;
    candidate = a;
  } else {
    return false;
  }

  const norm = candidate.trim().toLowerCase();
  if (!norm) return false;
  return existing.some((item) => (item ?? "").trim().toLowerCase() === norm);
}

/**
 * Merges predefined values, property custom values, and legacy values.
 * Deduplicates case-insensitively while preserving canonical casing.
 */
export function mergeClassificationLists(
  predefined: readonly string[],
  custom: readonly string[] | undefined,
  legacy: readonly string[] | undefined,
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  const append = (value: string | null | undefined) => {
    const trimmed = (value ?? "").trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) return;
    seen.add(lower);
    result.push(trimmed);
  };

  for (const item of predefined) append(item);
  for (const item of custom ?? []) append(item);
  for (const item of legacy ?? []) append(item);

  return result;
}

/**
 * Pure helper to merge a new custom category or class into pms_property_setup_status
 * with strict merge semantics, preserving cards, card1Steps, card2Steps, and other custom items.
 * Supports either ({ category, class }) or ("category" | "class", value).
 */
export function mergeCustomClassifications(
  stored: unknown,
  additionOrKind: { category?: string; class?: string } | "category" | "class",
  maybeValue?: string,
): PropertySetupStatus {
  const parsed = parsePropertySetupStatus(stored);
  const currentCategories = parsed.customRoomCategories ?? [];
  const currentClasses = parsed.customRoomClasses ?? [];

  const addition: { category?: string; class?: string } =
    typeof additionOrKind === "string"
      ? { [additionOrKind]: maybeValue }
      : additionOrKind;

  const nextCategories = [...currentCategories];
  if (addition.category) {
    const trimmedCat = addition.category.trim();
    if (trimmedCat && !isDuplicateClassification(nextCategories, trimmedCat)) {
      nextCategories.push(trimmedCat);
    }
  }

  const nextClasses = [...currentClasses];
  if (addition.class) {
    const trimmedClass = addition.class.trim();
    if (trimmedClass && !isDuplicateClassification(nextClasses, trimmedClass)) {
      nextClasses.push(trimmedClass);
    }
  }

  return {
    ...parsed,
    customRoomCategories: nextCategories,
    customRoomClasses: nextClasses,
  };
}

/** Null is allowed. A selected id must already have been confirmed on this property. */
export function foreignRatePlanPolicyMessage(
  kind: "deposit" | "no-show" | "early-departure",
  selectedId: string | null | undefined,
  sameProperty: boolean,
): string | null {
  if (!selectedId) return null;
  if (sameProperty) return null;
  if (kind === "deposit") return "That deposit policy doesn't belong to this property.";
  if (kind === "no-show") return "That no-show policy doesn't belong to this property.";
  return "That early departure policy doesn't belong to this property.";
}

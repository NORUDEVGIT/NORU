/**
 * Sequential Settings card progression after successful Save & Finish.
 * Presentation / navigation only — does not change persistence or readiness.
 */

import { SET1_HUB_HREF } from "./pms-set1-foundation.ts";
import { CARD1_HASH, PROPERTY_SETUP_CARDS } from "./pms-property-setup-card1.ts";
import { CARD2_HASH, CARD2_STEP_QUERY, CARD2_STEPS } from "./pms-property-setup-card2.ts";
import { CARD3_DOMAIN_QUERY, CARD3_DOMAINS, CARD3_HASH } from "./pms-property-setup-card3.ts";
import { CARD4_HASH } from "./pms-property-setup-card4.ts";
import { CARD5_HASH, STAFF_ACCESS_HASH } from "./pms-property-setup-card5.ts";
import { CARD6_HASH } from "./pms-property-setup-card6.ts";
import { CARD7_HASH } from "./pms-property-setup-card7.ts";
import { CARD8_HASH } from "./pms-property-setup-card8.ts";

export type PropertySetupCardHash = (typeof PROPERTY_SETUP_CARDS)[number]["hash"];

const CARD_ALIAS_TO_HASH: Record<string, PropertySetupCardHash> = {
  "card-1": CARD1_HASH,
  card1: CARD1_HASH,
  "card-2": CARD2_HASH,
  card2: CARD2_HASH,
  "card-3": CARD3_HASH,
  card3: CARD3_HASH,
  "card-4": CARD4_HASH,
  card4: CARD4_HASH,
  "card-5": CARD5_HASH,
  card5: CARD5_HASH,
  [STAFF_ACCESS_HASH]: CARD5_HASH,
  "card-6": CARD6_HASH,
  card6: CARD6_HASH,
  "card-7": CARD7_HASH,
  card7: CARD7_HASH,
  "card-8": CARD8_HASH,
  card8: CARD8_HASH,
};

/** Canonical first internal step/tab id for each Settings card. */
export const PROPERTY_SETUP_CARD_FIRST_STEP = {
  [CARD1_HASH]: "identity",
  [CARD2_HASH]: CARD2_STEPS[0].id,
  [CARD3_HASH]: CARD3_DOMAINS[0].id,
  [CARD4_HASH]: "profile-types",
  [CARD5_HASH]: "departments",
  [CARD6_HASH]: "integrations",
  [CARD7_HASH]: "security-roles",
  [CARD8_HASH]: "offline-sync",
} as const satisfies Record<PropertySetupCardHash, string>;

export function normalizePropertySetupCardHash(hash: string): PropertySetupCardHash | null {
  const raw = hash.replace(/^#/, "").trim();
  if (!raw) return null;
  const aliased = CARD_ALIAS_TO_HASH[raw];
  if (aliased) return aliased;
  const card = PROPERTY_SETUP_CARDS.find((row) => row.hash === raw);
  return card?.hash ?? null;
}

export function nextPropertySetupCard(currentHash: string) {
  const hash = normalizePropertySetupCardHash(currentHash);
  if (!hash) return null;
  const index = PROPERTY_SETUP_CARDS.findIndex((row) => row.hash === hash);
  if (index < 0 || index >= PROPERTY_SETUP_CARDS.length - 1) return null;
  return PROPERTY_SETUP_CARDS[index + 1] ?? null;
}

/**
 * Entry URL for a Settings card that opens its first canonical step.
 * Preserves returnTo/from when present; clears other setup step queries.
 */
export function propertySetupCardEntryHref(cardHash: string): string {
  const hash = normalizePropertySetupCardHash(cardHash) ?? cardHash.replace(/^#/, "");
  const params = new URLSearchParams();

  if (typeof window !== "undefined") {
    const current = new URLSearchParams(window.location.search);
    const returnTo = current.get("returnTo");
    const from = current.get("from");
    if (returnTo) params.set("returnTo", returnTo);
    else if (from) params.set("from", from);
  }

  if (hash === CARD2_HASH) {
    params.set(CARD2_STEP_QUERY, PROPERTY_SETUP_CARD_FIRST_STEP[CARD2_HASH]);
  } else if (hash === CARD3_HASH) {
    params.set(CARD3_DOMAIN_QUERY, PROPERTY_SETUP_CARD_FIRST_STEP[CARD3_HASH]);
  }

  const query = params.toString();
  return query ? `${SET1_HUB_HREF}?${query}#${hash}` : `${SET1_HUB_HREF}#${hash}`;
}

/**
 * After a successful final Save & Finish, open the next Settings card at step 1.
 * Returns false for Card 8 (no next card) — caller stays on the current card.
 */
export function navigateToNextPropertySetupCard(currentHash: string): boolean {
  if (typeof window === "undefined") return false;
  const next = nextPropertySetupCard(currentHash);
  if (!next) return false;
  const href = propertySetupCardEntryHref(next.hash);
  window.history.pushState(null, "", href);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
  window.dispatchEvent(new PopStateEvent("popstate"));
  return true;
}

/** Finish helper: advance when a next card exists; otherwise remain in place. */
export function finishPropertySetupCardAndAdvance(currentHash: string): boolean {
  return navigateToNextPropertySetupCard(currentHash);
}

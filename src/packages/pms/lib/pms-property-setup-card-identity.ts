/**
 * Shared Property Setup card identity. Dashboard and workspaces must use this
 * registry so icons cannot drift. Presentation only.
 */
import type { LucideIcon } from "lucide-react";
import {
  BedDouble,
  Building2,
  ChartColumn,
  Network,
  Rocket,
  Share2,
  Shield,
  Users,
} from "lucide-react";

import {
  PROPERTY_SETUP_CARDS,
  propertySetupStatusLabel,
  type PropertySetupCardId,
  type PropertySetupCardStatus,
} from "./pms-property-setup-card1.ts";

export const PROPERTY_SETUP_CARD_ICONS = {
  1: Building2,
  2: BedDouble,
  3: ChartColumn,
  4: Users,
  5: Network,
  6: Share2,
  7: Shield,
  8: Rocket,
} as const satisfies Record<(typeof PROPERTY_SETUP_CARDS)[number]["number"], LucideIcon>;

export type PropertySetupCardNumber = keyof typeof PROPERTY_SETUP_CARD_ICONS;

export type PropertySetupCardIdentity = (typeof PROPERTY_SETUP_CARDS)[number] & {
  Icon: LucideIcon;
};

export function propertySetupCardIdentity(
  card: (typeof PROPERTY_SETUP_CARDS)[number],
): PropertySetupCardIdentity {
  return { ...card, Icon: PROPERTY_SETUP_CARD_ICONS[card.number] };
}

export function propertySetupCardIcon(number: PropertySetupCardNumber): LucideIcon {
  return PROPERTY_SETUP_CARD_ICONS[number];
}

export function propertySetupCardById(id: PropertySetupCardId) {
  const card = PROPERTY_SETUP_CARDS.find((row) => row.id === id);
  if (!card) throw new Error(`Unknown property setup card: ${id}`);
  return propertySetupCardIdentity(card);
}

export function propertySetupCardByNumber(number: PropertySetupCardNumber) {
  const card = PROPERTY_SETUP_CARDS.find((row) => row.number === number);
  if (!card) throw new Error(`Unknown property setup card number: ${number}`);
  return propertySetupCardIdentity(card);
}

export function propertySetupCardIdentities(): PropertySetupCardIdentity[] {
  return PROPERTY_SETUP_CARDS.map(propertySetupCardIdentity);
}

export function propertySetupCardStatusPillLabel(status: PropertySetupCardStatus): string {
  if (status === "complete") return "Ready";
  return propertySetupStatusLabel(status);
}

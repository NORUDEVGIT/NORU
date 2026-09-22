/**
 * Travel Agency Detail workspace helpers.
 * The operational entity is guest_account_masters.account_type = travel_agent.
 * Company + Card 4 TRA remains a classification only.
 */

import type { KnownMoney } from "./guest-profile-wave3.ts";
import {
  companyBillingTotals,
  companyDocumentKpis,
  companyDocumentStatus,
  companyReservationKpis,
  formatMoneyLabel,
  latestNoteById,
} from "./guest-company-detail-workspace.ts";

export const TA_DETAIL_MIGRATION_FILE = "0095_pms_travel_agency_workspace.sql";

export const TRAVEL_AGENT_DETAIL_NAV = [
  { id: "overview", title: "Overview", live: true },
  { id: "contacts", title: "Contacts", live: true },
  { id: "bookings", title: "Bookings", live: true },
  { id: "commission", title: "Commission", live: true },
  { id: "agreements", title: "Agreements", live: true },
  { id: "payment", title: "Payment & Invoices", live: true },
  { id: "documents", title: "Documents", live: true },
  { id: "notes", title: "Notes", live: true },
  { id: "history", title: "Activity Log", live: true },
  { id: "settings", title: "Agency Settings", live: true },
] as const;

export type TravelAgentDetailNavId = (typeof TRAVEL_AGENT_DETAIL_NAV)[number]["id"];

export const TRAVEL_AGENT_DETAIL_NAV_IDS = TRAVEL_AGENT_DETAIL_NAV.map((item) => item.id);

export const TA_SETTINGS_SECTIONS = [
  { id: "general", title: "General" },
  { id: "commission", title: "Commission & Rates" },
  { id: "allotment", title: "Allotment & Inventory" },
  { id: "rules", title: "Booking Rules" },
  { id: "billing", title: "Payment & Billing" },
  { id: "notifications", title: "Notifications" },
  { id: "documents", title: "Documents" },
] as const;

export type TravelAgentSettingsSectionId = (typeof TA_SETTINGS_SECTIONS)[number]["id"];

export const TA_BOOKING_ACCESS = ["open", "restricted"] as const;
export type TravelAgentBookingAccess = (typeof TA_BOOKING_ACCESS)[number];

export const TA_COMMISSION_PLAN_TYPES = ["percent", "fixed"] as const;
export type TravelAgentCommissionPlanType = (typeof TA_COMMISSION_PLAN_TYPES)[number];

export const TA_COMMISSION_ENTRY_STATUSES = [
  "calculated",
  "pending",
  "approved",
  "settled",
  "void",
] as const;
export type TravelAgentCommissionEntryStatus = (typeof TA_COMMISSION_ENTRY_STATUSES)[number];

export const TA_ALLOTMENT_STATUSES = ["active", "inactive"] as const;
export type TravelAgentAllotmentStatus = (typeof TA_ALLOTMENT_STATUSES)[number];

export const TA_NOTIFICATION_EVENTS = [
  "booking_confirmation",
  "booking_cancellation",
  "booking_modification",
] as const;
export type TravelAgentNotificationEvent = (typeof TA_NOTIFICATION_EVENTS)[number];

export const TA_BILLING_COPY =
  "Reads reservation folios and agency commission entries. There is no separate TA accounts-receivable ledger.";

export const TA_ALLOTMENT_COPY =
  "Agency booking limit. Rooms stay in the property's general inventory.";

export const TA_COMMISSION_EMPTY_COPY =
  "No commission plan is configured for this agency. Configure one in Agency Settings.";

export const TA_CONTACTS_COPY = "People who represent this travel agency.";
export const TA_TRAVELERS_COPY =
  "Linked guests stay on guest_account_links. Default role is booker travel agent.";
export const TA_DOCUMENTS_COPY =
  "Agency files reuse the company document store. Identity documents stay on guest profiles.";
export const COMPANY_TA_SETTINGS_COPY =
  "Travel Agency operations live on standalone Travel Agency profiles (Guests → Travel Agencies). This company business type (TRA) is a classification only.";
export const TA_FORM_OPERATIONAL_COPY =
  "Commission, agreements, payment terms, and allotment are managed in Agency Settings. Existing reference values stay stored.";

export function isTravelAgentDetailNavId(value: string | undefined): value is TravelAgentDetailNavId {
  return Boolean(value && (TRAVEL_AGENT_DETAIL_NAV_IDS as readonly string[]).includes(value));
}

export function travelAgentDetailNav(id: string | undefined): TravelAgentDetailNavId {
  return isTravelAgentDetailNavId(id) ? id : "overview";
}

export function isTravelAgentSettingsSectionId(
  value: string | undefined,
): value is TravelAgentSettingsSectionId {
  return Boolean(value && TA_SETTINGS_SECTIONS.some((item) => item.id === value));
}

export function travelAgentSettingsSection(id: string | undefined): TravelAgentSettingsSectionId {
  return isTravelAgentSettingsSectionId(id) ? id : "general";
}

export function travelAgentOverviewKpis(input: {
  bookingCount: number;
  guestCount: number;
  commissionTotal: number | null;
  commissionConfigured: boolean;
  defaultRateLabel: string | null;
}): {
  totalBookings: number;
  totalGuests: number;
  totalCommission: number | null;
  commissionConfigured: boolean;
  defaultRateLabel: string | null;
} {
  return {
    totalBookings: input.bookingCount,
    totalGuests: input.guestCount,
    totalCommission: input.commissionConfigured ? input.commissionTotal : null,
    commissionConfigured: input.commissionConfigured,
    defaultRateLabel: input.defaultRateLabel,
  };
}

export function commissionEntryTotals(
  rows: Array<{ amount: number; status: string }>,
): {
  earned: number;
  approved: number;
  settled: number;
  outstanding: number;
} {
  const live = rows.filter((row) => row.status !== "void");
  const earned = live.reduce((sum, row) => sum + row.amount, 0);
  const approved = live
    .filter((row) => row.status === "approved" || row.status === "settled")
    .reduce((sum, row) => sum + row.amount, 0);
  const settled = live.filter((row) => row.status === "settled").reduce((sum, row) => sum + row.amount, 0);
  return {
    earned: Math.round(earned * 100) / 100,
    approved: Math.round(approved * 100) / 100,
    settled: Math.round(settled * 100) / 100,
    outstanding: Math.round((earned - settled) * 100) / 100,
  };
}

export function calculateCommissionAmount(options: {
  type: TravelAgentCommissionPlanType;
  rateValue: number;
  basisAmount: number;
}): number {
  const basis = Number.isFinite(options.basisAmount) ? options.basisAmount : 0;
  const rate = Number.isFinite(options.rateValue) ? options.rateValue : 0;
  const amount = options.type === "percent" ? (basis * rate) / 100 : rate;
  return Math.round(Math.max(0, amount) * 100) / 100;
}

export function parseLegacyCommissionRate(label: string | null | undefined): number | null {
  if (!label) return null;
  const match = label.trim().match(/^(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function nightsBetweenLocal(arrival: string, departure: string): number {
  const start = Date.parse(`${arrival}T00:00:00.000Z`);
  const end = Date.parse(`${departure}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round((end - start) / 86_400_000);
}

export function formatMoneyOrDash(value: KnownMoney | null): string {
  return formatMoneyLabel(value);
}

export {
  companyBillingTotals as travelAgentBillingTotals,
  companyDocumentKpis as travelAgentDocumentKpis,
  companyDocumentStatus as travelAgentDocumentStatus,
  companyReservationKpis as travelAgentReservationKpis,
  latestNoteById,
};

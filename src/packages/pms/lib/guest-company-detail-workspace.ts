/**
 * Company Detail workspace helpers.
 * Settings catalogues stay in Card 4 / Card 5 / Card 3.
 * Rows stay on guest_account_masters + guest_account_links + guest_company_contacts.
 */

import type { KnownMoney } from "./guest-profile-wave3.ts";

export const COMPANY_DETAIL_MIGRATION_FILE = "0091_pms_guest_company_detail.sql";
export const COMPANY_CONTACT_WHATSAPP_MIGRATION_FILE = "0092_pms_guest_company_contact_whatsapp.sql";
export const COMPANY_PHASE1_MIGRATION_FILE = "0094_pms_company_profile_phase1.sql";

export const COMPANY_DETAIL_NAV = [
  { id: "overview", title: "Overview", live: true },
  { id: "corporate", title: "Corporate Details", live: true },
  { id: "contacts", title: "Contact Persons", live: true },
  { id: "travelers", title: "Travelers", live: true },
  { id: "contracts", title: "Contracts & Agreements", live: true },
  { id: "reservations", title: "Reservations", live: true },
  { id: "notes", title: "Notes", live: true },
  { id: "history", title: "History", live: true },
  { id: "documents", title: "Documents", live: true },
  { id: "credit", title: "Billing", live: true },
  { id: "travel-agent-settings", title: "Travel Agent Settings", live: false, requiresTravelAgent: true },
] as const;

export type CompanyDetailNavId = (typeof COMPANY_DETAIL_NAV)[number]["id"];

export const COMPANY_DETAIL_NAV_IDS = COMPANY_DETAIL_NAV.map((item) => item.id);

export const COMPANY_CONTACT_STATUSES = ["active", "inactive"] as const;
export type CompanyContactStatus = (typeof COMPANY_CONTACT_STATUSES)[number];

export const COMPANY_CONTACT_PAGE_SIZES = [10, 25, 50] as const;
export const COMPANY_CONTACT_DEFAULT_PAGE_SIZE = 10;

export const COMPANY_CONTACTS_TITLE = "Contact Persons";
export const COMPANY_CONTACTS_COPY = "Manage people who represent this company.";
export const COMPANY_TRAVELERS_TITLE = "Company Travelers / Guests";
export const COMPANY_TRAVELERS_COPY = "Manage people who travel under this company.";
export const COMPANY_DOCUMENTS_COPY = "Company files use the company document store. Identity documents stay on guest profiles.";
export const COMPANY_BILLING_COPY =
  "Billing reads reservation folios for this company. There is no separate accounts-receivable ledger.";
export const COMPANY_TA_SETTINGS_COMING = "Travel Agent Settings for this business type are not available on Company Detail yet.";
export const COMPANY_NOTE_CATEGORIES = ["general", "billing", "operations", "sales"] as const;
export type CompanyNoteCategory = (typeof COMPANY_NOTE_CATEGORIES)[number];
export const COMPANY_NOTE_VISIBILITIES = ["internal", "restricted"] as const;
export type CompanyNoteVisibility = (typeof COMPANY_NOTE_VISIBILITIES)[number];
export const COMPANY_DOCUMENT_STATUSES = ["pending", "verified", "rejected", "expired"] as const;
export type CompanyDocumentStatus = (typeof COMPANY_DOCUMENT_STATUSES)[number];
export const COMPANY_CONTACT_REQUIRED =
  "This business type requires a primary contact. Set another primary contact first.";
export const COMPANY_RATE_YES = "Yes";
export const COMPANY_RATE_NO = "No";

export function isCompanyDetailNavId(value: string | undefined): value is CompanyDetailNavId {
  return Boolean(value && (COMPANY_DETAIL_NAV_IDS as readonly string[]).includes(value));
}

export function companyDetailNav(id: string | undefined): CompanyDetailNavId {
  return isCompanyDetailNavId(id) ? id : "overview";
}

export function isTravelAgencyBusinessType(type: { code: string; name: string } | null | undefined): boolean {
  if (!type) return false;
  const code = type.code.trim().toUpperCase();
  if (code === "TRA") return true;
  const name = type.name.trim().toLowerCase();
  return name === "travel agency" || name === "travel agent";
}

export function companyHasCompanyRate(negotiatedRateReference: string | null | undefined): boolean {
  return Boolean(negotiatedRateReference?.trim());
}

export function visibleCompanyNav(options: {
  creditAccountAllowed: boolean;
  travelAgency: boolean;
}): Array<(typeof COMPANY_DETAIL_NAV)[number]> {
  return COMPANY_DETAIL_NAV.filter((item) => {
    if ("requiresTravelAgent" in item && item.requiresTravelAgent && !options.travelAgency) return false;
    return true;
  });
}

export function roleAssignableForNew(role: { active: boolean }, assigned: boolean): boolean {
  return role.active || assigned;
}

export function departmentAssignableForNew(
  department: { id: string; active: boolean },
  assignedId: string | null,
): boolean {
  return department.active || department.id === assignedId;
}

export function blockLastPrimaryRemoval(options: {
  contactRequired: boolean;
  currentIsPrimary: boolean;
  nextIsPrimary: boolean;
  nextStatus: CompanyContactStatus;
}): string | null {
  if (!options.contactRequired || !options.currentIsPrimary) return null;
  if (!options.nextIsPrimary || options.nextStatus === "inactive") return COMPANY_CONTACT_REQUIRED;
  return null;
}

export function contactMethodKpis(
  rows: Array<{ phone: string | null; email: string | null; whatsapp?: string | null }>,
): {
  phone: number;
  email: number;
  whatsapp: number;
} {
  return {
    phone: rows.filter((row) => Boolean(row.phone?.trim())).length,
    email: rows.filter((row) => Boolean(row.email?.trim())).length,
    whatsapp: rows.filter((row) => Boolean(row.whatsapp?.trim())).length,
  };
}

export function distinctDepartmentCount(rows: Array<{ departmentId: string | null }>): number {
  return new Set(rows.map((row) => row.departmentId).filter((id): id is string => Boolean(id))).size;
}

export function distinctDepartmentNames(
  rows: Array<{ departmentId: string | null }>,
  names: Map<string, string>,
): string[] {
  const ids = [...new Set(rows.map((row) => row.departmentId).filter((id): id is string => Boolean(id)))];
  return ids.map((id) => names.get(id)).filter((name): name is string => Boolean(name));
}

export function agreementStatus(row: {
  active: boolean;
  validFrom: string | null;
  validTo: string | null;
}, today: string): "active" | "expiring" | "expired" | "inactive" {
  if (row.validTo && row.validTo < today) return "expired";
  if (!row.active) return "inactive";
  if (row.validTo) {
    const soon = new Date(`${today}T00:00:00.000Z`);
    soon.setUTCDate(soon.getUTCDate() + 30);
    const until = soon.toISOString().slice(0, 10);
    if (row.validTo <= until) return "expiring";
  }
  if (row.validFrom && row.validFrom > today) return "inactive";
  return "active";
}

export function companyOverviewKpis(input: {
  reservationCount: number;
  guestCount: number;
  revenue: KnownMoney | null;
  nightCount: number;
  stayCount: number;
}): {
  totalReservations: number;
  totalGuests: number;
  totalRevenue: KnownMoney | null;
  averageLengthOfStay: number | null;
} {
  return {
    totalReservations: input.reservationCount,
    totalGuests: input.guestCount,
    totalRevenue: input.revenue,
    averageLengthOfStay:
      input.stayCount > 0 ? Math.round((input.nightCount / input.stayCount) * 10) / 10 : null,
  };
}

export function travelerTypeLabel(options: { vip: boolean; groupLeader: boolean }): "VIP" | "Group Leader" | "Regular" {
  if (options.groupLeader) return "Group Leader";
  if (options.vip) return "VIP";
  return "Regular";
}

export function travelerKpis(rows: Array<{
  guestStatus: string;
  vip: boolean;
  groupLeader: boolean;
  upcomingTrips: number;
}>): {
  total: number;
  active: number;
  vip: number;
  groupLeaders: number;
  upcomingTrips: number;
} {
  return {
    total: rows.length,
    active: rows.filter((row) => row.guestStatus === "active").length,
    vip: rows.filter((row) => row.vip).length,
    groupLeaders: rows.filter((row) => row.groupLeader).length,
    upcomingTrips: rows.reduce((sum, row) => sum + row.upcomingTrips, 0),
  };
}

export function contactActivityLabel(eventType: string): string {
  if (eventType === "contact_created") return "Contact created";
  if (eventType === "contact_updated") return "Contact updated";
  if (eventType === "primary_contact_changed") return "Primary contact changed";
  if (eventType === "relationship_linked") return "Contact linked to company";
  if (eventType === "status_changed") return "Contact status changed";
  return eventType.replaceAll("_", " ");
}

export function companyReservationKpis(
  rows: Array<{ status: string; arrivalDate: string; departureDate: string; nights: number }>,
  today: string,
): {
  total: number;
  upcoming: number;
  inHouse: number;
  completed: number;
  cancelled: number;
  roomNights: number;
} {
  return {
    total: rows.length,
    upcoming: rows.filter((row) => (row.status === "pending" || row.status === "confirmed") && row.arrivalDate >= today).length,
    inHouse: rows.filter((row) => row.status === "checked_in").length,
    completed: rows.filter((row) => row.status === "checked_out").length,
    cancelled: rows.filter((row) => row.status === "cancelled" || row.status === "no_show").length,
    roomNights: rows.reduce((sum, row) => sum + row.nights, 0),
  };
}

export function companyBillingTotals(rows: Array<{ amount: number; folioStatus: string }>): {
  charges: number;
  credits: number;
  outstanding: number;
} {
  let charges = 0;
  let credits = 0;
  let outstanding = 0;
  const bySign = new Map<string, number>();
  for (const row of rows) {
    if (row.amount >= 0) charges += row.amount;
    else credits += -row.amount;
  }
  for (const row of rows) {
    const current = bySign.get(row.folioStatus) ?? 0;
    bySign.set(row.folioStatus, current + row.amount);
  }
  outstanding = Math.max(0, charges - credits);
  return {
    charges: Math.round(charges * 100) / 100,
    credits: Math.round(credits * 100) / 100,
    outstanding: Math.round(outstanding * 100) / 100,
  };
}

export function latestNoteById<T extends { noteId: string; createdAt: string }>(rows: T[]): T[] {
  const latest = new Map<string, T>();
  for (const row of rows) {
    const current = latest.get(row.noteId);
    if (!current || row.createdAt > current.createdAt) latest.set(row.noteId, row);
  }
  return [...latest.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function companyDocumentStatus(options: {
  reviewStatus: "pending" | "verified" | "rejected";
  expiryDate: string | null;
  today: string;
}): CompanyDocumentStatus {
  if (options.reviewStatus === "rejected") return "rejected";
  if (options.expiryDate && options.expiryDate < options.today) return "expired";
  return options.reviewStatus;
}

export function companyDocumentKpis(rows: Array<{ status: CompanyDocumentStatus; expiryDate: string | null }>, today: string): {
  total: number;
  verified: number;
  pending: number;
  expiring: number;
  expired: number;
} {
  const soon = new Date(`${today}T00:00:00.000Z`);
  soon.setUTCDate(soon.getUTCDate() + 30);
  const until = soon.toISOString().slice(0, 10);
  return {
    total: rows.length,
    verified: rows.filter((row) => row.status === "verified").length,
    pending: rows.filter((row) => row.status === "pending").length,
    expiring: rows.filter((row) => row.status !== "expired" && row.expiryDate && row.expiryDate >= today && row.expiryDate <= until).length,
    expired: rows.filter((row) => row.status === "expired").length,
  };
}

export function formatMoneyLabel(value: KnownMoney | null): string {
  if (!value) return "—";
  const amount = value.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return value.currency ? `${value.currency} ${amount}` : amount;
}

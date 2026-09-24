/**
 * Guest Profile Module — Wave 4 helpers (Company / Group / TA masters,
 * Relationships, Loyalty & Value).
 *
 * Persistence is Guest-owned (`guest_account_masters` + `guest_account_links`).
 * Loyalty figures compose from Wave 3 stay / folio reads — no invented points.
 * Bill-to is an association only. Group account ≠ Sales & Events blocks.
 */

import type { GuestProfileTypeId } from "./guest-profile-wave1.ts";
import type { GuestStayOverview, KnownMoney } from "./guest-profile-wave3.ts";

export const WAVE4_MIGRATION_FILE = "0053_pms_guest_profile_wave4.sql";

export const WAVE4_MIGRATION_UNAVAILABLE =
  "Unavailable until Guest Profile Wave 4 migration 0053 is applied.";

export const GUEST_ACCOUNT_TYPES = ["company", "group", "travel_agent"] as const;
export type GuestAccountType = (typeof GUEST_ACCOUNT_TYPES)[number];

export const GUEST_ACCOUNT_TYPE_LABELS: Record<GuestAccountType, string> = {
  company: "Company",
  group: "Group account",
  travel_agent: "Travel Agent",
};

export const GUEST_ACCOUNT_STATUSES = ["active", "inactive", "pending"] as const;
export type GuestAccountStatus = (typeof GUEST_ACCOUNT_STATUSES)[number];

export const GUEST_RELATIONSHIP_ROLES = [
  "employer",
  "bill_to",
  "booker_ta",
  "group_member",
] as const;
export type GuestRelationshipRole = (typeof GUEST_RELATIONSHIP_ROLES)[number];

export const GUEST_RELATIONSHIP_ROLE_LABELS: Record<GuestRelationshipRole, string> = {
  employer: "Employer",
  bill_to: "Bill-to",
  booker_ta: "Booker travel agent",
  group_member: "Group member",
};

/** Each relationship role is bound to one Guest master type. */
export const ROLE_ACCOUNT_TYPE: Record<GuestRelationshipRole, GuestAccountType> = {
  employer: "company",
  bill_to: "company",
  booker_ta: "travel_agent",
  group_member: "group",
};

export const WAVE4_LOYALTY_COPY =
  "Stay counts, nights and stored folio amounts only. There is no points balance. VIP remains a staff flag on Information.";

export const WAVE4_LOYALTY_EMPTY =
  "No derived stay or folio figures yet. This card does not invent points or spend.";

export const WAVE4_VIP_STAFF_FLAG_COPY =
  "VIP is a staff flag on Information. It is not a loyalty programme or points tier.";

export const WAVE4_BILL_TO_COPY =
  "Bill-to stores an association only. It does not route folio splits. Cashiering transfers are not supported.";

export const WAVE4_GROUP_ACCOUNT_COPY =
  "Group account master in Guest. This is not a Sales & Events group block, allotment or rooming list.";

export const WAVE4_UNLINK_COPY =
  "Unlink removes the relationship only. The individual and the master stay in the directory.";

export const WAVE4_TYPED_LABEL_COPY =
  "FO typed company/group labels are search text, not Guest masters. Reservations consume Guest master IDs.";

export const WAVE4_RESERVATION_MASTER_COPY =
  "Link this stay to a Guest Company, Group account or Travel Agent master. Typed company/group names are not masters.";

export const WAVE4_NO_POINTS_COPY = "No points balance is shown.";

export const WAVE4_SET3_FLAG_COPY =
  "Setup flag only — not a Guest Company master. Creating a Company master does not require this flag.";

export const WAVE4_ACCEPTANCE_CRITERIA = [
  "AC-W4-1",
  "AC-W4-2",
  "AC-W4-3",
  "AC-W4-4",
  "AC-W4-5",
  "AC-W4-6",
  "AC-W4-7",
  "AC-W4-8",
  "AC-W4-9",
  "AC-W4-10",
  "AC-W4-11",
  "AC-W4-12",
  "AC-W4-13",
  "AC-W4-14",
  "AC-W4-15",
  "AC-W4-16",
  "AC-W4-17",
  "AC-W4-18",
  "AC-W4-19",
  "AC-W4-20",
  "AC-W4-21",
  "AC-W4-22",
  "AC-W4-23",
] as const;

export const GUEST_ACCOUNT_EVENT_TYPES = [
  "created",
  "profile_updated",
  "relationship_linked",
  "relationship_unlinked",
  "comms_logged",
  "comms_sent",
  "exported",
  "anonymised",
  "status_changed",
  "logo_updated",
  "credit_account_changed",
    "imported",
  "note_added",
  "note_updated",
  "note_archived",
  "contact_created",
  "contact_updated",
  "primary_contact_changed",
  "document_uploaded",
  "document_verified",
  "document_rejected",
  "document_replaced",
  "agreement_created",
  "agreement_updated",
  "commission_configured",
  "commission_calculated",
  "commission_updated",
  "allotment_changed",
  "settings_changed",
  "member_imported",
  "reservation_linked",
  "reservation_unlinked",
  "room_assigned",
  "room_changed",
  "room_unassigned",
  "auto_assignment_failed",
  "document_generated",
  "template_applied",
  "duplicated",
] as const;
export type GuestAccountEventType = (typeof GUEST_ACCOUNT_EVENT_TYPES)[number];

export function isGuestAccountType(value: string): value is GuestAccountType {
  return (GUEST_ACCOUNT_TYPES as readonly string[]).includes(value);
}

export function isGuestRelationshipRole(value: string): value is GuestRelationshipRole {
  return (GUEST_RELATIONSHIP_ROLES as readonly string[]).includes(value);
}

export function profileTypeToAccountType(id: GuestProfileTypeId): GuestAccountType | null {
  if (id === "individual") return null;
  if (id === "travel-agent") return "travel_agent";
  if (id === "company" || id === "group") return id;
  return null;
}

export function accountTypeToProfileType(type: GuestAccountType): Exclude<GuestProfileTypeId, "individual"> {
  return type === "travel_agent" ? "travel-agent" : type;
}

export function rolesForAccountType(type: GuestAccountType): GuestRelationshipRole[] {
  return GUEST_RELATIONSHIP_ROLES.filter((role) => ROLE_ACCOUNT_TYPE[role] === type);
}

export function assertRoleMatchesType(role: GuestRelationshipRole, type: GuestAccountType): string | null {
  if (ROLE_ACCOUNT_TYPE[role] !== type) {
    return `${GUEST_RELATIONSHIP_ROLE_LABELS[role]} links to a ${GUEST_ACCOUNT_TYPE_LABELS[ROLE_ACCOUNT_TYPE[role]]} master.`;
  }
  return null;
}

export type GuestAccountSummary = {
  id: string;
  accountType: GuestAccountType;
  name: string;
  code: string | null;
  phone: string | null;
  email: string | null;
  accountStatus: GuestAccountStatus;
  updatedAt: string;
  anonymisedAt: string | null;
  tradeName: string | null;
  companyType: string | null;
  agencyType: string | null;
  businessProfileTypeId?: string | null;
  businessProfileTypeName?: string | null;
  businessProfileTypeActive?: boolean;
  primaryContactName?: string | null;
  country?: string | null;
  creditAccountEnabled?: boolean;
  logoUrl?: string | null;
  logoStoragePath?: string | null;
};

export type GuestAccountListPage = {
  items: GuestAccountSummary[];
  total: number;
  offset: number;
  limit: number;
};

export function accountListItems(
  data: GuestAccountListPage | GuestAccountSummary[] | null | undefined,
): GuestAccountSummary[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return data.items;
}

export type GuestAccountProfile = GuestAccountSummary & {
  addressLine1: string | null;
  city: string | null;
  country: string | null;
  notes: string | null;
  createdAt: string;
  companyTypeOther: string | null;
  taxId: string | null;
  businessRegistrationNumber: string | null;
  phoneAlt: string | null;
  emailAlt: string | null;
  primaryContactName: string | null;
  addressLine2: string | null;
  region: string | null;
  postalCode: string | null;
  corporateAccountReference: string | null;
  negotiatedRateReference: string | null;
  defaultTravelAgentMasterId: string | null;
  defaultTravelAgentMasterName: string | null;
  sourceOfBusiness: string | null;
  agencyTypeOther: string | null;
  website: string | null;
  billingContactName: string | null;
  iataLicenseNumber: string | null;
  licenseExpiryDate: string | null;
  commissionLabel: string | null;
  commissionType: string | null;
  commissionCurrencyNote: string | null;
  contractReference: string | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  contractStatus: string | null;
  contractSignedWith: string | null;
  paymentTerms: string | null;
  creditLimitNote: string | null;
  billingInstruction: string | null;
  businessProfileTypeId: string | null;
  primaryContactTitle: string | null;
  creditAccountEnabled: boolean;
  logoStoragePath: string | null;
  logoUrl: string | null;
};

export type GuestAccountLink = {
  id: string;
  guestId: string;
  guestName: string;
  masterId: string;
  masterName: string;
  masterType: GuestAccountType;
  role: GuestRelationshipRole;
  createdAt: string;
};

export type GuestLoyaltyValue = {
  stayCount: number;
  nightCount: number;
  roomTotal: KnownMoney | null;
  folioOutstanding: KnownMoney | null;
  vip: boolean;
  memberCount: number | null;
};

export function loyaltyFromStayOverview(
  overview: GuestStayOverview,
  vip: boolean,
): GuestLoyaltyValue {
  return {
    stayCount: overview.stayCount,
    nightCount: overview.nightCount,
    roomTotal: overview.roomTotal,
    folioOutstanding: overview.folioOutstanding,
    vip,
    memberCount: null,
  };
}

export function hasDerivedLoyaltyFigures(value: GuestLoyaltyValue): boolean {
  return (
    value.stayCount > 0 ||
    value.nightCount > 0 ||
    value.roomTotal !== null ||
    value.folioOutstanding !== null
  );
}

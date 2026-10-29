import type { AvailabilitySearchCriteria } from "@/packages/pms/lib/create-reservation-phase1-section4";
import type { ReservationTypeMode } from "@/packages/pms/lib/create-reservation-phase1";
import type { ReservationMode } from "@/packages/pms/lib/reservation-mode";

export const CREATE_RESERVATION_DRAFT_VERSION = 1;
const CREATE_RESERVATION_DRAFT_PREFIX = "reservation-create-draft";
const SENSITIVE_DRAFT_KEYS = [
  "cardNumber",
  "cardExpiry",
  "cardHolderName",
  "cvv",
  "quoteTotal",
  "subtotal",
];

export type CreateReservationDraftRelation = "company" | "travel_agent" | "group";

export type CreateReservationDraftGuest = {
  id: string;
  fullName: string;
};

export type CreateReservationDraftMaster = {
  id: string;
  name: string;
  code: string | null;
  paymentTerms: string | null;
};

export type CreateReservationDraftService = {
  serviceTypeId: string;
  name: string;
  description: string;
  pricingUnit?: "per_service" | "per_room" | "per_item" | "per_person" | "per_night" | null;
  unitAmount?: number | null;
  departmentId?: string | null;
  quantity?: number;
  quantityEdited?: boolean;
};

const DRAFT_SERVICE_UNITS = ["per_service", "per_room", "per_item", "per_person", "per_night"] as const;

export type CreateReservationDraftRoomUnit = {
  key: string;
  roomTypeId: string;
  adults: number;
  children: number;
  infants: number;
  ratePlanId: string | null;
  occupant: { guestId: string; fullName: string } | null;
  pmsGroupBlockId?: string | null;
};

export type CreateReservationDraft = {
  version: typeof CREATE_RESERVATION_DRAFT_VERSION;
  workflowStep: number;
  reservationType: ReservationTypeMode;
  reservationMode: ReservationMode;
  activeRoomIndex: number;
  guest: CreateReservationDraftGuest | null;
  arrival: string;
  departure: string;
  adults: number;
  children: number;
  infants: number;
  roomsRequested: number;
  extraRoomUnits: CreateReservationDraftRoomUnit[];
  roomTypeId: string;
  selectedRoomType: {
    roomTypeId: string;
    name: string;
    code: string;
    maxOccupancy: number;
    adultCapacity: number;
    childCapacity: number;
  } | null;
  roomId: string;
  ratePlanId: string;
  ratePreference: string;
  searchRoomTypeFilter: string;
  availabilitySearchCommitted: AvailabilitySearchCriteria | null;
  quoteCurrency: string;
  specialRequests: string;
  notes: string;
  bookingSource: string;
  salesChannel: string;
  marketSegment: string;
  externalReference: string;
  purposeOfStay: string;
  relationTab: CreateReservationDraftRelation;
  companyMaster: CreateReservationDraftMaster | null;
  travelAgentMaster: CreateReservationDraftMaster | null;
  groupMaster: CreateReservationDraftMaster | null;
  companyOverride: boolean;
  travelAgentOverride: boolean;
  groupOverride: boolean;
  linkedGroupId: string | null;
  linkedBlockId: string | null;
  companyContactId: string;
  travelAgentContactId: string;
  billingRuleId: string;
  packageActivationIds: string[];
  selectedServiceRequests: CreateReservationDraftService[];
  guaranteeMethod: string;
  depositReference: string;
  depositPaymentMethod: string;
  depositDueDate: string;
  paymentReceivedAmount?: string;
  paymentReceivedTender?: string;
  paymentReceivedReference?: string;
  guestDepositAmount?: string;
  guestDepositTender?: string;
  guestDepositReference?: string;
};

export function createReservationDraftKey(propertyId: string, scopeId: string): string {
  return `${CREATE_RESERVATION_DRAFT_PREFIX}:${propertyId}:${scopeId}`;
}

export function createReservationDraftIsMeaningful(
  draft: CreateReservationDraft,
  defaults: { arrival: string; departure: string; unassignedRoomId: string },
): boolean {
  if (draft.workflowStep > 0) return true;
  if (draft.guest) return true;
  if (draft.roomTypeId || draft.ratePlanId) return true;
  if (draft.roomId && draft.roomId !== defaults.unassignedRoomId) return true;
  if (draft.bookingSource || draft.salesChannel || draft.marketSegment || draft.externalReference) {
    return true;
  }
  if (draft.companyMaster || draft.travelAgentMaster || draft.groupMaster || draft.linkedGroupId) {
    return true;
  }
  if (draft.packageActivationIds.length > 0 || draft.selectedServiceRequests.length > 0)
    return true;
  if (draft.specialRequests.trim() || draft.notes.trim()) return true;
  if (
    draft.guaranteeMethod ||
    draft.depositReference ||
    draft.depositPaymentMethod ||
    draft.depositDueDate ||
    draft.paymentReceivedAmount ||
    draft.paymentReceivedTender ||
    draft.paymentReceivedReference ||
    draft.guestDepositAmount ||
    draft.guestDepositTender ||
    draft.guestDepositReference
  ) {
    return true;
  }
  if (draft.extraRoomUnits.length > 0) return true;
  if (draft.availabilitySearchCommitted) return true;
  if (
    draft.adults !== 1 ||
    draft.children !== 0 ||
    draft.infants !== 0 ||
    draft.roomsRequested !== 1
  ) {
    return true;
  }
  if (draft.arrival !== defaults.arrival || draft.departure !== defaults.departure) return true;
  if (draft.ratePreference || draft.searchRoomTypeFilter || draft.quoteCurrency) return true;
  if (draft.relationTab !== "company") return true;
  if (draft.companyContactId || draft.travelAgentContactId || draft.billingRuleId) return true;
  if (draft.reservationType !== "individual" || draft.purposeOfStay) return true;
  if (draft.reservationMode === "group") return true;
  if (draft.activeRoomIndex > 0) return true;
  return false;
}

export function shouldDropMissingRoomType(input: {
  roomTypeId: string;
  searchSettled: boolean;
  availableRoomTypeIds: string[];
}): boolean {
  if (!input.roomTypeId || !input.searchSettled) return false;
  return !input.availableRoomTypeIds.includes(input.roomTypeId);
}

export function parseCreateReservationDraft(payload: unknown): CreateReservationDraft | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (record.version !== CREATE_RESERVATION_DRAFT_VERSION) return null;
  for (const key of SENSITIVE_DRAFT_KEYS) {
    if (key in record) delete record[key];
  }
  const relation = record.relationTab;
  const relationTab: CreateReservationDraftRelation =
    relation === "travel_agent" || relation === "group" || relation === "company"
      ? relation
      : "company";
  const reservationType = record.reservationType;
  return {
    version: CREATE_RESERVATION_DRAFT_VERSION,
    workflowStep: clampInt(record.workflowStep, 0, 3, 0),
    reservationType:
      reservationType === "corporate" || reservationType === "travel_agency"
        ? reservationType
        : "individual",
    reservationMode: record.reservationMode === "group" ? "group" : "single",
    activeRoomIndex: clampInt(record.activeRoomIndex, 0, 19, 0),
    guest: parseGuest(record.guest),
    arrival: text(record.arrival),
    departure: text(record.departure),
    adults: clampInt(record.adults, 1, 20, 1),
    children: clampInt(record.children, 0, 20, 0),
    infants: clampInt(record.infants, 0, 20, 0),
    roomsRequested: clampInt(record.roomsRequested, 1, 20, 1),
    extraRoomUnits: parseExtraRoomUnits(record.extraRoomUnits),
    roomTypeId: text(record.roomTypeId),
    selectedRoomType: parseRoomType(record.selectedRoomType),
    roomId: text(record.roomId) || "unassigned",
    ratePlanId: text(record.ratePlanId),
    ratePreference: text(record.ratePreference),
    searchRoomTypeFilter: text(record.searchRoomTypeFilter),
    availabilitySearchCommitted: parseSearch(record.availabilitySearchCommitted),
    quoteCurrency: text(record.quoteCurrency),
    specialRequests: text(record.specialRequests),
    notes: text(record.notes),
    bookingSource: text(record.bookingSource),
    salesChannel: text(record.salesChannel),
    marketSegment: text(record.marketSegment),
    externalReference: text(record.externalReference),
    purposeOfStay: text(record.purposeOfStay),
    relationTab,
    companyMaster: parseMaster(record.companyMaster),
    travelAgentMaster: parseMaster(record.travelAgentMaster),
    groupMaster: parseMaster(record.groupMaster),
    companyOverride: record.companyOverride === true,
    travelAgentOverride: record.travelAgentOverride === true,
    groupOverride: record.groupOverride === true,
    linkedGroupId: text(record.linkedGroupId) || null,
    linkedBlockId: text(record.linkedBlockId) || null,
    companyContactId: text(record.companyContactId),
    travelAgentContactId: text(record.travelAgentContactId),
    billingRuleId: text(record.billingRuleId),
    packageActivationIds: stringList(record.packageActivationIds),
    selectedServiceRequests: parseServices(record.selectedServiceRequests),
    guaranteeMethod: text(record.guaranteeMethod),
    depositReference: text(record.depositReference),
    depositPaymentMethod: text(record.depositPaymentMethod),
    depositDueDate: text(record.depositDueDate),
    paymentReceivedAmount: text(record.paymentReceivedAmount),
    paymentReceivedTender: text(record.paymentReceivedTender),
    paymentReceivedReference: text(record.paymentReceivedReference),
    guestDepositAmount: text(record.guestDepositAmount),
    guestDepositTender: text(record.guestDepositTender),
    guestDepositReference: text(record.guestDepositReference),
  };
}

export function readCreateReservationDraftFrom(
  store: Storage,
  propertyId: string,
  scopeId: string,
): CreateReservationDraft | null {
  const key = createReservationDraftKey(propertyId, scopeId);
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const parsed = parseCreateReservationDraft(JSON.parse(raw));
    if (!parsed) store.removeItem(key);
    return parsed;
  } catch {
    store.removeItem(key);
    return null;
  }
}

export function writeCreateReservationDraftTo(
  store: Storage,
  propertyId: string,
  scopeId: string,
  draft: CreateReservationDraft,
): void {
  const safe = parseCreateReservationDraft(draft);
  if (!safe) return;
  store.setItem(createReservationDraftKey(propertyId, scopeId), JSON.stringify(safe));
}

export function clearCreateReservationDraftFrom(
  store: Storage,
  propertyId: string,
  scopeId: string,
): void {
  store.removeItem(createReservationDraftKey(propertyId, scopeId));
}

function draftStorage(): Storage | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

export function readCreateReservationDraft(
  propertyId: string,
  scopeId: string,
): CreateReservationDraft | null {
  const store = draftStorage();
  if (!store) return null;
  return readCreateReservationDraftFrom(store, propertyId, scopeId);
}

export function writeCreateReservationDraft(
  propertyId: string,
  scopeId: string,
  draft: CreateReservationDraft,
): void {
  const store = draftStorage();
  if (!store) return;
  writeCreateReservationDraftTo(store, propertyId, scopeId, draft);
}

export function clearCreateReservationDraft(propertyId: string, scopeId: string): void {
  const store = draftStorage();
  if (!store) return;
  clearCreateReservationDraftFrom(store, propertyId, scopeId);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number < min || number > max) return fallback;
  return number;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function parseExtraRoomUnits(value: unknown): CreateReservationDraftRoomUnit[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 19).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const roomTypeId = text(row.roomTypeId);
    const key = text(row.key);
    if (!key && !roomTypeId) return [];
    const occupant = row.occupant;
    const occupantRow =
      occupant && typeof occupant === "object"
        ? (occupant as { guestId?: unknown; fullName?: unknown })
        : null;
    return [
      {
        key: key || roomTypeId,
        roomTypeId,
        adults: clampInt(row.adults, 1, 20, 1),
        children: clampInt(row.children, 0, 20, 0),
        infants: clampInt(row.infants, 0, 20, 0),
        ratePlanId: text(row.ratePlanId) || null,
        occupant:
          occupantRow &&
          typeof occupantRow.guestId === "string" &&
          occupantRow.guestId &&
          typeof occupantRow.fullName === "string" &&
          occupantRow.fullName
            ? { guestId: occupantRow.guestId, fullName: occupantRow.fullName }
            : null,
      },
    ];
  });
}

function parseGuest(value: unknown): CreateReservationDraftGuest | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id || typeof row.fullName !== "string" || !row.fullName) {
    return null;
  }
  return { ...(row as CreateReservationDraftGuest), id: row.id, fullName: row.fullName };
}

function parseRoomType(value: unknown): CreateReservationDraft["selectedRoomType"] {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.roomTypeId !== "string" ||
    typeof row.name !== "string" ||
    typeof row.code !== "string"
  ) {
    return null;
  }
  return {
    roomTypeId: row.roomTypeId,
    name: row.name,
    code: row.code,
    maxOccupancy: clampInt(row.maxOccupancy, 0, 99, 0),
    adultCapacity: clampInt(row.adultCapacity, 0, 99, 0),
    childCapacity: clampInt(row.childCapacity, 0, 99, 0),
  };
}

function parseMaster(value: unknown): CreateReservationDraftMaster | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id || typeof row.name !== "string" || !row.name)
    return null;
  return {
    id: row.id,
    name: row.name,
    code: typeof row.code === "string" ? row.code : null,
    paymentTerms: typeof row.paymentTerms === "string" ? row.paymentTerms : null,
  };
}

function parseSearch(value: unknown): AvailabilitySearchCriteria | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.arrival !== "string" || typeof row.departure !== "string") return null;
  return {
    arrival: row.arrival,
    departure: row.departure,
    rooms: clampInt(row.rooms, 1, 20, 1),
    adults: clampInt(row.adults, 1, 20, 1),
    children: clampInt(row.children, 0, 20, 0),
    infants: clampInt(row.infants, 0, 20, 0),
    roomTypePreference: text(row.roomTypePreference),
    ratePreference: text(row.ratePreference),
  };
}

function parseServices(value: unknown): CreateReservationDraftService[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.serviceTypeId !== "string" || typeof row.name !== "string") return [];
    const unit = DRAFT_SERVICE_UNITS.find((value) => value === row.pricingUnit) ?? null;
    const quantity =
      typeof row.quantity === "number" && Number.isInteger(row.quantity)
        ? Math.min(99, Math.max(1, row.quantity))
        : undefined;
    return [
      {
        serviceTypeId: row.serviceTypeId,
        name: row.name,
        description: typeof row.description === "string" ? row.description : "",
        ...("pricingUnit" in row
          ? {
              pricingUnit: unit,
              unitAmount: typeof row.unitAmount === "number" ? row.unitAmount : null,
              departmentId: typeof row.departmentId === "string" ? row.departmentId : null,
            }
          : {}),
        ...(quantity != null ? { quantity } : {}),
        quantityEdited: row.quantityEdited === true,
      },
    ];
  });
}

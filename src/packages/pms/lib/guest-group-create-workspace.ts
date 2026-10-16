/**
 * Register New Group workflow helpers.
 * Canonical rows stay on guest_account_masters.account_type = group.
 * Extra travel/billing intent is stored as group_operations, not a second ledger.
 */

import { validateGroupDates, type GroupMemberStatus } from "./guest-group-detail-workspace.ts";
import { uniqueIssueMessages, type CreateFieldIssue } from "./guest-create-step-issues.ts";

function nightsBetweenLocal(arrival: string, departure: string): number {
  const start = Date.parse(`${arrival}T00:00:00Z`);
  const end = Date.parse(`${departure}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

export const GUEST_GROUP_CREATE_MIGRATION_FILE = "0097_pms_group_create_drafts.sql";

export const GUEST_GROUP_CREATE_STEPS = [
  { id: "details", number: 1, title: "Group Details" },
  { id: "stay", number: 2, title: "Travel & Stay" },
  { id: "guests", number: 3, title: "Guest Information" },
  { id: "billing", number: 4, title: "Financial & Billing" },
  { id: "review", number: 5, title: "Review & Confirm" },
] as const;

export type GuestGroupCreateStepId = (typeof GUEST_GROUP_CREATE_STEPS)[number]["id"];

export const GUEST_GROUP_CREATE_TITLE = "Register New Group";
export const GUEST_GROUP_CREATE_COPY =
  "Create a new group and manage all group details in one place.";
export const GUEST_GROUP_CREATE_DRAFT_SAVED =
  "Draft group saved. You can continue this registration later.";
export const GUEST_GROUP_CREATE_PROGRESS_KEPT =
  "Your progress is kept. Return to Register New Group to continue.";
export const GUEST_GROUP_CREATE_START_OVER = "Start Over";
export const GUEST_GROUP_CREATE_START_OVER_COPY =
  "This clears the form and saved progress. A draft group already created is kept.";
export const GUEST_GROUP_CREATE_HOLD_KEY_PREFIX = "noru.group-create.hold";
export const GUEST_GROUP_CREATE_HOLD_DEBOUNCE_MS = 700;

export const GROUP_CREATE_PRICING_UNAVAILABLE =
  "Estimated charges appear when the reservation rate service is available. No totals are invented during group creation.";
export const GROUP_CREATE_IMPORT_STRUCTURE =
  "CSV columns: first_name, last_name, email, phone, special_requests. Excel import is not available yet.";
export const GROUP_CREATE_NO_PHYSICAL_ROOMS =
  "Room requirements are demand only. Physical room assignment stays on Rooming List after the group exists.";
export const GROUP_CREATE_TRAVEL_METHOD_SOURCE = "placeholder" as const;

/** Isolated until a group travel-method catalogue exists in settings. */
export const GROUP_TRAVEL_METHODS = [
  { id: "flight", label: "Flight" },
  { id: "road", label: "Road" },
  { id: "train", label: "Train" },
  { id: "other", label: "Other" },
] as const;
export type GroupTravelMethodId = (typeof GROUP_TRAVEL_METHODS)[number]["id"];

/** Isolated until billing-arrangement configuration exists on the group catalogue. */
export const GROUP_BILLING_ARRANGEMENTS = [
  { id: "group_master", label: "Group Master" },
  { id: "individual", label: "Individual Guests" },
  { id: "company_agency", label: "Company / Agency" },
  { id: "split", label: "Split Billing" },
] as const;
export type GroupBillingArrangementId = (typeof GROUP_BILLING_ARRANGEMENTS)[number]["id"];

export type GuestGroupCreateMemberDraft = {
  key: string;
  guestId: string | null;
  guestName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: GroupMemberStatus;
  roomTypeId: string;
  bedPreference: string;
  specialRequests: string;
};

export type GuestGroupCreateRoomNeed = {
  key: string;
  roomTypeId: string;
  rooms: number;
  pax: number;
  mealPlanId: string;
  ratePlanId: string;
};

export type GuestGroupCreateDraft = {
  groupId: string | null;
  code: string;
  codeManual: boolean;
  name: string;
  groupTypeId: string;
  marketSegmentId: string;
  companyMasterId: string;
  companyMasterName: string;
  travelAgentMasterId: string;
  travelAgentMasterName: string;
  primaryContactGuestId: string;
  primaryContactName: string;
  contactEmail: string;
  contactPhone: string;
  notes: string;
  arrivalDate: string;
  departureDate: string;
  arrivalTime: string;
  departureTime: string;
  expectedPax: string;
  expectedRooms: string;
  arrivalMethod: string;
  arrivalFrom: string;
  arrivalTo: string;
  departureMethod: string;
  departureTo: string;
  destinations: string[];
  sourceCodeId: string;
  channelId: string;
  specialRequests: string;
  stayNotes: string;
  roomNeeds: GuestGroupCreateRoomNeed[];
  members: GuestGroupCreateMemberDraft[];
  importFilename: string;
  importStagedCount: number;
  ratePlanId: string;
  packageId: string;
  mealPlanId: string;
  currency: string;
  paymentMethodId: string;
  billingArrangement: string;
  depositRequired: boolean;
  depositAmount: string;
  depositPercent: string;
  depositDueDate: string;
  balanceDueDate: string;
  paymentTerms: string;
};

export type GuestGroupCreateHold = {
  step: GuestGroupCreateStepId;
  draft: GuestGroupCreateDraft;
};

export type GuestGroupCreateCompletionItem = {
  id: string;
  label: string;
  complete: boolean;
  requiredRemaining: boolean;
  step: GuestGroupCreateStepId;
};

export type GroupCreateCatalogueOption = {
  id: string;
  name: string;
  code?: string | null;
  active?: boolean;
};

export type GroupCreateEstimate = {
  roomCharges: number | null;
  packageCharges: number | null;
  extras: number | null;
  taxes: number | null;
  total: number | null;
  available: boolean;
  copy: string;
};

export function isGuestGroupCreateStepId(value: string | undefined): value is GuestGroupCreateStepId {
  return Boolean(value && GUEST_GROUP_CREATE_STEPS.some((step) => step.id === value));
}

export function guestGroupCreateStep(id: string | undefined): GuestGroupCreateStepId {
  return isGuestGroupCreateStepId(id) ? id : "details";
}

export function guestGroupCreateHoldKey(restaurantId: string): string {
  return `${GUEST_GROUP_CREATE_HOLD_KEY_PREFIX}:${restaurantId}`;
}

function guestGroupCreateStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function isGuestGroupCreateDraftShape(value: unknown): value is GuestGroupCreateDraft {
  return Boolean(value && typeof value === "object" && "name" in value && "members" in value && "roomNeeds" in value);
}

export function inferGuestGroupCreateStep(draft: GuestGroupCreateDraft): GuestGroupCreateStepId {
  if (filled(draft.billingArrangement) || filled(draft.ratePlanId) || filled(draft.paymentMethodId)) return "billing";
  if (draft.members.length > 0 || draft.importStagedCount > 0) return "guests";
  if (filled(draft.arrivalDate) || filled(draft.expectedPax)) return "stay";
  return "details";
}

export function parseGuestGroupCreateHold(payload: unknown): GuestGroupCreateHold | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as { step?: unknown; draft?: unknown };
  if (isGuestGroupCreateDraftShape(record.draft)) {
    return {
      step: isGuestGroupCreateStepId(String(record.step ?? ""))
        ? (record.step as GuestGroupCreateStepId)
        : inferGuestGroupCreateStep(record.draft),
      draft: normalizeGroupCreateDraft(record.draft),
    };
  }
  if (isGuestGroupCreateDraftShape(record)) {
    return { step: inferGuestGroupCreateStep(record), draft: normalizeGroupCreateDraft(record) };
  }
  return null;
}

export function readGuestGroupCreateHold(restaurantId: string): GuestGroupCreateHold | null {
  const storage = guestGroupCreateStorage();
  if (!storage) return null;
  try {
    return parseGuestGroupCreateHold(JSON.parse(storage.getItem(guestGroupCreateHoldKey(restaurantId)) ?? ""));
  } catch {
    return null;
  }
}

export function writeGuestGroupCreateHold(restaurantId: string, hold: GuestGroupCreateHold): void {
  const storage = guestGroupCreateStorage();
  if (!storage) return;
  storage.setItem(guestGroupCreateHoldKey(restaurantId), JSON.stringify(hold));
}

export function clearGuestGroupCreateHold(restaurantId: string): void {
  guestGroupCreateStorage()?.removeItem(guestGroupCreateHoldKey(restaurantId));
}

export function emptyGuestGroupCreateDraft(): GuestGroupCreateDraft {
  return {
    groupId: null,
    code: "",
    codeManual: false,
    name: "",
    groupTypeId: "",
    marketSegmentId: "",
    companyMasterId: "",
    companyMasterName: "",
    travelAgentMasterId: "",
    travelAgentMasterName: "",
    primaryContactGuestId: "",
    primaryContactName: "",
    contactEmail: "",
    contactPhone: "",
    notes: "",
    arrivalDate: "",
    departureDate: "",
    arrivalTime: "",
    departureTime: "",
    expectedPax: "",
    expectedRooms: "",
    arrivalMethod: "",
    arrivalFrom: "",
    arrivalTo: "",
    departureMethod: "",
    departureTo: "",
    destinations: [],
    sourceCodeId: "",
    channelId: "",
    specialRequests: "",
    stayNotes: "",
    roomNeeds: [],
    members: [],
    importFilename: "",
    importStagedCount: 0,
    ratePlanId: "",
    packageId: "",
    mealPlanId: "",
    currency: "",
    paymentMethodId: "",
    billingArrangement: "",
    depositRequired: false,
    depositAmount: "",
    depositPercent: "",
    depositDueDate: "",
    balanceDueDate: "",
    paymentTerms: "",
  };
}

export function normalizeGroupCreateDraft(draft: GuestGroupCreateDraft): GuestGroupCreateDraft {
  return {
    ...emptyGuestGroupCreateDraft(),
    ...draft,
    destinations: Array.isArray(draft.destinations) ? draft.destinations.filter((row) => filled(row)) : [],
    roomNeeds: Array.isArray(draft.roomNeeds) ? draft.roomNeeds : [],
    members: Array.isArray(draft.members) ? draft.members : [],
  };
}

export function newGroupCreateKey(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function filled(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

export function groupCreateNights(arrival: string, departure: string): number | null {
  if (!arrival || !departure) return null;
  if (validateGroupDates(arrival, departure)) return null;
  return nightsBetweenLocal(arrival, departure);
}

export function parsePositiveInt(value: string, allowZero = false): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return null;
  if (allowZero ? parsed < 0 : parsed <= 0) return null;
  return parsed;
}

export function groupCreateMemberCounts(draft: GuestGroupCreateDraft): {
  expected: number;
  registered: number;
  remaining: number;
} {
  const expected = parsePositiveInt(draft.expectedPax, true) ?? 0;
  const registered = draft.members.length;
  return {
    expected,
    registered,
    remaining: Math.max(0, expected - registered),
  };
}

export function emptyGroupCreateRoomNeed(): GuestGroupCreateRoomNeed {
  return {
    key: newGroupCreateKey("room"),
    roomTypeId: "",
    rooms: 1,
    pax: 1,
    mealPlanId: "",
    ratePlanId: "",
  };
}

export function emptyGroupCreateMember(): GuestGroupCreateMemberDraft {
  return {
    key: newGroupCreateKey("member"),
    guestId: null,
    guestName: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    status: "expected",
    roomTypeId: "",
    bedPreference: "",
    specialRequests: "",
  };
}

export function parseGroupMemberImportCsv(csv: string): {
  headers: string[];
  rows: Array<Record<string, string>>;
} {
  const lines = csv.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((line) => line.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const split = (line: string) =>
    line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, "").replace(/""/g, '"'));
  const headers = split(lines[0]).map((header) => header.toLowerCase());
  return {
    headers,
    rows: lines.slice(1).map((line) => {
      const cells = split(line);
      return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
    }),
  };
}

export function stageGroupMemberImport(
  csv: string,
  existing: GuestGroupCreateMemberDraft[],
): { members: GuestGroupCreateMemberDraft[]; errors: string[]; staged: number } {
  const parsed = parseGroupMemberImportCsv(csv);
  const errors: string[] = [];
  const members = [...existing];
  const seenGuestIds = new Set(existing.map((row) => row.guestId).filter(Boolean));
  const seenEmails = new Set(existing.map((row) => row.email.trim().toLowerCase()).filter(Boolean));
  const seenPhones = new Set(existing.map((row) => row.phone.trim()).filter(Boolean));
  let staged = 0;
  for (const [index, row] of parsed.rows.entries()) {
    const firstName = row.first_name || row.firstname || row.name || "";
    const lastName = row.last_name || row.lastname || "";
    const email = (row.email || "").trim();
    const phone = (row.phone || "").trim();
    const specialRequests = row.special_requests || row.notes || "";
    if (!firstName.trim()) {
      errors.push(`Row ${index + 2}: first name is required.`);
      continue;
    }
    if (email && seenEmails.has(email.toLowerCase())) {
      errors.push(`Row ${index + 2}: duplicate email in this group.`);
      continue;
    }
    if (phone && seenPhones.has(phone)) {
      errors.push(`Row ${index + 2}: duplicate phone in this group.`);
      continue;
    }
    const guestName = [firstName, lastName].filter((value) => filled(value)).join(" ").trim();
    members.push({
      ...emptyGroupCreateMember(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email,
      phone,
      guestName,
      specialRequests,
    });
    if (email) seenEmails.add(email.toLowerCase());
    if (phone) seenPhones.add(phone);
    staged += 1;
  }
  void seenGuestIds;
  return { members, errors, staged };
}

export type GroupCreateFieldIssue = CreateFieldIssue<GuestGroupCreateStepId>;

export function groupCreateFieldIssues(
  draft: GuestGroupCreateDraft,
  options?: {
    groupTypeIds?: string[];
    roomTypeIds?: string[];
    paymentMethodIds?: string[];
    currencyCodes?: string[];
  },
): GroupCreateFieldIssue[] {
  const issues: GroupCreateFieldIssue[] = [];
  const groupTypeIds = options?.groupTypeIds;
  const roomTypeIds = options?.roomTypeIds;
  const paymentMethodIds = options?.paymentMethodIds;
  const currencyCodes = options?.currencyCodes;
  if (!filled(draft.name)) issues.push({ key: "name", message: "Group name is required.", step: "details" });
  if (!filled(draft.groupTypeId)) issues.push({ key: "groupTypeId", message: "Group type is required.", step: "details" });
  if (filled(draft.groupTypeId) && groupTypeIds && !groupTypeIds.includes(draft.groupTypeId)) {
    issues.push({ key: "groupTypeId", message: "Select a configured group type.", step: "details" });
  }
  if (!filled(draft.arrivalDate) || !filled(draft.departureDate)) {
    issues.push({ key: "arrivalDate", message: "Arrival and departure dates are required.", step: "stay" });
    issues.push({ key: "departureDate", message: "Arrival and departure dates are required.", step: "stay" });
  }
  const dateError = validateGroupDates(draft.arrivalDate, draft.departureDate);
  if (dateError) {
    issues.push({ key: "arrivalDate", message: dateError, step: "stay" });
    issues.push({ key: "departureDate", message: dateError, step: "stay" });
  }
  if (parsePositiveInt(draft.expectedPax) == null) {
    issues.push({ key: "expectedPax", message: "Expected guests must be greater than 0.", step: "stay" });
  }
  const rooms = draft.expectedRooms.trim() === "" ? 0 : parsePositiveInt(draft.expectedRooms, true);
  if (draft.expectedRooms.trim() !== "" && rooms == null) {
    issues.push({ key: "expectedRooms", message: "Expected rooms cannot be negative.", step: "stay" });
  }
  for (const need of draft.roomNeeds) {
    if (need.rooms < 0 || need.pax < 0) {
      issues.push({ key: "roomNeeds", message: "Room quantities cannot be negative.", step: "stay" });
    }
    if (filled(need.roomTypeId) && roomTypeIds && !roomTypeIds.includes(need.roomTypeId)) {
      issues.push({ key: "roomNeeds", message: "Each room requirement must use a configured room type.", step: "stay" });
    }
    if (!filled(need.roomTypeId) && (need.rooms > 0 || need.pax > 0)) {
      issues.push({ key: "roomNeeds", message: "Select a room type for each room requirement.", step: "stay" });
    }
  }
  const guestIds = draft.members.map((row) => row.guestId).filter(Boolean) as string[];
  if (new Set(guestIds).size !== guestIds.length) {
    issues.push({ key: "members", message: "A guest can only be added to this group once.", step: "guests" });
  }
  for (const member of draft.members) {
    if (!member.guestId && !filled(member.firstName) && !filled(member.guestName)) {
      issues.push({ key: "members", message: "Each staged member needs a guest profile or a first name.", step: "guests" });
      break;
    }
  }
  if (!filled(draft.billingArrangement)) {
    issues.push({ key: "billingArrangement", message: "Billing arrangement is required.", step: "billing" });
  }
  if (
    filled(draft.billingArrangement) &&
    !GROUP_BILLING_ARRANGEMENTS.some((row) => row.id === draft.billingArrangement)
  ) {
    issues.push({ key: "billingArrangement", message: "Select a configured billing arrangement.", step: "billing" });
  }
  if (filled(draft.paymentMethodId) && paymentMethodIds && !paymentMethodIds.includes(draft.paymentMethodId)) {
    issues.push({ key: "paymentMethodId", message: "Select a configured payment method.", step: "billing" });
  }
  if (filled(draft.currency) && currencyCodes && currencyCodes.length > 0 && !currencyCodes.includes(draft.currency)) {
    issues.push({ key: "currency", message: "Select a configured currency.", step: "billing" });
  }
  if (draft.depositRequired) {
    const amount = draft.depositAmount.trim() === "" ? null : Number(draft.depositAmount);
    const percent = draft.depositPercent.trim() === "" ? null : Number(draft.depositPercent);
    if ((amount == null || Number.isNaN(amount) || amount <= 0) && (percent == null || Number.isNaN(percent) || percent <= 0)) {
      issues.push({ key: "depositAmount", message: "Enter a deposit amount or percentage.", step: "billing" });
      issues.push({ key: "depositPercent", message: "Enter a deposit amount or percentage.", step: "billing" });
    }
    if (percent != null && !Number.isNaN(percent) && (percent < 0 || percent > 100)) {
      issues.push({ key: "depositPercent", message: "Deposit percentage must be between 0 and 100.", step: "billing" });
    }
  }
  return issues;
}

export function groupCreateStepErrors(
  step: GuestGroupCreateStepId,
  draft: GuestGroupCreateDraft,
  options?: Parameters<typeof groupCreateFieldIssues>[1],
): string[] {
  return uniqueIssueMessages(groupCreateFieldIssues(draft, options), step);
}

export function groupCreateDraftErrors(
  draft: GuestGroupCreateDraft,
  options?: Parameters<typeof groupCreateStepErrors>[2],
): string[] {
  return groupCreateStepErrors("review", draft, options);
}

export function groupCreateDraftErrorsForSave(draft: GuestGroupCreateDraft): string[] {
  return filled(draft.name) ? [] : ["Group name is required to save a draft."];
}

export function guestGroupCreateHasChanges(draft: GuestGroupCreateDraft): boolean {
  const empty = emptyGuestGroupCreateDraft();
  const current = { ...draft, groupId: null, code: draft.codeManual ? draft.code : "" };
  const baseline = { ...empty, groupId: null };
  return JSON.stringify(current) !== JSON.stringify(baseline);
}

export function guestGroupCreateCompletion(draft: GuestGroupCreateDraft): {
  percent: number;
  items: GuestGroupCreateCompletionItem[];
} {
  const counts = groupCreateMemberCounts(draft);
  const items: GuestGroupCreateCompletionItem[] = [
    {
      id: "identity",
      label: "Group identity",
      complete: filled(draft.name) && filled(draft.groupTypeId),
      requiredRemaining: !filled(draft.name) || !filled(draft.groupTypeId),
      step: "details",
    },
    {
      id: "stay",
      label: "Travel dates",
      complete: !validateGroupDates(draft.arrivalDate, draft.departureDate) && Boolean(parsePositiveInt(draft.expectedPax)),
      requiredRemaining:
        Boolean(validateGroupDates(draft.arrivalDate, draft.departureDate)) || parsePositiveInt(draft.expectedPax) == null,
      step: "stay",
    },
    {
      id: "members",
      label: "Guest information",
      complete: true,
      requiredRemaining: false,
      step: "guests",
    },
    {
      id: "billing",
      label: "Billing arrangement",
      complete: filled(draft.billingArrangement),
      requiredRemaining: !filled(draft.billingArrangement),
      step: "billing",
    },
  ];
  void counts;
  const done = items.filter((item) => item.complete && !item.requiredRemaining).length;
  return {
    percent: items.length === 0 ? 0 : Math.round((done / items.length) * 100),
    items,
  };
}

export function estimateGroupCreationCharges(): GroupCreateEstimate {
  return {
    roomCharges: null,
    packageCharges: null,
    extras: null,
    taxes: null,
    total: null,
    available: false,
    copy: GROUP_CREATE_PRICING_UNAVAILABLE,
  };
}

export function optionLabel(options: GroupCreateCatalogueOption[], id: string): string {
  return options.find((row) => row.id === id)?.name || "";
}

export function travelMethodLabel(id: string): string {
  return GROUP_TRAVEL_METHODS.find((row) => row.id === id)?.label || id;
}

export function billingArrangementLabel(id: string): string {
  return GROUP_BILLING_ARRANGEMENTS.find((row) => row.id === id)?.label || id;
}

export function draftToGroupOperations(draft: GuestGroupCreateDraft): Record<string, unknown> {
  return {
    arrivalTime: blank(draft.arrivalTime),
    departureTime: blank(draft.departureTime),
    arrivalMethod: blank(draft.arrivalMethod),
    arrivalFrom: blank(draft.arrivalFrom),
    arrivalTo: blank(draft.arrivalTo),
    departureMethod: blank(draft.departureMethod),
    departureTo: blank(draft.departureTo),
    destinations: draft.destinations,
    channelId: blank(draft.channelId),
    stayNotes: blank(draft.stayNotes),
    roomNeeds: draft.roomNeeds
      .filter((row) => filled(row.roomTypeId))
      .map((row) => ({
        roomTypeId: row.roomTypeId,
        rooms: row.rooms,
        pax: row.pax,
        mealPlanId: blank(row.mealPlanId),
        ratePlanId: blank(row.ratePlanId),
      })),
    billing: {
      ratePlanId: blank(draft.ratePlanId),
      packageId: blank(draft.packageId),
      mealPlanId: blank(draft.mealPlanId),
      currency: blank(draft.currency),
      paymentMethodId: blank(draft.paymentMethodId),
      billingArrangement: blank(draft.billingArrangement),
      depositRequired: draft.depositRequired,
      depositAmount: draft.depositAmount.trim() === "" ? null : Number(draft.depositAmount),
      depositPercent: draft.depositPercent.trim() === "" ? null : Number(draft.depositPercent),
      depositDueDate: blank(draft.depositDueDate),
      balanceDueDate: blank(draft.balanceDueDate),
      paymentTerms: blank(draft.paymentTerms),
    },
  };
}

function blank(value: string): string | null {
  return filled(value) ? value.trim() : null;
}

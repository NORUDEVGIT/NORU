/**
 * FO-FS2 — Check-out stepper server writes.
 *
 * A–D gates live here. The Live status flip is still check_out_hotel_reservation
 * via completeFoCheckOut after the gates pass. Folio money stays on the
 * Cashiering ledger (open_folio_for_reservation / post_folio_transaction /
 * close_guest_folio). No second ledger.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MANAGE_ROLES } from "@/core/lib/workforce.server";
import {
  blankToNull,
  recordReservationEvent,
  requireReservationManager,
  reservationError,
} from "./reservations.server";
import {
  callPostFolioTransaction,
  cashierError,
  folioReportsSettled,
  requireCashierOperator,
} from "./cashiering.server";
import { loadPolish1Snapshot } from "./pms-polish1-payment-admin.functions";
import { folioTenderFromCatalogue } from "./pms-polish1-payment-admin";
import {
  canCompleteCheckOut,
  canContinueClose,
  canContinueFolio,
  canContinueSettle,
  canContinueStay,
  checkoutDocumentSubject,
  isFolioSettled,
  mapCashierShiftError,
  overrideKindForBalance,
  paymentAmountAllowed,
  platformEmailConfigured,
  renderCheckoutDocumentHtml,
  renderCheckoutDocumentText,
  roundMoney,
  shouldCloseFolioAtCheckout,
  type CheckOutDocumentSnapshot,
  type CheckoutOverrideKind,
} from "./fo-check-out";
import type { FrontOfficeStay } from "./frontoffice.functions";
import { nightsBetween } from "./reservation-dates";
import { loadGuestFolio } from "./cashiering.functions";
import { summarizeFolioLedger } from "./cashiering-tender-state";
import { isMissingSchemaError } from "./pms-set2-structure";
import {
  buildCheckOutCompletion,
  checkOutDocumentCapabilities,
  checkOutEligibility,
  checkOutFingerprint,
  checkOutHousekeepingConsequence,
  checkOutSettlementState,
  projectCheckOutCharges,
  projectCheckOutPayments,
  resolveCheckOutUnit,
  type CheckOutChargeItem,
  type CheckOutCompletion,
  type CheckOutDocumentCapabilities,
  type CheckOutEligibility,
  type CheckOutFolioFacts,
  type CheckOutHousekeepingConsequence,
  type CheckOutOverrideFacts,
  type CheckOutPaymentItem,
  type CheckOutSettlementState,
  type CheckOutUnitRow,
} from "./fo-check-out-contract";

const idSchema = z.string().uuid();

export type CheckOutLedgerLine = {
  id: string;
  type: string;
  description: string;
  amount: number;
  postedAt: string;
};

export type CheckOutFolioState = {
  folioId: string | null;
  folioNumber: string | null;
  status: "open" | "closed" | null;
  currency: string;
  charges: number;
  credits: number;
  balance: number;
  transactions: CheckOutLedgerLine[];
};

export type CheckOutOverrideState = {
  recorded: boolean;
  kind: CheckoutOverrideKind | null;
  reason: string | null;
};

export type CheckOutContext = {
  stay: FrontOfficeStay;
  rateMissing: boolean;
  propertyName: string;
  guestEmail: string | null;
  folio: CheckOutFolioState;
  override: CheckOutOverrideState;
  canOverride: boolean;
  emailConfigured: boolean;
  actorName: string;
};

const EMPTY_FOLIO: CheckOutFolioState = {
  folioId: null,
  folioNumber: null,
  status: null,
  currency: "GBP",
  charges: 0,
  credits: 0,
  balance: 0,
  transactions: [],
};

function joinName(first: string, last: string | null): string {
  return [first, last].filter(Boolean).join(" ").trim();
}

function emailSecrets(): { apiKey: string | null; from: string | null } {
  return {
    apiKey: process.env["RESEND_API_KEY"]?.trim() || null,
    from: process.env["RECEIPT_EMAIL_FROM"]?.trim() || null,
  };
}

function requireSupervisor(role: string): void {
  if (!(MANAGE_ROLES as readonly string[]).includes(role)) {
    throw new Error("You don't have permission to override checkout settlement.");
  }
}

function isCheckoutOverride(values: unknown): values is {
  checkout_override: true;
  kind?: CheckoutOverrideKind;
  reason?: string;
} {
  if (!values || typeof values !== "object") return false;
  return (values as { checkout_override?: unknown }).checkout_override === true;
}

function totals(rows: { amount: number }[]): { charges: number; credits: number; balance: number } {
  let charges = 0;
  let credits = 0;
  for (const r of rows) {
    if (r.amount >= 0) charges += r.amount;
    else credits += -r.amount;
  }
  return {
    charges: roundMoney(charges),
    credits: roundMoney(credits),
    balance: roundMoney(charges - credits),
  };
}

async function actorDisplayName(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  membershipId: string,
  restaurantId: string,
): Promise<string> {
  const { data: member } = await supabaseAdmin
    .from("restaurant_users")
    .select("user_id")
    .eq("id", membershipId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!member) return "Staff member";
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("first_name, last_name, email")
    .eq("id", member.user_id)
    .maybeSingle();
  const name = joinName(profile?.first_name ?? "", profile?.last_name ?? null);
  return name || profile?.email || "Staff member";
}

async function loadStay(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  restaurantId: string,
  reservationId: string,
): Promise<{
  stay: FrontOfficeStay;
  rateMissing: boolean;
  guestId: string;
  guestEmail: string | null;
}> {
  const { data: row, error } = await supabaseAdmin
    .from("hotel_reservations")
    .select(
      "id, confirmation_number, guest_id, room_type_id, room_id, arrival_date, departure_date, adults, children, status, special_requests, rate_plan_id, room_subtotal, guest_profiles!hotel_reservations_guest_same_property ( first_name, last_name, phone, email, vip_status ), room_types!hotel_reservations_type_same_property ( name ), hotel_rooms!hotel_reservations_room_same_type ( room_number )",
    )
    .eq("restaurant_id", restaurantId)
    .eq("id", reservationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Reservation not found for this property.");

  const guest = row.guest_profiles as {
    first_name: string;
    last_name: string | null;
    phone: string | null;
    email: string | null;
    vip_status: boolean;
  } | null;
  const stay: FrontOfficeStay = {
    id: row.id,
    confirmationNumber: row.confirmation_number,
    guestId: row.guest_id,
    guestName: joinName(guest?.first_name ?? "", guest?.last_name ?? null) || "Guest",
    guestVip: guest?.vip_status ?? false,
    guestPhone: guest?.phone ?? null,
    roomTypeId: row.room_type_id,
    roomTypeName: (row.room_types as { name: string } | null)?.name ?? "Room type",
    roomId: row.room_id,
    roomNumber: (row.hotel_rooms as { room_number: string } | null)?.room_number ?? null,
    arrivalDate: row.arrival_date,
    departureDate: row.departure_date,
    nights: nightsBetween(row.arrival_date, row.departure_date),
    adults: row.adults,
    children: row.children,
    status: row.status as FrontOfficeStay["status"],
    specialRequests: row.special_requests,
    overstay: false,
  };
  return {
    stay,
    rateMissing:
      row.rate_plan_id == null && (row.room_subtotal == null || Number(row.room_subtotal) === 0),
    guestId: row.guest_id,
    guestEmail: guest?.email ?? null,
  };
}

async function loadFolioState(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  restaurantId: string,
  reservationId: string,
): Promise<CheckOutFolioState> {
  const { data: folio } = await supabaseAdmin
    .from("guest_folios")
    .select(
      "id, folio_number, status, currency, settlement_exception, settlement_exception_kind, settlement_exception_reason",
    )
    .eq("restaurant_id", restaurantId)
    .eq("reservation_id", reservationId)
    .maybeSingle();
  if (!folio) return { ...EMPTY_FOLIO };

  const { data: txns } = await supabaseAdmin
    .from("folio_transactions")
    .select("id, transaction_type, description, amount, posted_at")
    .eq("restaurant_id", restaurantId)
    .eq("folio_id", folio.id)
    .order("posted_at", { ascending: true });

  const transactions: CheckOutLedgerLine[] = (
    (txns ?? []) as {
      id: string;
      transaction_type: string;
      description: string;
      amount: number | string;
      posted_at: string;
    }[]
  ).map((t) => ({
    id: t.id,
    type: t.transaction_type,
    description: t.description,
    amount: Number(t.amount),
    postedAt: t.posted_at,
  }));

  return {
    folioId: folio.id,
    folioNumber: folio.folio_number,
    status: folio.status as "open" | "closed",
    currency: folio.currency || "GBP",
    transactions,
    ...totals(transactions.map((t) => ({ amount: t.amount }))),
  };
}

async function loadOverride(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  restaurantId: string,
  reservationId: string,
): Promise<CheckOutOverrideState> {
  const { data: folio } = await supabaseAdmin
    .from("guest_folios")
    .select("status, settlement_exception, settlement_exception_kind, settlement_exception_reason")
    .eq("restaurant_id", restaurantId)
    .eq("reservation_id", reservationId)
    .maybeSingle();
  const marker = folio as {
    status?: string;
    settlement_exception?: string | null;
    settlement_exception_kind?: "unpaid" | "credit" | null;
    settlement_exception_reason?: string | null;
  } | null;
  if (marker?.settlement_exception === "unsettled_checkout" && marker.status === "open") {
    return {
      recorded: true,
      kind: marker.settlement_exception_kind ?? null,
      reason: marker.settlement_exception_reason ?? null,
    };
  }

  const { data } = await supabaseAdmin
    .from("hotel_reservation_history")
    .select("new_values, notes")
    .eq("restaurant_id", restaurantId)
    .eq("reservation_id", reservationId)
    .eq("event_type", "amended")
    .order("created_at", { ascending: false })
    .limit(30);

  for (const row of (data ?? []) as { new_values: unknown; notes: string | null }[]) {
    if (isCheckoutOverride(row.new_values)) {
      return {
        recorded: true,
        kind: row.new_values.kind ?? null,
        reason: row.new_values.reason ?? row.notes,
      };
    }
  }
  return { recorded: false, kind: null, reason: null };
}

async function loadPropertyName(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  restaurantId: string,
): Promise<string> {
  const { data } = await supabaseAdmin
    .from("restaurants")
    .select("name")
    .eq("id", restaurantId)
    .maybeSingle();
  return (data as { name?: string } | null)?.name ?? "Property";
}

function documentSnapshot(
  stay: FrontOfficeStay,
  folio: CheckOutFolioState,
  propertyName: string,
  overrideOpen: boolean,
): CheckOutDocumentSnapshot {
  return {
    propertyName,
    guestName: stay.guestName,
    confirmationNumber: stay.confirmationNumber,
    folioNumber: folio.folioNumber ?? "—",
    roomNumber: stay.roomNumber,
    arrivalDate: stay.arrivalDate,
    departureDate: stay.departureDate,
    currency: folio.currency,
    lines: folio.transactions.map((t) => ({
      description: t.description,
      amount: t.amount,
      type: t.type,
      postedAt: t.postedAt,
    })),
    charges: folio.charges,
    credits: folio.credits,
    balance: folio.balance,
    folioStatus: folio.status ?? "open",
    overrideOpen,
  };
}

type SupabaseAdmin = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

export type CheckOutContract = {
  reservationId: string;
  reservationRoomId: string | null;
  confirmationNumber: string;
  guestId: string;
  guestName: string;
  guestEmail: string | null;
  roomId: string | null;
  roomNumber: string | null;
  roomTypeName: string | null;
  businessDate: string | null;
  stay: {
    scope: "unit" | "header";
    unitSequence: number | null;
    unitCount: number;
    status: string | null;
    arrivalDate: string;
    scheduledDepartureDate: string;
    nights: number;
    adults: number;
    children: number;
  };
  /** One folio per reservation; shared by every unit on it. */
  folio: CheckOutFolioFacts | null;
  charges: CheckOutChargeItem[];
  payments: CheckOutPaymentItem[];
  override: CheckOutOverrideFacts;
  settlement: CheckOutSettlementState;
  eligibility: CheckOutEligibility;
  housekeeping: CheckOutHousekeepingConsequence;
  documents: CheckOutDocumentCapabilities;
  fingerprint: string;
  readAt: string;
};

type UnitDbRow = {
  id: string;
  unit_sequence: number | string;
  room_type_id: string | null;
  room_id: string | null;
  arrival_date: string;
  departure_date: string;
  adults: number | null;
  children: number | null;
  status: string | null;
};

async function loadCheckOutUnits(
  supabaseAdmin: SupabaseAdmin,
  restaurantId: string,
  reservationId: string,
): Promise<CheckOutUnitRow[]> {
  const { data, error } = await supabaseAdmin
    .from("hotel_reservation_rooms")
    .select(
      "id, unit_sequence, room_type_id, room_id, arrival_date, departure_date, adults, children, status",
    )
    .eq("restaurant_id", restaurantId)
    .eq("reservation_id", reservationId)
    .order("unit_sequence", { ascending: true });
  if (error) {
    if (isMissingSchemaError(error)) return [];
    throw new Error(error.message);
  }
  const rows = (data ?? []) as unknown as UnitDbRow[];
  const roomIds = [...new Set(rows.map((r) => r.room_id).filter((id): id is string => !!id))];
  const typeIds = [...new Set(rows.map((r) => r.room_type_id).filter((id): id is string => !!id))];
  const [rooms, types] = await Promise.all([
    roomIds.length
      ? supabaseAdmin
          .from("hotel_rooms")
          .select("id, room_number")
          .eq("restaurant_id", restaurantId)
          .in("id", roomIds)
      : Promise.resolve({ data: [], error: null }),
    typeIds.length
      ? supabaseAdmin
          .from("room_types")
          .select("id, name")
          .eq("restaurant_id", restaurantId)
          .in("id", typeIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (rooms.error) throw new Error(rooms.error.message);
  if (types.error) throw new Error(types.error.message);
  const roomNumbers = new Map(
    ((rooms.data ?? []) as { id: string; room_number: string }[]).map((r) => [r.id, r.room_number]),
  );
  const typeNames = new Map(
    ((types.data ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name]),
  );
  return rows.map((r) => ({
    id: r.id,
    unitSequence: Number(r.unit_sequence),
    roomId: r.room_id,
    roomNumber: r.room_id ? (roomNumbers.get(r.room_id) ?? null) : null,
    roomTypeId: r.room_type_id,
    roomTypeName: r.room_type_id ? (typeNames.get(r.room_type_id) ?? null) : null,
    arrivalDate: r.arrival_date,
    departureDate: r.departure_date,
    adults: r.adults ?? 0,
    children: r.children ?? 0,
    status: r.status ?? "",
  }));
}

/** Cashiering's own folio read, reduced to the facts checkout gates on. */
async function loadCheckOutFolio(
  supabaseAdmin: SupabaseAdmin,
  restaurantId: string,
  reservationId: string,
): Promise<{
  facts: CheckOutFolioFacts | null;
  charges: CheckOutChargeItem[];
  payments: CheckOutPaymentItem[];
}> {
  const { data: row, error } = await supabaseAdmin
    .from("guest_folios")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("reservation_id", reservationId)
    .maybeSingle();
  if (error) throw cashierError(error.message);
  if (!row) return { facts: null, charges: [], payments: [] };
  const detail = await loadGuestFolio(supabaseAdmin, restaurantId, (row as { id: string }).id);
  if (!detail) return { facts: null, charges: [], payments: [] };
  const ledger = summarizeFolioLedger(detail.transactions);
  const invoiceNumbers = detail.issuedInvoices.map((invoice) => invoice.issuedNumber);
  const last = detail.transactions[detail.transactions.length - 1];
  return {
    facts: {
      folioId: detail.id,
      folioNumber: detail.folioNumber,
      status: detail.status,
      invoiced: invoiceNumbers.length > 0 || detail.legacyFolioInvoice,
      invoiceNumbers,
      currency: detail.currency || "GBP",
      charges: detail.charges,
      credits: detail.credits,
      balance: detail.balance,
      depositsReceived: roundMoney(-ledger.deposits),
      transactionCount: detail.transactions.length,
      lastTransactionId: last?.id ?? null,
    },
    charges: projectCheckOutCharges(detail.transactions),
    payments: projectCheckOutPayments(detail.transactions),
  };
}

async function loadHousekeepingTarget(
  supabaseAdmin: SupabaseAdmin,
  restaurantId: string,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin.rpc("pms_housekeeping_transition_target", {
    _restaurant_id: restaurantId,
    _event_code: "guest_check_out",
    _fallback: "dirty",
  });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

async function loadRoomHousekeepingStatus(
  supabaseAdmin: SupabaseAdmin,
  restaurantId: string,
  roomId: string | null,
): Promise<string | null> {
  if (!roomId) return null;
  const { data, error } = await supabaseAdmin
    .from("hotel_rooms")
    .select("housekeeping_status")
    .eq("restaurant_id", restaurantId)
    .eq("id", roomId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { housekeeping_status?: string | null } | null)?.housekeeping_status ?? null;
}

async function loadBusinessDate(
  supabaseAdmin: SupabaseAdmin,
  restaurantId: string,
): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("restaurants")
    .select("business_date")
    .eq("id", restaurantId)
    .maybeSingle();
  return (data as { business_date?: string | null } | null)?.business_date ?? null;
}

async function loadCheckOutContract(
  supabaseAdmin: SupabaseAdmin,
  input: {
    restaurantId: string;
    reservationId: string;
    reservationRoomId: string | null;
    canOverride: boolean;
  },
): Promise<CheckOutContract> {
  const [loaded, units] = await Promise.all([
    loadStay(supabaseAdmin, input.restaurantId, input.reservationId),
    loadCheckOutUnits(supabaseAdmin, input.restaurantId, input.reservationId),
  ]);
  const resolution = resolveCheckOutUnit(units, input.reservationRoomId);
  if (resolution.kind === "error") throw reservationError(resolution.code);
  const unit = resolution.kind === "unit" ? resolution.unit : null;
  const stay = loaded.stay;
  const roomId = unit ? unit.roomId : stay.roomId;

  const [folio, override, housekeepingTarget, roomStatus, businessDate] = await Promise.all([
    loadCheckOutFolio(supabaseAdmin, input.restaurantId, input.reservationId),
    loadOverride(supabaseAdmin, input.restaurantId, input.reservationId),
    loadHousekeepingTarget(supabaseAdmin, input.restaurantId),
    loadRoomHousekeepingStatus(supabaseAdmin, input.restaurantId, roomId),
    loadBusinessDate(supabaseAdmin, input.restaurantId),
  ]);

  const stayStatus = unit ? unit.status : stay.status;
  const roomNumber = unit ? unit.roomNumber : stay.roomNumber;
  return {
    reservationId: stay.id,
    reservationRoomId: unit?.id ?? null,
    confirmationNumber: stay.confirmationNumber,
    guestId: stay.guestId,
    guestName: stay.guestName,
    guestEmail: loaded.guestEmail,
    roomId,
    roomNumber,
    roomTypeName: unit ? unit.roomTypeName : stay.roomTypeName,
    businessDate,
    stay: {
      scope: unit ? "unit" : "header",
      unitSequence: unit?.unitSequence ?? null,
      unitCount: units.length,
      status: stayStatus,
      arrivalDate: unit?.arrivalDate ?? stay.arrivalDate,
      scheduledDepartureDate: unit?.departureDate ?? stay.departureDate,
      nights: unit ? nightsBetween(unit.arrivalDate, unit.departureDate) : stay.nights,
      adults: unit?.adults ?? stay.adults,
      children: unit?.children ?? stay.children,
    },
    folio: folio.facts,
    charges: folio.charges,
    payments: folio.payments,
    override,
    settlement: checkOutSettlementState({ folio: folio.facts, override }),
    eligibility: checkOutEligibility({
      resolution,
      stayStatus,
      folio: folio.facts,
      override,
      canOverride: input.canOverride,
    }),
    housekeeping: checkOutHousekeepingConsequence({
      roomId,
      roomNumber,
      currentStatus: roomStatus,
      targetStatus: housekeepingTarget,
    }),
    documents: checkOutDocumentCapabilities({ folio: folio.facts, override }),
    fingerprint: checkOutFingerprint({
      reservationId: stay.id,
      reservationRoomId: unit?.id ?? null,
      stayStatus,
      roomId,
      folio: folio.facts,
      overrideRecorded: override.recorded,
    }),
    readAt: new Date().toISOString(),
  };
}

const contractInputSchema = z.object({
  restaurantId: idSchema,
  reservationId: idSchema,
  reservationRoomId: idSchema.optional(),
});

/** Stage 1 — folio review & settlement read for one unit. */
export const getCheckOutContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => contractInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<CheckOutContract> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadCheckOutContract(supabaseAdmin, {
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      reservationRoomId: data.reservationRoomId ?? null,
      canOverride: (MANAGE_ROLES as readonly string[]).includes(me.role),
    });
  });

/**
 * Stage 2 — final confirmation. Always a fresh read; `stale` is true when the
 * Stage 1 fingerprint no longer matches (new posting, close, invoice,
 * override, unit status or room change).
 */
export const getCheckOutConfirmation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    contractInputSchema
      .extend({ expectedFingerprint: z.string().min(1).max(2000).optional() })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ contract: CheckOutContract; stale: boolean }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const contract = await loadCheckOutContract(supabaseAdmin, {
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      reservationRoomId: data.reservationRoomId ?? null,
      canOverride: (MANAGE_ROLES as readonly string[]).includes(me.role),
    });
    return {
      contract,
      stale: Boolean(data.expectedFingerprint) && data.expectedFingerprint !== contract.fingerprint,
    };
  });

export const CHECKOUT_STALE_MESSAGE =
  "Check-out details changed since review. Review the folio again before completing.";

const CHECKOUT_BLOCK_MESSAGES: Record<string, string> = {
  stay_not_in_house: "Only in-house stays can be checked out.",
  folio_missing: "Open the folio before completing check-out.",
  outstanding_balance: "Settle the folio or request a supervisor override.",
  credit_balance: "Settle the folio or request a supervisor override.",
  folio_close_required: "Close the folio at zero before completing check-out.",
};

async function loadCheckOutCompletion(
  supabaseAdmin: SupabaseAdmin,
  before: CheckOutContract,
  restaurantId: string,
): Promise<CheckOutCompletion> {
  const unitQuery = before.reservationRoomId
    ? supabaseAdmin
        .from("hotel_reservation_rooms")
        .select("status")
        .eq("restaurant_id", restaurantId)
        .eq("id", before.reservationRoomId)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const taskQuery = before.roomId
    ? supabaseAdmin
        .from("housekeeping_tasks")
        .select("id")
        .eq("restaurant_id", restaurantId)
        .eq("room_id", before.roomId)
        .eq("task_type", "departure_cleaning")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const historyQuery = supabaseAdmin
    .from("hotel_reservation_history")
    .select("created_at, new_values")
    .eq("restaurant_id", restaurantId)
    .eq("reservation_id", before.reservationId)
    .eq("event_type", "check_out")
    .order("created_at", { ascending: false })
    .limit(10);
  const headerQuery = supabaseAdmin
    .from("hotel_reservations")
    .select("status")
    .eq("restaurant_id", restaurantId)
    .eq("id", before.reservationId)
    .maybeSingle();

  const [unitRes, taskRes, historyRes, headerRes, folio, override, roomStatus] = await Promise.all([
    unitQuery,
    taskQuery,
    historyQuery,
    headerQuery,
    loadCheckOutFolio(supabaseAdmin, restaurantId, before.reservationId),
    loadOverride(supabaseAdmin, restaurantId, before.reservationId),
    loadRoomHousekeepingStatus(supabaseAdmin, restaurantId, before.roomId),
  ]);
  const reservationStatus = (headerRes.data as { status?: string } | null)?.status ?? null;
  const unitStatus = before.reservationRoomId
    ? ((unitRes.data as { status?: string } | null)?.status ?? null)
    : reservationStatus;
  const history = (historyRes.data ?? []) as {
    created_at: string;
    new_values: { reservation_room_id?: string } | null;
  }[];
  const event = history.find((row) =>
    before.reservationRoomId
      ? row.new_values?.reservation_room_id === before.reservationRoomId
      : true,
  );
  return buildCheckOutCompletion({
    reservationId: before.reservationId,
    reservationRoomId: before.reservationRoomId,
    confirmationNumber: before.confirmationNumber,
    guestName: before.guestName,
    roomId: before.roomId,
    roomNumber: before.roomNumber,
    unitStatus,
    reservationStatus,
    folio: folio.facts,
    override,
    roomHousekeepingStatus: roomStatus,
    housekeepingTarget: before.housekeeping.targetStatus,
    departureTaskId: (taskRes.data as { id?: string } | null)?.id ?? null,
    checkedOutAt: event?.created_at ?? null,
  });
}

export const getCheckOutContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<CheckOutContext> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const loaded = await loadStay(supabaseAdmin, data.restaurantId, data.reservationId);
    const [folio, override, propertyName, actorName] = await Promise.all([
      loadFolioState(supabaseAdmin, data.restaurantId, data.reservationId),
      loadOverride(supabaseAdmin, data.restaurantId, data.reservationId),
      loadPropertyName(supabaseAdmin, data.restaurantId),
      actorDisplayName(supabaseAdmin, me.id, data.restaurantId),
    ]);
    const secrets = emailSecrets();
    return {
      stay: loaded.stay,
      rateMissing: loaded.rateMissing,
      propertyName,
      guestEmail: loaded.guestEmail,
      folio,
      override,
      canOverride: (MANAGE_ROLES as readonly string[]).includes(me.role),
      emailConfigured: platformEmailConfigured(secrets),
      actorName,
    };
  });

export const ensureCheckOutFolio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<CheckOutFolioState> => {
    await requireReservationManager(context as never, data.restaurantId);
    const me = await requireCashierOperator(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const existing = await loadFolioState(supabaseAdmin, data.restaurantId, data.reservationId);
    if (existing.folioId) return existing;

    const { error } = await supabaseAdmin.rpc("open_folio_for_reservation", {
      _restaurant_id: data.restaurantId,
      _reservation_id: data.reservationId,
      _membership_id: me.id,
    });
    if (error) throw cashierError(error.message);
    return loadFolioState(supabaseAdmin, data.restaurantId, data.reservationId);
  });

export const postCheckOutPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        amount: z.number().positive(),
        method: z.string().trim().min(1).max(40),
        reference: z.string().max(80).optional().nullable(),
        idempotencyKey: z.string().min(8).max(80),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<CheckOutFolioState> => {
    await requireReservationManager(context as never, data.restaurantId);
    const me = await requireCashierOperator(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const opened = await supabaseAdmin.rpc("open_folio_for_reservation", {
      _restaurant_id: data.restaurantId,
      _reservation_id: data.reservationId,
      _membership_id: me.id,
    });
    if (opened.error) throw cashierError(opened.error.message);
    const folioId = (opened.data as { id: string }).id;
    const folio = await loadFolioState(supabaseAdmin, data.restaurantId, data.reservationId);
    const amount = roundMoney(data.amount);
    if (!paymentAmountAllowed(amount, folio.balance)) {
      throw new Error("Enter an amount no greater than the remaining balance.");
    }

    const snapshot = await loadPolish1Snapshot(supabaseAdmin, data.restaurantId);
    const tender = folioTenderFromCatalogue(
      data.method,
      snapshot.paymentMethodsAvailable ? snapshot.paymentMethods : null,
    );
    if (!tender.ok) throw new Error(tender.message);

    const reference = blankToNull(data.reference);
    const description = reference
      ? `Check-out payment (${tender.stored}) · ${reference}`
      : `Check-out payment (${tender.stored})`;

    // Same live path as postFolioEntry({ type: "payment" }) — do not invent a second ledger.
    let txnId: string;
    try {
      const posted = await callPostFolioTransaction({
        restaurantId: data.restaurantId,
        folioId,
        type: "payment",
        category: "payment",
        description,
        amount,
        membershipId: me.id,
        paymentMethod: tender.stored,
        idempotencyKey: data.idempotencyKey,
      });
      txnId = posted.id;
    } catch (error) {
      throw new Error(mapCashierShiftError((error as Error).message));
    }

    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType: "amended",
      newValues: { checkout_payment_id: txnId, amount, method: tender.stored },
      notes: "Check-out payment posted to folio.",
      actorMembershipId: me.id,
    });
    return loadFolioState(supabaseAdmin, data.restaurantId, data.reservationId);
  });

export const overrideCheckOutSettlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        reason: z.string().trim().min(1).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; kind: CheckoutOverrideKind }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    requireSupervisor(me.role);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const folio = await loadFolioState(supabaseAdmin, data.restaurantId, data.reservationId);
    const kind = overrideKindForBalance(folio.balance);
    if (!kind) throw new Error("The folio is already settled. An override is not needed.");
    if (!folio.folioId) throw new Error("Open the folio before overriding settlement.");

    const { error: markerError } = await supabaseAdmin
      .from("guest_folios")
      .update({
        settlement_exception: "unsettled_checkout",
        settlement_exception_kind: kind,
        settlement_exception_reason: data.reason,
        settlement_exception_at: new Date().toISOString(),
        settlement_exception_amount: folio.balance,
      })
      .eq("id", folio.folioId)
      .eq("restaurant_id", data.restaurantId)
      .eq("status", "open");
    if (markerError) throw new Error(markerError.message);

    await supabaseAdmin.from("folio_history").insert({
      restaurant_id: data.restaurantId,
      folio_id: folio.folioId,
      event_type: "checkout_unsettled_exception",
      new_values: {
        settlement_exception: "unsettled_checkout",
        kind,
        reason: data.reason,
        amount: folio.balance,
        folio_status: "open",
      },
      notes: "Checkout settlement overridden — folio left open and unsettled.",
      actor_membership_id: me.id,
    });

    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType: "amended",
      newValues: {
        checkout_override: true,
        kind,
        reason: data.reason,
        balance: folio.balance,
        folio_id: folio.folioId,
      },
      notes: "Checkout settlement overridden — folio left open.",
      actorMembershipId: me.id,
    });
    return { ok: true, kind };
  });

/**
 * Thin close used at check-out only. Still calls close_guest_folio, only when
 * |balance| < 0.01, and never after an override. Gated by FO reservation
 * manager + cashier-operator. The RPC itself is balance-only (no manager
 * check) — if it later rejects non-managers, surface the error; do not rewrite it.
 */
export const closeFolioAtCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<CheckOutFolioState> => {
    await requireReservationManager(context as never, data.restaurantId);
    const me = await requireCashierOperator(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const folio = await loadFolioState(supabaseAdmin, data.restaurantId, data.reservationId);
    if (!folio.folioId) throw new Error("Open the folio before closing it.");
    const override = await loadOverride(supabaseAdmin, data.restaurantId, data.reservationId);
    if (override.recorded) {
      throw new Error(
        "Override leaves the folio open. Do not close a non-zero or overridden folio.",
      );
    }
    if (
      !shouldCloseFolioAtCheckout({
        balance: folio.balance,
        override: false,
        folioStatus: folio.status,
      })
    ) {
      if (!isFolioSettled(folio.balance)) {
        throw new Error("Settle the outstanding balance before closing this folio.");
      }
      return folio;
    }

    const { error } = await supabaseAdmin.rpc("close_guest_folio", {
      _restaurant_id: data.restaurantId,
      _folio_id: folio.folioId,
      _membership_id: me.id,
    });
    if (error) throw cashierError(error.message);
    return loadFolioState(supabaseAdmin, data.restaurantId, data.reservationId);
  });

export const sendCheckOutDocumentEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        toEmail: z.string().trim().max(254),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: true } | { ok: false; message: string; configured: boolean }> => {
      await requireReservationManager(context as never, data.restaurantId);
      const secrets = emailSecrets();
      if (!platformEmailConfigured(secrets)) {
        return { ok: false, message: "Email not configured.", configured: false };
      }
      const to = data.toEmail.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        return { ok: false, message: "Enter a valid email address.", configured: true };
      }

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const loaded = await loadStay(supabaseAdmin, data.restaurantId, data.reservationId);
      const folio = await loadFolioState(supabaseAdmin, data.restaurantId, data.reservationId);
      const override = await loadOverride(supabaseAdmin, data.restaurantId, data.reservationId);
      const propertyName = await loadPropertyName(supabaseAdmin, data.restaurantId);
      const snapshot = documentSnapshot(loaded.stay, folio, propertyName, override.recorded);

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secrets.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: secrets.from,
          to: [to],
          subject: checkoutDocumentSubject(snapshot),
          html: renderCheckoutDocumentHtml(snapshot),
          text: renderCheckoutDocumentText(snapshot),
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        console.error("[sendCheckOutDocumentEmail]", response.status, body);
        return {
          ok: false,
          message: "The guest document could not be sent. Try again.",
          configured: true,
        };
      }
      return { ok: true };
    },
  );

export const completeFoCheckOut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        reservationRoomId: idSchema.optional(),
        expectedFingerprint: z.string().min(1).max(2000).optional(),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      id: string;
      roomNumber: string | null;
      folioSettled: boolean;
      completion: CheckOutCompletion;
    }> => {
      const me = await requireReservationManager(context as never, data.restaurantId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // Unit → eligibility → folio → settlement/override, all from one fresh read.
      const before = await loadCheckOutContract(supabaseAdmin, {
        restaurantId: data.restaurantId,
        reservationId: data.reservationId,
        reservationRoomId: data.reservationRoomId ?? null,
        canOverride: (MANAGE_ROLES as readonly string[]).includes(me.role),
      });
      if (data.expectedFingerprint && data.expectedFingerprint !== before.fingerprint) {
        throw new Error(CHECKOUT_STALE_MESSAGE);
      }
      const gate = before.eligibility;
      const stayOk = canContinueStay({ loaded: true, status: before.stay.status });
      const folioOk = canContinueFolio({ folioId: before.folio?.folioId ?? null });
      const settleOk = canContinueSettle({
        balance: before.folio?.balance ?? 0,
        override: before.override.recorded,
      });
      const closeOk = canContinueClose({
        balance: before.folio?.balance ?? 0,
        override: before.override.recorded,
        folioStatus: before.folio?.status ?? null,
      });
      if (!gate.checkoutAllowed || !canCompleteCheckOut({ stayOk, folioOk, settleOk, closeOk })) {
        throw new Error(
          (gate.blockingReason && CHECKOUT_BLOCK_MESSAGES[gate.blockingReason]) ??
            "Check-out cannot finish until every step is complete.",
        );
      }

      // Single writer: unit status, rollup, history, housekeeping flip and
      // departure task commit together inside check_out_hotel_reservation.
      const { error } = await supabaseAdmin.rpc("check_out_hotel_reservation", {
        _restaurant_id: data.restaurantId,
        _reservation_id: data.reservationId,
        _membership_id: me.id,
        ...(before.reservationRoomId ? { _reservation_room_id: before.reservationRoomId } : {}),
      });
      if (error) throw reservationError(error.message);

      const completion = await loadCheckOutCompletion(supabaseAdmin, before, data.restaurantId);
      return {
        id: data.reservationId,
        roomNumber: completion.roomNumber,
        folioSettled: folioReportsSettled({
          status: completion.folioStatus,
          balance: completion.folioBalance,
          unsettledCheckout: completion.settlement.startsWith("override"),
        }),
        completion,
      };
    },
  );

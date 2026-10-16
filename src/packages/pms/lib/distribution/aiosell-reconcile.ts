/**
 * AIOS-06 reservation fetch reconciliation and outbound no-show notification.
 * Fetched bookings use the AIOS-05 normalizer and writer.
 * A booking missing from one window is not treated as cancelled.
 * bookedOn is not a modification version. There is no fetch ordering field.
 */
import type { AiosellCallResult } from "./aiosell-client";
import {
  AIOSELL_NO_SHOW_CHANNELS,
  parseAiosellFetchedReservation,
  withoutUnsupportedAiosellCard,
  type AiosellFetchRequest,
  type AiosellNoShowRequest,
} from "./aiosell-contract";
import {
  toDistributionSyncEventInsert,
  type DistributionSyncEventInsert,
} from "./distribution-sync-event";
import {
  externalCancelCommand,
  normalizeAiosellStayCommand,
  type AiosellReservationDirectory,
  type ExternalApplyResult,
  type ExternalReservationCommand,
} from "./aiosell-reservation";

export type AiosellReconcileOutcome =
  "created" | "modified" | "cancelled" | "unchanged" | "conflict" | "failed";

export type AiosellReconcileItem = {
  bookingId: string | null;
  channel: string | null;
  outcome: AiosellReconcileOutcome;
  code: string;
};

export type AiosellReconcileSummary = {
  ok: boolean;
  propertyId: string;
  provider: "aiosell";
  hotelCode: string | null;
  startedAt: string;
  completedAt: string;
  window: { startDate: string; endDate: string };
  runError: string | null;
  totals: {
    fetched: number;
    created: number;
    modified: number;
    cancelled: number;
    unchanged: number;
    conflicts: number;
    failed: number;
  };
  results: AiosellReconcileItem[];
};

export type AiosellReconcilePorts = {
  directory: AiosellReservationDirectory;
  fetchReservations(request: AiosellFetchRequest): Promise<AiosellCallResult<unknown[]>>;
  findFingerprint(input: {
    restaurantId: string;
    hotelCode: string;
    channel: string;
    bookingId: string;
  }): Promise<{ found: boolean; fingerprint: string | null }>;
  now?: () => Date;
};

const CARD_KEYS = ["creditCard", "cardNumber", "cvv"] as const;

function stamp(now: () => Date): string {
  return now().toISOString();
}

function emptyTotals(): AiosellReconcileSummary["totals"] {
  return {
    fetched: 0,
    created: 0,
    modified: 0,
    cancelled: 0,
    unchanged: 0,
    conflicts: 0,
    failed: 0,
  };
}

function addTotal(totals: AiosellReconcileSummary["totals"], outcome: AiosellReconcileOutcome) {
  if (outcome === "created") totals.created += 1;
  else if (outcome === "modified") totals.modified += 1;
  else if (outcome === "cancelled") totals.cancelled += 1;
  else if (outcome === "unchanged") totals.unchanged += 1;
  else if (outcome === "conflict") totals.conflicts += 1;
  else totals.failed += 1;
}

function cardPresent(value: unknown): boolean {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    value !== null &&
    CARD_KEYS.some((key) => key in value)
  );
}

function stripCard(value: unknown): unknown {
  const stripped = withoutUnsupportedAiosellCard(value);
  if (!stripped || typeof stripped !== "object" || Array.isArray(stripped)) return stripped;
  const copy = { ...(stripped as Record<string, unknown>) };
  delete copy.cardNumber;
  delete copy.cvv;
  return copy;
}

function safeEvent(input: {
  restaurantId: string;
  operation: string;
  channel?: string | null;
  bookingId?: string | null;
  success: boolean;
  message: string;
}): DistributionSyncEventInsert {
  return toDistributionSyncEventInsert({
    restaurantId: input.restaurantId,
    provider: "aiosell",
    direction: "outbound",
    channel: input.channel ?? null,
    externalBookingId: input.bookingId ?? null,
    operation: input.operation,
    status: input.success ? "success" : "failed",
    responseSuccess: input.success,
    responseMessage: input.message,
    attemptCount: 1,
    retryEligible: false,
  });
}

function identityOf(value: unknown): { bookingId: string | null; channel: string | null } {
  if (!value || typeof value !== "object") return { bookingId: null, channel: null };
  const record = value as { bookingId?: unknown; channel?: unknown };
  return {
    bookingId: typeof record.bookingId === "string" ? record.bookingId : null,
    channel: typeof record.channel === "string" ? record.channel : null,
  };
}

function fromWriter(result: ExternalApplyResult): {
  outcome: AiosellReconcileOutcome;
  code: string;
} {
  if (result.outcome === "created") return { outcome: "created", code: "created" };
  if (result.outcome === "modified") return { outcome: "modified", code: "modified" };
  if (result.outcome === "cancelled") return { outcome: "cancelled", code: "cancelled" };
  if (
    result.outcome === "duplicate" ||
    result.outcome === "modify_idempotent" ||
    result.outcome === "cancel_idempotent"
  ) {
    return { outcome: "unchanged", code: result.outcome };
  }
  if (result.outcome === "status_conflict") return { outcome: "conflict", code: "status_conflict" };
  return { outcome: "failed", code: result.outcome };
}

async function applyCommand(
  ports: AiosellReconcilePorts,
  command: ExternalReservationCommand,
): Promise<AiosellReconcileItem> {
  try {
    const written = fromWriter(await ports.directory.apply(command));
    await ports.directory.record(
      safeEvent({
        restaurantId: command.restaurantId,
        operation: `reconcile_${command.action}`,
        channel: command.channel,
        bookingId: command.bookingId,
        success: written.outcome !== "failed" && written.outcome !== "conflict",
        message: written.code,
      }),
    );
    return {
      bookingId: command.bookingId,
      channel: command.channel,
      outcome: written.outcome,
      code: written.code,
    };
  } catch {
    await ports.directory.record(
      safeEvent({
        restaurantId: command.restaurantId,
        operation: `reconcile_${command.action}`,
        channel: command.channel,
        bookingId: command.bookingId,
        success: false,
        message: "AIOSELL_WRITE_FAILED",
      }),
    );
    return {
      bookingId: command.bookingId,
      channel: command.channel,
      outcome: "failed",
      code: "AIOSELL_WRITE_FAILED",
    };
  }
}

async function reconcileItem(
  ports: AiosellReconcilePorts,
  property: { restaurantId: string; hotelCode: string },
  raw: unknown,
): Promise<AiosellReconcileItem> {
  const identity = identityOf(raw);
  const present = cardPresent(raw);
  let fetched: ReturnType<typeof parseAiosellFetchedReservation>;
  try {
    fetched = parseAiosellFetchedReservation(stripCard(raw));
  } catch {
    return { ...identity, outcome: "failed", code: "AIOSELL_PAYLOAD_INVALID" };
  }
  if (fetched.hotelCode !== property.hotelCode) {
    return {
      bookingId: fetched.bookingId,
      channel: fetched.channel,
      outcome: "failed",
      code: "AIOSELL_PROPERTY_MISMATCH",
    };
  }
  if (fetched.action === "cancel") {
    const properties = await ports.directory.findProperties(fetched.hotelCode);
    const match = properties.filter((row) => row.restaurantId === property.restaurantId);
    if (properties.length !== 1 || match.length !== 1) {
      return {
        bookingId: fetched.bookingId,
        channel: fetched.channel,
        outcome: "failed",
        code: properties.length > 1 ? "AIOSELL_PROPERTY_AMBIGUOUS" : "AIOSELL_PROPERTY_NOT_FOUND",
      };
    }
    return applyCommand(ports, externalCancelCommand(property.restaurantId, fetched));
  }
  const normalized = await normalizeAiosellStayCommand(ports.directory, "book", fetched, present);
  if ("error" in normalized) {
    await ports.directory.record(
      safeEvent({
        restaurantId: property.restaurantId,
        operation: "reconcile_normalize",
        channel: fetched.channel,
        bookingId: fetched.bookingId,
        success: false,
        message: normalized.error,
      }),
    );
    return {
      bookingId: fetched.bookingId,
      channel: fetched.channel,
      outcome: "failed",
      code: normalized.error,
    };
  }
  if (normalized.command.restaurantId !== property.restaurantId) {
    return {
      bookingId: fetched.bookingId,
      channel: fetched.channel,
      outcome: "failed",
      code: "AIOSELL_PROPERTY_MISMATCH",
    };
  }
  const existing = await ports.findFingerprint({
    restaurantId: property.restaurantId,
    hotelCode: fetched.hotelCode,
    channel: fetched.channel,
    bookingId: fetched.bookingId,
  });
  if (!existing.found) {
    return applyCommand(ports, { ...normalized.command, action: "book" });
  }
  if (existing.fingerprint === normalized.command.fingerprint) {
    await ports.directory.record(
      safeEvent({
        restaurantId: property.restaurantId,
        operation: "reconcile_unchanged",
        channel: fetched.channel,
        bookingId: fetched.bookingId,
        success: true,
        message: "unchanged",
      }),
    );
    return {
      bookingId: fetched.bookingId,
      channel: fetched.channel,
      outcome: "unchanged",
      code: "unchanged",
    };
  }
  return applyCommand(ports, { ...normalized.command, action: "modify" });
}

export async function reconcileAiosellReservations(
  input: {
    restaurantId: string;
    hotelCode: string;
    startDate: string;
    endDate: string;
  },
  ports: AiosellReconcilePorts,
): Promise<AiosellReconcileSummary> {
  const now = ports.now ?? (() => new Date());
  const startedAt = stamp(now);
  const totals = emptyTotals();
  const results: AiosellReconcileItem[] = [];
  const base = {
    propertyId: input.restaurantId,
    provider: "aiosell" as const,
    hotelCode: input.hotelCode,
    startedAt,
    window: { startDate: input.startDate, endDate: input.endDate },
    totals,
    results,
  };
  let fetched: AiosellCallResult<unknown[]>;
  try {
    fetched = await ports.fetchReservations({
      type: "reservation",
      hotelCode: input.hotelCode,
      startDate: input.startDate,
      endDate: input.endDate,
    });
  } catch {
    fetched = {
      ok: false,
      code: "AIOSELL_NETWORK",
      message: "Aiosell request failed.",
      httpStatus: null,
    };
  }
  if (!fetched.ok) {
    await ports.directory.record(
      safeEvent({
        restaurantId: input.restaurantId,
        operation: "reconcile_fetch",
        success: false,
        message: fetched.code,
      }),
    );
    return {
      ...base,
      ok: false,
      completedAt: stamp(now),
      runError: fetched.code,
    };
  }
  for (const raw of fetched.data) {
    const item = await reconcileItem(ports, input, raw);
    results.push(item);
    totals.fetched += 1;
    addTotal(totals, item.outcome);
  }
  await ports.directory.record(
    safeEvent({
      restaurantId: input.restaurantId,
      operation: "reconcile_fetch",
      success: true,
      message: `fetched ${totals.fetched}`,
    }),
  );
  return { ...base, ok: true, completedAt: stamp(now), runError: null };
}

export function aiosellNoShowSupported(
  channel: string,
): channel is (typeof AIOSELL_NO_SHOW_CHANNELS)[number] {
  return (AIOSELL_NO_SHOW_CHANNELS as readonly string[]).includes(channel);
}

export async function notifyAiosellNoShow(
  input: {
    restaurantId: string;
    reservationId: string;
  },
  ports: {
    loadReservation(restaurantId: string, reservationId: string): Promise<boolean>;
    loadMapping(
      restaurantId: string,
      reservationId: string,
    ): Promise<{
      provider: string;
      hotelCode: string;
      channel: string;
      bookingId: string;
    } | null>;
    markNoShow(
      request: AiosellNoShowRequest,
    ): Promise<AiosellCallResult<{ success: boolean; message: string }>>;
    record(event: DistributionSyncEventInsert): Promise<void>;
  },
): Promise<{ ok: true; code: "notified" } | { ok: false; code: string }> {
  const owned = await ports.loadReservation(input.restaurantId, input.reservationId);
  if (!owned) return { ok: false, code: "RESERVATION_NOT_FOUND" };
  const mapping = await ports.loadMapping(input.restaurantId, input.reservationId);
  if (!mapping || mapping.provider !== "aiosell")
    return { ok: false, code: "EXTERNAL_MAPPING_MISSING" };
  if (!mapping.hotelCode || !mapping.bookingId || !mapping.channel) {
    return { ok: false, code: "EXTERNAL_IDENTITY_INCOMPLETE" };
  }
  if (!aiosellNoShowSupported(mapping.channel))
    return { ok: false, code: "AIOSELL_NO_SHOW_CHANNEL" };
  const request: AiosellNoShowRequest = {
    hotelCode: mapping.hotelCode,
    bookingId: mapping.bookingId,
    channel: mapping.channel,
  };
  const result = await ports.markNoShow(request);
  const code = result.ok ? "notified" : result.code;
  await ports.record(
    safeEvent({
      restaurantId: input.restaurantId,
      operation: "mark_no_show",
      channel: mapping.channel,
      bookingId: mapping.bookingId,
      success: result.ok,
      message: code,
    }),
  );
  return result.ok ? { ok: true, code: "notified" } : { ok: false, code };
}

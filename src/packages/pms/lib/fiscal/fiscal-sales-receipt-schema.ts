/**
 * Shared sales-receipt schema for guest B2C/B2B and company B2B.
 *
 * ReceiptDate is the allocation timestamp as RFC3339, not the calendar day and
 * not the clock at retry. source_date stays the property calendar date.
 * ReceiptNumber is a stored short number when one already exists. Otherwise it
 * is GSR- or CSR- plus the first 16 hex characters of the allocation id.
 * NORU payments and allocations do not have their own receipt sequence.
 *
 * A failed registration keeps its stored request. This module does not rewrite
 * a row. Normal retry does not change trnx_id or the snapshot.
 *
 * TEST sales receipts send a short trnx_id and omit ReceiptNumber. Production
 * keeps gsr-/csr- plus the full allocation id, and still sends ReceiptNumber.
 * A TEST repair of one failed row may set the column and snapshot trnx_id to
 * the short value, delete ReceiptNumber, recompute request_hash, and leave
 * every other field. The unique (restaurant_id, trnx_id) constraint allows
 * that update on the same row when the short id is unused.
 */
export const FISCAL_RECEIPT_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/;

const SHORT_RECEIPT_NUMBER = /^[A-Za-z0-9][A-Za-z0-9./_-]{0,19}$/;

export function fiscalReceiptDateTime(iso: string, timezone: string): string | null {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return null;
  const zone = timezone.trim() || "UTC";
  const wall = zonedWallClock(instant, zone) ?? zonedWallClock(instant, "UTC");
  if (!wall) return null;
  const offsetMinutes = Math.round((wall.asUtc - instant.getTime()) / 60000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = String(absolute % 60).padStart(2, "0");
  return `${wall.date}T${wall.time}${sign}${hours}:${minutes}`;
}

/** TEST-only. GSR or CSR plus the first 16 hex digits of the allocation id. */
export function fiscalTestReceiptTrnxId(
  lane: "guest" | "company",
  allocationId: string,
): string | null {
  const prefix = lane === "company" ? "CSR" : "GSR";
  const hex = allocationId.trim().replace(/-/g, "").toLowerCase();
  if (/^[0-9a-f]{32}$/.test(hex)) return `${prefix}${hex.slice(0, 16).toUpperCase()}`;
  const compact = allocationId
    .trim()
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
  if (compact.length === 0) return null;
  const value = `${prefix}${compact}`.slice(0, 20);
  return value.length > prefix.length ? value : null;
}

export function fiscalReceiptNumber(
  lane: "guest" | "company",
  allocationId: string,
  existingNumber?: string | null,
): string | null {
  const provided = shortReceiptNumber(existingNumber);
  if (provided) return provided;
  const id = allocationId.trim();
  const hex = id.replace(/-/g, "").toLowerCase();
  if (/^[0-9a-f]{32}$/.test(hex)) {
    return `${lane === "company" ? "CSR-" : "GSR-"}${hex.slice(0, 16)}`;
  }
  return shortReceiptNumber(id);
}

function shortReceiptNumber(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!SHORT_RECEIPT_NUMBER.test(trimmed)) return null;
  return trimmed;
}

function zonedWallClock(
  instant: Date,
  timeZone: string,
): { date: string; time: string; asUtc: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(instant);
    const bag = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    let hour = Number(bag.hour);
    let day = Number(bag.day);
    let month = Number(bag.month);
    let year = Number(bag.year);
    if (hour === 24) {
      hour = 0;
      const rolled = new Date(Date.UTC(year, month - 1, day + 1));
      year = rolled.getUTCFullYear();
      month = rolled.getUTCMonth() + 1;
      day = rolled.getUTCDate();
    }
    const date = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const time = `${String(hour).padStart(2, "0")}:${String(bag.minute).padStart(2, "0")}:${String(bag.second).padStart(2, "0")}`;
    const asUtc = Date.UTC(year, month - 1, day, hour, Number(bag.minute), Number(bag.second));
    return { date, time, asUtc };
  } catch {
    return null;
  }
}

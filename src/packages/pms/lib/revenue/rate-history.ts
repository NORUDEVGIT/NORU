/**
 * Rate Change History (UI-06) display helpers.
 * Reads hotel_rate_change_events only. created_at range is "Changed Between".
 */

import {
  RATE_CHANGE_HISTORY_PAGE_SIZE,
  type RateChangeActionType,
  type RateChangeHistoryRow,
} from "./rate-change.ts";
import { HISTORY_EMPTY_COPY } from "./revenue-control.ts";

export const RATE_HISTORY_EMPTY_COPY = HISTORY_EMPTY_COPY;
export const RATE_HISTORY_EMPTY_SECONDARY =
  "Earlier calendar changes are not available in this history.";
export const RATE_HISTORY_PAGE_SIZES = [10, 25, 50] as const;
export const RATE_HISTORY_DEFAULT_PAGE_SIZE = RATE_CHANGE_HISTORY_PAGE_SIZE;
export const RATE_HISTORY_REASON_EMPTY = "No reason provided";

export function rateHistoryActionLabel(actionType: RateChangeActionType | string): string {
  if (actionType === "bulk_rate_change") return "Bulk Rate Change";
  if (actionType === "reset_override") return "Reset to Base";
  if (actionType === "copy_rate") return "Copied Rate";
  return "Single Rate Change";
}

export function rateHistorySourceLabel(source: string): string {
  if (source === "rate_calendar") return "Rate Calendar";
  if (source === "rate_revenue") return "Rate & Revenue";
  return source;
}

export function rateHistoryActorLabel(row: { actorName?: string | null; actorMembershipId?: string | null }): string {
  if (row.actorName && row.actorName.trim()) return row.actorName;
  return "Staff";
}

export function rateHistoryReasonLabel(reason: string | null | undefined): string {
  const trimmed = (reason ?? "").trim();
  return trimmed === "" ? RATE_HISTORY_REASON_EMPTY : trimmed;
}

export function copySourceDateFromMetadata(metadata: Record<string, unknown> | null | undefined): string | null {
  const value = metadata?.sourceDate;
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function historyPaginationRange(page: number, pageSize: number, total: number) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return { start, end, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export function formatHistoryMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`.trim();
  }
}

export function deltaTone(delta: number): "up" | "down" | "flat" {
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}

export function historyEventSummary(row: RateChangeHistoryRow): string {
  return `${rateHistoryActionLabel(row.actionType)} · ${row.ratePlanCode ?? "Plan"} · ${row.stayDate}`;
}

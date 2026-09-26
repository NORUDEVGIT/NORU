/**
 * FO Phase 6 — Guest Services signals (pure).
 * Canonical rows live in guest_service_history. No FO SLA/routing engine.
 */
import type { GuestServicePriority, GuestServiceStatus } from "./guest-services-workspace.ts";

export const FO_GS_ACTIVE_STATUSES: GuestServiceStatus[] = ["requested", "in_progress"];

export const PRIORITY_RANK: Record<GuestServicePriority, number> = {
  urgent: 3,
  high: 2,
  normal: 1,
};

export type FoGuestServiceItem = {
  id: string;
  requestNumber: string | null;
  serviceName: string;
  categoryName: string | null;
  status: GuestServiceStatus;
  priority: GuestServicePriority;
  assignedName: string | null;
  requestedAt: string;
  preferredAt: string | null;
  notes: string | null;
};

export type FoGuestServiceSignals = {
  activeCount: number;
  unresolvedCount: number;
  hasUrgent: boolean;
  hasOverdue: boolean;
  highestPriority: GuestServicePriority | null;
};

export function isActiveGuestServiceStatus(status: string): status is GuestServiceStatus {
  return status === "requested" || status === "in_progress";
}

export function preferredTimeOverdue(preferredAt: string | null | undefined, nowMs: number): boolean {
  if (!preferredAt) return false;
  const due = Date.parse(preferredAt);
  if (!Number.isFinite(due)) return false;
  return due < nowMs;
}

export function foGuestServiceSignals(
  items: Array<{
    status: string;
    priority: GuestServicePriority;
    preferredAt: string | null;
  }>,
  nowMs: number,
): FoGuestServiceSignals {
  const active = items.filter((item) => isActiveGuestServiceStatus(item.status));
  const overdue = active.filter((item) => preferredTimeOverdue(item.preferredAt, nowMs));
  let highest: GuestServicePriority | null = null;
  for (const item of active) {
    if (!highest || PRIORITY_RANK[item.priority] > PRIORITY_RANK[highest]) highest = item.priority;
  }
  return {
    activeCount: active.length,
    unresolvedCount: active.length,
    hasUrgent: active.some((item) => item.priority === "urgent"),
    hasOverdue: overdue.length > 0,
    highestPriority: highest,
  };
}

export function foGuestServiceHeadline(signals: FoGuestServiceSignals): string {
  if (signals.activeCount === 0) return "No active requests";
  const bits = [`${signals.activeCount} active`];
  if (signals.highestPriority) bits.push(signals.highestPriority);
  if (signals.hasOverdue) bits.push("preferred time passed");
  return bits.join(" · ");
}

/** Read-only derived FO flags. Never persisted. */
export function foGuestServiceDerivedFlags(signals: FoGuestServiceSignals): {
  active_guest_request: boolean;
  urgent_guest_request: boolean;
  overdue_guest_request: boolean;
  unresolved_service_request: boolean;
} {
  return {
    active_guest_request: signals.activeCount > 0,
    urgent_guest_request: signals.hasUrgent,
    overdue_guest_request: signals.hasOverdue,
    unresolved_service_request: signals.unresolvedCount > 0,
  };
}

export function canConfirmFoGuestServiceRequest(input: {
  serviceTypeId: string;
  description: string;
  typesConfigured: boolean;
}): boolean {
  return input.typesConfigured && Boolean(input.serviceTypeId) && input.description.trim().length > 0;
}

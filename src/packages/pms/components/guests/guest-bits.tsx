import { AlertTriangle, Star } from "lucide-react";

import {
  guestRestrictionWarning,
  type GuestRestrictionFlags,
} from "@/packages/pms/lib/guest-profile-individual";

export function VipBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
      <Star className="size-3" /> VIP
    </span>
  );
}

export function StatusBadge({ status }: { status: "active" | "inactive" }) {
  return (
    <span
      className={
        status === "active"
          ? "inline-flex rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-success"
          : "inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
      }
    >
      {status}
    </span>
  );
}

export function GuestRestrictionBadges({
  guest,
}: {
  guest: GuestRestrictionFlags | null | undefined;
}) {
  if (!guest) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1" data-testid="guest-restriction-badges">
      {guest.restricted ? (
        <span
          data-testid="guest-restricted-badge"
          className="inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800"
        >
          Restricted
        </span>
      ) : null}
      {guest.blacklisted ? (
        <span
          data-testid="guest-blacklisted-badge"
          className="inline-flex rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-destructive"
        >
          Blacklisted
        </span>
      ) : null}
    </span>
  );
}

export function GuestRestrictionWarn({
  guest,
}: {
  guest: GuestRestrictionFlags | null | undefined;
}) {
  const message = guestRestrictionWarning(guest);
  if (!message) return null;
  const reason = (guest?.restrictionReason ?? "").trim();
  return (
    <div
      data-testid="guest-restriction-warn"
      className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>
        <p>{message}</p>
        {reason ? (
          <p className="mt-1 text-xs" data-testid="guest-restriction-warn-reason">
            Reason: {reason}
          </p>
        ) : null}
      </div>
    </div>
  );
}

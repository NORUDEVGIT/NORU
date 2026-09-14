import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { StatCard } from "@/packages/pms/components/bookings/reservation-bits";
import { VipBadge } from "@/packages/pms/components/guests/guest-bits";
import { WAVE3_KPI_NOT_AVAILABLE, WAVE3_POSTED_FOLIO_LABEL, WAVE3_QUOTED_ROOM_TOTAL_LABEL } from "@/packages/pms/lib/guest-profile-wave3";
import {
  WAVE4_LOYALTY_COPY,
  WAVE4_LOYALTY_EMPTY,
  WAVE4_MIGRATION_UNAVAILABLE,
  WAVE4_NO_POINTS_COPY,
  WAVE4_VIP_STAFF_FLAG_COPY,
  hasDerivedLoyaltyFigures,
  loyaltyFromStayOverview,
  type GuestLoyaltyValue,
} from "@/packages/pms/lib/guest-profile-wave4";
import { getAccountLoyaltyValue } from "@/packages/pms/lib/guest-accounts.functions";
import { getGuest, getGuestStayOverview } from "@/packages/pms/lib/guests.functions";
import { useMoney } from "@/packages/restaurant-management/state/restaurant-context";

export function GuestLoyaltyCard({
  restaurantId,
  guestId,
  accountId,
  partyName,
}: {
  restaurantId: string;
  guestId?: string | undefined;
  accountId?: string | undefined;
  partyName: string;
}) {
  const money = useMoney();
  const fetchOverview = useServerFn(getGuestStayOverview);
  const fetchGuest = useServerFn(getGuest);
  const fetchAccountLoyalty = useServerFn(getAccountLoyaltyValue);

  const guestQuery = useQuery({
    queryKey: ["guest", restaurantId, guestId],
    queryFn: () => fetchGuest({ data: { restaurantId, guestId: guestId! } }),
    enabled: Boolean(guestId),
    retry: false,
  });
  const overviewQuery = useQuery({
    queryKey: ["guest-stay-overview", restaurantId, guestId],
    queryFn: () => fetchOverview({ data: { restaurantId, guestId: guestId! } }),
    enabled: Boolean(guestId),
    retry: false,
  });
  const accountQuery = useQuery({
    queryKey: ["guest-account-loyalty", restaurantId, accountId],
    queryFn: () => fetchAccountLoyalty({ data: { restaurantId, accountId: accountId! } }),
    enabled: Boolean(accountId),
    retry: false,
  });

  const loading = guestId ? overviewQuery.isLoading || guestQuery.isLoading : accountQuery.isLoading;
  const error = guestId ? overviewQuery.error ?? guestQuery.error : accountQuery.error;

  if (loading) return <p className="text-sm text-muted-foreground">Loading loyalty…</p>;
  if (error) {
    const message = error instanceof Error ? error.message : "Loyalty figures could not be loaded.";
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-6" data-testid="guest-loyalty">
        <h2 className="font-display text-xl">Loyalty & Value</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {message.includes("0053") ? WAVE4_MIGRATION_UNAVAILABLE : message}
        </p>
      </div>
    );
  }

  const value: GuestLoyaltyValue | null = guestId
    ? overviewQuery.data && guestQuery.data
      ? loyaltyFromStayOverview(overviewQuery.data, guestQuery.data.guest.vipStatus)
      : null
    : (accountQuery.data ?? null);
  if (!value) return null;

  return (
    <div className="space-y-4" data-testid="guest-loyalty">
      <div>
        <h2 className="font-display text-xl">Loyalty & Value</h2>
        <p className="mt-1 text-sm font-medium">{partyName}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {WAVE4_LOYALTY_COPY} {WAVE4_NO_POINTS_COPY} {WAVE4_VIP_STAFF_FLAG_COPY}
        </p>
      </div>

      {!hasDerivedLoyaltyFigures(value) ? (
        <p className="text-sm text-muted-foreground" data-testid="guest-loyalty-empty">
          {WAVE4_LOYALTY_EMPTY}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div data-testid="guest-loyalty-stays">
          <StatCard label="Stays" value={value.stayCount} hint="Real reservation records only" />
        </div>
        <div data-testid="guest-loyalty-nights">
          <StatCard label="Nights" value={value.nightCount} hint="Same nightsBetween rule as Reservations" />
        </div>
        <div data-testid="guest-loyalty-quoted">
          <StatCard
            label={WAVE3_QUOTED_ROOM_TOTAL_LABEL}
            value={value.roomTotal ? money(value.roomTotal.amount) : WAVE3_KPI_NOT_AVAILABLE}
            hint={value.roomTotal ? "Quoted / priced room_subtotal — not invented spend" : "Not shown as 0.00"}
          />
        </div>
        <div data-testid="guest-loyalty-folio">
          <StatCard
            label={WAVE3_POSTED_FOLIO_LABEL}
            value={value.folioOutstanding ? money(value.folioOutstanding.amount) : WAVE3_KPI_NOT_AVAILABLE}
            hint={value.folioOutstanding ? "Posted folio totals only when they exist" : "Not shown as 0.00"}
          />
        </div>
      </div>

      {guestId ? (
        <p className="text-sm text-muted-foreground" data-testid="guest-loyalty-vip">
          {value.vip ? (
            <span className="inline-flex items-center gap-2">
              <VipBadge /> Staff VIP flag from Information — not a points tier.
            </span>
          ) : (
            "VIP is not set. Staff can flag VIP on Information."
          )}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Figures are derived from linked individuals&apos; stays
          {value.memberCount !== null ? ` (${value.memberCount} linked)` : ""}. This is not a points programme.
        </p>
      )}
    </div>
  );
}

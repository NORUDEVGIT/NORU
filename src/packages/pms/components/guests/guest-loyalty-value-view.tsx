import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Award, Crown, DollarSign, Hotel, Moon, ShieldCheck, Sparkles } from "lucide-react";

import { VipBadge } from "@/packages/pms/components/guests/guest-bits";
import {
  WAVE3_KPI_NOT_AVAILABLE,
  WAVE3_POSTED_FOLIO_LABEL,
  WAVE3_QUOTED_ROOM_TOTAL_LABEL,
} from "@/packages/pms/lib/guest-profile-wave3";
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
import { Badge } from "@/shared/components/ui/badge";

export function GuestLoyaltyValueView({
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

  const loading = guestId
    ? overviewQuery.isLoading || guestQuery.isLoading
    : accountQuery.isLoading;
  const error = guestId ? overviewQuery.error ?? guestQuery.error : accountQuery.error;

  if (loading) {
    return (
      <div className="space-y-4" data-testid="guest-loyalty-loading">
        <div className="h-10 rounded-xl border border-[#DDD4C5] bg-white animate-pulse" />
        <div className="h-28 rounded-xl border border-[#DDD4C5] bg-white animate-pulse" />
      </div>
    );
  }

  if (error) {
    const message = error instanceof Error ? error.message : "Loyalty figures could not be loaded.";
    return (
      <div className="rounded-xl border border-[#DDD4C5] bg-white p-6 text-center text-xs text-[#756A5B]" data-testid="guest-loyalty">
        <h2 className="font-display text-base font-semibold text-[#251605]">Loyalty & Value</h2>
        <p className="mt-2 text-[#756A5B]">
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

  const hasData = hasDerivedLoyaltyFigures(value);

  return (
    <div className="space-y-4" data-testid="guest-loyalty">
      {/* Top Header */}
      <div className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-[#251605]">Loyalty & Value</h2>
            <p className="text-[11px] text-[#756A5B] mt-0.5">
              Guest recognition, historical production, and portfolio value derived from actual stays and folios.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#756A5B]">Recognition Status:</span>
            {value.isVip ? (
              <VipBadge />
            ) : (
              <Badge variant="outline" className="border-[#DDD4C5] bg-[#FAF8F5] text-xs text-[#756A5B]">
                Standard Guest
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* 4-Cell Summary Band matching NORU Operational Layout (NO legacy StatCards) */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="guest-loyalty-metrics">
        {/* Cell 1: Stays */}
        <div
          className="rounded-xl border border-[#DDD4C5] bg-white p-3.5 shadow-sm"
          data-testid="guest-loyalty-stays"
        >
          <div className="flex items-center justify-between text-[#756A5B]">
            <span className="text-[10px] font-medium uppercase tracking-wider">Total Stays</span>
            <Hotel className="size-3.5 text-[#8A641A]" />
          </div>
          <p className="mt-1 font-display text-2xl font-semibold text-[#251605]">{value.stayCount}</p>
          <p className="text-[10px] text-[#756A5B] mt-0.5">Completed & verified stays</p>
        </div>

        {/* Cell 2: Nights */}
        <div
          className="rounded-xl border border-[#DDD4C5] bg-white p-3.5 shadow-sm"
          data-testid="guest-loyalty-nights"
        >
          <div className="flex items-center justify-between text-[#756A5B]">
            <span className="text-[10px] font-medium uppercase tracking-wider">Total Nights</span>
            <Moon className="size-3.5 text-[#8A641A]" />
          </div>
          <p className="mt-1 font-display text-2xl font-semibold text-[#251605]">{value.nightCount}</p>
          <p className="text-[10px] text-[#756A5B] mt-0.5">Cumulative nights stayed</p>
        </div>

        {/* Cell 3: Quoted Room Value */}
        <div
          className="rounded-xl border border-[#DDD4C5] bg-white p-3.5 shadow-sm"
          data-testid="guest-loyalty-quoted"
        >
          <div className="flex items-center justify-between text-[#756A5B]">
            <span className="text-[10px] font-medium uppercase tracking-wider">
              Quoted Room Value
            </span>
            <DollarSign className="size-3.5 text-[#8A641A]" />
          </div>
          <p className="mt-1 font-display text-2xl font-semibold text-[#251605]">
            {value.quotedRoomTotal != null ? money(value.quotedRoomTotal) : "—"}
          </p>
          <p className="text-[10px] text-[#756A5B] mt-0.5">Agreed reservation room totals</p>
        </div>

        {/* Cell 4: Posted Folio Value */}
        <div
          className="rounded-xl border border-[#DDD4C5] bg-white p-3.5 shadow-sm"
          data-testid="guest-loyalty-posted"
        >
          <div className="flex items-center justify-between text-[#756A5B]">
            <span className="text-[10px] font-medium uppercase tracking-wider">
              Posted Folio Value
            </span>
            <Award className="size-3.5 text-[#8A641A]" />
          </div>
          <p className="mt-1 font-display text-2xl font-semibold text-[#251605]">
            {value.postedFolioValue != null ? money(value.postedFolioValue) : "—"}
          </p>
          <p className="text-[10px] text-[#756A5B] mt-0.5">Final settled folio charges</p>
        </div>
      </div>

      {/* Recognition & Value Policy Context */}
      <div className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm space-y-3">
        <h3 className="font-display text-sm font-semibold text-[#251605]">
          Recognition Policy & System Truth
        </h3>

        {!hasData ? (
          <p className="text-xs text-[#756A5B]" data-testid="guest-loyalty-empty">
            {WAVE4_LOYALTY_EMPTY}
          </p>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-xs">
          <div className="rounded-lg border border-[#DDD4C5] bg-[#FAF8F5] p-3 space-y-1">
            <span className="font-semibold text-[#251605]">No Artificial Points</span>
            <p className="text-[11px] text-[#756A5B] leading-relaxed">
              {WAVE4_NO_POINTS_COPY} Production and stay counts represent verifiable front-desk folio records.
            </p>
          </div>

          <div className="rounded-lg border border-[#DDD4C5] bg-[#FAF8F5] p-3 space-y-1">
            <span className="font-semibold text-[#251605]">VIP Flag Management</span>
            <p className="text-[11px] text-[#756A5B] leading-relaxed">
              {WAVE4_VIP_STAFF_FLAG_COPY} VIP recognition is managed by hotel management and reception supervisors directly on the profile.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";

import { getHousekeepingAccess } from "@/packages/pms/lib/housekeeping.functions";
import {
  CleaningBoardTab,
  ExceptionsTab,
  HousekeepingHistoryTab,
  InspectionsTab,
  MaintenanceTab,
  RestrictionsTab,
} from "@/packages/pms/components/housekeeping/housekeeping-tabs";
import { HousekeepingBoardTab } from "@/packages/pms/components/housekeeping/housekeeping-board";
import { HousekeepingChrome } from "@/packages/pms/components/housekeeping/housekeeping-chrome";
import { HousekeepingRequestsTab } from "@/packages/pms/components/housekeeping/housekeeping-requests-tab";
import {
  firstVisibleHkArea,
  hkAreaPath,
  resolveHkArea,
  type HkAreaId,
  type HkResolvableAreaId,
} from "@/packages/pms/lib/housekeeping-shell";
import { useRestaurantTimezone } from "@/core/state/property-format";
import { localDateInZone } from "@/shared/lib/property-time";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { PageHeading } from "@/core/state/pms-context";

export function HousekeepingWorkspace({
  membership,
  initialTab,
  initialRoomId,
  fromLegacy = false,
  defaultArea,
}: {
  membership: RestaurantMembership;
  initialTab?: string | undefined;
  initialRoomId?: string | undefined;
  fromLegacy?: boolean;
  defaultArea?: HkResolvableAreaId;
}) {
  const restaurantId = membership.restaurant.id;
  const timezone = useRestaurantTimezone();
  const today = useMemo(() => localDateInZone(timezone), [timezone]);
  const navigate = useNavigate();

  const fetchAccess = useServerFn(getHousekeepingAccess);
  const accessQuery = useQuery({
    queryKey: ["housekeeping-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });

  const requested = resolveHkArea(initialTab, { fromLegacy, defaultArea });
  const scope = accessQuery.data?.scope ?? "housekeeper";
  const area = accessQuery.data ? firstVisibleHkArea(scope, requested) : requested;

  useEffect(() => {
    if (!accessQuery.data) return;
    if (requested !== area) {
      const dest = hkAreaPath(area);
      void navigate({ to: dest.to, search: dest.search, replace: true });
      return;
    }
    if (!initialTab) {
      const dest = hkAreaPath(area);
      void navigate({ to: dest.to, search: dest.search, replace: true });
    }
  }, [accessQuery.data, area, requested, initialTab, navigate]);

  function goToArea(id: HkAreaId) {
    const dest = hkAreaPath(id);
    void navigate({ to: dest.to, search: dest.search, replace: true });
  }

  if (accessQuery.isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading housekeeping…</p>;
  }
  if (!accessQuery.data) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl">
          <PageHeading fallback="Housekeeping" />
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don't have access to Housekeeping for this property.
        </p>
      </div>
    );
  }

  const props = { restaurantId, today };

  return (
    <HousekeepingChrome
      membership={membership}
      scope={scope}
      active={area}
      onNavigate={goToArea}
      onSearch={() => undefined}
    >
      {area === "board" ? (
        <HousekeepingBoardTab
          {...props}
          scope={scope}
          membershipId={accessQuery.data.membershipId}
          openRoomId={initialRoomId}
        />
      ) : null}
      {area === "cleaning" ? (
        <CleaningBoardTab {...props} scope={scope} membershipId={accessQuery.data.membershipId} />
      ) : null}
      {area === "inspections" ? <InspectionsTab {...props} /> : null}
      {area === "requests" ? <HousekeepingRequestsTab {...props} /> : null}
      {area === "maintenance" ? <MaintenanceTab {...props} /> : null}
      {area === "exceptions" ? <ExceptionsTab {...props} /> : null}
      {area === "history" ? <HousekeepingHistoryTab {...props} /> : null}
      {area === "restrictions" ? <RestrictionsTab {...props} /> : null}
    </HousekeepingChrome>
  );
}

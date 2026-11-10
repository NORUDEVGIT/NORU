import type { ReactNode } from "react";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { RoomInventoryChrome } from "@/packages/pms/components/rooms/room-inventory-chrome";

/** Same desk shell as Reservations and Guest Profiles: module bar, then the page. */
export function NightAuditChrome({
  membership,
  onSearch,
  children,
}: {
  membership: RestaurantMembership;
  onSearch: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <RoomInventoryChrome
      membership={membership}
      activeModule="Night Audit"
      searchPlaceholder="Search End of Day…"
      searchTestId="night-audit-module-search"
      helpLabel="Night Audit End of Day workspace"
      shellTestId="night-audit-command-shell"
      onRoomSearch={onSearch}
      suppressReturnButton
    >
      <div className="min-w-0 bg-[#F7F4EE]" data-testid="night-audit-desk">
        {children}
      </div>
    </RoomInventoryChrome>
  );
}

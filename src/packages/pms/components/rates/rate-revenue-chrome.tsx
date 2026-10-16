import type { ReactNode } from "react";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { RoomInventoryChrome } from "@/packages/pms/components/rooms/room-inventory-chrome";

/**
 * Rate & Revenue uses the shared PMS module bar.
 * Revenue desks and server logic stay in this module.
 */
export function RateRevenueChrome({
  membership,
  children,
}: {
  membership: RestaurantMembership;
  children: ReactNode;
}) {
  return (
    <RoomInventoryChrome
      membership={membership}
      activeModule="Rate & Revenue"
      onRoomSearch={() => undefined}
      searchPlaceholder="Search rates…"
      helpLabel="Rate & Revenue operational workspace"
      shellTestId="rate-revenue-command-shell"
    >
      {children}
    </RoomInventoryChrome>
  );
}

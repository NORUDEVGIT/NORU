import type { ReactNode } from "react";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { RoomInventoryChrome } from "@/packages/pms/components/rooms/room-inventory-chrome";

export function HousekeepingChrome({
  membership,
  children,
}: {
  membership: RestaurantMembership;
  children: ReactNode;
}) {
  return (
    <RoomInventoryChrome
      membership={membership}
      activeModule="Housekeeping"
      helpLabel="Housekeeping operational workspace"
      shellTestId="hk-command-shell"
      suppressReturnButton
    >
      {children}
    </RoomInventoryChrome>
  );
}

import type { ReactNode } from "react";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { RoomInventoryChrome } from "@/packages/pms/components/rooms/room-inventory-chrome";

export function CashieringChrome({
  membership,
  children,
}: {
  membership: RestaurantMembership;
  children: ReactNode;
}) {
  return (
    <RoomInventoryChrome
      membership={membership}
      activeModule="Cashiering"
      helpLabel="Cashiering operational workspace"
      shellTestId="cashiering-command-shell"
      suppressReturnButton
    >
      {children}
    </RoomInventoryChrome>
  );
}

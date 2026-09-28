import type { ReactNode } from "react";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { RoomInventoryChrome } from "@/packages/pms/components/rooms/room-inventory-chrome";

/** Guest Profile desk inside the shared PMS module bar. */
export function GuestProfileChrome({
  membership,
  children,
}: {
  membership: RestaurantMembership;
  children: ReactNode;
}) {
  return (
    <RoomInventoryChrome
      membership={membership}
      activeModule="Guest Profile"
      onRoomSearch={() => undefined}
      searchPlaceholder="Search guests…"
      helpLabel="Guest Profile"
      shellTestId="guest-profile-command-shell"
    >
      {children}
    </RoomInventoryChrome>
  );
}

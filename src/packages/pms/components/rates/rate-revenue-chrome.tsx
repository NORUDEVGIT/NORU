import type { ReactNode } from "react";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { RoomInventoryChrome } from "@/packages/pms/components/rooms/room-inventory-chrome";

/**
 * Rate & Revenue uses the shared PMS module bar.
 * Revenue desks and server logic stay in this module.
 */
const NAV_ITEMS = [
  { label: "Front Office", to: "/restaurant/pms/front-office" },
  { label: "Reservations", to: "/restaurant/pms/reservations" },
  { label: "Rooms & Inventory", to: "/restaurant/pms/room-inventory" },
  { label: "Guest Profiles", to: "/restaurant/pms/guests" },
  { label: "Housekeeping", to: "/restaurant/pms/housekeeping" },
  { label: "Rates & Revenue", to: "/restaurant/pms/rates-revenue", active: true },
  { label: "F&B", to: "/restaurant/restaurant-management/dashboard" },
  { label: "Reports", to: "/restaurant/pms/reports" },
  { label: "Settings", to: "/restaurant/settings" },
] as const;

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

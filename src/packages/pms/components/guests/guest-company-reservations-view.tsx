import { GuestCompanyReservations } from "@/packages/pms/components/guests/guest-company-reservations";

export function GuestCompanyReservationsView(props: {
  restaurantId: string;
  companyId: string;
  canManage: boolean;
}) {
  return <GuestCompanyReservations {...props} />;
}

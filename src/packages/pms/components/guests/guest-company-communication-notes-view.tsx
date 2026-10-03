import { GuestCompanyNotes } from "@/packages/pms/components/guests/guest-company-notes";

export function GuestCompanyCommunicationNotesView(props: {
  restaurantId: string;
  companyId: string;
}) {
  return <GuestCompanyNotes {...props} />;
}

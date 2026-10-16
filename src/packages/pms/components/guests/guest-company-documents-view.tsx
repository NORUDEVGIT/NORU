import { GuestCompanyDocuments } from "@/packages/pms/components/guests/guest-company-documents";

export function GuestCompanyDocumentsView(props: {
  restaurantId: string;
  companyId: string;
}) {
  return <GuestCompanyDocuments {...props} />;
}

export { GuestCompanyDocuments };

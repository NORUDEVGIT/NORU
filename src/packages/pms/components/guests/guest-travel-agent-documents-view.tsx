import { GuestTravelAgentDocuments } from "@/packages/pms/components/guests/guest-travel-agent-documents";

export function GuestTravelAgentDocumentsView(props: {
  restaurantId: string;
  agencyId: string;
}) {
  return <GuestTravelAgentDocuments {...props} />;
}

export { GuestTravelAgentDocuments };

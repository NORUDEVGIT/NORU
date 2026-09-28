import { GuestTravelAgentNotes } from "@/packages/pms/components/guests/guest-travel-agent-notes";

export function GuestTravelAgentCommunicationNotesView(props: {
  restaurantId: string;
  agencyId: string;
}) {
  return <GuestTravelAgentNotes {...props} />;
}

export { GuestTravelAgentNotes };

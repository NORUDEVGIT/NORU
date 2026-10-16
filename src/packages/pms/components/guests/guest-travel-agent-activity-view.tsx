import { GuestActivityHubCard } from "@/packages/pms/components/guests/guest-activity-hub-card";

export function GuestTravelAgentActivityView({
  restaurantId,
  agencyId,
  agencyName,
}: {
  restaurantId: string;
  agencyId: string;
  agencyName: string;
}) {
  return (
    <div className="space-y-4" data-testid="travel-agent-activity-view">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DDD4C5] pb-3">
        <div>
          <h2 className="font-display text-lg font-bold text-[#251605]">Agency Activity & Audit Log</h2>
          <p className="text-xs text-[#756A5B]">
            Chronological audit trail of travel agency profile updates, commission plans, agreements, travelers, documents, and communication.
          </p>
        </div>
      </div>
      <GuestActivityHubCard
        restaurantId={restaurantId}
        accountId={agencyId}
        partyName={agencyName}
        showFilters
      />
    </div>
  );
}

import { GuestActivityHubCard } from "@/packages/pms/components/guests/guest-activity-hub-card";

export function GuestCompanyActivityView({
  restaurantId,
  companyId,
  companyName,
}: {
  restaurantId: string;
  companyId: string;
  companyName: string;
}) {
  return (
    <div className="space-y-4" data-testid="company-activity-view">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DDD4C5] pb-3">
        <div>
          <h2 className="font-display text-lg font-bold text-[#251605]">Company Activity & Audit Log</h2>
          <p className="text-xs text-[#756A5B]">
            Chronological audit trail of corporate profile updates, agreements, travelers, documents, and communication.
          </p>
        </div>
      </div>
      <GuestActivityHubCard
        restaurantId={restaurantId}
        accountId={companyId}
        partyName={companyName}
        showFilters
      />
    </div>
  );
}

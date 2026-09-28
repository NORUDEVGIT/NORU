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
      <GuestActivityHubCard
        restaurantId={restaurantId}
        accountId={companyId}
        partyName={companyName}
        showFilters
      />
    </div>
  );
}

import { GuestActivityHubCard } from "@/packages/pms/components/guests/guest-activity-hub-card";

export function GuestGroupActivityView({
  restaurantId,
  groupId,
  groupName,
}: {
  restaurantId: string;
  groupId: string;
  groupName: string;
}) {
  return (
    <div className="space-y-4" data-testid="group-activity-view">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DDD4C5] pb-3">
        <div>
          <h2 className="font-display text-lg font-bold text-[#251605]">Group Activity & Audit Log</h2>
          <p className="text-xs text-[#756A5B]">
            Chronological audit trail of group master changes, member links, room assignments, communications, and service requests.
          </p>
        </div>
      </div>
      <GuestActivityHubCard
        restaurantId={restaurantId}
        accountId={groupId}
        partyName={groupName}
        showFilters
      />
    </div>
  );
}

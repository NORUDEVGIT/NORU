import { useState } from "react";
import { Users, UserCheck } from "lucide-react";

import { GuestTravelAgentContacts } from "@/packages/pms/components/guests/guest-travel-agent-contacts";
import { GuestTravelAgentTravelers } from "@/packages/pms/components/guests/guest-travel-agent-travelers";
import {
  resolveInitialTravelAgentContactsTravelersSubTab,
  type TravelAgentContactsTravelersSubTab,
} from "@/packages/pms/lib/guest-travel-agent-detail-view";
import { cn } from "@/shared/lib/utils";

export function GuestTravelAgentContactsTravelersView({
  restaurantId,
  agencyId,
  initialSubTab,
}: {
  restaurantId: string;
  agencyId: string;
  initialSubTab?: string | null;
}) {
  const [subTab, setSubTab] = useState<TravelAgentContactsTravelersSubTab>(() =>
    resolveInitialTravelAgentContactsTravelersSubTab(initialSubTab),
  );

  return (
    <div className="space-y-6" data-testid="travel-agent-contacts-travelers-view">
      {/* Subtab Navigation */}
      <div className="flex items-center gap-6 border-b border-[#DDD4C5] pb-0">
        <button
          type="button"
          onClick={() => setSubTab("contacts")}
          data-testid="travel-agent-subtab-contacts"
          className={cn(
            "inline-flex items-center gap-2 pb-2.5 text-sm font-medium border-b-2 transition-colors",
            subTab === "contacts"
              ? "border-[#8A641A] text-[#251605] font-semibold"
              : "border-transparent text-[#756A5B] hover:text-[#251605]",
          )}
        >
          <Users className="size-4 text-[#8A641A]" />
          <span>Agency Contacts</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab("travelers")}
          data-testid="travel-agent-subtab-travelers"
          className={cn(
            "inline-flex items-center gap-2 pb-2.5 text-sm font-medium border-b-2 transition-colors",
            subTab === "travelers"
              ? "border-[#8A641A] text-[#251605] font-semibold"
              : "border-transparent text-[#756A5B] hover:text-[#251605]",
          )}
        >
          <UserCheck className="size-4 text-[#8A641A]" />
          <span>Linked Travelers</span>
        </button>
      </div>

      {subTab === "contacts" ? (
        <GuestTravelAgentContacts
          restaurantId={restaurantId}
          agencyId={agencyId}
        />
      ) : (
        <GuestTravelAgentTravelers
          restaurantId={restaurantId}
          agencyId={agencyId}
        />
      )}
    </div>
  );
}

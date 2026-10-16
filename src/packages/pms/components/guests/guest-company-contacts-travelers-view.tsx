import { useState } from "react";
import { Users, UserCheck } from "lucide-react";

import { GuestCompanyContacts } from "@/packages/pms/components/guests/guest-company-contacts";
import { GuestCompanyTravelers } from "@/packages/pms/components/guests/guest-company-travelers";
import {
  resolveInitialContactsTravelersSubTab,
  type CompanyContactsTravelersSubTab,
} from "@/packages/pms/lib/guest-company-detail-view";
import { cn } from "@/shared/lib/utils";

export function GuestCompanyContactsTravelersView({
  restaurantId,
  companyId,
  companyName,
  contactRequired,
  initialSubTab,
  onEditCompany,
}: {
  restaurantId: string;
  companyId: string;
  companyName: string;
  contactRequired?: boolean;
  initialSubTab?: string | null;
  onEditCompany?: () => void;
}) {
  const [subTab, setSubTab] = useState<CompanyContactsTravelersSubTab>(() =>
    resolveInitialContactsTravelersSubTab(initialSubTab),
  );

  return (
    <div className="space-y-6" data-testid="company-contacts-travelers-view">
      {/* Subtab Navigation */}
      <div className="flex items-center gap-6 border-b border-[#DDD4C5] pb-0">
        <button
          type="button"
          onClick={() => setSubTab("contacts")}
          data-testid="company-subtab-contacts"
          className={cn(
            "inline-flex items-center gap-2 pb-2.5 text-sm font-medium border-b-2 transition-colors",
            subTab === "contacts"
              ? "border-[#8A641A] text-[#251605] font-semibold"
              : "border-transparent text-[#756A5B] hover:text-[#251605]",
          )}
        >
          <Users className="size-4 text-[#8A641A]" />
          <span>Contact Persons</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab("travelers")}
          data-testid="company-subtab-travelers"
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
        <GuestCompanyContacts
          restaurantId={restaurantId}
          companyId={companyId}
          companyName={companyName}
          contactRequired={Boolean(contactRequired)}
          onEditCompany={onEditCompany}
        />
      ) : (
        <GuestCompanyTravelers restaurantId={restaurantId} companyId={companyId} />
      )}
    </div>
  );
}

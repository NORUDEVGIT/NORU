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
      {/* Subtab Segmented Switcher */}
      <div className="flex items-center gap-2 border-b border-[#DDD4C5] pb-3">
        <button
          type="button"
          onClick={() => setSubTab("contacts")}
          data-testid="company-subtab-contacts"
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            subTab === "contacts"
              ? "bg-[#251605] text-white shadow-sm"
              : "bg-[#F7F4EE] text-[#756A5B] hover:bg-[#EFE8DC] hover:text-[#251605]",
          )}
        >
          <Users className="size-4" />
          <span>Contact Persons</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab("travelers")}
          data-testid="company-subtab-travelers"
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            subTab === "travelers"
              ? "bg-[#251605] text-white shadow-sm"
              : "bg-[#F7F4EE] text-[#756A5B] hover:bg-[#EFE8DC] hover:text-[#251605]",
          )}
        >
          <UserCheck className="size-4" />
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

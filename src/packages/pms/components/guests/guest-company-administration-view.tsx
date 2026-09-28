import { GuestPrivacyAdministrationView } from "@/packages/pms/components/guests/guest-privacy-administration-view";

export function GuestCompanyAdministrationView({
  restaurantId,
  companyId,
  companyName,
}: {
  restaurantId: string;
  companyId: string;
  companyName: string;
}) {
  return (
    <div className="space-y-4" data-testid="company-administration-view">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DDD4C5] pb-3">
        <div>
          <h2 className="font-display text-lg font-bold text-[#251605]">Company Administration</h2>
          <p className="text-xs text-[#756A5B]">
            Data privacy, compliance export, lifecycle state, and company audit control.
          </p>
        </div>
      </div>
      <GuestPrivacyAdministrationView
        restaurantId={restaurantId}
        accountId={companyId}
        partyName={companyName}
      />
    </div>
  );
}

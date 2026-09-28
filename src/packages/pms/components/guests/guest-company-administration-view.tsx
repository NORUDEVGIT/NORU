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
      <GuestPrivacyAdministrationView
        restaurantId={restaurantId}
        accountId={companyId}
        partyName={companyName}
      />
    </div>
  );
}

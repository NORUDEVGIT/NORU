import { GuestCompanyBilling } from "@/packages/pms/components/guests/guest-company-billing";

export function GuestCompanyCommercialBillingView(props: {
  restaurantId: string;
  companyId: string;
}) {
  return <GuestCompanyBilling {...props} />;
}

export { GuestCompanyBilling };

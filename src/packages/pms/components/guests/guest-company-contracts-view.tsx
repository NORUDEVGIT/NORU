import { GuestCompanyContracts } from "@/packages/pms/components/guests/guest-company-contracts";

export function GuestCompanyContractsView(props: {
  restaurantId: string;
  companyId: string;
  canWrite: boolean;
}) {
  return <GuestCompanyContracts {...props} />;
}

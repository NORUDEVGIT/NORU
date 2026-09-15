import { CreateReservationMasterPicker } from "@/packages/pms/components/bookings/create-reservation-master-picker";
import {
  CREATE_RESERVATION_ASSOCIATIONS_COPY,
  CREATE_RESERVATION_MASTER_OVERRIDE_RULE,
  type PickedReservationMaster,
} from "@/packages/pms/lib/create-reservation-phase1";

export function CreateReservationAssociations({
  restaurantId,
  canCreateMaster,
  companyMaster,
  onCompanyMasterChange,
  travelAgentMaster,
  onTravelAgentMasterChange,
}: {
  restaurantId: string;
  canCreateMaster: boolean;
  companyMaster: PickedReservationMaster | null;
  onCompanyMasterChange: (master: PickedReservationMaster | null) => void;
  travelAgentMaster: PickedReservationMaster | null;
  onTravelAgentMasterChange: (master: PickedReservationMaster | null) => void;
}) {
  return (
    <section
      className="rounded-2xl border border-border bg-card p-4"
      data-testid="create-reservation-associations"
    >
      <h2 className="font-display text-lg">Associations</h2>
      <p className="mt-1 text-xs text-muted-foreground">{CREATE_RESERVATION_ASSOCIATIONS_COPY}</p>
      <p className="mt-1 text-xs text-muted-foreground">{CREATE_RESERVATION_MASTER_OVERRIDE_RULE}</p>

      <CreateReservationMasterPicker
        restaurantId={restaurantId}
        kind="company"
        canCreate={canCreateMaster}
        master={companyMaster}
        onMasterChange={onCompanyMasterChange}
      />
      <CreateReservationMasterPicker
        restaurantId={restaurantId}
        kind="travel_agent"
        canCreate={canCreateMaster}
        master={travelAgentMaster}
        onMasterChange={onTravelAgentMasterChange}
      />
    </section>
  );
}

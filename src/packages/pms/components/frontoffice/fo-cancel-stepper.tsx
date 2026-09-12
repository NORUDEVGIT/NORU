import type { FrontOfficeStay } from "@/packages/pms/lib/frontoffice.functions";
import { FoCancelNoShowStepper } from "@/packages/pms/components/frontoffice/fo-cancel-noshow-stepper";

export function FoCancelStepper({
  restaurantId,
  stay,
  open,
  onOpenChange,
}: {
  restaurantId: string;
  stay: FrontOfficeStay;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <FoCancelNoShowStepper
      restaurantId={restaurantId}
      stay={stay}
      kind="cancel"
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}

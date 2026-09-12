import type { FrontOfficeStay } from "@/packages/pms/lib/frontoffice.functions";
import { FoCancelNoShowStepper } from "@/packages/pms/components/frontoffice/fo-cancel-noshow-stepper";

export function FoNoShowStepper({
  restaurantId,
  stay,
  today,
  open,
  onOpenChange,
}: {
  restaurantId: string;
  stay: FrontOfficeStay;
  today: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <FoCancelNoShowStepper
      restaurantId={restaurantId}
      stay={stay}
      today={today}
      kind="noshow"
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}

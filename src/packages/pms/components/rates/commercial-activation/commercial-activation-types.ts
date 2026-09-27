import type {
  CommercialActivationKind,
  CommercialActivationSource,
} from "@/packages/pms/lib/revenue/commercial-activation-workflow";
import type { PromotionWorkspaceMaster } from "@/packages/pms/lib/revenue/commercial-overview";
import type { PackageWorkspaceMaster } from "@/packages/pms/lib/revenue/commercial-packages-ui";
import type { RevenueRatePlan, RevenueRoomType } from "@/packages/pms/lib/revenue/revenue-config.types";

export type CommercialActivationWorkflowProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurantId: string;
  canManage: boolean;
  source: CommercialActivationSource;
  currency: string;
  roomTypes: RevenueRoomType[];
  ratePlans: RevenueRatePlan[];
  initialKind?: CommercialActivationKind;
  initialPromotionId?: string | null;
  initialPackageId?: string | null;
  promotionMasters?: PromotionWorkspaceMaster[];
  packageMasters?: PackageWorkspaceMaster[];
  onActivated?: (result: { kind: CommercialActivationKind; activationId: string }) => void;
};

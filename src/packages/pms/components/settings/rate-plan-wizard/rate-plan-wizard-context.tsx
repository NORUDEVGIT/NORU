import { createContext, useContext } from "react";

import type { RatePlanPricingMethod } from "@/packages/pms/lib/rate-plan-from-defaults";
import type { PackageChargeBasis } from "@/packages/pms/lib/meals-card3.server";
import type {
  RateCancellationPolicyRow,
  RateCategoryRow,
  RateEarlyDeparturePolicyRow,
  RateNoShowPolicyRow,
  RatesCard2Snapshot,
} from "@/packages/pms/lib/rates-card2.server";
import type {
  RatePlanWizardForm,
  RatePlanWizardStepId,
} from "./rate-plan-wizard-types";

export type RatePlanWizardPackageOption = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  packagePrice: number;
  chargeBasis: PackageChargeBasis;
};

export type RatePlanWizardFooterConfig = {
  continueLabel: string;
  continueDisabled?: boolean;
  continueBusy?: boolean;
  onContinue: () => void;
};

export type RatePlanWizardCatalogues = {
  categories: RateCategoryRow[];
  roomTypes: RatesCard2Snapshot["roomTypes"];
  mealPlans: RatesCard2Snapshot["mealPlans"];
  cancellationPolicies: RateCancellationPolicyRow[];
  depositPolicies: RatesCard2Snapshot["depositPolicies"];
  noShowPolicies: RateNoShowPolicyRow[];
  earlyDeparturePolicies: RateEarlyDeparturePolicyRow[];
  currencyCode: string;
};

export type RatePlanWizardContextValue = {
  restaurantId: string;
  canEdit: boolean;
  step: RatePlanWizardStepId;
  setStep: (step: RatePlanWizardStepId) => void;
  form: RatePlanWizardForm;
  setForm: React.Dispatch<React.SetStateAction<RatePlanWizardForm>>;
  codeManuallyEdited: boolean;
  setCodeManuallyEdited: (value: boolean) => void;
  attemptedStep1: boolean;
  setAttemptedStep1: (value: boolean) => void;
  catalogues: RatePlanWizardCatalogues;
  packages: RatePlanWizardPackageOption[];
  onAddCategory: () => void;
  onAddCancellation: () => void;
  onAddDeposit: () => void;
  onAddNoShow: () => void;
  onAddEarlyDeparture: () => void;
  onAddMealPlan: () => void;
  onAddPackage: () => void;
  onClose: () => void;
  onCompleted: () => void;
  setFooter: (config: RatePlanWizardFooterConfig | null) => void;
  applyRoomTypeDefaults: (roomTypeId: string, method?: RatePlanPricingMethod) => void;
  pendingSave: boolean;
  completeSetup: () => void;
};

export const RatePlanWizardContext = createContext<RatePlanWizardContextValue | null>(null);

export function useRatePlanWizard(): RatePlanWizardContextValue {
  const ctx = useContext(RatePlanWizardContext);
  if (!ctx) {
    throw new Error("useRatePlanWizard must be used inside RatePlanWizard");
  }
  return ctx;
}

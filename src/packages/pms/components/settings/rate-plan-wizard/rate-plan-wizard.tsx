import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { cn } from "@/shared/lib/utils";
import { getMealsCard3, savePackageCard3 } from "@/packages/pms/lib/meals-card3.functions";
import {
  computeRatePlanBaseFromDefaults,
  occupancyFieldsFromRoomTypeDefaults,
  roomTypeBaseIsConfigured,
  type RatePlanPricingMethod,
} from "@/packages/pms/lib/rate-plan-from-defaults";
import { parseOptionalIncludedField } from "@/packages/pms/components/settings/rate-plan-pricing-setup";
import type {
  RateCancellationPolicyRow,
  RateCategoryRow,
  RateEarlyDeparturePolicyRow,
  RateNoShowPolicyRow,
  RatesCard2Snapshot,
} from "@/packages/pms/lib/rates-card2.server";
import {
  RatePlanWizardContext,
  type RatePlanWizardFooterConfig,
} from "./rate-plan-wizard-context";
import {
  RatePlanWizardStep1,
  RatePlanWizardStep2,
  RatePlanWizardStep3,
  RatePlanWizardStep4,
  RatePlanWizardStep5,
} from "./rate-plan-wizard-steps";
import {
  emptyRatePlanWizardForm,
  isRatePlanWizardStep1Valid,
  RATE_PLAN_NONE,
  RATE_PLAN_WIZARD_STEPS,
  type RatePlanWizardForm,
  type RatePlanWizardStepId,
} from "./rate-plan-wizard-types";

export type RatePlanWizardSavePayload = {
  categoryId: string;
  roomTypeId: string;
  code: string;
  name: string;
  description: string;
  baseRate: number;
  validFrom: string | null;
  validTo: string | null;
  mealPlanId: string | null;
  cancellationPolicyId: string | null;
  refundabilityId: string | null;
  depositPolicyId: string | null;
  noShowPolicyId: string | null;
  earlyDeparturePolicyId: string | null;
  includedOccupancy: number | null;
  extraAdultRate: number | null;
  extraChildRate: number | null;
  active: boolean;
};

function optionalId(value: string) {
  return value && value !== RATE_PLAN_NONE ? value : null;
}

export function RatePlanWizard({
  restaurantId,
  canEdit,
  categories,
  roomTypes,
  mealPlans,
  cancellationPolicies,
  depositPolicies,
  noShowPolicies,
  earlyDeparturePolicies,
  currencyCode,
  pending,
  newlyCreatedCategoryId,
  newlyCreatedPolicy,
  newlyCreatedMealPlanId,
  onClose,
  onSave,
  onAddCategory,
  onAddCancellationPolicy,
  onAddDepositPolicy,
  onAddNoShow,
  onAddEarlyDeparture,
  onAddMealPlan,
}: {
  restaurantId: string;
  canEdit: boolean;
  categories: RateCategoryRow[];
  roomTypes: RatesCard2Snapshot["roomTypes"];
  mealPlans: RatesCard2Snapshot["mealPlans"];
  cancellationPolicies: RateCancellationPolicyRow[];
  depositPolicies: RatesCard2Snapshot["depositPolicies"];
  noShowPolicies: RateNoShowPolicyRow[];
  earlyDeparturePolicies: RateEarlyDeparturePolicyRow[];
  currencyCode: string;
  pending: boolean;
  newlyCreatedCategoryId?: string | null;
  newlyCreatedPolicy?: { type: string; id: string } | null;
  newlyCreatedMealPlanId?: string | null;
  onClose: () => void;
  onSave: (payload: RatePlanWizardSavePayload) => Promise<{
    snapshot?: RatesCard2Snapshot;
  } | void>;
  onAddCategory: () => void;
  onAddCancellationPolicy: () => void;
  onAddDepositPolicy: () => void;
  onAddNoShow: () => void;
  onAddEarlyDeparture: () => void;
  onAddMealPlan: () => void;
}) {
  const queryClient = useQueryClient();
  const loadMeals = useServerFn(getMealsCard3);
  const savePackage = useServerFn(savePackageCard3);

  const [step, setStep] = useState<RatePlanWizardStepId>(1);
  const [attemptedStep1, setAttemptedStep1] = useState(false);
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
  const [footer, setFooter] = useState<RatePlanWizardFooterConfig | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<RatePlanWizardForm>(() =>
    emptyRatePlanWizardForm({
      categoryId: categories[0]?.id ?? "",
      roomTypeId: roomTypes[0]?.id ?? "",
    }),
  );

  const mealsQuery = useQuery({
    queryKey: ["pms-card3-meals", restaurantId],
    queryFn: () => loadMeals({ data: { restaurantId } }),
  });

  const packages = useMemo(
    () =>
      (mealsQuery.data?.snapshot?.packages ?? []).map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        active: row.active,
      })),
    [mealsQuery.data?.snapshot?.packages],
  );

  const applyRoomTypeDefaults = useCallback(
    (roomTypeId: string, method?: RatePlanPricingMethod) => {
      const nextType = roomTypes.find((row) => row.id === roomTypeId);
      if (!nextType) {
        setForm((prev) => ({ ...prev, roomTypeId }));
        return;
      }
      const occupancy = occupancyFieldsFromRoomTypeDefaults(nextType);
      const nextMethod =
        method ??
        (roomTypeBaseIsConfigured(nextType.baseNightlyRate) ? "use_base" : "fixed");
      const computed = computeRatePlanBaseFromDefaults({
        method: nextMethod,
        roomTypeBase: nextType.baseNightlyRate,
        percent: 10,
        fixedPrice: nextType.baseNightlyRate ?? 0,
      });
      setForm((prev) => ({
        ...prev,
        roomTypeId,
        pricingMethod: nextMethod,
        includedOccupancy: occupancy.includedOccupancy,
        extraAdultRate: occupancy.extraAdultRate,
        extraChildRate: occupancy.extraChildRate,
        baseRate: computed.ok ? computed.baseRate : prev.baseRate,
      }));
    },
    [roomTypes],
  );

  // Seed defaults from first room type once on mount when empty form.
  useEffect(() => {
    if (form.roomTypeId && roomTypes.some((row) => row.id === form.roomTypeId)) {
      applyRoomTypeDefaults(form.roomTypeId);
    }
    // intentionally once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!newlyCreatedCategoryId) return;
    setForm((prev) => ({ ...prev, categoryId: newlyCreatedCategoryId }));
  }, [newlyCreatedCategoryId]);

  useEffect(() => {
    if (!newlyCreatedPolicy) return;
    if (newlyCreatedPolicy.type === "cancellation") {
      setForm((prev) => ({ ...prev, cancellationPolicyId: newlyCreatedPolicy.id }));
    } else if (newlyCreatedPolicy.type === "deposit") {
      setForm((prev) => ({ ...prev, depositPolicyId: newlyCreatedPolicy.id }));
    } else if (newlyCreatedPolicy.type === "no-show") {
      setForm((prev) => ({ ...prev, noShowPolicyId: newlyCreatedPolicy.id }));
    } else if (newlyCreatedPolicy.type === "early-departure") {
      setForm((prev) => ({ ...prev, earlyDeparturePolicyId: newlyCreatedPolicy.id }));
    }
  }, [newlyCreatedPolicy]);

  useEffect(() => {
    if (newlyCreatedMealPlanId) {
      setForm((prev) => ({ ...prev, mealPlanId: newlyCreatedMealPlanId }));
    }
  }, [newlyCreatedMealPlanId]);

  const step1Valid = isRatePlanWizardStep1Valid(form);

  function handleStepClick(target: RatePlanWizardStepId) {
    if (target === step) return;
    if (target > step && !step1Valid) {
      setAttemptedStep1(true);
      toast.error("Please fill all required fields on Rate Plan & Pricing before continuing.");
      setStep(1);
      return;
    }
    setStep(target);
  }

  function buildPayload(): RatePlanWizardSavePayload {
    const extraAdult =
      form.extraAdultRate.trim() === "" ? null : Number(form.extraAdultRate);
    const extraChild =
      form.extraChildRate.trim() === "" ? null : Number(form.extraChildRate);
    return {
      categoryId: form.categoryId,
      roomTypeId: form.roomTypeId,
      code: form.code.trim(),
      name: form.name.trim(),
      description: form.description,
      baseRate: form.baseRate,
      validFrom: form.validFrom.trim() || null,
      validTo: form.noEndDate ? null : form.validTo.trim() || null,
      mealPlanId: optionalId(form.mealPlanId),
      cancellationPolicyId: optionalId(form.cancellationPolicyId),
      refundabilityId: null,
      depositPolicyId: optionalId(form.depositPolicyId),
      noShowPolicyId: optionalId(form.noShowPolicyId),
      earlyDeparturePolicyId: optionalId(form.earlyDeparturePolicyId),
      includedOccupancy: parseOptionalIncludedField(form.includedOccupancy),
      extraAdultRate:
        extraAdult != null && Number.isFinite(extraAdult) ? extraAdult : null,
      extraChildRate:
        extraChild != null && Number.isFinite(extraChild) ? extraChild : null,
      active: form.active,
    };
  }

  const completeSetup = useCallback(async () => {
    if (!isRatePlanWizardStep1Valid(form)) {
      setAttemptedStep1(true);
      setStep(1);
      toast.error("Please fill all required fields before completing.");
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload();
      const result = await onSave(payload);
      const packageId = optionalId(form.packageId);
      if (packageId && result?.snapshot) {
        try {
          const created = result.snapshot.plans.find(
            (plan) => plan.code.trim().toUpperCase() === payload.code.trim().toUpperCase(),
          );
          const pkg = mealsQuery.data?.snapshot?.packages?.find((row) => row.id === packageId);
          if (created && pkg) {
            const ratePlanIds = [...new Set([...pkg.ratePlanIds, created.id])];
            await savePackage({
              data: {
                restaurantId,
                id: pkg.id,
                code: pkg.code,
                name: pkg.name,
                type: pkg.type,
                description: pkg.description || null,
                packagePrice: pkg.packagePrice,
                chargeBasis: pkg.chargeBasis,
                active: pkg.active,
                roomTypeIds: pkg.roomTypeIds,
                ratePlanIds,
                ratePlanLinks: ratePlanIds.map((ratePlanId) => ({
                  ratePlanId,
                  inclusionType:
                    pkg.ratePlanLinks.find((link) => link.ratePlanId === ratePlanId)
                      ?.inclusionType ?? "optional",
                })),
              },
            });
            void queryClient.invalidateQueries({ queryKey: ["pms-card3-meals", restaurantId] });
          }
        } catch (linkError: unknown) {
          toast.error(
            (linkError as Error)?.message ??
              "Rate plan saved, but package link could not be updated.",
          );
        }
      }
      toast.success("Rate plan setup completed successfully!");
      onClose();
    } catch (error: unknown) {
      toast.error((error as Error)?.message ?? "Failed to save rate plan.");
    } finally {
      setSaving(false);
    }
    // buildPayload reads latest form; intentional deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, onSave, onClose, mealsQuery.data, restaurantId, savePackage, queryClient]);

  const catalogues = useMemo(
    () => ({
      categories,
      roomTypes,
      mealPlans,
      cancellationPolicies,
      depositPolicies,
      noShowPolicies,
      earlyDeparturePolicies,
      currencyCode,
    }),
    [
      categories,
      roomTypes,
      mealPlans,
      cancellationPolicies,
      depositPolicies,
      noShowPolicies,
      earlyDeparturePolicies,
      currencyCode,
    ],
  );

  const value = useMemo(
    () => ({
      restaurantId,
      canEdit,
      step,
      setStep,
      form,
      setForm,
      codeManuallyEdited,
      setCodeManuallyEdited,
      attemptedStep1,
      setAttemptedStep1,
      catalogues,
      packages,
      onAddCategory,
      onAddCancellation: onAddCancellationPolicy,
      onAddDeposit: onAddDepositPolicy,
      onAddNoShow,
      onAddEarlyDeparture,
      onAddMealPlan,
      onClose,
      onCompleted: onClose,
      setFooter,
      applyRoomTypeDefaults,
      pendingSave: saving || pending,
      completeSetup,
    }),
    [
      restaurantId,
      canEdit,
      step,
      form,
      codeManuallyEdited,
      attemptedStep1,
      catalogues,
      packages,
      onAddCategory,
      onAddCancellationPolicy,
      onAddDepositPolicy,
      onAddNoShow,
      onAddEarlyDeparture,
      onAddMealPlan,
      onClose,
      applyRoomTypeDefaults,
      saving,
      pending,
      completeSetup,
    ],
  );

  const isReview = step === 5;

  function handlePrimaryContinue() {
    if (step === 1 && !step1Valid) {
      setAttemptedStep1(true);
      toast.error("Please fill all required fields before continuing.");
      return;
    }
    footer?.onContinue();
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        overlayClassName="bg-[#1F140A]/70"
        data-testid="pms-card2-rate-plan-wizard"
        className={cn(
          "z-50 flex max-h-[88vh] min-h-0 w-[min(900px,calc(100vw-48px))] max-w-none sm:max-w-none",
          "flex-col gap-0 overflow-hidden rounded-2xl border border-[#DDD4C5] bg-[#F7F4EE] p-0 shadow-xl",
          "[&>button.absolute]:hidden",
        )}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <RatePlanWizardContext.Provider value={value}>
          <header className="relative shrink-0 bg-[#1F140A] px-5 py-2.5 pr-12 text-[#F3E9D8]">
            <DialogTitle className="font-display text-sm font-semibold text-white">
              Create Rate Plan
            </DialogTitle>
            <DialogDescription className="text-[11px] text-[#C4B6A0]">
              Step {step} of 5
            </DialogDescription>
            <button
              type="button"
              className="absolute right-3 top-2 rounded-md p-1 text-[#F3E9D8]/80 hover:bg-white/10 hover:text-[#F3E9D8]"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
            <div className="absolute inset-x-0 bottom-0 h-0.5 bg-[#C89933]" aria-hidden />
          </header>

          <nav
            className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[#E6DFD3] bg-[#FBF9F5] px-3 py-1.5"
            aria-label="Rate plan wizard steps"
          >
            {RATE_PLAN_WIZARD_STEPS.map((row) => {
              const active = step === row.id;
              const done = step > row.id;
              return (
                <button
                  key={row.id}
                  type="button"
                  className={`flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-colors ${
                    active
                      ? "bg-[#C89933] text-[#251605] shadow-xs"
                      : done
                        ? "text-[#251605] hover:bg-[#F4EDE0]"
                        : "text-muted-foreground hover:text-[#251605]"
                  }`}
                  onClick={() => handleStepClick(row.id)}
                  aria-current={active ? "step" : undefined}
                >
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold ${
                      active
                        ? "bg-[#251605] text-white"
                        : done
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-[#E6DFD3] text-[#5C4528]"
                    }`}
                  >
                    {done ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : row.id}
                  </span>
                  <span className="whitespace-nowrap">{row.title}</span>
                </button>
              );
            })}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {step === 1 ? <RatePlanWizardStep1 /> : null}
            {step === 2 ? <RatePlanWizardStep2 /> : null}
            {step === 3 ? <RatePlanWizardStep3 /> : null}
            {step === 4 ? <RatePlanWizardStep4 /> : null}
            {step === 5 ? <RatePlanWizardStep5 /> : null}
          </div>

          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[#D9D2C4] bg-white px-5 py-3">
            {step === 1 ? (
              <Button
                type="button"
                variant="outline"
                className="border-[#D9D2C4] text-[#251605] hover:bg-[#F4EDE0]"
                onClick={onClose}
              >
                Cancel
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="border-[#D9D2C4] text-[#251605] hover:bg-[#F4EDE0]"
                onClick={() => setStep((step - 1) as RatePlanWizardStepId)}
              >
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back
              </Button>
            )}
            <Button
              type="button"
              disabled={!footer || footer.continueDisabled}
              className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90 font-medium"
              onClick={handlePrimaryContinue}
            >
              {isReview ? <CheckCircle2 className="mr-1.5 h-4 w-4" /> : null}
              {footer?.continueBusy ? "Saving…" : (footer?.continueLabel ?? "Continue")}
              {!isReview ? <ArrowRight className="ml-1.5 h-4 w-4" /> : null}
            </Button>
          </footer>
        </RatePlanWizardContext.Provider>
      </DialogContent>
    </Dialog>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { PackageMasterEditor } from "@/packages/pms/components/settings/pms-property-setup-card3-meals";
import { parseOptionalIncludedField } from "@/packages/pms/components/settings/rate-plan-pricing-setup";
import {
  getMealsCard3,
  saveMealPlanCard3,
  savePackageCard3,
} from "@/packages/pms/lib/meals-card3.functions";
import { saveDepositPolicyCard3 } from "@/packages/pms/lib/payments-card3.functions";
import {
  computeRatePlanBaseFromDefaults,
  occupancyFieldsFromRoomTypeDefaults,
  roomTypeBaseIsConfigured,
  type RatePlanPricingMethod,
} from "@/packages/pms/lib/rate-plan-from-defaults";
import {
  saveRateCancellationPolicyCard2,
  saveRateEarlyDeparturePolicyCard2,
  saveRateNoShowPolicyCard2,
} from "@/packages/pms/lib/rates-card2.functions";
import type {
  PackageChargeBasis,
  PackageType,
} from "@/packages/pms/lib/meals-card3.server";
import type { PackageInclusionType } from "@/packages/pms/lib/rate-plan-package-inclusion";
import {
  isValidRatePlanCode,
  RATE_PLAN_CODE_STAFF_HINT,
  suggestRatePlanCode,
} from "@/packages/pms/lib/rates-card2-code";
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
  clearCreateRatePlanWizardDraft,
  freshCreateRatePlanWizardState,
  readCreateRatePlanWizardDraft,
  sanitizeCreateRatePlanWizardDraft,
  writeCreateRatePlanWizardDraft,
} from "./rate-plan-wizard-draft";
import {
  findConfiguredMealPlanForPreset,
  isPredefinedMealSelection,
  parsePredefMeal,
} from "./rate-plan-wizard-meal-options";
import {
  findConfiguredCancellation,
  findConfiguredDepositForPreset,
  findConfiguredEarly,
  findConfiguredNoShowForPreset,
  isPredefinedPolicySelection,
  parsePredefCancellation,
  parsePredefDeposit,
  parsePredefEarly,
  parsePredefNoShow,
} from "./rate-plan-wizard-policy-options";
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

const DRAFT_AUTOSAVE_MS = 400;

function staffFacingRatePlanSaveError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (
    /Use 1–30 letters, numbers, or underscores/i.test(message) ||
    /"code"\s*:\s*"custom"/i.test(message) ||
    (/^\s*\[\{/.test(message) && /code/i.test(message))
  ) {
    return RATE_PLAN_CODE_STAFF_HINT;
  }
  if (/23505|already used|duplicate/i.test(message)) {
    return "That rate plan code is already used for this property.";
  }
  return message || "Failed to save rate plan.";
}

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
  if (
    !value ||
    value === RATE_PLAN_NONE ||
    isPredefinedPolicySelection(value) ||
    isPredefinedMealSelection(value)
  ) {
    return null;
  }
  return value;
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
  const saveCancellation = useServerFn(saveRateCancellationPolicyCard2);
  const saveNoShow = useServerFn(saveRateNoShowPolicyCard2);
  const saveEarlyDeparture = useServerFn(saveRateEarlyDeparturePolicyCard2);
  const saveDeposit = useServerFn(saveDepositPolicyCard3);
  const saveMealPlan = useServerFn(saveMealPlanCard3);

  const restoredDraftRef = useRef(
    (() => {
      const raw = readCreateRatePlanWizardDraft(restaurantId);
      if (!raw) return null;
      return sanitizeCreateRatePlanWizardDraft(raw, {
        categories,
        roomTypes,
        mealPlans,
        cancellationPolicies,
        depositPolicies,
        noShowPolicies,
        earlyDeparturePolicies,
        packages: [],
      });
    })(),
  );
  const skipInitialRoomDefaults = useRef(Boolean(restoredDraftRef.current));
  const draftReadyRef = useRef(false);

  const [step, setStep] = useState<RatePlanWizardStepId>(
    () => restoredDraftRef.current?.step ?? 1,
  );
  const [attemptedStep1, setAttemptedStep1] = useState(false);
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(
    () => restoredDraftRef.current?.codeManuallyEdited ?? false,
  );
  const [footer, setFooter] = useState<RatePlanWizardFooterConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [draftRestored, setDraftRestored] = useState(() => Boolean(restoredDraftRef.current));
  const [packageEditorOpen, setPackageEditorOpen] = useState(false);
  const [packageSavePending, setPackageSavePending] = useState(false);

  const [form, setForm] = useState<RatePlanWizardForm>(() => {
    if (restoredDraftRef.current) return restoredDraftRef.current.form;
    return emptyRatePlanWizardForm({
      categoryId: categories[0]?.id ?? "",
      roomTypeId: roomTypes[0]?.id ?? "",
    });
  });

  const mealsQuery = useQuery({
    queryKey: ["pms-card3-meals", restaurantId],
    queryFn: () => loadMeals({ data: { restaurantId } }),
  });

  const mealsSnapshot = mealsQuery.data?.snapshot;

  const packages = useMemo(
    () =>
      (mealsSnapshot?.packages ?? []).map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        active: row.active,
        packagePrice: row.packagePrice,
        chargeBasis: row.chargeBasis,
      })),
    [mealsSnapshot?.packages],
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
      setForm((prev) => {
        const category = categories.find((row) => row.id === prev.categoryId);
        return {
          ...prev,
          roomTypeId,
          pricingMethod: nextMethod,
          includedOccupancy: occupancy.includedOccupancy,
          extraAdultRate: occupancy.extraAdultRate,
          extraChildRate: occupancy.extraChildRate,
          baseRate: computed.ok ? computed.baseRate : prev.baseRate,
          code: codeManuallyEdited
            ? prev.code
            : suggestRatePlanCode(category?.code ?? "", nextType.name),
        };
      });
    },
    [roomTypes, categories, codeManuallyEdited],
  );

  // Seed defaults from first room type once on mount when starting blank (not restored).
  useEffect(() => {
    if (skipInitialRoomDefaults.current) return;
    if (form.roomTypeId && roomTypes.some((row) => row.id === form.roomTypeId)) {
      applyRoomTypeDefaults(form.roomTypeId);
    }
    // intentionally once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-validate package once packages finish loading after a restore.
  const packageSanitizeDoneRef = useRef(false);
  useEffect(() => {
    if (!draftRestored || packageSanitizeDoneRef.current) return;
    if (!mealsQuery.isFetched) return;
    packageSanitizeDoneRef.current = true;
    setForm((prev) =>
      sanitizeCreateRatePlanWizardDraft(
        {
          version: 1,
          restaurantId,
          savedAt: new Date().toISOString(),
          step,
          codeManuallyEdited,
          form: prev,
        },
        {
          categories,
          roomTypes,
          mealPlans,
          cancellationPolicies,
          depositPolicies,
          noShowPolicies,
          earlyDeparturePolicies,
          packages,
        },
      ).form,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftRestored, mealsQuery.isFetched, packages]);

  // Autosave local draft (debounced). Closing the wizard keeps the draft.
  useEffect(() => {
    if (!draftReadyRef.current) {
      draftReadyRef.current = true;
      return;
    }
    const timer = window.setTimeout(() => {
      writeCreateRatePlanWizardDraft(restaurantId, {
        step,
        codeManuallyEdited,
        form,
      });
    }, DRAFT_AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [restaurantId, step, codeManuallyEdited, form]);

  function discardDraft() {
    clearCreateRatePlanWizardDraft(restaurantId);
    const fresh = freshCreateRatePlanWizardState({
      categoryId: categories[0]?.id ?? "",
      roomTypeId: roomTypes[0]?.id ?? "",
    });
    setStep(fresh.step);
    setCodeManuallyEdited(fresh.codeManuallyEdited);
    setForm(fresh.form);
    setAttemptedStep1(false);
    setDraftRestored(false);
    skipInitialRoomDefaults.current = false;
    if (fresh.form.roomTypeId) {
      applyRoomTypeDefaults(fresh.form.roomTypeId);
    }
    toast.info("Draft discarded.");
  }

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

  function buildPayload(resolved: {
    mealPlanId: string | null;
    cancellationPolicyId: string | null;
    noShowPolicyId: string | null;
    depositPolicyId: string | null;
    earlyDeparturePolicyId: string | null;
  }): RatePlanWizardSavePayload {
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
      mealPlanId: resolved.mealPlanId,
      cancellationPolicyId: resolved.cancellationPolicyId,
      refundabilityId: null,
      depositPolicyId: resolved.depositPolicyId,
      noShowPolicyId: resolved.noShowPolicyId,
      earlyDeparturePolicyId: resolved.earlyDeparturePolicyId,
      includedOccupancy: parseOptionalIncludedField(form.includedOccupancy),
      extraAdultRate:
        extraAdult != null && Number.isFinite(extraAdult) ? extraAdult : null,
      extraChildRate:
        extraChild != null && Number.isFinite(extraChild) ? extraChild : null,
      active: form.active,
    };
  }

  async function resolveMealPlanSelection(selection: string): Promise<string | null> {
    if (!selection || selection === RATE_PLAN_NONE) return null;
    if (!isPredefinedMealSelection(selection)) return selection;

    const preset = parsePredefMeal(selection);
    if (!preset) throw new Error("Unknown meal plan.");
    if (!preset.materialize) return null;

    const existing = findConfiguredMealPlanForPreset(preset, mealPlans);
    if (existing?.id) return existing.id;

    const result = await saveMealPlan({
      data: {
        restaurantId,
        code: preset.code,
        name: preset.name,
        type: preset.type,
        description: preset.description,
        includesBreakfast: preset.includesBreakfast,
        includesLunch: preset.includesLunch,
        includesDinner: preset.includesDinner,
        taxPosture: preset.taxPosture,
        active: true,
      },
    });
    const created = findConfiguredMealPlanForPreset(
      preset,
      result?.snapshot?.mealPlans ?? [],
    );
    if (!created?.id) throw new Error("Meal plan could not be saved.");
    await queryClient.invalidateQueries({ queryKey: ["pms-card2-rates", restaurantId] });
    await queryClient.invalidateQueries({ queryKey: ["pms-card3-meals", restaurantId] });
    return created.id;
  }

  async function resolvePolicySelection(
    selection: string,
    kind: "cancellation" | "no-show" | "deposit" | "early-departure",
  ): Promise<string | null> {
    if (!selection || selection === RATE_PLAN_NONE) return null;
    if (!isPredefinedPolicySelection(selection)) return selection;

    if (kind === "cancellation") {
      const preset = parsePredefCancellation(selection);
      if (!preset) throw new Error("Unknown cancellation policy.");
      const existing = findConfiguredCancellation(preset, cancellationPolicies);
      if (existing) return existing.id;
      const result = await saveCancellation({
        data: {
          restaurantId,
          code: preset.code,
          name: preset.name,
          description: preset.description,
          policyKind: preset.policyKind,
          windowValue: preset.windowValue,
          windowUnit: preset.windowUnit,
          cutoffTime: preset.cutoffTime,
          penaltyType: preset.penaltyType,
          penaltyValue: preset.penaltyValue,
          active: true,
        },
      });
      const created = findConfiguredCancellation(
        preset,
        result?.snapshot?.cancellationPolicies ?? [],
      );
      if (!created) throw new Error("Cancellation policy could not be saved.");
      if (result) queryClient.setQueryData(["pms-card2-rates", restaurantId], result);
      return created.id;
    }

    if (kind === "no-show") {
      const preset = parsePredefNoShow(selection);
      if (!preset) throw new Error("Unknown no-show policy.");
      const existing = findConfiguredNoShowForPreset(preset, noShowPolicies);
      if (existing) return existing.id;
      const result = await saveNoShow({
        data: {
          restaurantId,
          code: preset.code,
          name: preset.name,
          description: preset.description,
          penaltyType: preset.penaltyType,
          penaltyValue: preset.penaltyValue,
          releaseHour: preset.releaseHour,
          isDefault: false,
          active: true,
        },
      });
      const created = findConfiguredNoShowForPreset(
        preset,
        result?.snapshot?.noShowPolicies ?? [],
      );
      if (!created) throw new Error("No-show policy could not be saved.");
      if (result) queryClient.setQueryData(["pms-card2-rates", restaurantId], result);
      return created.id;
    }

    if (kind === "deposit") {
      const preset = parsePredefDeposit(selection);
      if (!preset) throw new Error("Unknown deposit policy.");
      const existing = findConfiguredDepositForPreset(preset, depositPolicies);
      if (existing) return existing.id;
      const result = await saveDeposit({
        data: {
          restaurantId,
          code: preset.code,
          name: preset.name,
          description: preset.description,
          required: preset.required,
          depositType: preset.depositType,
          depositValue: preset.depositValue,
          isDefault: false,
          active: true,
        },
      });
      const created = findConfiguredDepositForPreset(
        preset,
        result?.snapshot?.depositPolicies ?? [],
      );
      if (!created) throw new Error("Deposit policy could not be saved.");
      await queryClient.invalidateQueries({ queryKey: ["pms-card2-rates", restaurantId] });
      await queryClient.invalidateQueries({ queryKey: ["pms-card3-payments", restaurantId] });
      return created.id;
    }

    const preset = parsePredefEarly(selection);
    if (!preset) throw new Error("Unknown early departure policy.");
    const existing = findConfiguredEarly(preset, earlyDeparturePolicies);
    if (existing) return existing.id;
    const result = await saveEarlyDeparture({
      data: {
        restaurantId,
        code: preset.code,
        name: preset.name,
        description: preset.description,
        penaltyType: preset.penaltyType,
        penaltyValue: preset.penaltyValue,
        active: true,
      },
    });
    const created = findConfiguredEarly(
      preset,
      result?.snapshot?.earlyDeparturePolicies ?? [],
    );
    if (!created) throw new Error("Early departure policy could not be saved.");
    if (result) queryClient.setQueryData(["pms-card2-rates", restaurantId], result);
    return created.id;
  }

  const completeSetup = useCallback(async () => {
    if (!isRatePlanWizardStep1Valid(form)) {
      setAttemptedStep1(true);
      setStep(1);
      toast.error("Please fill all required fields before completing.");
      return;
    }
    if (!isValidRatePlanCode(form.code)) {
      setAttemptedStep1(true);
      setStep(1);
      toast.error(RATE_PLAN_CODE_STAFF_HINT);
      return;
    }
    setSaving(true);
    try {
      const [
        mealPlanId,
        cancellationPolicyId,
        noShowPolicyId,
        depositPolicyId,
        earlyDeparturePolicyId,
      ] = await Promise.all([
        resolveMealPlanSelection(form.mealPlanId),
        resolvePolicySelection(form.cancellationPolicyId, "cancellation"),
        resolvePolicySelection(form.noShowPolicyId, "no-show"),
        resolvePolicySelection(form.depositPolicyId, "deposit"),
        resolvePolicySelection(form.earlyDeparturePolicyId, "early-departure"),
      ]);
      const payload = buildPayload({
        mealPlanId,
        cancellationPolicyId,
        noShowPolicyId,
        depositPolicyId,
        earlyDeparturePolicyId,
      });
      const result = await onSave(payload);
      const packageId = optionalId(form.packageId);
      if (packageId && result?.snapshot) {
        try {
          const created = result.snapshot.plans.find(
            (plan) => plan.code.trim().toUpperCase() === payload.code.trim().toUpperCase(),
          );
          const pkg = mealsSnapshot?.packages?.find((row) => row.id === packageId);
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
                    ratePlanId === created.id
                      ? form.packageInclusionType
                      : (pkg.ratePlanLinks.find((link) => link.ratePlanId === ratePlanId)
                          ?.inclusionType ?? "optional"),
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
      clearCreateRatePlanWizardDraft(restaurantId);
      setDraftRestored(false);
      toast.success("Rate plan setup completed successfully!");
      onClose();
    } catch (error: unknown) {
      toast.error(staffFacingRatePlanSaveError(error));
    } finally {
      setSaving(false);
    }
    // buildPayload / resolve* read latest form & catalogues; intentional deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    form,
    onSave,
    onClose,
    mealsSnapshot,
    restaurantId,
    savePackage,
    saveMealPlan,
    mealPlans,
    queryClient,
  ]);

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

  const handleAddPackage = useCallback(() => {
    setPackageEditorOpen(true);
  }, []);

  const handleSaveInlinePackage = useCallback(
    async (payload: {
      id?: string;
      code: string;
      name: string;
      type: PackageType;
      description?: string;
      packagePrice: number;
      chargeBasis: PackageChargeBasis;
      active: boolean;
      serviceTypeIds: string[];
      roomTypeIds: string[];
      ratePlanIds: string[];
      ratePlanLinks: { ratePlanId: string; inclusionType: PackageInclusionType }[];
    }) => {
      setPackageSavePending(true);
      try {
        const result = await savePackage({
          data: { restaurantId, ...payload },
        });
        await queryClient.invalidateQueries({ queryKey: ["pms-card3-meals", restaurantId] });
        const created = result?.snapshot?.packages?.find(
          (row) => row.code.trim().toUpperCase() === payload.code.trim().toUpperCase(),
        );
        if (!created) throw new Error("Package could not be saved.");
        return { id: created.id, name: created.name };
      } finally {
        setPackageSavePending(false);
      }
    },
    [queryClient, restaurantId, savePackage],
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
      onAddPackage: handleAddPackage,
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
      handleAddPackage,
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
      toast.error(
        form.code.trim() && !isValidRatePlanCode(form.code)
          ? RATE_PLAN_CODE_STAFF_HINT
          : "Please fill all required fields before continuing.",
      );
      return;
    }
    footer?.onContinue();
  }

  return (
    <>
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
            {draftRestored ? (
              <div
                className="mb-3 flex flex-col gap-2 rounded-lg border border-[#E6D7B8] bg-[#FBF7EE] px-3 py-2.5 text-[12px] text-[#5C5346] sm:flex-row sm:items-center sm:justify-between"
                data-testid="pms-card2-rate-plan-draft-restored"
              >
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#C89933]" aria-hidden />
                  <span>Unsaved rate plan draft restored.</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 px-2 text-xs text-[#8A641A] hover:bg-[#F4EDE0] hover:text-[#251605]"
                  onClick={discardDraft}
                  data-testid="pms-card2-rate-plan-discard-draft"
                >
                  Discard draft
                </Button>
              </div>
            ) : null}
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

    <PackageMasterEditor
      open={packageEditorOpen}
      restaurantId={restaurantId}
      canEdit={canEdit}
      currencyCode={currencyCode || mealsSnapshot?.currencyCode || ""}
      roomTypes={mealsSnapshot?.roomTypes ?? []}
      ratePlans={mealsSnapshot?.ratePlans ?? []}
      components={mealsSnapshot?.components ?? []}
      mealPlans={mealsSnapshot?.mealPlans ?? []}
      roomAmenities={mealsSnapshot?.roomAmenities ?? []}
      foServices={mealsSnapshot?.foServices ?? []}
      departments={mealsSnapshot?.departments ?? []}
      guestServiceCategories={mealsSnapshot?.guestServiceCategories ?? []}
      guestServiceTypes={mealsSnapshot?.guestServiceTypes ?? []}
      existingPackages={mealsSnapshot?.packages ?? []}
      value={null}
      pending={packageSavePending}
      componentPending={false}
      className="z-[80]"
      onClose={() => setPackageEditorOpen(false)}
      onSave={handleSaveInlinePackage}
      onSaved={(pkg) => {
        setForm((prev) => ({ ...prev, packageId: pkg.id }));
        toast.success(`Selected "${pkg.name}" for rate plan.`);
        void queryClient.invalidateQueries({ queryKey: ["pms-card3-meals", restaurantId] });
      }}
      onSaveComponent={() => {
        // Benefits & Services persist with Save package — no separate component writer.
      }}
      onDeleteComponent={() => {
        // Benefits & Services persist with Save package — no separate component writer.
      }}
    />
    </>
  );
}

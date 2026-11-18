import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { ArrowLeft, Check, Plus, Search } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Card3EmptyRow,
  Card3OverlapSheet,
  Card3RowActions,
  Card3Section,
  Card3StatusDot,
  Card3Table,
} from "@/packages/pms/components/settings/pms-property-setup-card3-primitives";
import { PROPERTY_SETUP_CONTROL_CLASS } from "@/packages/pms/lib/pms-property-setup-ui";
import type { PropertySetupCardStatus } from "@/packages/pms/lib/pms-property-setup-card1";
import {
  getRatesCard2,
  saveRateCancellationPolicyCard2,
  saveRateCategoryCard2,
  saveRateEarlyDeparturePolicyCard2,
  saveRateNoShowPolicyCard2,
  saveRatePlanCard2,
} from "@/packages/pms/lib/rates-card2.functions";
import {
  CANCELLATION_PENALTY_TYPE_LABELS,
  CANCELLATION_PENALTY_TYPES,
  CANCELLATION_POLICY_KIND_LABELS,
  CANCELLATION_POLICY_KINDS,
  CANCELLATION_WINDOW_UNIT_LABELS,
  CANCELLATION_WINDOW_UNITS,
  CARD2_RATES_ROOM_TYPES_COPY,
  POLICY_PENALTY_TYPE_LABELS,
  POLICY_PENALTY_TYPES,
  PREDEFINED_CANCELLATION_POLICIES,
  PREDEFINED_EARLY_DEPARTURE_POLICIES,
  PREDEFINED_RATE_CATEGORIES,
  buildNoShowPolicyPreview,
  cancellationPresetDetailLine,
  findMatchingPredefinedCancellation,
  findMatchingPredefinedCategory,
  findMatchingPredefinedEarlyDeparture,
  isPredefinedCancellationConfigured,
  isPredefinedCategoryConfigured,
  isPredefinedEarlyDepartureConfigured,
  type CancellationPenaltyType,
  type CancellationPolicyKind,
  type CancellationWindowUnit,
  type PolicyPenaltyType,
  type PredefinedCancellationPolicy,
  type PredefinedEarlyDeparturePolicy,
  type PredefinedRateCategory,
  type RateCancellationPolicyRow,
  type RateCategoryRow,
  type RateEarlyDeparturePolicyRow,
  type RateNoShowPolicyRow,
  type RatePlanRow,
  type RateRefundabilityKind,
  type RateRefundabilityRow,
  type RatesCard2Snapshot,
} from "@/packages/pms/lib/rates-card2.server";
import { penaltyNeedsValue } from "@/packages/pms/lib/cancellation-policy-rules";
import {
  EARLY_DEPARTURE_PENALTY_TYPE_LABELS,
  EARLY_DEPARTURE_PENALTY_TYPES,
  type EarlyDeparturePenaltyType,
} from "@/packages/pms/lib/early-departure-policy";
import { formatRateValidity } from "@/packages/pms/lib/pms-property-setup-card2";
import {
  computeRatePlanBaseFromDefaults,
  occupancyFieldsFromRoomTypeDefaults,
  occupancyFieldsFromSavedRatePlan,
  roomTypeBaseIsConfigured,
  type RatePlanPricingMethod,
} from "@/packages/pms/lib/rate-plan-from-defaults";
import {
  parseOptionalIncludedField,
  RatePlanPricingSetup,
} from "@/packages/pms/components/settings/rate-plan-pricing-setup";
import { suggestRatePlanCode } from "@/packages/pms/lib/rates-card2-code";
import {
  MealPlanSheet,
  PackageMasterEditor,
  PmsPropertySetupCard3Meals,
} from "@/packages/pms/components/settings/pms-property-setup-card3-meals";
import {
  getMealsCard3,
  saveMealPlanCard3,
  savePackageCard3,
} from "@/packages/pms/lib/meals-card3.functions";
import type {
  MealPlanCard3Row,
  PackageCard3Row,
  PackageChargeBasis,
  PackageType,
} from "@/packages/pms/lib/meals-card3.server";
import { DepositPolicySheet } from "@/packages/pms/components/settings/pms-property-setup-card3-payments";
import { saveDepositPolicyCard3 } from "@/packages/pms/lib/payments-card3.functions";
import type { DepositPolicyCard3Row } from "@/packages/pms/lib/payments-card3";
import { RatePlanWizard } from "@/packages/pms/components/settings/rate-plan-wizard/rate-plan-wizard";
import {
  isEffectivelyOpenEndedRestrictionWindow,
  parseOptionalNonNegativeInt,
  parseOptionalPositiveInt,
  RATE_PLAN_RESTRICTION_OPEN_ENDED_TO,
} from "@/packages/pms/components/settings/rate-plan-wizard/rate-plan-wizard-types";
import {
  PACKAGE_INCLUSION_TYPE_LABELS,
  PACKAGE_INCLUSION_TYPES,
  parsePackageInclusionType,
  type PackageInclusionType,
} from "@/packages/pms/lib/rate-plan-package-inclusion";
import {
  buildRatePlanPackageLinkUpdates,
  findPackageLinkedToRatePlan,
} from "@/packages/pms/lib/rate-plan-package-link";
import {
  formatPackageDropdownDetail,
  formatPackagePriceDetail,
  formatRatePlanMoney,
  oneNightStartingTotal,
} from "@/packages/pms/lib/rate-plan-price-summary";
import { cn } from "@/shared/lib/utils";

/** Active policy catalogue families (Refundability is legacy — not a catalogue). */
type PolicySectionType = "cancellation" | "no-show" | "early-departure";
type InlinePolicyTarget = PolicySectionType | "deposit" | "refundability";

const NONE = "__none__";
/** @deprecated Standalone refundability catalogue removed from active UI. */
const REFUNDABILITY_KIND_LABELS: Record<RateRefundabilityKind, string> = {
  refundable: "Refundable",
  non_refundable: "Non-refundable",
  partially_refundable: "Partially refundable",
};

function matchesQuery(query: string, ...values: string[]) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return values.some((value) => value.toLowerCase().includes(q));
}

export function PmsPropertySetupCard2Rates({
  restaurantId,
  canEdit,
  onReadiness,
  onNavigateToRoomTypes,
}: {
  restaurantId: string;
  canEdit: boolean;
  onReadiness?: (status: PropertySetupCardStatus, blockers: string[], warnings: string[]) => void;
  onNavigateToRoomTypes?: () => void;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getRatesCard2);
  const saveCategory = useServerFn(saveRateCategoryCard2);
  const savePlan = useServerFn(saveRatePlanCard2);
  const saveCancellation = useServerFn(saveRateCancellationPolicyCard2);
  const saveNoShow = useServerFn(saveRateNoShowPolicyCard2);
  const saveEarlyDeparture = useServerFn(saveRateEarlyDeparturePolicyCard2);
  const saveMealPlan = useServerFn(saveMealPlanCard3);
  const saveDepositPolicy = useServerFn(saveDepositPolicyCard3);

  const [inlineTargetPolicy, setInlineTargetPolicy] = useState<InlinePolicyTarget | null>(null);
  const [newlyCreatedPolicy, setNewlyCreatedPolicy] = useState<{
    type: InlinePolicyTarget;
    id: string;
  } | null>(null);
  const [mealPlanDraft, setMealPlanDraft] = useState<MealPlanCard3Row | "new" | null>(null);
  const [inlineMealPlanTarget, setInlineMealPlanTarget] = useState<boolean>(false);
  const [newlyCreatedMealPlanId, setNewlyCreatedMealPlanId] = useState<string | null>(null);
  const [depositDraft, setDepositDraft] = useState<DepositPolicyCard3Row | "new" | null>(null);
  const [inlineCategoryTarget, setInlineCategoryTarget] = useState(false);
  const [newlyCreatedCategoryId, setNewlyCreatedCategoryId] = useState<string | null>(null);

  const [planSearch, setPlanSearch] = useState("");
  const [planRoomTypeFilter, setPlanRoomTypeFilter] = useState("all");
  const [planCategoryFilter, setPlanCategoryFilter] = useState("all");
  const [planStatusFilter, setPlanStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [categoryDraft, setCategoryDraft] = useState<RateCategoryRow | "new" | null>(null);
  const [planDraft, setPlanDraft] = useState<RatePlanRow | "new" | null>(null);
  const [batchPending, setBatchPending] = useState(false);
  const [cancelDraft, setCancelDraft] = useState<RateCancellationPolicyRow | "new" | null>(null);
  const [noShowDraft, setNoShowDraft] = useState<RateNoShowPolicyRow | "new" | null>(null);
  const [earlyDepartureDraft, setEarlyDepartureDraft] = useState<
    RateEarlyDeparturePolicyRow | "new" | null
  >(null);
  /** When opening Cancellation/Early Departure from Rate Plan "Create custom", skip predefined catalogue. */
  const [policyDrawerInitialMode, setPolicyDrawerInitialMode] = useState<"catalogue" | "custom">(
    "catalogue",
  );

  const query = useQuery({
    queryKey: ["pms-card2-rates", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });

  const snapshot: RatesCard2Snapshot | undefined = query.data?.snapshot;
  const readiness = query.data?.readiness;
  const roomTypes = snapshot?.roomTypes ?? [];
  const categories = snapshot?.categories ?? [];
  const plans = snapshot?.plans ?? [];
  const mealPlans = snapshot?.mealPlans ?? [];
  const cancellationPolicies = snapshot?.cancellationPolicies ?? [];
  const refundabilityCodes = snapshot?.refundabilityCodes ?? [];
  const depositPolicies = snapshot?.depositPolicies ?? [];
  const noShowPolicies = snapshot?.noShowPolicies ?? [];
  const earlyDeparturePolicies = snapshot?.earlyDeparturePolicies ?? [];
  const currencyCode = snapshot?.currencyCode ?? "USD";

  useEffect(() => {
    if (readiness && onReadiness) {
      onReadiness(readiness.status, readiness.blockers, []);
    }
  }, [readiness, onReadiness]);

  const filteredPlans = useMemo(
    () =>
      plans.filter((row) => {
        if (planRoomTypeFilter !== "all" && row.roomTypeId !== planRoomTypeFilter) return false;
        if (planCategoryFilter !== "all" && row.categoryId !== planCategoryFilter) return false;
        if (planStatusFilter === "active" && !row.active) return false;
        if (planStatusFilter === "inactive" && row.active) return false;
        return matchesQuery(
          planSearch,
          row.code,
          row.name,
          row.categoryName,
          row.roomTypeCode,
          row.roomTypeName,
          row.mealPlanName,
        );
      }),
    [plans, planSearch, planRoomTypeFilter, planCategoryFilter, planStatusFilter],
  );

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["pms-card2-rates", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["pms-no-show-policies", restaurantId] });
  }

  const categoryMut = useMutation({
    mutationFn: (input: Parameters<typeof saveCategory>[0]["data"]) =>
      saveCategory({ data: input }),
    onSuccess: (data, variables) => {
      toast.success("Rate category saved.");
      setCategoryDraft(null);
      if (data) {
        queryClient.setQueryData(["pms-card2-rates", restaurantId], data);
      }
      invalidate();
      if (inlineCategoryTarget && data?.snapshot?.categories) {
        const created = data.snapshot.categories.find(
          (row) => row.code.trim().toUpperCase() === variables.code.trim().toUpperCase(),
        );
        if (created) {
          setNewlyCreatedCategoryId(created.id);
          toast.success(`Selected "${created.name}" for rate plan.`);
        }
        setInlineCategoryTarget(false);
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function handleSavePredefined(presets: PredefinedRateCategory[]) {
    setBatchPending(true);
    try {
      let lastResult: Awaited<ReturnType<typeof saveCategory>> | undefined;
      for (const preset of presets) {
        lastResult = await saveCategory({
          data: {
            restaurantId,
            code: preset.code,
            name: preset.persistedName,
            active: true,
          },
        });
      }
      if (lastResult) {
        queryClient.setQueryData(["pms-card2-rates", restaurantId], lastResult);
      }
      toast.success(
        presets.length === 1
          ? `Added ${presets[0].name}.`
          : `Added ${presets.length} rate categories.`,
      );
      setCategoryDraft(null);
      invalidate();
      if (inlineCategoryTarget && lastResult?.snapshot?.categories) {
        const created = lastResult.snapshot.categories.find(
          (row) =>
            row.code.trim().toUpperCase() ===
            presets[presets.length - 1]?.code.trim().toUpperCase(),
        );
        if (created) {
          setNewlyCreatedCategoryId(created.id);
          toast.success(`Selected "${created.name}" for rate plan.`);
        }
        setInlineCategoryTarget(false);
      }
    } catch (error: unknown) {
      toast.error((error as Error)?.message ?? "Failed to add rate category.");
    } finally {
      setBatchPending(false);
    }
  }

  async function handleSavePredefinedCancellations(presets: PredefinedCancellationPolicy[]) {
    setBatchPending(true);
    try {
      let lastResult: Awaited<ReturnType<typeof saveCancellation>> | undefined;
      for (const preset of presets) {
        lastResult = await saveCancellation({
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
      }
      if (lastResult) {
        queryClient.setQueryData(["pms-card2-rates", restaurantId], lastResult);
      }
      toast.success(
        presets.length === 1
          ? `Added ${presets[0].name}.`
          : `Added ${presets.length} cancellation policies.`,
      );
      setCancelDraft(null);
      setPolicyDrawerInitialMode("catalogue");
      invalidate();
      if (inlineTargetPolicy === "cancellation" && lastResult?.snapshot?.cancellationPolicies) {
        const created = lastResult.snapshot.cancellationPolicies.find(
          (p) => p.code.trim().toUpperCase() === presets[presets.length - 1]?.code.trim().toUpperCase(),
        );
        if (created) {
          setNewlyCreatedPolicy({ type: "cancellation", id: created.id });
          toast.success(`Selected "${created.name}" for rate plan.`);
        }
        setInlineTargetPolicy(null);
      }
    } catch (error: unknown) {
      toast.error((error as Error)?.message ?? "Failed to add cancellation policy.");
    } finally {
      setBatchPending(false);
    }
  }

  async function handleSavePredefinedEarlyDepartures(presets: PredefinedEarlyDeparturePolicy[]) {
    setBatchPending(true);
    try {
      let lastResult: Awaited<ReturnType<typeof saveEarlyDeparture>> | undefined;
      for (const preset of presets) {
        lastResult = await saveEarlyDeparture({
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
      }
      if (lastResult) {
        queryClient.setQueryData(["pms-card2-rates", restaurantId], lastResult);
      }
      toast.success(
        presets.length === 1
          ? `Added ${presets[0].name}.`
          : `Added ${presets.length} early departure policies.`,
      );
      setEarlyDepartureDraft(null);
      setPolicyDrawerInitialMode("catalogue");
      invalidate();
      if (inlineTargetPolicy === "early-departure" && lastResult?.snapshot?.earlyDeparturePolicies) {
        const created = lastResult.snapshot.earlyDeparturePolicies.find(
          (p) =>
            p.code.trim().toUpperCase() ===
            presets[presets.length - 1]?.code.trim().toUpperCase(),
        );
        if (created) {
          setNewlyCreatedPolicy({ type: "early-departure", id: created.id });
          toast.success(`Selected "${created.name}" for rate plan.`);
        }
        setInlineTargetPolicy(null);
      }
    } catch (error: unknown) {
      toast.error((error as Error)?.message ?? "Failed to add early departure policy.");
    } finally {
      setBatchPending(false);
    }
  }

  const planMut = useMutation({
    mutationFn: (input: Parameters<typeof savePlan>[0]["data"]) => savePlan({ data: input }),
    onSuccess: () => {
      toast.success("Rate plan saved.");
      invalidate();
      // PlanDrawer closes itself after package-link reconciliation.
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const cancelMut = useMutation({
    mutationFn: (input: Parameters<typeof saveCancellation>[0]["data"]) =>
      saveCancellation({ data: input }),
    onSuccess: (data, variables) => {
      toast.success("Cancellation policy saved.");
      setCancelDraft(null);
      setPolicyDrawerInitialMode("catalogue");
      if (data) {
        queryClient.setQueryData(["pms-card2-rates", restaurantId], data);
      }
      invalidate();
      if (inlineTargetPolicy === "cancellation" && data?.snapshot?.cancellationPolicies) {
        const created = data.snapshot.cancellationPolicies.find(
          (p) => p.code.trim().toUpperCase() === variables.code.trim().toUpperCase(),
        );
        if (created) {
          setNewlyCreatedPolicy({ type: "cancellation", id: created.id });
          toast.success(`Selected "${created.name}" for rate plan.`);
        }
        setInlineTargetPolicy(null);
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const noShowMut = useMutation({
    mutationFn: (input: Parameters<typeof saveNoShow>[0]["data"]) => saveNoShow({ data: input }),
    onSuccess: (data, variables) => {
      toast.success("No-show policy saved.");
      setNoShowDraft(null);
      if (data) {
        queryClient.setQueryData(["pms-card2-rates", restaurantId], data);
      }
      invalidate();
      if (inlineTargetPolicy === "no-show" && data?.snapshot?.noShowPolicies) {
        const created = data.snapshot.noShowPolicies.find(
          (p) => p.code.trim().toUpperCase() === variables.code.trim().toUpperCase(),
        );
        if (created) {
          setNewlyCreatedPolicy({ type: "no-show", id: created.id });
          toast.success(`Selected "${created.name}" for rate plan.`);
        }
        setInlineTargetPolicy(null);
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const earlyDepartureMut = useMutation({
    mutationFn: (input: Parameters<typeof saveEarlyDeparture>[0]["data"]) =>
      saveEarlyDeparture({ data: input }),
    onSuccess: (data, variables) => {
      toast.success("Early departure policy saved.");
      setEarlyDepartureDraft(null);
      setPolicyDrawerInitialMode("catalogue");
      if (data) {
        queryClient.setQueryData(["pms-card2-rates", restaurantId], data);
      }
      invalidate();
      if (inlineTargetPolicy === "early-departure" && data?.snapshot?.earlyDeparturePolicies) {
        const created = data.snapshot.earlyDeparturePolicies.find(
          (p) => p.code.trim().toUpperCase() === variables.code.trim().toUpperCase(),
        );
        if (created) {
          setNewlyCreatedPolicy({ type: "early-departure", id: created.id });
          toast.success(`Selected "${created.name}" for rate plan.`);
        }
        setInlineTargetPolicy(null);
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const mealPlanMut = useMutation({
    mutationFn: (input: Parameters<typeof saveMealPlan>[0]["data"]) =>
      saveMealPlan({ data: input }),
    onSuccess: async (data, variables) => {
      toast.success("Meal plan saved.");
      setMealPlanDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["pms-card2-rates", restaurantId] });
      await queryClient.invalidateQueries({ queryKey: ["pms-card3-meals", restaurantId] });
      if (inlineMealPlanTarget && data?.snapshot?.mealPlans) {
        const created = data.snapshot.mealPlans.find(
          (m: { code: string }) =>
            m.code.trim().toUpperCase() === variables.code.trim().toUpperCase(),
        );
        if (created) {
          setNewlyCreatedMealPlanId(created.id);
          toast.success(`Selected "${created.name}" for rate plan.`);
        }
      }
      setInlineMealPlanTarget(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const depositMut = useMutation({
    mutationFn: (input: Parameters<typeof saveDepositPolicy>[0]["data"]) =>
      saveDepositPolicy({ data: input }),
    onSuccess: async (data, variables) => {
      toast.success("Deposit policy saved.");
      setDepositDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["pms-card2-rates", restaurantId] });
      await queryClient.invalidateQueries({ queryKey: ["pms-card3-payments", restaurantId] });
      if (inlineTargetPolicy === "deposit" && data?.snapshot?.depositPolicies) {
        const created = data.snapshot.depositPolicies.find(
          (d: { code: string }) =>
            d.code.trim().toUpperCase() === variables.code.trim().toUpperCase(),
        );
        if (created) {
          setNewlyCreatedPolicy({ type: "deposit", id: created.id });
          toast.success(`Selected "${created.name}" for rate plan.`);
        }
        setInlineTargetPolicy(null);
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-5" data-testid="pms-card2-rates">
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading rates…</p>
      ) : query.isError || !snapshot ? (
        <p className="text-sm text-destructive">
          {(query.error as Error | undefined)?.message ?? "Rates & Pricing are unavailable."}
        </p>
      ) : (
        <div className="space-y-4">
          {roomTypes.length === 0 ? (
            <div className="flex items-center justify-between rounded-xl border border-[#F4EDE0] bg-[#FFFBF5] p-3 text-sm text-[#8A641A]">
              <div>
                <p className="font-medium">No room types are configured yet.</p>
                <p className="text-xs text-[#756A5B]">{CARD2_RATES_ROOM_TYPES_COPY}</p>
              </div>
              {onNavigateToRoomTypes ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onNavigateToRoomTypes}
                  className="border-[#D9D2C4] bg-white text-[#251605]"
                >
                  Configure Room Types
                </Button>
              ) : null}
            </div>
          ) : null}

          <Card3Section
            title="Room Rates"
            helper="Configure room rates, policies, meals and packages available for this property."
            icon="money"
            testId="pms-card2-room-rates"
            action={
              canEdit ? (
                <Button
                  type="button"
                  className="h-9 border border-[#C89933] bg-[#C89933] px-3 text-sm font-medium text-white hover:bg-[#B8892A]"
                  onClick={() => setPlanDraft("new")}
                  data-testid="pms-card2-add-rate-plan"
                >
                  <Plus className="mr-1.5 size-4" />
                  Add rate plan
                </Button>
              ) : null
            }
          >
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1 sm:max-w-xs">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={planSearch}
                  onChange={(event) => setPlanSearch(event.target.value)}
                  placeholder="Search rate plans"
                  aria-label="Search rate plans"
                  className={cn(PROPERTY_SETUP_CONTROL_CLASS, "h-9 pl-9")}
                />
              </div>
              <Select value={planRoomTypeFilter} onValueChange={setPlanRoomTypeFilter}>
                <SelectTrigger
                  className="h-9 w-[160px] border-[#CCCCCC] bg-white text-xs text-[#251605]"
                  aria-label="Filter by room type"
                >
                  <SelectValue placeholder="Room type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All room types</SelectItem>
                  {roomTypes.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={planCategoryFilter} onValueChange={setPlanCategoryFilter}>
                <SelectTrigger
                  className="h-9 w-[150px] border-[#CCCCCC] bg-white text-xs text-[#251605]"
                  aria-label="Filter by category"
                >
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={planStatusFilter}
                onValueChange={(value) =>
                  setPlanStatusFilter(value as "all" | "active" | "inactive")
                }
              >
                <SelectTrigger
                  className="h-9 w-[130px] border-[#CCCCCC] bg-white text-xs text-[#251605]"
                  aria-label="Filter by status"
                >
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {plans.length === 0 ? (
              <div
                className="rounded-[8px] border border-[#E6E1D8] bg-white px-4 py-8 text-center"
                data-testid="pms-card2-room-rates-empty"
              >
                <p className="text-sm font-medium text-[#251605]">No rate plans configured</p>
                <p className="mx-auto mt-1 max-w-md text-xs text-[#756A5B]">
                  Create your first rate plan to define room pricing, policies, meals and packages.
                </p>
                {canEdit ? (
                  <Button
                    type="button"
                    className="mt-4 h-9 border border-[#C89933] bg-[#C89933] px-3 text-sm font-medium text-white hover:bg-[#B8892A]"
                    onClick={() => setPlanDraft("new")}
                  >
                    <Plus className="mr-1.5 size-4" />
                    Add Rate Plan
                  </Button>
                ) : null}
              </div>
            ) : (
              <Card3Table
                headers={[
                  "Code",
                  "Rate Plan",
                  "Room Type",
                  "Category",
                  "Meal Plan",
                  "Base Rate",
                  "Validity",
                  "Status",
                  "",
                ]}
                minWidthClass="min-w-[56rem]"
              >
                {filteredPlans.length === 0 ? (
                  <Card3EmptyRow colSpan={9}>No rate plans match your filters.</Card3EmptyRow>
                ) : (
                  filteredPlans.map((row) => (
                    <tr key={row.id} className="border-t border-[#E6E1D8]">
                      <td className="px-3 py-2 font-mono text-xs text-[#251605]">{row.code}</td>
                      <td className="px-3 py-2 text-[#251605]">{row.name}</td>
                      <td className="px-3 py-2 text-[#251605]">
                        {row.roomTypeName || row.roomTypeCode || "—"}
                      </td>
                      <td className="px-3 py-2 text-[#251605]">
                        {row.categoryName || "—"}
                      </td>
                      <td className="px-3 py-2 text-[#251605]">
                        {row.mealPlanName || "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-[#251605]">
                        {`${currencyCode} ${Number(row.baseRate).toLocaleString(undefined, {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        })}`}
                      </td>
                      <td className="px-3 py-2 text-[#251605]">
                        {formatRateValidity(row.validFrom, row.validTo)}
                      </td>
                      <td className="px-3 py-2 text-[#251605]">
                        <Card3StatusDot active={row.active} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Card3RowActions
                          label={`Actions for ${row.name}`}
                          onEdit={() => setPlanDraft(row)}
                          editDisabled={!canEdit}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </Card3Table>
            )}
          </Card3Section>

          {planDraft === "new" ? (
            <RatePlanWizard
              restaurantId={restaurantId}
              canEdit={canEdit}
              categories={categories}
              roomTypes={roomTypes}
              mealPlans={mealPlans}
              cancellationPolicies={cancellationPolicies}
              depositPolicies={depositPolicies}
              noShowPolicies={noShowPolicies}
              earlyDeparturePolicies={earlyDeparturePolicies}
              currencyCode={currencyCode}
              pending={false}
              newlyCreatedCategoryId={newlyCreatedCategoryId}
              newlyCreatedPolicy={newlyCreatedPolicy}
              newlyCreatedMealPlanId={newlyCreatedMealPlanId}
              onClose={() => {
                setPlanDraft(null);
                setNewlyCreatedCategoryId(null);
                setNewlyCreatedMealPlanId(null);
                setNewlyCreatedPolicy(null);
                setInlineCategoryTarget(false);
              }}
              onSave={async (payload) => {
                const result = await savePlan({ data: { restaurantId, ...payload } });
                if (result) {
                  queryClient.setQueryData(["pms-card2-rates", restaurantId], result);
                }
                invalidate();
                return result;
              }}
              onAddCategory={() => {
                setInlineCategoryTarget(true);
                setCategoryDraft("new");
              }}
              onAddCancellationPolicy={() => {
                setPolicyDrawerInitialMode("custom");
                setInlineTargetPolicy("cancellation");
                setCancelDraft("new");
              }}
              onAddNoShow={() => {
                setInlineTargetPolicy("no-show");
                setNoShowDraft("new");
              }}
              onAddEarlyDeparture={() => {
                setPolicyDrawerInitialMode("custom");
                setInlineTargetPolicy("early-departure");
                setEarlyDepartureDraft("new");
              }}
              onAddDepositPolicy={() => {
                setInlineTargetPolicy("deposit");
                setDepositDraft("new");
              }}
              onAddMealPlan={() => {
                setInlineMealPlanTarget(true);
                setMealPlanDraft("new");
              }}
            />
          ) : (
            <PlanDrawer
              key={planDraft?.id ?? "plan-closed"}
              open={planDraft !== null}
              restaurantId={restaurantId}
              canEdit={canEdit}
              categories={categories}
              roomTypes={roomTypes}
              mealPlans={mealPlans}
              cancellationPolicies={cancellationPolicies}
              refundabilityCodes={refundabilityCodes}
              depositPolicies={depositPolicies}
              noShowPolicies={noShowPolicies}
              earlyDeparturePolicies={earlyDeparturePolicies}
              currencyCode={currencyCode}
              value={planDraft}
              pending={planMut.isPending}
              onClose={() => setPlanDraft(null)}
              onSave={(payload) => planMut.mutateAsync({ restaurantId, ...payload })}
              onAddCancellationPolicy={() => {
                setPolicyDrawerInitialMode("catalogue");
                setInlineTargetPolicy("cancellation");
                setCancelDraft("new");
              }}
              onAddNoShow={() => {
                setInlineTargetPolicy("no-show");
                setNoShowDraft("new");
              }}
              onAddEarlyDeparture={() => {
                setPolicyDrawerInitialMode("catalogue");
                setInlineTargetPolicy("early-departure");
                setEarlyDepartureDraft("new");
              }}
              onAddDepositPolicy={() => {
                setInlineTargetPolicy("deposit");
                setDepositDraft("new");
              }}
              newlyCreatedPolicy={newlyCreatedPolicy}
              onAddMealPlan={() => {
                setInlineMealPlanTarget(true);
                setMealPlanDraft("new");
              }}
              newlyCreatedMealPlanId={newlyCreatedMealPlanId}
            />
          )}

          <CategoryDrawer
            key={categoryDraft === "new" ? "cat-new" : (categoryDraft?.id ?? "cat-closed")}
            open={categoryDraft !== null}
            canEdit={canEdit}
            value={categoryDraft === "new" || categoryDraft === null ? null : categoryDraft}
            configuredCategories={categories}
            pending={categoryMut.isPending || batchPending}
            onClose={() => {
              setCategoryDraft(null);
              setInlineCategoryTarget(false);
            }}
            onSave={(payload) => categoryMut.mutate({ restaurantId, ...payload })}
            onSavePredefined={handleSavePredefined}
          />

          <CancellationDrawer
            key={
              cancelDraft === "new"
                ? `cancel-new-${policyDrawerInitialMode}`
                : (cancelDraft?.id ?? "cancel-closed")
            }
            open={cancelDraft !== null}
            canEdit={canEdit}
            value={cancelDraft === "new" || cancelDraft === null ? null : cancelDraft}
            configuredPolicies={cancellationPolicies}
            pending={cancelMut.isPending || batchPending}
            initialMode={cancelDraft === "new" ? policyDrawerInitialMode : "catalogue"}
            onClose={() => {
              setCancelDraft(null);
              setInlineTargetPolicy(null);
              setPolicyDrawerInitialMode("catalogue");
            }}
            onSave={(payload) => cancelMut.mutate({ restaurantId, ...payload })}
            onSavePredefined={handleSavePredefinedCancellations}
          />

          <NoShowDrawer
            key={noShowDraft === "new" ? "ns-new" : (noShowDraft?.id ?? "ns-closed")}
            open={noShowDraft !== null}
            canEdit={canEdit}
            value={noShowDraft === "new" || noShowDraft === null ? null : noShowDraft}
            currencyCode={currencyCode}
            pending={noShowMut.isPending}
            onClose={() => {
              setNoShowDraft(null);
              setInlineTargetPolicy(null);
            }}
            onSave={(payload) => noShowMut.mutate({ restaurantId, ...payload })}
          />

          <EarlyDepartureDrawer
            key={
              earlyDepartureDraft === "new"
                ? `ed-new-${policyDrawerInitialMode}`
                : (earlyDepartureDraft?.id ?? "ed-closed")
            }
            open={earlyDepartureDraft !== null}
            canEdit={canEdit}
            value={
              earlyDepartureDraft === "new" || earlyDepartureDraft === null
                ? null
                : earlyDepartureDraft
            }
            configuredPolicies={earlyDeparturePolicies}
            currencyCode={currencyCode}
            pending={earlyDepartureMut.isPending || batchPending}
            initialMode={earlyDepartureDraft === "new" ? policyDrawerInitialMode : "catalogue"}
            onClose={() => {
              setEarlyDepartureDraft(null);
              setInlineTargetPolicy(null);
              setPolicyDrawerInitialMode("catalogue");
            }}
            onSave={(payload) => earlyDepartureMut.mutate({ restaurantId, ...payload })}
            onSavePredefined={handleSavePredefinedEarlyDepartures}
          />

          <MealPlanSheet
            key={mealPlanDraft === "new" ? "meal-new" : (mealPlanDraft?.id ?? "meal-closed")}
            open={mealPlanDraft !== null}
            canEdit={canEdit}
            value={mealPlanDraft === "new" || mealPlanDraft === null ? null : mealPlanDraft}
            pending={mealPlanMut.isPending}
            className="z-[60]"
            onClose={() => {
              setMealPlanDraft(null);
              setInlineMealPlanTarget(false);
            }}
            onSave={(payload) =>
              mealPlanMut.mutate({
                restaurantId,
                ...payload,
              })
            }
          />

          <DepositPolicySheet
            key={depositDraft === "new" ? "dep-new" : (depositDraft?.id ?? "dep-closed")}
            open={depositDraft !== null}
            canEdit={canEdit}
            currencyCode={currencyCode}
            value={depositDraft === "new" || depositDraft === null ? null : depositDraft}
            pending={depositMut.isPending}
            className="z-[60]"
            onClose={() => {
              setDepositDraft(null);
              setInlineTargetPolicy(null);
            }}
            onSave={(payload) => depositMut.mutate({ restaurantId, ...payload })}
          />
        </div>
      )}
    </div>
  );
}

function CategoryDrawer({
  open,
  canEdit,
  value,
  configuredCategories,
  pending,
  onClose,
  onSave,
  onSavePredefined,
}: {
  open: boolean;
  canEdit: boolean;
  value: RateCategoryRow | null;
  configuredCategories: readonly RateCategoryRow[];
  pending: boolean;
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    code: string;
    name: string;
    active: boolean;
    isCustom?: boolean;
  }) => void;
  onSavePredefined: (presets: PredefinedRateCategory[]) => Promise<void>;
}) {
  const isEditing = value !== null;
  const [mode, setMode] = useState<"catalogue" | "custom">("catalogue");

  // Edit fields
  const [code, setCode] = useState(value?.code ?? "BAR");
  const [name, setName] = useState(value?.name ?? "Best Available Rate");
  const [active, setActive] = useState(value?.active ?? true);

  // Predefined catalogue state
  const [predefinedSearch, setPredefinedSearch] = useState("");
  const [selectedPresets, setSelectedPresets] = useState<PredefinedRateCategory[]>([]);

  // Custom category fields
  const [customName, setCustomName] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [customActive, setCustomActive] = useState(true);
  const [customCodeTouched, setCustomCodeTouched] = useState(false);

  const handleCustomNameChange = (val: string) => {
    setCustomName(val);
    if (!customCodeTouched) {
      const generated = val
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "_")
        .replace(/_+/g, "_")
        .slice(0, 30);
      setCustomCode(generated);
    }
  };

  const filteredPresets = useMemo(() => {
    const q = predefinedSearch.trim().toLowerCase();
    if (!q) return PREDEFINED_RATE_CATEGORIES;
    return PREDEFINED_RATE_CATEGORIES.filter(
      (preset) =>
        preset.name.toLowerCase().includes(q) ||
        preset.code.toLowerCase().includes(q) ||
        preset.legacyCodes?.some((c) => c.toLowerCase().includes(q)),
    );
  }, [predefinedSearch]);

  const customPredefinedConflict = useMemo(() => {
    if (!customName.trim() && !customCode.trim()) return undefined;
    return findMatchingPredefinedCategory(customName, customCode);
  }, [customName, customCode]);

  const customConfiguredConflict = useMemo(() => {
    const trimmedCode = customCode.trim().toUpperCase();
    const trimmedName = customName.trim().toLowerCase();
    if (!trimmedCode && !trimmedName) return false;
    return configuredCategories.some(
      (row) =>
        (trimmedCode && row.code.trim().toUpperCase() === trimmedCode) ||
        (trimmedName && row.name.trim().toLowerCase() === trimmedName),
    );
  }, [configuredCategories, customCode, customName]);

  // If in Edit mode:
  if (isEditing) {
    return (
      <Card3OverlapSheet
        open={open}
        onClose={onClose}
        title="Edit category"
        description="BAR is a category code. There is no separate BAR flag in this schema."
        canEdit={canEdit}
        pending={pending}
        submitLabel="Save category"
        onSubmit={() => onSave({ id: value.id, code, name, active })}
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="cat-code">Code</Label>
            <Input
              id="cat-code"
              value={code}
              disabled={!canEdit}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cat-name">Name</Label>
            <Input
              id="cat-name"
              value={name}
              disabled={!canEdit}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border px-3 py-2">
            <Label htmlFor="cat-active">Active</Label>
            <Switch
              id="cat-active"
              checked={active}
              disabled={!canEdit}
              onCheckedChange={setActive}
            />
          </div>
        </div>
      </Card3OverlapSheet>
    );
  }

  // If in Add mode - Custom Category View:
  if (mode === "custom") {
    return (
      <Card3OverlapSheet
        open={open}
        onClose={onClose}
        title="Create Custom Category"
        description="Define a property-specific rate category if not available in the predefined list."
        canEdit={
          canEdit &&
          Boolean(customName.trim()) &&
          Boolean(customCode.trim()) &&
          !customPredefinedConflict &&
          !customConfiguredConflict
        }
        pending={pending}
        submitLabel="Save category"
        onSubmit={() =>
          onSave({
            code: customCode.trim(),
            name: customName.trim(),
            active: customActive,
            isCustom: true,
          })
        }
      >
        <div className="space-y-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 text-xs text-[#8A641A] hover:text-[#251605]"
            onClick={() => setMode("catalogue")}
          >
            <ArrowLeft className="mr-1 size-3.5" /> Back to predefined categories
          </Button>

          {customPredefinedConflict ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-semibold">
                {customPredefinedConflict.name} is already available in the predefined Rate
                Categories. Select it from the predefined list.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 border-amber-400 bg-white text-xs text-amber-950 hover:bg-amber-100"
                onClick={() => {
                  setMode("catalogue");
                  setPredefinedSearch(customPredefinedConflict.name);
                }}
              >
                Go to predefined {customPredefinedConflict.name}
              </Button>
            </div>
          ) : null}

          {customConfiguredConflict ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              A rate category with this code or name is already configured for this property.
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="custom-cat-name">Category Name *</Label>
              <Input
                id="custom-cat-name"
                value={customName}
                placeholder="e.g. Diplomatic, Airline Crew"
                disabled={!canEdit}
                onChange={(event) => handleCustomNameChange(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="custom-cat-code">Category Code *</Label>
              <Input
                id="custom-cat-code"
                value={customCode}
                placeholder="e.g. DIPLOMATIC"
                disabled={!canEdit}
                onChange={(event) => {
                  setCustomCodeTouched(true);
                  setCustomCode(event.target.value.toUpperCase());
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                Use 1–30 uppercase letters, numbers, or underscores.
              </p>
            </div>
            <div className="flex items-center justify-between rounded-xl border px-3 py-2">
              <Label htmlFor="custom-cat-active">Active</Label>
              <Switch
                id="custom-cat-active"
                checked={customActive}
                disabled={!canEdit}
                onCheckedChange={setCustomActive}
              />
            </div>
          </div>
        </div>
      </Card3OverlapSheet>
    );
  }

  // Default: Add mode - Predefined Catalogue View:
  const submitText =
    selectedPresets.length > 1 ? `Add ${selectedPresets.length} Categories` : "Add Category";

  return (
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      title="Add Rate Category"
      description="Choose from NORU's predefined hotel rate categories or create a property-specific category."
      canEdit={canEdit && selectedPresets.length > 0}
      pending={pending}
      submitLabel={submitText}
      onSubmit={() => void onSavePredefined(selectedPresets)}
    >
      <div className="space-y-3.5">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 size-4 text-[#756A5B]" />
          <Input
            placeholder="Search predefined categories..."
            value={predefinedSearch}
            onChange={(e) => setPredefinedSearch(e.target.value)}
            className="pl-9 text-xs"
          />
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#251605]">
            Predefined Rate Categories
          </p>
          <span className="text-[11px] text-muted-foreground">
            {filteredPresets.length} available
          </span>
        </div>

        <div className="grid max-h-[46vh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {filteredPresets.map((preset) => {
            const isConfigured = isPredefinedCategoryConfigured(preset, configuredCategories);
            const isSelected = selectedPresets.some((s) => s.code === preset.code);
            return (
              <div
                key={preset.code}
                role="button"
                tabIndex={isConfigured ? -1 : 0}
                onClick={() => {
                  if (isConfigured || !canEdit) return;
                  setSelectedPresets((current) =>
                    isSelected
                      ? current.filter((s) => s.code !== preset.code)
                      : [...current, preset],
                  );
                }}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg border p-2.5 text-xs transition-colors",
                  isConfigured
                    ? "cursor-not-allowed border-[#E6E1D8] bg-[#F7F4EE] opacity-60 text-[#756A5B]"
                    : isSelected
                      ? "cursor-pointer border-[#C89933] bg-[#FAF8F5] text-[#251605] ring-1 ring-[#C89933]"
                      : "cursor-pointer border-[#E6E1D8] bg-white text-[#251605] hover:border-[#C89933]/60",
                )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isConfigured || isSelected}
                    disabled={isConfigured || !canEdit}
                    onChange={() => {
                      if (isConfigured || !canEdit) return;
                      setSelectedPresets((current) =>
                        isSelected
                          ? current.filter((s) => s.code !== preset.code)
                          : [...current, preset],
                      );
                    }}
                    className="rounded border-[#CCCCCC] text-[#C89933] focus:ring-[#C89933]"
                  />
                  <span className="truncate font-medium">{preset.name}</span>
                </div>
                <div className="shrink-0 text-[11px]">
                  {isConfigured ? (
                    <span className="font-semibold text-emerald-700">Added ✓</span>
                  ) : (
                    <span className="font-mono text-muted-foreground">{preset.code}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col items-center justify-between gap-2 border-t border-[#E6E1D8] pt-3 sm:flex-row">
          <p className="text-xs text-[#756A5B]">Can&apos;t find the category you need?</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canEdit}
            className="h-8 border-[#C89933]/50 text-xs text-[#8A641A] hover:bg-[#FAF8F5]"
            onClick={() => {
              setMode("custom");
              setCustomName("");
              setCustomCode("");
              setCustomCodeTouched(false);
            }}
          >
            <Plus className="mr-1 size-3.5" /> Create Custom Category
          </Button>
        </div>
      </div>
    </Card3OverlapSheet>
  );
}

function optionalId(value: string) {
  return value && value !== NONE ? value : null;
}

function dateField(value: string | null | undefined) {
  const match = String(value ?? "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? "";
}

function ratePlanOptionLabel(
  id: string,
  rows: ReadonlyArray<{ id: string; code: string; name: string }>,
  savedName?: string | null,
  suffix?: string,
): string | undefined {
  if (!id) return undefined;
  if (id === NONE) return "None";
  const row = rows.find((item) => item.id === id);
  if (!row) return savedName?.trim() || undefined;
  return `${row.code} — ${row.name}${suffix ?? ""}`;
}

function PlanDrawer({
  open,
  restaurantId,
  canEdit,
  categories,
  roomTypes,
  mealPlans,
  cancellationPolicies,
  refundabilityCodes: _legacyRefundabilityCodes,
  depositPolicies,
  noShowPolicies,
  earlyDeparturePolicies,
  currencyCode,
  value,
  pending,
  onClose,
  onSave,
  onAddCancellationPolicy,
  onAddDepositPolicy,
  onAddNoShow,
  onAddEarlyDeparture,
  newlyCreatedPolicy,
  onAddMealPlan,
  newlyCreatedMealPlanId,
}: {
  open: boolean;
  restaurantId: string;
  canEdit: boolean;
  categories: RateCategoryRow[];
  roomTypes: RatesCard2Snapshot["roomTypes"];
  mealPlans: RatesCard2Snapshot["mealPlans"];
  cancellationPolicies: RateCancellationPolicyRow[];
  /** Legacy snapshot rows — not editable via a Refundability catalogue. */
  refundabilityCodes: RateRefundabilityRow[];
  depositPolicies: RatesCard2Snapshot["depositPolicies"];
  noShowPolicies: RatesCard2Snapshot["noShowPolicies"];
  earlyDeparturePolicies: RatesCard2Snapshot["earlyDeparturePolicies"];
  currencyCode: string;
  value: RatePlanRow | null;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: {
    id?: string;
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
    minAdvanceDays: number | null;
    maxAdvanceDays: number | null;
    /** Omitted when date-level stay/CTA/CTD are heterogeneous (non-destructive). */
    minStayNights?: number | null;
    maxStayNights?: number | null;
    closedToArrival?: boolean;
    closedToDeparture?: boolean;
    restrictionValidFrom?: string | null;
    restrictionValidTo?: string | null;
    active: boolean;
  }) => void | Promise<unknown>;
  onAddCancellationPolicy?: () => void;
  onAddDepositPolicy?: () => void;
  onAddNoShow?: () => void;
  onAddEarlyDeparture?: () => void;
  newlyCreatedPolicy?: { type: InlinePolicyTarget; id: string } | null;
  onAddMealPlan?: () => void;
  newlyCreatedMealPlanId?: string | null;
}) {
  const queryClient = useQueryClient();
  const loadMeals = useServerFn(getMealsCard3);
  const savePackage = useServerFn(savePackageCard3);

  const mealsQuery = useQuery({
    queryKey: ["pms-card3-meals", restaurantId],
    queryFn: () => loadMeals({ data: { restaurantId } }),
    enabled: open,
  });
  const mealsSnapshot = mealsQuery.data?.snapshot;
  const packageCatalogue: PackageCard3Row[] = mealsSnapshot?.packages ?? [];

  const [categoryId, setCategoryId] = useState(value?.categoryId ?? categories[0]?.id ?? "");
  const [roomTypeId, setRoomTypeId] = useState(value?.roomTypeId ?? roomTypes[0]?.id ?? "");
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(Boolean(value?.code));
  const [description, setDescription] = useState(value?.description ?? "");
  const initialType = roomTypes.find((row) => row.id === (value?.roomTypeId ?? roomTypes[0]?.id));
  const createDefaults = occupancyFieldsFromRoomTypeDefaults(initialType);
  const savedOccupancy = occupancyFieldsFromSavedRatePlan(value);
  const [baseRate, setBaseRate] = useState(() => {
    if (value) return value.baseRate;
    const computed = computeRatePlanBaseFromDefaults({
      method: roomTypeBaseIsConfigured(initialType?.baseNightlyRate) ? "use_base" : "fixed",
      roomTypeBase: initialType?.baseNightlyRate,
      fixedPrice: 0,
    });
    return computed.ok ? computed.baseRate : 0;
  });
  const [pricingMethod, setPricingMethod] = useState<RatePlanPricingMethod>(
    value ? "fixed" : roomTypeBaseIsConfigured(initialType?.baseNightlyRate) ? "use_base" : "fixed",
  );
  const [methodPercent, setMethodPercent] = useState(10);
  const [validFrom, setValidFrom] = useState(dateField(value?.validFrom));
  const [validTo, setValidTo] = useState(dateField(value?.validTo));
  const [mealPlanId, setMealPlanId] = useState(value?.mealPlanId ?? NONE);
  const [packageId, setPackageId] = useState(NONE);
  const [packageInclusionType, setPackageInclusionType] =
    useState<PackageInclusionType>("included");
  const [initialPackageId, setInitialPackageId] = useState<string | null>(null);
  const [packageHydrated, setPackageHydrated] = useState(false);
  const [packageEditorOpen, setPackageEditorOpen] = useState(false);
  const [mealCatalogueOpen, setMealCatalogueOpen] = useState(false);
  const [packageCatalogueOpen, setPackageCatalogueOpen] = useState(false);
  const [packageSavePending, setPackageSavePending] = useState(false);
  const [packageLinkPending, setPackageLinkPending] = useState(false);
  const [cancellationPolicyId, setCancellationPolicyId] = useState(
    value?.cancellationPolicyId ?? NONE,
  );
  const [depositPolicyId, setDepositPolicyId] = useState(value?.depositPolicyId ?? NONE);
  const [noShowPolicyId, setNoShowPolicyId] = useState(value?.noShowPolicyId ?? NONE);
  const [earlyDeparturePolicyId, setEarlyDeparturePolicyId] = useState(
    value?.earlyDeparturePolicyId ?? NONE,
  );
  const selectedType = roomTypes.find((row) => row.id === roomTypeId);
  const selectedMeal = mealPlans.find((row) => row.id === mealPlanId);
  const selectedCancellation = cancellationPolicies.find((row) => row.id === cancellationPolicyId);
  const packageOptions = packageCatalogue.filter(
    (row) => row.active || row.id === packageId || row.id === initialPackageId,
  );
  const selectedPackage = packageOptions.find((row) => row.id === packageId);
  const packageSelected = Boolean(packageId && packageId !== NONE);
  const categoryLabel = ratePlanOptionLabel(
    categoryId,
    categories,
    value?.categoryName ? `${value.categoryName}` : null,
  );
  const roomTypeLabel = ratePlanOptionLabel(
    roomTypeId,
    roomTypes,
    value ? `${value.roomTypeCode} — ${value.roomTypeName}`.trim() : null,
  );
  const mealLabel =
    !mealPlanId || mealPlanId === NONE
      ? "Room Only"
      : selectedMeal?.name ?? value?.mealPlanName ?? "Room Only";
  const cancellationLabel = ratePlanOptionLabel(
    cancellationPolicyId,
    cancellationPolicies,
    value?.cancellationName,
  );
  const depositLabel = ratePlanOptionLabel(depositPolicyId, depositPolicies, value?.depositPolicyName);
  const noShowLabel = ratePlanOptionLabel(noShowPolicyId, noShowPolicies, value?.noShowPolicyName);
  const earlyDepartureLabel = ratePlanOptionLabel(
    earlyDeparturePolicyId,
    earlyDeparturePolicies,
    value?.earlyDeparturePolicyName,
  );
  const [includedOccupancy, setIncludedOccupancy] = useState(
    value ? savedOccupancy.includedOccupancy : createDefaults.includedOccupancy,
  );
  const [extraAdultRate, setExtraAdultRate] = useState(
    value ? savedOccupancy.extraAdultRate : createDefaults.extraAdultRate,
  );
  const [extraChildRate, setExtraChildRate] = useState(
    value ? savedOccupancy.extraChildRate : createDefaults.extraChildRate,
  );
  const [active, setActive] = useState(value?.active ?? true);
  const [minStayNights, setMinStayNights] = useState(
    value?.restrictionCalendarWritable === false || value?.minStayNights == null
      ? ""
      : String(value.minStayNights),
  );
  const [maxStayNights, setMaxStayNights] = useState(
    value?.restrictionCalendarWritable === false || value?.maxStayNights == null
      ? ""
      : String(value.maxStayNights),
  );
  const [minAdvanceDays, setMinAdvanceDays] = useState(
    value?.minAdvanceDays == null ? "" : String(value.minAdvanceDays),
  );
  const [maxAdvanceDays, setMaxAdvanceDays] = useState(
    value?.maxAdvanceDays == null ? "" : String(value.maxAdvanceDays),
  );
  const restrictionCalendarWritable = value?.restrictionCalendarWritable !== false;
  const restrictionHasDateOverrides = value?.restrictionHasDateOverrides === true;
  const [closedToArrival, setClosedToArrival] = useState(
    restrictionCalendarWritable ? (value?.closedToArrival ?? false) : false,
  );
  const [closedToDeparture, setClosedToDeparture] = useState(
    restrictionCalendarWritable ? (value?.closedToDeparture ?? false) : false,
  );
  const restrictionFromRaw = restrictionCalendarWritable
    ? dateField(value?.restrictionValidFrom) || dateField(value?.validFrom)
    : dateField(value?.validFrom);
  const [restrictionValidFrom, setRestrictionValidFrom] = useState(restrictionFromRaw);
  const restrictionToRaw = restrictionCalendarWritable ? (value?.restrictionValidTo ?? "") : "";
  const restrictionOpenEnded = restrictionCalendarWritable
    ? isEffectivelyOpenEndedRestrictionWindow(restrictionFromRaw, restrictionToRaw)
    : true;
  const [restrictionNoEndDate, setRestrictionNoEndDate] = useState(restrictionOpenEnded);
  const [restrictionValidTo, setRestrictionValidTo] = useState(
    restrictionOpenEnded ? "" : dateField(restrictionToRaw),
  );

  useEffect(() => {
    if (!newlyCreatedPolicy) return;
    if (newlyCreatedPolicy.type === "cancellation") {
      setCancellationPolicyId(newlyCreatedPolicy.id);
    } else if (newlyCreatedPolicy.type === "deposit") {
      setDepositPolicyId(newlyCreatedPolicy.id);
    } else if (newlyCreatedPolicy.type === "no-show") {
      setNoShowPolicyId(newlyCreatedPolicy.id);
    } else if (newlyCreatedPolicy.type === "early-departure") {
      setEarlyDeparturePolicyId(newlyCreatedPolicy.id);
    }
  }, [newlyCreatedPolicy]);

  useEffect(() => {
    if (newlyCreatedMealPlanId) {
      setMealPlanId(newlyCreatedMealPlanId);
    }
  }, [newlyCreatedMealPlanId]);

  useEffect(() => {
    if (packageHydrated || !value?.id || !mealsQuery.isFetched) return;
    const linked = findPackageLinkedToRatePlan(packageCatalogue, value.id);
    setPackageId(linked?.id ?? NONE);
    setPackageInclusionType(
      linked
        ? parsePackageInclusionType(
            linked.ratePlanLinks.find((link) => link.ratePlanId === value.id)?.inclusionType,
          )
        : "included",
    );
    setInitialPackageId(linked?.id ?? null);
    setPackageHydrated(true);
  }, [packageHydrated, value?.id, mealsQuery.isFetched, packageCatalogue]);

  function applyPricingMethod(method: RatePlanPricingMethod, percent = methodPercent) {
    setPricingMethod(method);
    if (value) return;
    const computed = computeRatePlanBaseFromDefaults({
      method,
      roomTypeBase: selectedType?.baseNightlyRate,
      percent,
      fixedPrice: method === "fixed" ? baseRate : selectedType?.baseNightlyRate,
    });
    if (computed.ok) setBaseRate(computed.baseRate);
  }

  function copyRoomTypeDefaults(nextType = selectedType) {
    if (!nextType) return;
    const next = occupancyFieldsFromRoomTypeDefaults(nextType);
    setIncludedOccupancy(next.includedOccupancy);
    setExtraAdultRate(next.extraAdultRate);
    setExtraChildRate(next.extraChildRate);
    const computed = computeRatePlanBaseFromDefaults({
      method: "use_base",
      roomTypeBase: nextType.baseNightlyRate,
    });
    if (computed.ok) setBaseRate(computed.baseRate);
  }

  async function handleSaveInlinePackage(payload: {
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
  }) {
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
  }

  async function handleSubmit() {
    if (pending || packageLinkPending) return;
    try {
      await onSave({
        ...(value ? { id: value.id } : {}),
        categoryId,
        roomTypeId,
        code,
        name,
        description,
        baseRate,
        validFrom: validFrom.trim() || null,
        validTo: validTo.trim() || null,
        mealPlanId: optionalId(mealPlanId),
        cancellationPolicyId: optionalId(cancellationPolicyId),
        refundabilityId: value?.refundabilityId ?? null,
        depositPolicyId: optionalId(depositPolicyId),
        noShowPolicyId: optionalId(noShowPolicyId),
        earlyDeparturePolicyId: optionalId(earlyDeparturePolicyId),
        includedOccupancy: parseOptionalIncludedField(includedOccupancy),
        extraAdultRate: extraAdultRate.trim() === "" ? null : Number(extraAdultRate),
        extraChildRate: extraChildRate.trim() === "" ? null : Number(extraChildRate),
        minAdvanceDays: parseOptionalNonNegativeInt(minAdvanceDays),
        maxAdvanceDays: parseOptionalNonNegativeInt(maxAdvanceDays),
        // Heterogeneous date-level stay/CTA/CTD: omit calendar fields so save cannot flatten them.
        ...(restrictionCalendarWritable
          ? {
              minStayNights: parseOptionalPositiveInt(minStayNights),
              maxStayNights: parseOptionalPositiveInt(maxStayNights),
              closedToArrival,
              closedToDeparture,
              restrictionValidFrom: restrictionValidFrom.trim() || validFrom.trim() || null,
              restrictionValidTo: restrictionNoEndDate
                ? RATE_PLAN_RESTRICTION_OPEN_ENDED_TO
                : restrictionValidTo.trim() || null,
            }
          : {}),
        active,
      });

      if (value?.id) {
        const nextPackageId = optionalId(packageId);
        const updates = buildRatePlanPackageLinkUpdates({
          ratePlanId: value.id,
          previousPackageId: initialPackageId,
          nextPackageId,
          inclusionType: packageInclusionType,
          packages: packageCatalogue,
        });
        if (updates.length > 0) {
          setPackageLinkPending(true);
          try {
            for (const update of updates) {
              await savePackage({
                data: {
                  restaurantId,
                  ...update,
                  // Omit serviceTypeIds so Package Master inclusion JSON is unchanged.
                },
              });
            }
            await queryClient.invalidateQueries({ queryKey: ["pms-card3-meals", restaurantId] });
            setInitialPackageId(nextPackageId);
          } catch (linkError: unknown) {
            toast.error(
              (linkError as Error)?.message ??
                "Rate plan saved, but package link could not be updated.",
            );
          } finally {
            setPackageLinkPending(false);
          }
        }
      }
      onClose();
    } catch {
      // planMut already toasts onError.
    }
  }

  return (
    <>
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      maxWidth="max-w-4xl"
      title={value ? "Edit rate plan" : "Add rate plan"}
      description="Choose a room type. Pricing method is set when creating the plan — only the final base rate is saved. Later room type changes do not update this rate plan."
      canEdit={canEdit && Boolean(categoryId) && Boolean(roomTypeId)}
      pending={pending || packageLinkPending || packageSavePending}
      submitLabel="Save rate plan"
      onSubmit={() => {
        void handleSubmit();
      }}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Category</Label>
            <Select
              value={categoryId}
              disabled={!canEdit}
              onValueChange={(nextId) => {
                setCategoryId(nextId);
                if (!value && !codeManuallyEdited) {
                  const category = categories.find((row) => row.id === nextId);
                  const roomType = roomTypes.find((row) => row.id === roomTypeId);
                  setCode(suggestRatePlanCode(category?.code ?? "", roomType?.name ?? ""));
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a category">{categoryLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-[190px] overflow-y-auto">
                {categories.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.code} — {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Room type</Label>
            <Select
              value={roomTypeId}
              disabled={!canEdit}
              onValueChange={(nextId) => {
                setRoomTypeId(nextId);
                const nextType = roomTypes.find((row) => row.id === nextId);
                if (!value && nextType) {
                  const next = occupancyFieldsFromRoomTypeDefaults(nextType);
                  setIncludedOccupancy(next.includedOccupancy);
                  setExtraAdultRate(next.extraAdultRate);
                  setExtraChildRate(next.extraChildRate);
                  const nextMethod = roomTypeBaseIsConfigured(nextType.baseNightlyRate)
                    ? pricingMethod
                    : "fixed";
                  setPricingMethod(nextMethod);
                  const computed = computeRatePlanBaseFromDefaults({
                    method: nextMethod,
                    roomTypeBase: nextType.baseNightlyRate,
                    percent: methodPercent,
                    fixedPrice: nextType.baseNightlyRate ?? 0,
                  });
                  if (computed.ok) setBaseRate(computed.baseRate);
                  if (!codeManuallyEdited) {
                    const category = categories.find((row) => row.id === categoryId);
                    setCode(suggestRatePlanCode(category?.code ?? "", nextType.name));
                  }
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a room type">{roomTypeLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-[190px] overflow-y-auto">
                {roomTypes.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.code} — {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="plan-name">Rate Plan Name</Label>
            <Input
              id="plan-name"
              value={name}
              disabled={!canEdit}
              placeholder="e.g. Best Available Rate"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label htmlFor="plan-code">Rate Plan Code</Label>
              {!codeManuallyEdited && code ? (
                <span className="text-[10px] text-muted-foreground">
                  Auto from category & room type
                </span>
              ) : null}
            </div>
            <Input
              id="plan-code"
              value={code}
              disabled={!canEdit}
              placeholder="e.g. BAR_STD_KING"
              onChange={(event) => {
                setCodeManuallyEdited(true);
                setCode(event.target.value.toUpperCase());
              }}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="plan-description">Description</Label>
          <Textarea
            id="plan-description"
            value={description}
            disabled={!canEdit}
            rows={2}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="plan-valid-from">Valid from</Label>
            <Input
              id="plan-valid-from"
              type="date"
              value={validFrom}
              disabled={!canEdit}
              onChange={(event) => setValidFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="plan-valid-to">Valid to</Label>
            <Input
              id="plan-valid-to"
              type="date"
              value={validTo}
              disabled={!canEdit}
              onChange={(event) => setValidTo(event.target.value)}
            />
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-[#E6E1D8] bg-[#FAF8F5]/60 p-4">
          <div className="border-b border-[#E6E1D8] pb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#251605]">
              Meals & Packages
            </p>
            <p className="text-[11px] text-[#756A5B]">
              Meal plan and package treatment match Create Rate Plan Step 3.
            </p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <Label>Meal Plan</Label>
              {canEdit ? (
                <div className="flex items-center gap-1">
                  {onAddMealPlan ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1.5 text-xs text-[#8A641A] hover:bg-[#F4EDE0]"
                      onClick={onAddMealPlan}
                    >
                      <Plus className="mr-1 size-3" />
                      Create custom
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-5 border-[#D9D2C4] px-1.5 text-[10px] text-[#251605] hover:bg-[#F4EDE0]"
                    onClick={() => setMealCatalogueOpen(true)}
                    data-testid="edit-rate-plan-manage-meal-catalogue"
                  >
                    Manage catalogue
                  </Button>
                </div>
              ) : null}
            </div>
            <Select value={mealPlanId} disabled={!canEdit} onValueChange={setMealPlanId}>
              <SelectTrigger>
                <SelectValue placeholder="Room Only">{mealLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-[190px] overflow-y-auto">
                <SelectItem value={NONE}>Room Only</SelectItem>
                {mealPlans
                  .filter((row) => row.active || row.id === mealPlanId)
                  .map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                      {row.includesBreakfast ? " (breakfast)" : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <Label>Package</Label>
              {canEdit ? (
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-xs text-[#8A641A] hover:bg-[#F4EDE0]"
                    onClick={() => setPackageEditorOpen(true)}
                  >
                    <Plus className="mr-1 size-3" />
                    Create custom
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-5 border-[#D9D2C4] px-1.5 text-[10px] text-[#251605] hover:bg-[#F4EDE0]"
                    onClick={() => setPackageCatalogueOpen(true)}
                    data-testid="edit-rate-plan-manage-packages"
                  >
                    Manage packages
                  </Button>
                </div>
              ) : null}
            </div>
            <Select
              value={packageId}
              disabled={!canEdit}
              onValueChange={(next) => {
                setPackageId(next);
                if (next === NONE) setPackageInclusionType("included");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="None">
                  {selectedPackage?.name ?? "None"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-[190px] overflow-y-auto z-[100]">
                <SelectItem value={NONE}>None</SelectItem>
                {packageOptions.map((row) => (
                  <SelectItem key={row.id} value={row.id} className="items-start py-2">
                    <div className="flex flex-col gap-0.5">
                      <span>{row.name}</span>
                      <span className="text-[10px] font-normal text-[#8A7963]">
                        {formatPackageDropdownDetail(row, currencyCode)}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {packageSelected ? (
            <div className="space-y-1.5" data-testid="edit-rate-plan-package-treatment">
              <Label>Package Treatment</Label>
              <Select
                value={packageInclusionType}
                disabled={!canEdit}
                onValueChange={(next) =>
                  setPackageInclusionType(next as PackageInclusionType)
                }
              >
                <SelectTrigger>
                  <SelectValue>
                    {PACKAGE_INCLUSION_TYPE_LABELS[packageInclusionType]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="z-[100]">
                  {PACKAGE_INCLUSION_TYPES.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {PACKAGE_INCLUSION_TYPE_LABELS[kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-[#756A5B]">
                {packageInclusionType === "included"
                  ? "Package benefits are included with this rate plan."
                  : "Guests may add this package separately when booking."}
              </p>
            </div>
          ) : null}
        </div>

        <div className="space-y-3 rounded-xl border border-[#E6E1D8] bg-[#FAF8F5]/60 p-4">
          <div className="flex items-center justify-between border-b border-[#E6E1D8] pb-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#251605]">
                Policies
              </p>
              <p className="text-[11px] text-[#756A5B]">
                Assign policies or create new ones inline without leaving this rate plan.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label>Cancellation policy</Label>
                {canEdit && onAddCancellationPolicy ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-xs text-[#8A641A] hover:bg-[#F4EDE0]"
                    onClick={onAddCancellationPolicy}
                  >
                    <Plus className="mr-1 size-3" />
                    New
                  </Button>
                ) : null}
              </div>
              <Select
                value={cancellationPolicyId}
                disabled={!canEdit}
                onValueChange={setCancellationPolicyId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None">{cancellationLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {cancellationPolicies.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.code} — {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label>Refundability</Label>
              <p className="rounded-lg border border-[#E6E1D8] bg-[#FBF7EE] px-3 py-2 text-xs text-[#5C5346]">
                Refundable vs non-refundable terms come from the{" "}
                <span className="font-semibold text-[#251605]">Cancellation policy</span>
                {selectedCancellation
                  ? ` (${selectedCancellation.code} — ${CANCELLATION_POLICY_KIND_LABELS[selectedCancellation.policyKind]})`
                  : ""}
                . A separate Refundability catalogue is not used.
                {value?.refundabilityId && value.refundabilityName ? (
                  <span className="mt-1 block text-[11px] text-[#8A641A]">
                    Legacy link retained on this plan: {value.refundabilityName}
                    {value.refundabilityKind
                      ? ` (${REFUNDABILITY_KIND_LABELS[value.refundabilityKind]})`
                      : ""}
                    .
                  </span>
                ) : null}
              </p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label>Deposit policy</Label>
                {canEdit && onAddDepositPolicy ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-xs text-[#8A641A] hover:bg-[#F4EDE0]"
                    onClick={onAddDepositPolicy}
                  >
                    <Plus className="mr-1 size-3" />
                    New
                  </Button>
                ) : null}
              </div>
              <Select
                value={depositPolicyId}
                disabled={!canEdit}
                onValueChange={setDepositPolicyId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None">{depositLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent className="z-[100]">
                  <SelectItem value={NONE}>None</SelectItem>
                  {depositPolicies.length === 0 ? (
                    <SelectItem value="__empty_deposit__" disabled>
                      No deposit policies configured
                    </SelectItem>
                  ) : (
                    depositPolicies.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.code} — {row.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label>No-show policy</Label>
                {canEdit && onAddNoShow ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-xs text-[#8A641A] hover:bg-[#F4EDE0]"
                    onClick={onAddNoShow}
                  >
                    <Plus className="mr-1 size-3" />
                    New
                  </Button>
                ) : null}
              </div>
              <Select
                value={noShowPolicyId}
                disabled={!canEdit}
                onValueChange={setNoShowPolicyId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None">{noShowLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {noShowPolicies.length === 0 ? (
                    <SelectItem value="__empty_no_show__" disabled>
                      No no-show policies configured
                    </SelectItem>
                  ) : (
                    noShowPolicies.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.code} — {row.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 sm:col-span-2 sm:max-w-[calc(50%-0.375rem)]">
              <div className="flex items-center justify-between">
                <Label>Early departure policy</Label>
                {canEdit && onAddEarlyDeparture ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-xs text-[#8A641A] hover:bg-[#F4EDE0]"
                    onClick={onAddEarlyDeparture}
                  >
                    <Plus className="mr-1 size-3" />
                    New
                  </Button>
                ) : null}
              </div>
              <Select
                value={earlyDeparturePolicyId}
                disabled={!canEdit}
                onValueChange={setEarlyDeparturePolicyId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None">{earlyDepartureLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {earlyDeparturePolicies.length === 0 ? (
                    <SelectItem value="__empty_early_departure__" disabled>
                      No early departure policies configured
                    </SelectItem>
                  ) : (
                    earlyDeparturePolicies.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.code} — {row.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <RatePlanPricingSetup
          canEdit={canEdit}
          isCreate={!value}
          selectedType={selectedType}
          savedBaseRate={value?.baseRate}
          pricingMethod={pricingMethod}
          methodPercent={methodPercent}
          baseRate={baseRate}
          includedOccupancy={includedOccupancy}
          extraAdultRate={extraAdultRate}
          extraChildRate={extraChildRate}
          onPricingMethodChange={(method) => applyPricingMethod(method)}
          onPercentChange={(percent) => {
            setMethodPercent(percent);
            applyPricingMethod(pricingMethod, percent);
          }}
          onBaseRateChange={(rate) => {
            setPricingMethod("fixed");
            setBaseRate(rate);
          }}
          onIncludedChange={setIncludedOccupancy}
          onExtraAdultChange={setExtraAdultRate}
          onExtraChildChange={setExtraChildRate}
          onRecalculateFromType={() => copyRoomTypeDefaults()}
        />

        <div
          className="space-y-1.5 rounded-xl border border-[#E6E1D8] bg-white p-4"
          data-testid="edit-rate-plan-price-summary"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-[#251605]">
            Price Summary
          </p>
          <div className="flex justify-between gap-3 text-xs">
            <span className="text-muted-foreground">Room rate</span>
            <span className="text-right font-medium text-[#251605]">
              {`${formatRatePlanMoney(currencyCode, baseRate)} / night`}
            </span>
          </div>
          {packageSelected && selectedPackage && packageInclusionType === "included" ? (
            <>
              <div className="flex justify-between gap-3 text-xs">
                <span className="text-muted-foreground">{selectedPackage.name}</span>
                <span className="text-right font-medium text-[#251605]">
                  {formatPackagePriceDetail(selectedPackage, currencyCode)}
                </span>
              </div>
              <div className="flex justify-between gap-3 text-xs">
                <span className="text-muted-foreground">Treatment</span>
                <span className="text-right font-medium text-[#251605]">
                  {PACKAGE_INCLUSION_TYPE_LABELS.included}
                </span>
              </div>
              <div className="mt-2 flex justify-between gap-3 border-t border-[#EDE6D8] pt-2.5">
                <span className="text-xs font-semibold text-[#251605]">
                  1-night starting total
                </span>
                <span className="text-right text-sm font-semibold tabular-nums text-[#251605]">
                  {formatRatePlanMoney(
                    currencyCode,
                    oneNightStartingTotal(baseRate, selectedPackage.packagePrice),
                  )}
                </span>
              </div>
              <p className="pt-1 text-[11px] text-[#756A5B]">
                Final booking total depends on stay length and package charge basis.
              </p>
            </>
          ) : null}
          {packageSelected && selectedPackage && packageInclusionType === "optional" ? (
            <>
              <div className="flex justify-between gap-3 text-xs">
                <span className="text-muted-foreground">{selectedPackage.name}</span>
                <span className="text-right font-medium text-[#251605]">
                  {formatPackagePriceDetail(selectedPackage, currencyCode)}
                </span>
              </div>
              <div className="flex justify-between gap-3 text-xs">
                <span className="text-muted-foreground">Treatment</span>
                <span className="text-right font-medium text-[#251605]">
                  {PACKAGE_INCLUSION_TYPE_LABELS.optional}
                </span>
              </div>
              <div className="mt-2 flex justify-between gap-3 border-t border-[#EDE6D8] pt-2.5">
                <span className="text-xs font-semibold text-[#251605]">Starting room total</span>
                <span className="text-right text-sm font-semibold tabular-nums text-[#251605]">
                  {`${formatRatePlanMoney(currencyCode, baseRate)} / night`}
                </span>
              </div>
            </>
          ) : null}
        </div>

        <div className="space-y-3 rounded-xl border border-[#E6E1D8] bg-[#FAF8F5]/60 p-4">
          <div className="border-b border-[#E6E1D8] pb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#251605]">
              Availability & Restrictions
            </p>
            <p className="text-[11px] text-[#756A5B]">
              Matches Create Rate Plan Step 4. Blank stay fields mean no minimum or no maximum.
            </p>
          </div>
          {restrictionHasDateOverrides ? (
            <p className="rounded-[6px] border border-[#D9D0C3] bg-white px-3 py-2 text-[11px] text-[#5C5346]">
              This rate plan has date-specific restriction overrides.
              {restrictionCalendarWritable
                ? " Saving base restrictions will not erase those overrides."
                : " Stay and arrival controls vary by date — edit them on the rate calendar. Saving here will not erase those overrides."}
            </p>
          ) : null}
          <div className="flex items-center justify-between rounded-[6px] border border-[#CCCCCC] bg-white px-3 py-2">
            <div>
              <Label htmlFor="plan-active">Active</Label>
              <p className="text-[11px] text-[#756A5B]">
                Available for sale: {active ? "Yes" : "No"}
              </p>
            </div>
            <Switch
              id="plan-active"
              checked={active}
              disabled={!canEdit}
              onCheckedChange={setActive}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="plan-min-stay">Minimum stay</Label>
              <Input
                id="plan-min-stay"
                type="number"
                min={1}
                placeholder={restrictionCalendarWritable ? "No minimum" : "Varies by date"}
                value={minStayNights}
                disabled={!canEdit || !restrictionCalendarWritable}
                className={PROPERTY_SETUP_CONTROL_CLASS}
                onChange={(event) => setMinStayNights(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="plan-max-stay">Maximum stay</Label>
              <Input
                id="plan-max-stay"
                type="number"
                min={1}
                placeholder={restrictionCalendarWritable ? "No maximum" : "Varies by date"}
                value={maxStayNights}
                disabled={!canEdit || !restrictionCalendarWritable}
                className={PROPERTY_SETUP_CONTROL_CLASS}
                onChange={(event) => setMaxStayNights(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="plan-min-advance">Minimum advance booking</Label>
              <Input
                id="plan-min-advance"
                type="number"
                min={0}
                placeholder="No minimum"
                value={minAdvanceDays}
                disabled={!canEdit}
                className={PROPERTY_SETUP_CONTROL_CLASS}
                onChange={(event) => setMinAdvanceDays(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="plan-max-advance">Maximum advance booking</Label>
              <Input
                id="plan-max-advance"
                type="number"
                min={0}
                placeholder="No maximum"
                value={maxAdvanceDays}
                disabled={!canEdit}
                className={PROPERTY_SETUP_CONTROL_CLASS}
                onChange={(event) => setMaxAdvanceDays(event.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-[6px] border border-[#CCCCCC] bg-white px-3 py-2">
              <Label htmlFor="plan-cta">Closed to Arrival</Label>
              <Switch
                id="plan-cta"
                checked={closedToArrival}
                disabled={!canEdit || !restrictionCalendarWritable}
                onCheckedChange={setClosedToArrival}
              />
            </div>
            <div className="flex items-center justify-between rounded-[6px] border border-[#CCCCCC] bg-white px-3 py-2">
              <Label htmlFor="plan-ctd">Closed to Departure</Label>
              <Switch
                id="plan-ctd"
                checked={closedToDeparture}
                disabled={!canEdit || !restrictionCalendarWritable}
                onCheckedChange={setClosedToDeparture}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="plan-rest-from">Valid from</Label>
              <Input
                id="plan-rest-from"
                type="date"
                value={restrictionValidFrom}
                disabled={!canEdit || !restrictionCalendarWritable}
                className={PROPERTY_SETUP_CONTROL_CLASS}
                onChange={(event) => setRestrictionValidFrom(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="plan-rest-to">Valid to</Label>
                <label className="flex items-center gap-2 text-xs text-[#251605]">
                  <input
                    type="checkbox"
                    checked={restrictionNoEndDate}
                    disabled={!canEdit || !restrictionCalendarWritable}
                    onChange={(event) => {
                      setRestrictionNoEndDate(event.target.checked);
                      if (event.target.checked) setRestrictionValidTo("");
                    }}
                  />
                  No end date
                </label>
              </div>
              <Input
                id="plan-rest-to"
                type="date"
                value={restrictionNoEndDate ? "" : restrictionValidTo}
                disabled={!canEdit || !restrictionCalendarWritable || restrictionNoEndDate}
                className={PROPERTY_SETUP_CONTROL_CLASS}
                onChange={(event) => {
                  setRestrictionValidTo(event.target.value);
                  setRestrictionNoEndDate(false);
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </Card3OverlapSheet>

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
      existingPackages={packageCatalogue}
      value={null}
      pending={packageSavePending}
      componentPending={false}
      className="z-[80]"
      onClose={() => setPackageEditorOpen(false)}
      onSave={handleSaveInlinePackage}
      onSaved={(pkg) => {
        setPackageId(pkg.id);
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

    <Dialog open={mealCatalogueOpen} onOpenChange={setMealCatalogueOpen}>
      <DialogContent
        overlayClassName="bg-[#1F140A]/60 z-[70]"
        className="z-[80] flex max-h-[90vh] w-[min(1100px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden rounded-2xl border border-[#DDD4C5] bg-[#F7F4EE] p-0 shadow-xl sm:max-w-none"
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="shrink-0 border-b border-[#EDE6D8] bg-white px-5 py-3 text-left">
          <DialogTitle className="font-display text-base text-[#251605]">
            Manage Meal Plan Catalogue
          </DialogTitle>
          <DialogDescription className="text-xs text-[#756A5B]">
            Add or edit meal plans for this property. Your rate plan selections stay preserved
            underneath.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <PmsPropertySetupCard3Meals
            restaurantId={restaurantId}
            canEdit={canEdit}
            embedded
            catalogueMode="meals"
            onMealPlanCreated={(id) => {
              setMealPlanId(id);
              void queryClient.invalidateQueries({ queryKey: ["pms-card2-rates", restaurantId] });
              void queryClient.invalidateQueries({ queryKey: ["pms-card3-meals", restaurantId] });
              setMealCatalogueOpen(false);
            }}
          />
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={packageCatalogueOpen} onOpenChange={setPackageCatalogueOpen}>
      <DialogContent
        overlayClassName="bg-[#1F140A]/60 z-[70]"
        className="z-[80] flex max-h-[90vh] w-[min(1100px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden rounded-2xl border border-[#DDD4C5] bg-[#F7F4EE] p-0 shadow-xl sm:max-w-none"
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="shrink-0 border-b border-[#EDE6D8] bg-white px-5 py-3 text-left">
          <DialogTitle className="font-display text-base text-[#251605]">
            Manage Packages
          </DialogTitle>
          <DialogDescription className="text-xs text-[#756A5B]">
            Add or edit packages for this property. Your rate plan selections stay preserved
            underneath.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <PmsPropertySetupCard3Meals
            restaurantId={restaurantId}
            canEdit={canEdit}
            embedded
            catalogueMode="packages"
            onPackageCreated={(id) => {
              setPackageId(id);
              void queryClient.invalidateQueries({ queryKey: ["pms-card3-meals", restaurantId] });
              setPackageCatalogueOpen(false);
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

function CancellationPolicyFormFields({
  canEdit,
  code,
  setCode,
  name,
  setName,
  description,
  setDescription,
  policyKind,
  setPolicyKind,
  windowValue,
  setWindowValue,
  windowUnit,
  setWindowUnit,
  cutoffTime,
  setCutoffTime,
  penaltyType,
  setPenaltyType,
  penaltyValue,
  setPenaltyValue,
  active,
  setActive,
  idPrefix = "cancel",
}: {
  canEdit: boolean;
  code: string;
  setCode: (value: string) => void;
  name: string;
  setName: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  policyKind: CancellationPolicyKind;
  setPolicyKind: (value: CancellationPolicyKind) => void;
  windowValue: string;
  setWindowValue: (value: string) => void;
  windowUnit: CancellationWindowUnit;
  setWindowUnit: (value: CancellationWindowUnit) => void;
  cutoffTime: string;
  setCutoffTime: (value: string) => void;
  penaltyType: CancellationPenaltyType;
  setPenaltyType: (value: CancellationPenaltyType) => void;
  penaltyValue: string;
  setPenaltyValue: (value: string) => void;
  active: boolean;
  setActive: (value: boolean) => void;
  idPrefix?: string;
}) {
  const showWindow = policyKind !== "non_refundable";
  const showPenaltyValue = penaltyNeedsValue(penaltyType);
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-code`}>Code</Label>
        <Input
          id={`${idPrefix}-code`}
          value={code}
          disabled={!canEdit}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-name`}>Name</Label>
        <Input
          id={`${idPrefix}-name`}
          value={name}
          disabled={!canEdit}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-description`}>Description</Label>
        <Textarea
          id={`${idPrefix}-description`}
          value={description}
          disabled={!canEdit}
          rows={3}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-kind`}>Policy kind</Label>
        <Select
          value={policyKind}
          disabled={!canEdit}
          onValueChange={(next) => {
            const k = next as CancellationPolicyKind;
            setPolicyKind(k);
            if (k === "non_refundable" && penaltyType === "none") {
              setPenaltyType("full_stay");
            }
          }}
        >
          <SelectTrigger id={`${idPrefix}-kind`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[100]">
            {CANCELLATION_POLICY_KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {CANCELLATION_POLICY_KIND_LABELS[kind]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {showWindow ? (
        <>
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-window-value`}>Window</Label>
            <Input
              id={`${idPrefix}-window-value`}
              type="number"
              min={0}
              value={windowValue}
              disabled={!canEdit}
              onChange={(event) => setWindowValue(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-window-unit`}>Window unit</Label>
            <Select
              value={windowUnit}
              disabled={!canEdit}
              onValueChange={(next) => setWindowUnit(next as CancellationWindowUnit)}
            >
              <SelectTrigger id={`${idPrefix}-window-unit`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[100]">
                {CANCELLATION_WINDOW_UNITS.map((unit) => (
                  <SelectItem key={unit} value={unit}>
                    {CANCELLATION_WINDOW_UNIT_LABELS[unit]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-cutoff`}>Cutoff time (property local, optional)</Label>
            <Input
              id={`${idPrefix}-cutoff`}
              type="time"
              value={cutoffTime}
              disabled={!canEdit}
              onChange={(event) => setCutoffTime(event.target.value)}
            />
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-[#C89933]/40 bg-[#FAF8F5] p-3 text-xs text-[#251605]">
          <p className="font-semibold text-[#8A641A] uppercase tracking-wider text-[10px]">
            Cancellation Policy — Non-Refundable
          </p>
          <p className="mt-1 font-medium">
            Free cancellation window does not apply. Any cancellation at any time will forfeit the
            booking according to the cancellation penalty below.
          </p>
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-penalty-type`}>
          {showWindow ? "Penalty after the window" : "Cancellation penalty"}
        </Label>
        <Select
          value={penaltyType}
          disabled={!canEdit}
          onValueChange={(next) => setPenaltyType(next as CancellationPenaltyType)}
        >
          <SelectTrigger id={`${idPrefix}-penalty-type`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[100]">
            {CANCELLATION_PENALTY_TYPES.filter(
              (type) => type !== "percent" && type !== "nights" && type !== "fixed",
            ).map((type) => (
              <SelectItem key={type} value={type}>
                {CANCELLATION_PENALTY_TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {showPenaltyValue ? (
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-penalty-value`}>Penalty value</Label>
          <Input
            id={`${idPrefix}-penalty-value`}
            type="number"
            min={0}
            value={penaltyValue}
            disabled={!canEdit}
            onChange={(event) => setPenaltyValue(event.target.value)}
          />
        </div>
      ) : null}
      <div className="flex items-center justify-between rounded-xl border px-3 py-2">
        <Label htmlFor={`${idPrefix}-active`}>Active</Label>
        <Switch
          id={`${idPrefix}-active`}
          checked={active}
          disabled={!canEdit}
          onCheckedChange={setActive}
        />
      </div>
    </div>
  );
}

function CancellationDrawer({
  open,
  canEdit,
  value,
  configuredPolicies,
  pending,
  initialMode = "catalogue",
  onClose,
  onSave,
  onSavePredefined,
}: {
  open: boolean;
  canEdit: boolean;
  value: RateCancellationPolicyRow | null;
  configuredPolicies: readonly RateCancellationPolicyRow[];
  pending: boolean;
  /** When "custom", open the manual form directly (Rate Plan Create custom). */
  initialMode?: "catalogue" | "custom";
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    code: string;
    name: string;
    description: string;
    policyKind: CancellationPolicyKind;
    windowValue: number | null;
    windowUnit: CancellationWindowUnit;
    cutoffTime: string | null;
    penaltyType: CancellationPenaltyType;
    penaltyValue: number;
    active: boolean;
  }) => void;
  onSavePredefined: (presets: PredefinedCancellationPolicy[]) => Promise<void>;
}) {
  const isEditing = value !== null;
  const [mode, setMode] = useState<"catalogue" | "custom">(
    isEditing ? "catalogue" : initialMode,
  );

  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [description, setDescription] = useState(value?.description ?? "");
  const [policyKind, setPolicyKind] = useState<CancellationPolicyKind>(
    value?.policyKind ?? "flexible",
  );
  const [windowValue, setWindowValue] = useState(String(value?.windowValue ?? 24));
  const [windowUnit, setWindowUnit] = useState<CancellationWindowUnit>(
    value?.windowUnit ?? "hours_before_arrival",
  );
  const [cutoffTime, setCutoffTime] = useState(value?.cutoffTime ?? "");
  const [penaltyType, setPenaltyType] = useState<CancellationPenaltyType>(
    value?.penaltyType ?? "none",
  );
  const [penaltyValue, setPenaltyValue] = useState(String(value?.penaltyValue ?? 0));
  const [active, setActive] = useState(value?.active ?? true);

  const [predefinedSearch, setPredefinedSearch] = useState("");
  const [selectedPresets, setSelectedPresets] = useState<PredefinedCancellationPolicy[]>([]);

  const [customCode, setCustomCode] = useState("");
  const [customName, setCustomName] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [customPolicyKind, setCustomPolicyKind] = useState<CancellationPolicyKind>("flexible");
  const [customWindowValue, setCustomWindowValue] = useState("24");
  const [customWindowUnit, setCustomWindowUnit] =
    useState<CancellationWindowUnit>("hours_before_arrival");
  const [customCutoffTime, setCustomCutoffTime] = useState("");
  const [customPenaltyType, setCustomPenaltyType] = useState<CancellationPenaltyType>("first_night");
  const [customPenaltyValue, setCustomPenaltyValue] = useState("0");
  const [customActive, setCustomActive] = useState(true);
  const [customCodeTouched, setCustomCodeTouched] = useState(false);

  const handleCustomNameChange = (val: string) => {
    setCustomName(val);
    if (!customCodeTouched) {
      const generated = val
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 30);
      setCustomCode(generated);
    }
  };

  const filteredPresets = useMemo(() => {
    const q = predefinedSearch.trim().toLowerCase();
    if (!q) return PREDEFINED_CANCELLATION_POLICIES;
    return PREDEFINED_CANCELLATION_POLICIES.filter(
      (preset) =>
        preset.name.toLowerCase().includes(q) ||
        preset.code.toLowerCase().includes(q) ||
        preset.catalogueKind.toLowerCase().includes(q) ||
        preset.summary.toLowerCase().includes(q) ||
        preset.legacyCodes?.some((c) => c.toLowerCase().includes(q)),
    );
  }, [predefinedSearch]);

  const customPredefinedConflict = useMemo(() => {
    if (!customName.trim() && !customCode.trim()) return undefined;
    return findMatchingPredefinedCancellation(customName, customCode);
  }, [customName, customCode]);

  const customConfiguredConflict = useMemo(() => {
    const trimmedCode = customCode.trim().toUpperCase();
    const trimmedName = customName.trim().toLowerCase();
    if (!trimmedCode && !trimmedName) return false;
    return configuredPolicies.some(
      (row) =>
        (trimmedCode && row.code.trim().toUpperCase() === trimmedCode) ||
        (trimmedName && row.name.trim().toLowerCase() === trimmedName),
    );
  }, [configuredPolicies, customCode, customName]);

  const formPayload = (
    opts: {
      id?: string;
      code: string;
      name: string;
      description: string;
      policyKind: CancellationPolicyKind;
      windowValue: string;
      windowUnit: CancellationWindowUnit;
      cutoffTime: string;
      penaltyType: CancellationPenaltyType;
      penaltyValue: string;
      active: boolean;
    },
  ) => {
    const showWindow = opts.policyKind !== "non_refundable";
    return {
      ...(opts.id ? { id: opts.id } : {}),
      code: opts.code,
      name: opts.name,
      description: opts.description,
      policyKind: opts.policyKind,
      windowValue: showWindow ? Number(opts.windowValue) : null,
      windowUnit: opts.windowUnit,
      cutoffTime: opts.cutoffTime.trim() ? opts.cutoffTime : null,
      penaltyType: opts.penaltyType,
      penaltyValue: penaltyNeedsValue(opts.penaltyType) ? Number(opts.penaltyValue) : 0,
      active: opts.active,
    };
  };

  if (isEditing) {
    return (
      <Card3OverlapSheet
        open={open}
        onClose={onClose}
        className="z-[60]"
        title="Edit cancellation policy"
        description="Reusable window and cutoff. Linked rate plans pick this catalogue. Confirmed reservations keep their snapshot."
        canEdit={canEdit}
        pending={pending}
        submitLabel="Save policy"
        onSubmit={() =>
          onSave(
            formPayload({
              id: value.id,
              code,
              name,
              description,
              policyKind,
              windowValue,
              windowUnit,
              cutoffTime,
              penaltyType,
              penaltyValue,
              active,
            }),
          )
        }
      >
        <CancellationPolicyFormFields
          canEdit={canEdit}
          code={code}
          setCode={setCode}
          name={name}
          setName={setName}
          description={description}
          setDescription={setDescription}
          policyKind={policyKind}
          setPolicyKind={setPolicyKind}
          windowValue={windowValue}
          setWindowValue={setWindowValue}
          windowUnit={windowUnit}
          setWindowUnit={setWindowUnit}
          cutoffTime={cutoffTime}
          setCutoffTime={setCutoffTime}
          penaltyType={penaltyType}
          setPenaltyType={setPenaltyType}
          penaltyValue={penaltyValue}
          setPenaltyValue={setPenaltyValue}
          active={active}
          setActive={setActive}
        />
      </Card3OverlapSheet>
    );
  }

  if (mode === "custom") {
    return (
      <Card3OverlapSheet
        open={open}
        onClose={onClose}
        className="z-[60]"
        title="Create Custom Policy"
        description="Define a property-specific cancellation policy if it is not in the predefined list."
        canEdit={
          canEdit &&
          Boolean(customName.trim()) &&
          Boolean(customCode.trim()) &&
          !customPredefinedConflict &&
          !customConfiguredConflict
        }
        pending={pending}
        submitLabel="Save policy"
        onSubmit={() =>
          onSave(
            formPayload({
              code: customCode.trim(),
              name: customName.trim(),
              description: customDescription,
              policyKind: customPolicyKind,
              windowValue: customWindowValue,
              windowUnit: customWindowUnit,
              cutoffTime: customCutoffTime,
              penaltyType: customPenaltyType,
              penaltyValue: customPenaltyValue,
              active: customActive,
            }),
          )
        }
      >
        <div className="space-y-4">
          {initialMode !== "custom" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 text-xs text-[#8A641A] hover:text-[#251605]"
              onClick={() => setMode("catalogue")}
            >
              <ArrowLeft className="mr-1 size-3.5" /> Back to predefined policies
            </Button>
          ) : null}

          {customPredefinedConflict ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-semibold">
                {customPredefinedConflict.name} is already available in the predefined cancellation
                policies. Select it from the Rate Plan policy list instead of recreating it.
              </p>
              {initialMode !== "custom" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 border-amber-400 bg-white text-xs text-amber-950 hover:bg-amber-100"
                  onClick={() => {
                    setMode("catalogue");
                    setPredefinedSearch(customPredefinedConflict.name);
                  }}
                >
                  Go to predefined {customPredefinedConflict.name}
                </Button>
              ) : null}
            </div>
          ) : null}

          {customConfiguredConflict ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              A cancellation policy with this code or name is already configured for this property.
            </div>
          ) : null}

          <CancellationPolicyFormFields
            idPrefix="custom-cancel"
            canEdit={canEdit}
            code={customCode}
            setCode={(next) => {
              setCustomCodeTouched(true);
              setCustomCode(next);
            }}
            name={customName}
            setName={handleCustomNameChange}
            description={customDescription}
            setDescription={setCustomDescription}
            policyKind={customPolicyKind}
            setPolicyKind={setCustomPolicyKind}
            windowValue={customWindowValue}
            setWindowValue={setCustomWindowValue}
            windowUnit={customWindowUnit}
            setWindowUnit={setCustomWindowUnit}
            cutoffTime={customCutoffTime}
            setCutoffTime={setCustomCutoffTime}
            penaltyType={customPenaltyType}
            setPenaltyType={setCustomPenaltyType}
            penaltyValue={customPenaltyValue}
            setPenaltyValue={setCustomPenaltyValue}
            active={customActive}
            setActive={setCustomActive}
          />
        </div>
      </Card3OverlapSheet>
    );
  }

  const submitText =
    selectedPresets.length > 1
      ? `Add ${selectedPresets.length} Policies`
      : "Add Cancellation Policy";

  return (
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      className="z-[60]"
      title="Add Cancellation Policy"
      description="Choose from NORU's predefined cancellation policies or create a property-specific policy."
      canEdit={canEdit && selectedPresets.length > 0}
      pending={pending}
      submitLabel={submitText}
      onSubmit={() => void onSavePredefined(selectedPresets)}
    >
      <div className="space-y-3.5">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 size-4 text-[#756A5B]" />
          <Input
            placeholder="Search predefined policies..."
            value={predefinedSearch}
            onChange={(e) => setPredefinedSearch(e.target.value)}
            className="pl-9 text-xs"
          />
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#251605]">
            Predefined cancellation policies
          </p>
          <span className="text-[11px] text-muted-foreground">
            {filteredPresets.length} available
          </span>
        </div>

        <div className="grid max-h-[46vh] grid-cols-1 gap-2 overflow-y-auto pr-1">
          {filteredPresets.map((preset) => {
            const isConfigured = isPredefinedCancellationConfigured(preset, configuredPolicies);
            const isSelected = selectedPresets.some((s) => s.code === preset.code);
            return (
              <div
                key={preset.code}
                role="button"
                tabIndex={isConfigured ? -1 : 0}
                onClick={() => {
                  if (isConfigured || !canEdit) return;
                  setSelectedPresets((current) =>
                    isSelected
                      ? current.filter((s) => s.code !== preset.code)
                      : [...current, preset],
                  );
                }}
                className={cn(
                  "flex items-start justify-between gap-2 rounded-lg border p-2.5 text-xs transition-colors",
                  isConfigured
                    ? "cursor-not-allowed border-[#E6E1D8] bg-[#F7F4EE] text-[#756A5B] opacity-60"
                    : isSelected
                      ? "cursor-pointer border-[#C89933] bg-[#FAF8F5] text-[#251605] ring-1 ring-[#C89933]"
                      : "cursor-pointer border-[#E6E1D8] bg-white text-[#251605] hover:border-[#C89933]/60",
                )}
              >
                <div className="flex min-w-0 items-start gap-2">
                  <input
                    type="checkbox"
                    checked={isConfigured || isSelected}
                    disabled={isConfigured || !canEdit}
                    onChange={() => {
                      if (isConfigured || !canEdit) return;
                      setSelectedPresets((current) =>
                        isSelected
                          ? current.filter((s) => s.code !== preset.code)
                          : [...current, preset],
                      );
                    }}
                    className="mt-0.5 rounded border-[#CCCCCC] text-[#C89933] focus:ring-[#C89933]"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{preset.name}</span>
                      <span className="rounded-full bg-[#F4EDE0] px-1.5 py-0.5 text-[10px] font-semibold text-[#8A641A]">
                        {preset.catalogueKind}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-[#756A5B]">
                      {cancellationPresetDetailLine(preset)}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      {preset.code}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 pt-0.5 text-[11px]">
                  {isConfigured ? (
                    <span className="font-semibold text-emerald-700">Added ✓</span>
                  ) : isSelected ? (
                    <Check className="size-3.5 text-[#8A641A]" />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col items-center justify-between gap-2 border-t border-[#E6E1D8] pt-3 sm:flex-row">
          <p className="text-xs text-[#756A5B]">Can&apos;t find the policy you need?</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canEdit}
            className="h-8 border-[#C89933]/50 text-xs text-[#8A641A] hover:bg-[#FAF8F5]"
            onClick={() => {
              setMode("custom");
              setCustomName("");
              setCustomCode("");
              setCustomDescription("");
              setCustomCodeTouched(false);
              setCustomPolicyKind("flexible");
              setCustomWindowValue("24");
              setCustomWindowUnit("hours_before_arrival");
              setCustomCutoffTime("");
              setCustomPenaltyType("first_night");
              setCustomPenaltyValue("0");
              setCustomActive(true);
            }}
          >
            <Plus className="mr-1 size-3.5" /> Create Custom Policy
          </Button>
        </div>
      </div>
    </Card3OverlapSheet>
  );
}

/** @deprecated Standalone Refundability catalogue removed from Rate & Pricing UI.
 * Legacy rows may still load via snapshot.refundabilityCodes / rate-plan refundability_id.
 * Creating/editing refundability codes is no longer exposed.
 */

function NoShowDrawer({
  open,
  canEdit,
  value,
  currencyCode,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  value: RateNoShowPolicyRow | null;
  currencyCode: string;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    code: string;
    name: string;
    description: string;
    penaltyType: PolicyPenaltyType;
    penaltyValue: number;
    releaseHour: number;
    isDefault: boolean;
    active: boolean;
  }) => void;
}) {
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [description, setDescription] = useState(value?.description ?? "");
  const [penaltyType, setPenaltyType] = useState<PolicyPenaltyType>(
    value?.penaltyType ?? "first_night",
  );
  const [penaltyValue, setPenaltyValue] = useState(String(value?.penaltyValue ?? 0));
  const [releaseHour, setReleaseHour] = useState(String(value?.releaseHour ?? 18));
  const [isDefault, setIsDefault] = useState(value?.isDefault ?? false);
  const [active, setActive] = useState(value?.active ?? true);

  const preview = buildNoShowPolicyPreview(
    penaltyType,
    Number(penaltyValue) || 0,
    Number(releaseHour) || 18,
  );

  return (
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      className="z-[60]"
      title={value ? "Edit no-show policy" : "Add no-show policy"}
      description="Defines the charge and unclaimed room release time when a guest fails to arrive."
      canEdit={canEdit}
      pending={pending}
      submitLabel="Save no-show policy"
      onSubmit={() =>
        onSave({
          ...(value ? { id: value.id } : {}),
          code: code.trim().toUpperCase(),
          name: name.trim(),
          description: description.trim() || "",
          penaltyType,
          penaltyValue:
            penaltyType === "percent_stay" || penaltyType === "fixed_amount"
              ? Number(penaltyValue) || 0
              : 0,
          releaseHour: Math.max(0, Math.min(23, Number(releaseHour) || 18)),
          isDefault,
          active,
        })
      }
    >
      <div className="space-y-3">
        <div className="rounded-xl border border-[#C89933]/40 bg-[#FAF8F5] p-3 text-xs text-[#251605]">
          <p className="font-semibold text-[#8A641A] uppercase tracking-wider text-[10px]">
            Operational Preview
          </p>
          <p className="mt-1 font-medium">{preview}</p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="ns-code">Code</Label>
          <Input
            id="ns-code"
            value={code}
            maxLength={30}
            disabled={!canEdit}
            placeholder="e.g. NS_1N, NS_FULL, NS_FREE"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ns-name">Name</Label>
          <Input
            id="ns-name"
            value={name}
            maxLength={120}
            disabled={!canEdit}
            placeholder="e.g. Standard First Night No-Show"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ns-release">Release time (hour of arrival day)</Label>
          <Input
            id="ns-release"
            type="number"
            min={0}
            max={23}
            value={releaseHour}
            disabled={!canEdit}
            placeholder="18"
            onChange={(e) => setReleaseHour(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ns-penalty">Penalty Type</Label>
          <Select
            value={penaltyType}
            onValueChange={(val) => setPenaltyType(val as PolicyPenaltyType)}
            disabled={!canEdit}
          >
            <SelectTrigger id="ns-penalty">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[100]">
              {POLICY_PENALTY_TYPES.map((pt) => (
                <SelectItem key={pt} value={pt}>
                  {POLICY_PENALTY_TYPE_LABELS[pt]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {(penaltyType === "percent_stay" || penaltyType === "fixed_amount") && (
          <div className="space-y-1">
            <Label htmlFor="ns-value">
              {penaltyType === "percent_stay"
                ? "Penalty Percentage (%)"
                : `Fixed Penalty (${currencyCode})`}
            </Label>
            <Input
              id="ns-value"
              type="number"
              min={0}
              max={penaltyType === "percent_stay" ? 100 : undefined}
              step="0.01"
              value={penaltyValue}
              disabled={!canEdit}
              onChange={(e) => setPenaltyValue(e.target.value)}
            />
          </div>
        )}
        <div className="flex items-center justify-between rounded-xl border px-3 py-2">
          <Label htmlFor="ns-default">Default Policy</Label>
          <Switch
            id="ns-default"
            checked={isDefault}
            disabled={!canEdit}
            onCheckedChange={setIsDefault}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ns-description">Description</Label>
          <Textarea
            id="ns-description"
            value={description}
            maxLength={500}
            disabled={!canEdit}
            rows={3}
            placeholder="Operational notes or front desk instructions"
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between rounded-xl border px-3 py-2">
          <Label htmlFor="ns-active">Active</Label>
          <Switch id="ns-active" checked={active} disabled={!canEdit} onCheckedChange={setActive} />
        </div>
      </div>
    </Card3OverlapSheet>
  );
}

function EarlyDeparturePolicyFormFields({
  canEdit,
  currencyCode,
  code,
  setCode,
  name,
  setName,
  description,
  setDescription,
  penaltyType,
  setPenaltyType,
  penaltyValue,
  setPenaltyValue,
  active,
  setActive,
  idPrefix = "ed",
}: {
  canEdit: boolean;
  currencyCode: string;
  code: string;
  setCode: (value: string) => void;
  name: string;
  setName: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  penaltyType: EarlyDeparturePenaltyType;
  setPenaltyType: (value: EarlyDeparturePenaltyType) => void;
  penaltyValue: string;
  setPenaltyValue: (value: string) => void;
  active: boolean;
  setActive: (value: boolean) => void;
  idPrefix?: string;
}) {
  const needsValue = penaltyType === "percent_stay" || penaltyType === "fixed_amount";
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-code`}>Code</Label>
        <Input
          id={`${idPrefix}-code`}
          value={code}
          maxLength={30}
          disabled={!canEdit}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-name`}>Name</Label>
        <Input
          id={`${idPrefix}-name`}
          value={name}
          maxLength={120}
          disabled={!canEdit}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-penalty`}>Penalty type</Label>
        <Select
          value={penaltyType}
          disabled={!canEdit}
          onValueChange={(next) => setPenaltyType(next as EarlyDeparturePenaltyType)}
        >
          <SelectTrigger id={`${idPrefix}-penalty`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[100]">
            {EARLY_DEPARTURE_PENALTY_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {EARLY_DEPARTURE_PENALTY_TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {needsValue ? (
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-value`}>
            {penaltyType === "percent_stay" ? "Percentage" : `Fixed amount (${currencyCode})`}
          </Label>
          <Input
            id={`${idPrefix}-value`}
            type="number"
            min={0}
            max={penaltyType === "percent_stay" ? 100 : undefined}
            step="0.01"
            value={penaltyValue}
            disabled={!canEdit}
            onChange={(event) => setPenaltyValue(event.target.value)}
          />
        </div>
      ) : null}
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-description`}>Description</Label>
        <Textarea
          id={`${idPrefix}-description`}
          value={description}
          maxLength={500}
          rows={3}
          disabled={!canEdit}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <div className="flex items-center justify-between rounded-xl border px-3 py-2">
        <Label htmlFor={`${idPrefix}-active`}>Active</Label>
        <Switch
          id={`${idPrefix}-active`}
          checked={active}
          disabled={!canEdit}
          onCheckedChange={setActive}
        />
      </div>
    </div>
  );
}

function EarlyDepartureDrawer({
  open,
  canEdit,
  value,
  configuredPolicies,
  currencyCode,
  pending,
  initialMode = "catalogue",
  onClose,
  onSave,
  onSavePredefined,
}: {
  open: boolean;
  canEdit: boolean;
  value: RateEarlyDeparturePolicyRow | null;
  configuredPolicies: readonly RateEarlyDeparturePolicyRow[];
  currencyCode: string;
  pending: boolean;
  /** When "custom", open the manual form directly (Rate Plan Create custom). */
  initialMode?: "catalogue" | "custom";
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    code: string;
    name: string;
    description: string;
    penaltyType: EarlyDeparturePenaltyType;
    penaltyValue: number;
    active: boolean;
  }) => void;
  onSavePredefined: (presets: PredefinedEarlyDeparturePolicy[]) => Promise<void>;
}) {
  const isEditing = value !== null;
  const [mode, setMode] = useState<"catalogue" | "custom">(
    isEditing ? "catalogue" : initialMode,
  );

  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [description, setDescription] = useState(value?.description ?? "");
  const [penaltyType, setPenaltyType] = useState<EarlyDeparturePenaltyType>(
    value?.penaltyType ?? "none",
  );
  const [penaltyValue, setPenaltyValue] = useState(String(value?.penaltyValue ?? 0));
  const [active, setActive] = useState(value?.active ?? true);

  const [predefinedSearch, setPredefinedSearch] = useState("");
  const [selectedPresets, setSelectedPresets] = useState<PredefinedEarlyDeparturePolicy[]>([]);

  const [customCode, setCustomCode] = useState("");
  const [customName, setCustomName] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [customPenaltyType, setCustomPenaltyType] = useState<EarlyDeparturePenaltyType>("none");
  const [customPenaltyValue, setCustomPenaltyValue] = useState("0");
  const [customActive, setCustomActive] = useState(true);
  const [customCodeTouched, setCustomCodeTouched] = useState(false);

  const handleCustomNameChange = (val: string) => {
    setCustomName(val);
    if (!customCodeTouched) {
      const generated = val
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 30);
      setCustomCode(generated);
    }
  };

  const filteredPresets = useMemo(() => {
    const q = predefinedSearch.trim().toLowerCase();
    if (!q) return PREDEFINED_EARLY_DEPARTURE_POLICIES;
    return PREDEFINED_EARLY_DEPARTURE_POLICIES.filter(
      (preset) =>
        preset.name.toLowerCase().includes(q) ||
        preset.code.toLowerCase().includes(q) ||
        preset.summary.toLowerCase().includes(q) ||
        preset.legacyCodes?.some((c) => c.toLowerCase().includes(q)),
    );
  }, [predefinedSearch]);

  const customPredefinedConflict = useMemo(() => {
    if (!customName.trim() && !customCode.trim()) return undefined;
    return findMatchingPredefinedEarlyDeparture(customName, customCode);
  }, [customName, customCode]);

  const customConfiguredConflict = useMemo(() => {
    const trimmedCode = customCode.trim().toUpperCase();
    const trimmedName = customName.trim().toLowerCase();
    if (!trimmedCode && !trimmedName) return false;
    return configuredPolicies.some(
      (row) =>
        (trimmedCode && row.code.trim().toUpperCase() === trimmedCode) ||
        (trimmedName && row.name.trim().toLowerCase() === trimmedName),
    );
  }, [configuredPolicies, customCode, customName]);

  const savePayload = (opts: {
    id?: string;
    code: string;
    name: string;
    description: string;
    penaltyType: EarlyDeparturePenaltyType;
    penaltyValue: string;
    active: boolean;
  }) => {
    const needsValue = opts.penaltyType === "percent_stay" || opts.penaltyType === "fixed_amount";
    return {
      ...(opts.id ? { id: opts.id } : {}),
      code: opts.code.trim().toUpperCase(),
      name: opts.name.trim(),
      description: opts.description.trim(),
      penaltyType: opts.penaltyType,
      penaltyValue: needsValue ? Number(opts.penaltyValue) || 0 : 0,
      active: opts.active,
    };
  };

  if (isEditing) {
    return (
      <Card3OverlapSheet
        open={open}
        onClose={onClose}
        className="z-[60]"
        title="Edit early departure policy"
        description="Applies when a guest leaves before the booked departure date. Check-in/out times stay in Property Setup."
        canEdit={canEdit}
        pending={pending}
        submitLabel="Save early departure policy"
        onSubmit={() =>
          onSave(
            savePayload({
              id: value.id,
              code,
              name,
              description,
              penaltyType,
              penaltyValue,
              active,
            }),
          )
        }
      >
        <EarlyDeparturePolicyFormFields
          canEdit={canEdit}
          currencyCode={currencyCode}
          code={code}
          setCode={setCode}
          name={name}
          setName={setName}
          description={description}
          setDescription={setDescription}
          penaltyType={penaltyType}
          setPenaltyType={setPenaltyType}
          penaltyValue={penaltyValue}
          setPenaltyValue={setPenaltyValue}
          active={active}
          setActive={setActive}
        />
      </Card3OverlapSheet>
    );
  }

  if (mode === "custom") {
    const customNeedsValue =
      customPenaltyType === "percent_stay" || customPenaltyType === "fixed_amount";
    return (
      <Card3OverlapSheet
        open={open}
        onClose={onClose}
        className="z-[60]"
        title="Create Custom Policy"
        description="Define a property-specific early departure policy if it is not in the predefined list."
        canEdit={
          canEdit &&
          Boolean(customName.trim()) &&
          Boolean(customCode.trim()) &&
          !customPredefinedConflict &&
          !customConfiguredConflict &&
          (!customNeedsValue || Number(customPenaltyValue) > 0)
        }
        pending={pending}
        submitLabel="Create Policy"
        onSubmit={() =>
          onSave(
            savePayload({
              code: customCode,
              name: customName,
              description: customDescription,
              penaltyType: customPenaltyType,
              penaltyValue: customPenaltyValue,
              active: customActive,
            }),
          )
        }
      >
        <div className="space-y-4">
          {initialMode !== "custom" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 text-xs text-[#8A641A] hover:text-[#251605]"
              onClick={() => setMode("catalogue")}
            >
              <ArrowLeft className="mr-1 size-3.5" /> Back to predefined policies
            </Button>
          ) : null}

          {customPredefinedConflict ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-semibold">
                {customPredefinedConflict.name} is already available in the predefined early
                departure policies. Select it from the Rate Plan policy list instead of recreating
                it.
              </p>
              {initialMode !== "custom" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 border-amber-400 bg-white text-xs text-amber-950 hover:bg-amber-100"
                  onClick={() => {
                    setMode("catalogue");
                    setPredefinedSearch(customPredefinedConflict.name);
                  }}
                >
                  Go to predefined {customPredefinedConflict.name}
                </Button>
              ) : null}
            </div>
          ) : null}

          {customConfiguredConflict ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              An early departure policy with this code or name is already configured for this
              property.
            </div>
          ) : null}

          <EarlyDeparturePolicyFormFields
            idPrefix="custom-ed"
            canEdit={canEdit}
            currencyCode={currencyCode}
            code={customCode}
            setCode={(next) => {
              setCustomCodeTouched(true);
              setCustomCode(next);
            }}
            name={customName}
            setName={handleCustomNameChange}
            description={customDescription}
            setDescription={setCustomDescription}
            penaltyType={customPenaltyType}
            setPenaltyType={setCustomPenaltyType}
            penaltyValue={customPenaltyValue}
            setPenaltyValue={setCustomPenaltyValue}
            active={customActive}
            setActive={setCustomActive}
          />
        </div>
      </Card3OverlapSheet>
    );
  }

  const submitText =
    selectedPresets.length > 1
      ? `Add ${selectedPresets.length} Policies`
      : "Add Selected Policies";

  return (
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      className="z-[60]"
      title="Add Early Departure Policy"
      description="Choose predefined early-departure terms for guests who leave before the booked departure date."
      canEdit={canEdit && selectedPresets.length > 0}
      pending={pending}
      submitLabel={submitText}
      onSubmit={() => void onSavePredefined(selectedPresets)}
    >
      <div className="space-y-3.5">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 size-4 text-[#756A5B]" />
          <Input
            placeholder="Search predefined policies..."
            value={predefinedSearch}
            onChange={(e) => setPredefinedSearch(e.target.value)}
            className="pl-9 text-xs"
          />
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#251605]">
            Predefined early departure policies
          </p>
          <span className="text-[11px] text-muted-foreground">
            {filteredPresets.length} available
          </span>
        </div>

        <div className="grid max-h-[46vh] grid-cols-1 gap-2 overflow-y-auto pr-1">
          {filteredPresets.map((preset) => {
            const isConfigured = isPredefinedEarlyDepartureConfigured(preset, configuredPolicies);
            const isSelected = selectedPresets.some((s) => s.code === preset.code);
            return (
              <div
                key={preset.code}
                role="button"
                tabIndex={isConfigured ? -1 : 0}
                onClick={() => {
                  if (isConfigured || !canEdit) return;
                  setSelectedPresets((current) =>
                    isSelected
                      ? current.filter((s) => s.code !== preset.code)
                      : [...current, preset],
                  );
                }}
                className={cn(
                  "flex items-start justify-between gap-2 rounded-lg border p-2.5 text-xs transition-colors",
                  isConfigured
                    ? "cursor-not-allowed border-[#E6E1D8] bg-[#F7F4EE] text-[#756A5B] opacity-60"
                    : isSelected
                      ? "cursor-pointer border-[#C89933] bg-[#FAF8F5] text-[#251605] ring-1 ring-[#C89933]"
                      : "cursor-pointer border-[#E6E1D8] bg-white text-[#251605] hover:border-[#C89933]/60",
                )}
              >
                <div className="flex min-w-0 items-start gap-2">
                  <input
                    type="checkbox"
                    checked={isConfigured || isSelected}
                    disabled={isConfigured || !canEdit}
                    onChange={() => {
                      if (isConfigured || !canEdit) return;
                      setSelectedPresets((current) =>
                        isSelected
                          ? current.filter((s) => s.code !== preset.code)
                          : [...current, preset],
                      );
                    }}
                    className="mt-0.5 rounded border-[#CCCCCC] text-[#C89933] focus:ring-[#C89933]"
                  />
                  <div className="min-w-0">
                    <p className="font-medium">{preset.name}</p>
                    <p className="mt-0.5 text-[11px] text-[#756A5B]">{preset.summary}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      {preset.code}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 pt-0.5 text-[11px]">
                  {isConfigured ? (
                    <span className="font-semibold text-emerald-700">Added ✓</span>
                  ) : isSelected ? (
                    <Check className="size-3.5 text-[#8A641A]" />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col items-center justify-between gap-2 border-t border-[#E6E1D8] pt-3 sm:flex-row">
          <p className="text-xs text-[#756A5B]">Can&apos;t find the policy you need?</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canEdit}
            className="h-8 border-[#C89933]/50 text-xs text-[#8A641A] hover:bg-[#FAF8F5]"
            onClick={() => {
              setMode("custom");
              setCustomName("");
              setCustomCode("");
              setCustomDescription("");
              setCustomCodeTouched(false);
              setCustomPenaltyType("none");
              setCustomPenaltyValue("0");
              setCustomActive(true);
            }}
          >
            <Plus className="mr-1 size-3.5" /> Create Custom Policy
          </Button>
        </div>
      </div>
    </Card3OverlapSheet>
  );
}

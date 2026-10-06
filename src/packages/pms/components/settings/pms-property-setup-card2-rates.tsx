import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { ArrowLeft, Check, Plus, Search } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
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
  Card3ListSection,
  Card3OverlapSheet,
  Card3StatusDot,
} from "@/packages/pms/components/settings/pms-property-setup-card3-primitives";
import type { PropertySetupCardStatus } from "@/packages/pms/lib/pms-property-setup-card1";
import {
  getRatesCard2,
  saveRateCancellationPolicyCard2,
  saveRateCategoryCard2,
  saveRateNoShowPolicyCard2,
  saveRatePlanCard2,
  saveRateRefundabilityCard2,
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
  PREDEFINED_RATE_CATEGORIES,
  RATE_REFUNDABILITY_KINDS,
  buildNoShowPolicyPreview,
  findMatchingPredefinedCategory,
  isPredefinedCategoryConfigured,
  type CancellationPenaltyType,
  type CancellationPolicyKind,
  type CancellationWindowUnit,
  type PolicyPenaltyType,
  type PredefinedRateCategory,
  type RateCancellationPolicyRow,
  type RateCategoryRow,
  type RateNoShowPolicyRow,
  type RatePlanRow,
  type RateRefundabilityKind,
  type RateRefundabilityRow,
  type RatesCard2Snapshot,
} from "@/packages/pms/lib/rates-card2.server";
import { penaltyNeedsValue } from "@/packages/pms/lib/cancellation-policy-rules";
import { formatRateValidity } from "@/packages/pms/lib/pms-property-setup-card2";
import { cn } from "@/shared/lib/utils";

const NONE = "__none__";
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
  const saveRefundability = useServerFn(saveRateRefundabilityCard2);
  const saveNoShow = useServerFn(saveRateNoShowPolicyCard2);

  const [categorySearch, setCategorySearch] = useState("");
  const [planSearch, setPlanSearch] = useState("");
  const [cancelSearch, setCancelSearch] = useState("");
  const [refundSearch, setRefundSearch] = useState("");
  const [noShowSearch, setNoShowSearch] = useState("");
  const [categoryDraft, setCategoryDraft] = useState<RateCategoryRow | "new" | null>(null);
  const [planDraft, setPlanDraft] = useState<RatePlanRow | "new" | null>(null);
  const [batchPending, setBatchPending] = useState(false);
  const [cancelDraft, setCancelDraft] = useState<RateCancellationPolicyRow | "new" | null>(null);
  const [refundDraft, setRefundDraft] = useState<RateRefundabilityRow | "new" | null>(null);
  const [noShowDraft, setNoShowDraft] = useState<RateNoShowPolicyRow | "new" | null>(null);

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
  const noShowPolicies = snapshot?.noShowPolicies ?? [];
  const currencyCode = snapshot?.currencyCode ?? "USD";

  useEffect(() => {
    if (readiness && onReadiness) {
      onReadiness(readiness.status, readiness.blockers, []);
    }
  }, [readiness, onReadiness]);

  const filteredCategories = useMemo(
    () => categories.filter((row) => matchesQuery(categorySearch, row.code, row.name)),
    [categories, categorySearch],
  );

  const filteredPlans = useMemo(
    () =>
      plans.filter((row) =>
        matchesQuery(
          planSearch,
          row.code,
          row.name,
          row.categoryName,
          row.roomTypeCode,
          row.roomTypeName,
        ),
      ),
    [plans, planSearch],
  );

  const filteredCancellations = useMemo(
    () => cancellationPolicies.filter((row) => matchesQuery(cancelSearch, row.code, row.name)),
    [cancellationPolicies, cancelSearch],
  );
  const filteredRefundability = useMemo(
    () => refundabilityCodes.filter((row) => matchesQuery(refundSearch, row.code, row.name)),
    [refundabilityCodes, refundSearch],
  );
  const filteredNoShowPolicies = useMemo(
    () =>
      noShowPolicies.filter((row) =>
        matchesQuery(
          noShowSearch,
          row.code,
          row.name,
          row.description ?? "",
          POLICY_PENALTY_TYPE_LABELS[row.penaltyType] ?? row.penaltyType,
        ),
      ),
    [noShowPolicies, noShowSearch],
  );

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["pms-card2-rates", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["pms-no-show-policies", restaurantId] });
  }

  const categoryMut = useMutation({
    mutationFn: (input: Parameters<typeof saveCategory>[0]["data"]) =>
      saveCategory({ data: input }),
    onSuccess: () => {
      toast.success("Rate category saved.");
      setCategoryDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function handleSavePredefined(presets: PredefinedRateCategory[]) {
    setBatchPending(true);
    try {
      for (const preset of presets) {
        await saveCategory({
          data: {
            restaurantId,
            code: preset.code,
            name: preset.persistedName,
            active: true,
          },
        });
      }
      toast.success(
        presets.length === 1
          ? `Added ${presets[0].name}.`
          : `Added ${presets.length} rate categories.`,
      );
      setCategoryDraft(null);
      invalidate();
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to add rate category.");
    } finally {
      setBatchPending(false);
    }
  }

  const planMut = useMutation({
    mutationFn: (input: Parameters<typeof savePlan>[0]["data"]) => savePlan({ data: input }),
    onSuccess: () => {
      toast.success("Rate plan saved.");
      setPlanDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const cancelMut = useMutation({
    mutationFn: (input: Parameters<typeof saveCancellation>[0]["data"]) =>
      saveCancellation({ data: input }),
    onSuccess: () => {
      toast.success("Cancellation policy saved.");
      setCancelDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const refundMut = useMutation({
    mutationFn: (input: Parameters<typeof saveRefundability>[0]["data"]) =>
      saveRefundability({ data: input }),
    onSuccess: () => {
      toast.success("Refundability saved.");
      setRefundDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const noShowMut = useMutation({
    mutationFn: (input: Parameters<typeof saveNoShow>[0]["data"]) =>
      saveNoShow({ data: input }),
    onSuccess: () => {
      toast.success("No-show policy saved.");
      setNoShowDraft(null);
      invalidate();
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

          <Card3ListSection
            title="Rate categories"
            helper="Choose from NORU's predefined hotel rate categories or create a property-specific category."
            icon="tag"
            search={categorySearch}
            onSearch={setCategorySearch}
            placeholder="Search rate categories"
            addLabel="Add category"
            onAdd={() => setCategoryDraft("new")}
            canEdit={canEdit}
            empty="No rate categories yet."
            columns={["Code", "Name", "Status"]}
            rows={filteredCategories.map((row) => ({
              id: row.id,
              cells: [row.code, row.name, <Card3StatusDot key="status" active={row.active} />],
              onEdit: () => setCategoryDraft(row),
            }))}
          />

          <Card3ListSection
            title="Room rates"
            icon="money"
            search={planSearch}
            onSearch={setPlanSearch}
            placeholder="Search rate plans"
            addLabel="Add rate plan"
            onAdd={() => setPlanDraft("new")}
            canEdit={canEdit}
            empty="No room rates yet. Create a category, then a plan on a Card 2 room type."
            columns={[
              "Code",
              "Name",
              "Category",
              "Room type",
              "Validity",
              "Meal plan",
              "Base rate",
              "Status",
            ]}
            rows={filteredPlans.map((row) => ({
              id: row.id,
              cells: [
                row.code,
                row.name,
                row.categoryName || row.categoryId,
                `${row.roomTypeCode} ${row.roomTypeName}`.trim(),
                formatRateValidity(row.validFrom, row.validTo),
                row.mealPlanName || "—",
                String(row.baseRate),
                <Card3StatusDot key="status" active={row.active} />,
              ],
              onEdit: () => setPlanDraft(row),
            }))}
          />

          <Card3ListSection
            title="Cancellation policies"
            icon="tag"
            search={cancelSearch}
            onSearch={setCancelSearch}
            placeholder="Search cancellation policies"
            addLabel="Add cancellation policy"
            onAdd={() => setCancelDraft("new")}
            canEdit={canEdit}
            empty="No cancellation policies yet. Optional on rate plans."
            columns={["Code", "Name", "Kind", "Window", "Status"]}
            rows={filteredCancellations.map((row) => ({
              id: row.id,
              cells: [
                row.code,
                row.name,
                CANCELLATION_POLICY_KIND_LABELS[row.policyKind],
                row.policyKind === "non_refundable"
                  ? "—"
                  : row.windowValue == null
                    ? "—"
                    : `${row.windowValue} ${CANCELLATION_WINDOW_UNIT_LABELS[row.windowUnit].toLowerCase()}`,
                <Card3StatusDot key="status" active={row.active} />,
              ],
              onEdit: () => setCancelDraft(row),
            }))}
          />

          <Card3ListSection
            title="Refundability"
            icon="tag"
            search={refundSearch}
            onSearch={setRefundSearch}
            placeholder="Search refundability"
            addLabel="Add refundability"
            onAdd={() => setRefundDraft("new")}
            canEdit={canEdit}
            empty="No refundability codes yet. Optional on rate plans."
            columns={["Code", "Name", "Kind", "Status"]}
            rows={filteredRefundability.map((row) => ({
              id: row.id,
              cells: [
                row.code,
                row.name,
                REFUNDABILITY_KIND_LABELS[row.kind],
                <Card3StatusDot key="status" active={row.active} />,
              ],
              onEdit: () => setRefundDraft(row),
            }))}
          />

          <Card3ListSection
            title="No-show policies"
            icon="checklist"
            search={noShowSearch}
            onSearch={setNoShowSearch}
            placeholder="Search no-show policies"
            addLabel="Add no-show policy"
            onAdd={() => setNoShowDraft("new")}
            canEdit={canEdit}
            empty="No no-show policies yet. Defines charge and release time when a guest fails to arrive."
            columns={[
              "Code",
              "Name",
              "Release time",
              "Penalty",
              "Default",
              "Status",
            ]}
            rows={filteredNoShowPolicies.map((row) => ({
              id: row.id,
              cells: [
                row.code,
                row.name,
                `${String(row.releaseHour).padStart(2, "0")}:00`,
                row.penaltyType === "percent_stay"
                  ? `${row.penaltyValue}% stay`
                  : row.penaltyType === "fixed_amount"
                    ? `${currencyCode} ${row.penaltyValue}`
                    : POLICY_PENALTY_TYPE_LABELS[row.penaltyType] ?? row.penaltyType,
                row.isDefault ? "Default" : "—",
                <Card3StatusDot key="status" active={row.active} />,
              ],
              onEdit: () => setNoShowDraft(row),
            }))}
          />

          <CategoryDrawer
            key={categoryDraft === "new" ? "cat-new" : (categoryDraft?.id ?? "cat-closed")}
            open={categoryDraft !== null}
            canEdit={canEdit}
            value={categoryDraft === "new" || categoryDraft === null ? null : categoryDraft}
            configuredCategories={categories}
            pending={categoryMut.isPending || batchPending}
            onClose={() => setCategoryDraft(null)}
            onSave={(payload) => categoryMut.mutate({ restaurantId, ...payload })}
            onSavePredefined={handleSavePredefined}
          />

          <PlanDrawer
            key={planDraft === "new" ? "plan-new" : (planDraft?.id ?? "plan-closed")}
            open={planDraft !== null}
            canEdit={canEdit}
            categories={categories}
            roomTypes={roomTypes}
            mealPlans={mealPlans}
            cancellationPolicies={cancellationPolicies}
            refundabilityCodes={refundabilityCodes}
            value={planDraft === "new" || planDraft === null ? null : planDraft}
            pending={planMut.isPending}
            onClose={() => setPlanDraft(null)}
            onSave={(payload) => planMut.mutate({ restaurantId, ...payload })}
          />

          <CancellationDrawer
            key={cancelDraft === "new" ? "cancel-new" : (cancelDraft?.id ?? "cancel-closed")}
            open={cancelDraft !== null}
            canEdit={canEdit}
            value={cancelDraft === "new" || cancelDraft === null ? null : cancelDraft}
            pending={cancelMut.isPending}
            onClose={() => setCancelDraft(null)}
            onSave={(payload) => cancelMut.mutate({ restaurantId, ...payload })}
          />

          <RefundabilityDrawer
            key={refundDraft === "new" ? "refund-new" : (refundDraft?.id ?? "refund-closed")}
            open={refundDraft !== null}
            canEdit={canEdit}
            value={refundDraft === "new" || refundDraft === null ? null : refundDraft}
            pending={refundMut.isPending}
            onClose={() => setRefundDraft(null)}
            onSave={(payload) => refundMut.mutate({ restaurantId, ...payload })}
          />

          <NoShowDrawer
            key={noShowDraft === "new" ? "ns-new" : (noShowDraft?.id ?? "ns-closed")}
            open={noShowDraft !== null}
            canEdit={canEdit}
            value={noShowDraft === "new" || noShowDraft === null ? null : noShowDraft}
            currencyCode={currencyCode}
            pending={noShowMut.isPending}
            onClose={() => setNoShowDraft(null)}
            onSave={(payload) => noShowMut.mutate({ restaurantId, ...payload })}
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
  onSave: (payload: { id?: string; code: string; name: string; active: boolean; isCustom?: boolean }) => void;
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
                {customPredefinedConflict.name} is already available in the predefined Rate Categories. Select it from the predefined list.
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
    selectedPresets.length > 1
      ? `Add ${selectedPresets.length} Categories`
      : "Add Category";

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

function PlanDrawer({
  open,
  canEdit,
  categories,
  roomTypes,
  mealPlans,
  cancellationPolicies,
  refundabilityCodes,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  categories: RateCategoryRow[];
  roomTypes: RatesCard2Snapshot["roomTypes"];
  mealPlans: RatesCard2Snapshot["mealPlans"];
  cancellationPolicies: RateCancellationPolicyRow[];
  refundabilityCodes: RateRefundabilityRow[];
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
    active: boolean;
  }) => void;
}) {
  const [categoryId, setCategoryId] = useState(value?.categoryId ?? categories[0]?.id ?? "");
  const [roomTypeId, setRoomTypeId] = useState(value?.roomTypeId ?? roomTypes[0]?.id ?? "");
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [description, setDescription] = useState(value?.description ?? "");
  const [baseRate, setBaseRate] = useState(value?.baseRate ?? 0);
  const [validFrom, setValidFrom] = useState(value?.validFrom ?? "");
  const [validTo, setValidTo] = useState(value?.validTo ?? "");
  const [mealPlanId, setMealPlanId] = useState(value?.mealPlanId ?? NONE);
  const [cancellationPolicyId, setCancellationPolicyId] = useState(
    value?.cancellationPolicyId ?? NONE,
  );
  const [refundabilityId, setRefundabilityId] = useState(value?.refundabilityId ?? NONE);
  const [active, setActive] = useState(value?.active ?? true);

  return (
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      title={value ? "Edit rate plan" : "Add rate plan"}
      description="Choose an existing Card 2 room type. Setup changes do not reprice confirmed reservations."
      canEdit={canEdit && Boolean(categoryId) && Boolean(roomTypeId)}
      pending={pending}
      submitLabel="Save rate plan"
      onSubmit={() =>
        onSave({
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
          refundabilityId: optionalId(refundabilityId),
          active,
        })
      }
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>Category</Label>
          <Select value={categoryId} disabled={!canEdit} onValueChange={setCategoryId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.code} — {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Room type (Card 2)</Label>
          <Select value={roomTypeId} disabled={!canEdit} onValueChange={setRoomTypeId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a room type" />
            </SelectTrigger>
            <SelectContent>
              {roomTypes.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.code} — {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="plan-code">Code</Label>
          <Input
            id="plan-code"
            value={code}
            disabled={!canEdit}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="plan-name">Name</Label>
          <Input
            id="plan-name"
            value={name}
            disabled={!canEdit}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="plan-description">Description</Label>
          <Textarea
            id="plan-description"
            value={description}
            disabled={!canEdit}
            rows={3}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
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
        <div className="space-y-1">
          <Label>Meal plan</Label>
          <Select value={mealPlanId} disabled={!canEdit} onValueChange={setMealPlanId}>
            <SelectTrigger>
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>None</SelectItem>
              {mealPlans.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.code} — {row.name}
                  {row.includesBreakfast ? " (breakfast)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Cancellation policy</Label>
          <Select
            value={cancellationPolicyId}
            disabled={!canEdit}
            onValueChange={setCancellationPolicyId}
          >
            <SelectTrigger>
              <SelectValue placeholder="None" />
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
        <div className="space-y-1">
          <Label>Refundability</Label>
          <Select value={refundabilityId} disabled={!canEdit} onValueChange={setRefundabilityId}>
            <SelectTrigger>
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>None</SelectItem>
              {refundabilityCodes.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.code} — {row.name} ({REFUNDABILITY_KIND_LABELS[row.kind]})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="plan-rate">Base rate</Label>
          <Input
            id="plan-rate"
            type="number"
            min={0}
            step="any"
            value={baseRate}
            disabled={!canEdit}
            onChange={(event) => setBaseRate(Number(event.target.value))}
          />
        </div>
        <div className="flex items-center justify-between rounded-xl border px-3 py-2">
          <Label htmlFor="plan-active">Active</Label>
          <Switch
            id="plan-active"
            checked={active}
            disabled={!canEdit}
            onCheckedChange={setActive}
          />
        </div>
      </div>
    </Card3OverlapSheet>
  );
}

function CancellationDrawer({
  open,
  canEdit,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  value: RateCancellationPolicyRow | null;
  pending: boolean;
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
}) {
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [description, setDescription] = useState(value?.description ?? "");
  const [policyKind, setPolicyKind] = useState<CancellationPolicyKind>(value?.policyKind ?? "flexible");
  const [windowValue, setWindowValue] = useState(String(value?.windowValue ?? 24));
  const [windowUnit, setWindowUnit] = useState<CancellationWindowUnit>(
    value?.windowUnit ?? "hours_before_arrival",
  );
  const [cutoffTime, setCutoffTime] = useState(value?.cutoffTime ?? "");
  const [penaltyType, setPenaltyType] = useState<CancellationPenaltyType>(value?.penaltyType ?? "none");
  const [penaltyValue, setPenaltyValue] = useState(String(value?.penaltyValue ?? 0));
  const [active, setActive] = useState(value?.active ?? true);
  const showWindow = policyKind !== "non_refundable";
  const showPenaltyValue = penaltyNeedsValue(penaltyType);

  return (
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      title={value ? "Edit cancellation policy" : "Add cancellation policy"}
      description="Reusable window and cutoff. Linked rate plans pick this catalogue. Confirmed reservations keep their snapshot."
      canEdit={canEdit}
      pending={pending}
      submitLabel="Save policy"
      onSubmit={() =>
        onSave({
          ...(value ? { id: value.id } : {}),
          code,
          name,
          description,
          policyKind,
          windowValue: showWindow ? Number(windowValue) : null,
          windowUnit,
          cutoffTime: cutoffTime.trim() ? cutoffTime : null,
          penaltyType,
          penaltyValue: showPenaltyValue ? Number(penaltyValue) : 0,
          active,
        })
      }
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="cancel-code">Code</Label>
          <Input
            id="cancel-code"
            value={code}
            disabled={!canEdit}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cancel-name">Name</Label>
          <Input
            id="cancel-name"
            value={name}
            disabled={!canEdit}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cancel-description">Description</Label>
          <Textarea
            id="cancel-description"
            value={description}
            disabled={!canEdit}
            rows={3}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cancel-kind">Policy kind</Label>
          <Select
            value={policyKind}
            disabled={!canEdit}
            onValueChange={(next) => setPolicyKind(next as CancellationPolicyKind)}
          >
            <SelectTrigger id="cancel-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
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
              <Label htmlFor="cancel-window-value">Window</Label>
              <Input
                id="cancel-window-value"
                type="number"
                min={0}
                value={windowValue}
                disabled={!canEdit}
                onChange={(event) => setWindowValue(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cancel-window-unit">Window unit</Label>
              <Select
                value={windowUnit}
                disabled={!canEdit}
                onValueChange={(next) => setWindowUnit(next as CancellationWindowUnit)}
              >
                <SelectTrigger id="cancel-window-unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CANCELLATION_WINDOW_UNITS.map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {CANCELLATION_WINDOW_UNIT_LABELS[unit]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cancel-cutoff">Cutoff time (property local, optional)</Label>
              <Input
                id="cancel-cutoff"
                type="time"
                value={cutoffTime}
                disabled={!canEdit}
                onChange={(event) => setCutoffTime(event.target.value)}
              />
            </div>
          </>
        ) : null}
        <div className="space-y-1">
          <Label htmlFor="cancel-penalty-type">Penalty after the window</Label>
          <Select
            value={penaltyType}
            disabled={!canEdit}
            onValueChange={(next) => setPenaltyType(next as CancellationPenaltyType)}
          >
            <SelectTrigger id="cancel-penalty-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
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
            <Label htmlFor="cancel-penalty-value">Penalty value</Label>
            <Input
              id="cancel-penalty-value"
              type="number"
              min={0}
              value={penaltyValue}
              disabled={!canEdit}
              onChange={(event) => setPenaltyValue(event.target.value)}
            />
          </div>
        ) : null}
        <div className="flex items-center justify-between rounded-xl border px-3 py-2">
          <Label htmlFor="cancel-active">Active</Label>
          <Switch
            id="cancel-active"
            checked={active}
            disabled={!canEdit}
            onCheckedChange={setActive}
          />
        </div>
      </div>
    </Card3OverlapSheet>
  );
}

function RefundabilityDrawer({
  open,
  canEdit,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  value: RateRefundabilityRow | null;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    code: string;
    name: string;
    description: string;
    kind: RateRefundabilityKind;
    active: boolean;
  }) => void;
}) {
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [description, setDescription] = useState(value?.description ?? "");
  const [kind, setKind] = useState<RateRefundabilityKind>(value?.kind ?? "refundable");
  const [active, setActive] = useState(value?.active ?? true);

  return (
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      title={value ? "Edit refundability" : "Add refundability"}
      description="Linked to rate plans. Does not change confirmed reservations."
      canEdit={canEdit}
      pending={pending}
      submitLabel="Save refundability"
      onSubmit={() =>
        onSave({ ...(value ? { id: value.id } : {}), code, name, description, kind, active })
      }
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="refund-code">Code</Label>
          <Input
            id="refund-code"
            value={code}
            disabled={!canEdit}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="refund-name">Name</Label>
          <Input
            id="refund-name"
            value={name}
            disabled={!canEdit}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Kind</Label>
          <Select
            value={kind}
            disabled={!canEdit}
            onValueChange={(next) => setKind(next as RateRefundabilityKind)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RATE_REFUNDABILITY_KINDS.map((row) => (
                <SelectItem key={row} value={row}>
                  {REFUNDABILITY_KIND_LABELS[row]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="refund-description">Description</Label>
          <Textarea
            id="refund-description"
            value={description}
            disabled={!canEdit}
            rows={3}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <div className="flex items-center justify-between rounded-xl border px-3 py-2">
          <Label htmlFor="refund-active">Active</Label>
          <Switch
            id="refund-active"
            checked={active}
            disabled={!canEdit}
            onCheckedChange={setActive}
          />
        </div>
      </div>
    </Card3OverlapSheet>
  );
}

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
            <SelectContent>
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
          <Switch
            id="ns-active"
            checked={active}
            disabled={!canEdit}
            onCheckedChange={setActive}
          />
        </div>
      </div>
    </Card3OverlapSheet>
  );
}

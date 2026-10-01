import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { ArrowLeft, Check, Plus, Search } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
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
  saveRateCategoryCard2,
  saveRatePlanCard2,
} from "@/packages/pms/lib/rates-card2.functions";
import {
  CARD2_RATES_ROOM_TYPES_COPY,
  PREDEFINED_RATE_CATEGORIES,
  isPredefinedCategoryConfigured,
  findMatchingPredefinedCategory,
  type PredefinedRateCategory,
  type RateCategoryRow,
  type RatePlanRow,
  type RatesCard2Snapshot,
} from "@/packages/pms/lib/rates-card2.server";
import { cn } from "@/shared/lib/utils";

function matchesQuery(query: string, ...values: string[]) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return values.some((value) => value.toLowerCase().includes(q));
}

export function PmsPropertySetupCard2Rates({
  restaurantId,
  canEdit,
  onReadiness,
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

  const [categorySearch, setCategorySearch] = useState("");
  const [planSearch, setPlanSearch] = useState("");
  const [categoryDraft, setCategoryDraft] = useState<RateCategoryRow | "new" | null>(null);
  const [planDraft, setPlanDraft] = useState<RatePlanRow | "new" | null>(null);
  const [batchPending, setBatchPending] = useState(false);

  const query = useQuery({
    queryKey: ["pms-card2-rates", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });

  const snapshot: RatesCard2Snapshot | undefined = query.data?.snapshot;
  const readiness = query.data?.readiness;
  const roomTypes = snapshot?.roomTypes ?? [];
  const categories = snapshot?.categories ?? [];
  const plans = snapshot?.plans ?? [];

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

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["pms-card2-rates", restaurantId] });
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
            columns={["Code", "Name", "Category", "Room type", "Base rate", "Status"]}
            rows={filteredPlans.map((row) => ({
              id: row.id,
              cells: [
                row.code,
                row.name,
                row.categoryName || row.categoryId,
                `${row.roomTypeCode} ${row.roomTypeName}`.trim(),
                String(row.baseRate),
                <Card3StatusDot key="status" active={row.active} />,
              ],
              onEdit: () => setPlanDraft(row),
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
            value={planDraft === "new" || planDraft === null ? null : planDraft}
            pending={planMut.isPending}
            onClose={() => setPlanDraft(null)}
            onSave={(payload) => planMut.mutate({ restaurantId, ...payload })}
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

function PlanDrawer({
  open,
  canEdit,
  categories,
  roomTypes,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  categories: RateCategoryRow[];
  roomTypes: RatesCard2Snapshot["roomTypes"];
  value: RatePlanRow | null;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    categoryId: string;
    roomTypeId: string;
    code: string;
    name: string;
    baseRate: number;
    active: boolean;
  }) => void;
}) {
  const [categoryId, setCategoryId] = useState(value?.categoryId ?? categories[0]?.id ?? "");
  const [roomTypeId, setRoomTypeId] = useState(value?.roomTypeId ?? roomTypes[0]?.id ?? "");
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [baseRate, setBaseRate] = useState(value?.baseRate ?? 0);
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
          baseRate,
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

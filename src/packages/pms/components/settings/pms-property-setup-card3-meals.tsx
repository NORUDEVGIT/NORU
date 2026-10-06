import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Switch } from "@/shared/components/ui/switch";
import { Textarea } from "@/shared/components/ui/textarea";
import { PmsPropertySetupCard3Workspace } from "@/packages/pms/components/settings/pms-property-setup-card3-workspace";
import {
  Card3InheritedStrip,
  Card3ListSection,
  Card3OverlapSheet,
  Card3StatusDot,
} from "@/packages/pms/components/settings/pms-property-setup-card3-primitives";
import type { Card3Domain } from "@/packages/pms/lib/pms-property-setup-card3";
import {
  deletePackageComponentCard3,
  getMealsCard3,
  saveMealPlanCard3,
  savePackageCard3,
  savePackageComponentCard3,
} from "@/packages/pms/lib/meals-card3.functions";
import {
  CARD3_MEALS_TABS,
  MEAL_PLAN_TYPE_LABELS,
  PACKAGE_COMPONENT_KIND_LABELS,
  PACKAGE_COMPONENT_KINDS,
  PACKAGE_INCLUSION_TYPE_LABELS,
  PACKAGE_INCLUSION_TYPES,
  PACKAGE_TYPE_LABELS,
  TAX_POSTURE_LABELS,
  type MealPlanCard3Row,
  type MealsCard3Snapshot,
  type PackageCard3Row,
  type PackageComponentCard3Row,
  type PackageComponentKind,
  type PackageInclusionType,
} from "@/packages/pms/lib/meals-card3.server";
import {
  MEAL_PLAN_TYPES,
  PACKAGE_TYPES,
  TAX_POSTURES,
  type MealPlanType,
  type PackageType,
  type TaxPosture,
} from "@/packages/pms/lib/pms-set3-rates-guest";

const goldFocus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933] focus-visible:ring-offset-2";

type MealPlanInput = {
  restaurantId: string;
  id?: string;
  code: string;
  name: string;
  type: MealPlanType;
  description?: string;
  includesBreakfast: boolean;
  includesLunch: boolean;
  includesDinner: boolean;
  taxPosture: TaxPosture;
  active: boolean;
};

type PackageInput = {
  restaurantId: string;
  id?: string;
  code: string;
  name: string;
  type: PackageType;
  description?: string;
  packagePrice: number;
  active: boolean;
  roomTypeIds: string[];
  ratePlanIds: string[];
  ratePlanLinks: { ratePlanId: string; inclusionType: PackageInclusionType }[];
};

type ComponentInput =
  | {
      restaurantId: string;
      id?: string;
      packageId: string;
      kind: "meal_plan";
      mealPlanId: string;
      quantity: number;
      sortOrder: number;
    }
  | {
      restaurantId: string;
      id?: string;
      packageId: string;
      kind: "room_amenity";
      roomAmenityId: string;
      quantity: number;
      sortOrder: number;
    }
  | {
      restaurantId: string;
      id?: string;
      packageId: string;
      kind: "fo_service";
      foServiceId: string;
      quantity: number;
      sortOrder: number;
    };

function matchesQuery(query: string, ...values: string[]) {
  const normalized = query.trim().toLowerCase();
  return !normalized || values.some((value) => value.toLowerCase().includes(normalized));
}

export function PmsPropertySetupCard3Meals({
  restaurantId,
  canEdit,
  domain,
}: {
  restaurantId: string;
  canEdit: boolean;
  domain: Card3Domain;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getMealsCard3);
  const saveMeal = useServerFn(saveMealPlanCard3);
  const savePackage = useServerFn(savePackageCard3);
  // Component mutations retained for Phase E — not wired to primary UI in Phase B
  const saveComponent = useServerFn(savePackageComponentCard3);
  const deleteComponent = useServerFn(deletePackageComponentCard3);
  const [mealSearch, setMealSearch] = useState("");
  const [packageSearch, setPackageSearch] = useState("");
  const [mealDraft, setMealDraft] = useState<MealPlanCard3Row | "new" | null>(null);
  const [packageDraft, setPackageDraft] = useState<PackageCard3Row | "new" | null>(null);
  // componentDraft retained for Phase E
  const [componentDraft, setComponentDraft] = useState<PackageComponentCard3Row | "new" | null>(
    null,
  );

  const query = useQuery({
    queryKey: ["pms-card3-meals", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });
  const snapshot: MealsCard3Snapshot | undefined = query.data?.snapshot;
  const mealPlans = useMemo(() => snapshot?.mealPlans ?? [], [snapshot?.mealPlans]);
  const packages = useMemo(() => snapshot?.packages ?? [], [snapshot?.packages]);
  // components retained in scope for Phase E
  const components = useMemo(() => snapshot?.components ?? [], [snapshot?.components]);

  const roomTypeById = useMemo(
    () => new Map((snapshot?.roomTypes ?? []).map((row) => [row.id, `${row.code} — ${row.name}`])),
    [snapshot?.roomTypes],
  );
  const ratePlanById = useMemo(
    () => new Map((snapshot?.ratePlans ?? []).map((row) => [row.id, `${row.code} — ${row.name}`])),
    [snapshot?.ratePlans],
  );
  const filteredMeals = useMemo(
    () =>
      mealPlans.filter((row) =>
        matchesQuery(
          mealSearch,
          row.code,
          row.name,
          row.typeLabel,
          row.description,
          row.taxPostureLabel,
        ),
      ),
    [mealPlans, mealSearch],
  );
  const filteredPackages = useMemo(
    () =>
      packages.filter((row) =>
        matchesQuery(
          packageSearch,
          row.code,
          row.name,
          row.typeLabel,
          row.description,
          ...row.roomTypeIds.map((id) => roomTypeById.get(id) ?? ""),
          ...row.ratePlanIds.map((id) => ratePlanById.get(id) ?? ""),
        ),
      ),
    [packages, ratePlanById, roomTypeById, packageSearch],
  );

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["pms-card3-meals", restaurantId] });
  }

  const mealMutation = useMutation({
    mutationFn: (input: MealPlanInput) => saveMeal({ data: input }),
    onSuccess: () => {
      toast.success("Meal plan saved.");
      setMealDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const packageMutation = useMutation({
    mutationFn: (input: PackageInput) => savePackage({ data: input }),
    onSuccess: () => {
      toast.success("Package saved.");
      setPackageDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  // Component mutations retained for Phase E
  const componentMutation = useMutation({
    mutationFn: (input: ComponentInput) => saveComponent({ data: input }),
    onSuccess: () => {
      toast.success("Package component saved.");
      setComponentDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteComponent({ data: { restaurantId, id } }),
    onSuccess: () => {
      toast.success("Package component deleted.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  void CARD3_MEALS_TABS;
  // Retain references so Phase E can wire them without re-adding imports
  void components;
  void componentDraft;
  void componentMutation;
  void deleteMutation;

  return (
    <PmsPropertySetupCard3Workspace domain={domain}>
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading meal plans and packages…</p>
      ) : query.isError || !snapshot ? (
        <p className="text-sm text-destructive">
          {(query.error as Error | undefined)?.message ?? "Meal Plans & Packages are unavailable."}
        </p>
      ) : (
        <div className="space-y-4" data-testid="pms-card3-meals">
          <Card3InheritedStrip>
            Room types are inherited from Card 2. Rate plans are inherited from Phase 3. Room
            amenities and front-office services are reused from their owning modules; this workspace
            does not create or edit those catalogues. This configuration makes no reservation or
            folio operational changes.
          </Card3InheritedStrip>

          {/* ── Meal Plans list ── */}
          <Card3ListSection
            title="Meal plans"
            icon="meal"
            search={mealSearch}
            onSearch={setMealSearch}
            placeholder="Search meal plans"
            canEdit={canEdit}
            addLabel="Add meal plan"
            onAdd={() => setMealDraft("new")}
            columns={["Code", "Name", "Type", "Description", "Meals", "Tax posture", "Status"]}
            empty="No meal plans saved yet."
            rows={filteredMeals.map((row) => ({
              id: row.id,
              cells: [
                row.code,
                row.name,
                row.typeLabel,
                row.description || "—",
                [
                  row.includesBreakfast ? "Breakfast" : "",
                  row.includesLunch ? "Lunch" : "",
                  row.includesDinner ? "Dinner" : "",
                ]
                  .filter(Boolean)
                  .join(", ") || "None",
                row.taxPostureLabel,
                <Card3StatusDot active={row.active} />,
              ],
              onEdit: () => setMealDraft(row),
            }))}
          />

          {/* ── Package Master list — unified entry point (Phase B) ── */}
          {/* "Package rate plan types" and "Package components" are retired as
              peer primary lists. Their data is preserved in snapshot. They will
              be nested inside this editor in Phase E (Includes) and Phase F
              (Applicability). */}
          <Card3ListSection
            title="Packages"
            icon="tag"
            search={packageSearch}
            onSearch={setPackageSearch}
            placeholder="Search packages"
            canEdit={canEdit}
            addLabel="Add package"
            onAdd={() => setPackageDraft("new")}
            columns={[
              "Code",
              "Name",
              "Type / Category",
              "Description",
              `Price (${snapshot.currencyCode || "currency"})`,
              "Status",
            ]}
            empty="No packages saved yet."
            rows={filteredPackages.map((row) => ({
              id: row.id,
              cells: [
                row.code,
                row.name,
                row.typeLabel,
                row.description || "—",
                `${snapshot.currencyCode} ${row.packagePrice}`.trim(),
                <Card3StatusDot active={row.active} />,
              ],
              onEdit: () => setPackageDraft(row),
            }))}
          />

          {/* ── Editors ── */}
          <MealPlanSheet
            key={mealDraft === "new" ? "meal-new" : (mealDraft?.id ?? "meal-closed")}
            open={mealDraft !== null}
            canEdit={canEdit}
            value={mealDraft === "new" || mealDraft === null ? null : mealDraft}
            pending={mealMutation.isPending}
            onClose={() => setMealDraft(null)}
            onSave={(payload) => mealMutation.mutate({ restaurantId, ...payload })}
          />

          {/* Unified Package Master editor — replaces old PackageSheet.
              Writer: savePackageCard3 (canonical). No second package writer. */}
          <PackageMasterEditor
            key={packageDraft === "new" ? "package-new" : (packageDraft?.id ?? "package-closed")}
            open={packageDraft !== null}
            canEdit={canEdit}
            currencyCode={snapshot.currencyCode}
            roomTypes={snapshot.roomTypes}
            ratePlans={snapshot.ratePlans}
            value={packageDraft === "new" || packageDraft === null ? null : packageDraft}
            pending={packageMutation.isPending}
            onClose={() => setPackageDraft(null)}
            onSave={(payload) => packageMutation.mutate({ restaurantId, ...payload })}
          />
        </div>
      )}
    </PmsPropertySetupCard3Workspace>
  );
}

function ActiveField({
  id,
  active,
  canEdit,
  onChange,
}: {
  id: string;
  active: boolean;
  canEdit: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border px-3 py-2">
      <Label htmlFor={id}>Active</Label>
      <Switch
        id={id}
        checked={active}
        disabled={!canEdit}
        onCheckedChange={onChange}
        className={goldFocus}
      />
    </div>
  );
}

function MealPlanSheet({
  open,
  canEdit,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  value: MealPlanCard3Row | null;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    code: string;
    name: string;
    type: MealPlanType;
    description?: string;
    includesBreakfast: boolean;
    includesLunch: boolean;
    includesDinner: boolean;
    taxPosture: TaxPosture;
    active: boolean;
  }) => void;
}) {
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [type, setType] = useState<MealPlanType>(value?.type ?? "breakfast");
  const [description, setDescription] = useState(value?.description ?? "");
  const [breakfast, setBreakfast] = useState(value?.includesBreakfast ?? true);
  const [lunch, setLunch] = useState(value?.includesLunch ?? false);
  const [dinner, setDinner] = useState(value?.includesDinner ?? false);
  const [taxPosture, setTaxPosture] = useState<TaxPosture>(value?.taxPosture ?? "inherit");
  const [active, setActive] = useState(value?.active ?? true);

  return (
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      title={value ? "Edit meal plan" : "Add meal plan"}
      description="Configure a typed meal plan for this property."
      canEdit={canEdit}
      pending={pending}
      submitLabel="Save meal plan"
      onSubmit={() =>
        onSave({
          ...(value ? { id: value.id } : {}),
          code,
          name,
          type,
          description,
          includesBreakfast: breakfast,
          includesLunch: lunch,
          includesDinner: dinner,
          taxPosture,
          active,
        })
      }
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="meal-code">Code</Label>
          <Input
            id="meal-code"
            value={code}
            maxLength={20}
            disabled={!canEdit}
            className={goldFocus}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="meal-name">Name</Label>
          <Input
            id="meal-name"
            value={name}
            disabled={!canEdit}
            className={goldFocus}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="meal-type">Type</Label>
          <Select
            value={type}
            disabled={!canEdit}
            onValueChange={(next) => setType(next as MealPlanType)}
          >
            <SelectTrigger id="meal-type" className={goldFocus}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MEAL_PLAN_TYPES.map((row) => (
                <SelectItem key={row} value={row}>
                  {MEAL_PLAN_TYPE_LABELS[row]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="meal-description">Description</Label>
          <Textarea
            id="meal-description"
            value={description}
            disabled={!canEdit}
            className={goldFocus}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <fieldset className="space-y-2 rounded-xl border px-3 py-2">
          <legend className="px-1 text-sm font-medium text-[#251605]">Included meals</legend>
          {[
            ["meal-breakfast", "Breakfast", breakfast, setBreakfast],
            ["meal-lunch", "Lunch", lunch, setLunch],
            ["meal-dinner", "Dinner", dinner, setDinner],
          ].map(([id, label, checked, setter]) => (
            <div key={String(id)} className="flex items-center gap-2">
              <Checkbox
                id={String(id)}
                checked={Boolean(checked)}
                disabled={!canEdit}
                className={goldFocus}
                onCheckedChange={(next) => (setter as (value: boolean) => void)(next === true)}
              />
              <Label htmlFor={String(id)}>{String(label)}</Label>
            </div>
          ))}
        </fieldset>
        <div className="space-y-1">
          <Label htmlFor="meal-tax">Tax posture</Label>
          <Select
            value={taxPosture}
            disabled={!canEdit}
            onValueChange={(next) => setTaxPosture(next as TaxPosture)}
          >
            <SelectTrigger id="meal-tax" className={goldFocus}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TAX_POSTURES.map((row) => (
                <SelectItem key={row} value={row}>
                  {TAX_POSTURE_LABELS[row]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ActiveField id="meal-active" active={active} canEdit={canEdit} onChange={setActive} />
      </div>
    </Card3OverlapSheet>
  );
}

// ---------------------------------------------------------------------------
// Package Master Editor — Phase B
// ---------------------------------------------------------------------------
// Section structure (see package-master-refactor-plan.md §4 Phase B):
//   1. Basic Information  ← live (code, name, type/category, description, active)
//   2. Pricing            ← live (package_price in property currency)
//   3. Includes           ← placeholder — Phase E
//   4. Applicability      ← placeholder — Phase F (room types + rate plans + inclusion_type)
//   5. Cover Image        ← placeholder — Phase C
//
// Writer: savePackageCard3 (canonical). No second package writer created here.
// Existing applicability state (roomTypeIds, ratePlanIds, ratePlanLinks) is
// preserved on edit so live data is not clobbered before Phase F renders the UI.
// ---------------------------------------------------------------------------

function PackageMasterEditor({
  open,
  canEdit,
  currencyCode,
  roomTypes,
  ratePlans,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  currencyCode: string;
  roomTypes: MealsCard3Snapshot["roomTypes"];
  ratePlans: MealsCard3Snapshot["ratePlans"];
  value: PackageCard3Row | null;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    code: string;
    name: string;
    type: PackageType;
    description?: string;
    packagePrice: number;
    active: boolean;
    roomTypeIds: string[];
    ratePlanIds: string[];
    ratePlanLinks: { ratePlanId: string; inclusionType: PackageInclusionType }[];
  }) => void;
}) {
  // Section 1 — Basic Information
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [type, setType] = useState<PackageType>(value?.type ?? "accommodation");
  const [description, setDescription] = useState(value?.description ?? "");
  const [active, setActive] = useState(value?.active ?? true);

  // Section 2 — Pricing
  const [price, setPrice] = useState(value?.packagePrice ?? 0);

  // Sections 3–4 state: retained from existing record so applicability links
  // are not lost before Phase F wires the UI. Not rendered in Phase B.
  const existingRoomTypeIds = value?.roomTypeIds ?? [];
  const existingRatePlanIds = value?.ratePlanIds ?? [];
  const existingRatePlanLinks = value?.ratePlanLinks ?? [];
  const inclusionByPlan = Object.fromEntries(
    existingRatePlanLinks.map((link) => [link.ratePlanId, link.inclusionType]),
  );

  // Suppress unused Phase F prop warnings
  void roomTypes;
  void ratePlans;

  return (
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      title={value ? "Edit package" : "Add package"}
      description="Package Master — canonical package record."
      canEdit={canEdit}
      pending={pending}
      submitLabel="Save package"
      onSubmit={() => {
        if (!canEdit) return;
        onSave({
          ...(value ? { id: value.id } : {}),
          code,
          name,
          type,
          description,
          packagePrice: price,
          active,
          // Pass existing applicability through untouched until Phase F wires the UI
          roomTypeIds: existingRoomTypeIds,
          ratePlanIds: existingRatePlanIds,
          ratePlanLinks: existingRatePlanIds.map((ratePlanId) => ({
            ratePlanId,
            inclusionType: inclusionByPlan[ratePlanId] ?? "optional",
          })),
        });
      }}
    >
      <div className="space-y-4" data-testid="package-master-editor">
        {/* ── Section 1: Basic Information ─────────────────────────────── */}
        <div
          className="space-y-3 rounded-xl border border-[#E6D7B8] bg-[#FDFAF5] px-4 py-3"
          data-testid="package-master-section-basic"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6B6458]">
            1. Basic Information
          </p>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="pkg-master-code">Code</Label>
              <Input
                id="pkg-master-code"
                value={code}
                maxLength={20}
                disabled={!canEdit}
                className={goldFocus}
                placeholder="e.g. WEEKEND"
                onChange={(event) => setCode(event.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pkg-master-name">Name</Label>
              <Input
                id="pkg-master-name"
                value={name}
                disabled={!canEdit}
                className={goldFocus}
                placeholder="e.g. Weekend Escape"
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pkg-master-type">Type / Category</Label>
              <Select
                value={type}
                disabled={!canEdit}
                onValueChange={(next) => setType(next as PackageType)}
              >
                <SelectTrigger id="pkg-master-type" className={goldFocus}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PACKAGE_TYPES.map((row) => (
                    <SelectItem key={row} value={row}>
                      {PACKAGE_TYPE_LABELS[row]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="pkg-master-description">Description</Label>
              <Textarea
                id="pkg-master-description"
                value={description}
                disabled={!canEdit}
                className={goldFocus}
                rows={3}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <ActiveField
              id="pkg-master-active"
              active={active}
              canEdit={canEdit}
              onChange={setActive}
            />
          </div>
        </div>

        {/* ── Section 2: Pricing ────────────────────────────────────────── */}
        <div
          className="space-y-3 rounded-xl border border-[#E6D7B8] bg-[#FDFAF5] px-4 py-3"
          data-testid="package-master-section-pricing"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6B6458]">2. Pricing</p>
          <div className="space-y-1">
            <Label htmlFor="pkg-master-price">
              Package price ({currencyCode || "property currency"})
            </Label>
            <Input
              id="pkg-master-price"
              type="number"
              min={0}
              step="any"
              value={price}
              disabled={!canEdit}
              className={goldFocus}
              onChange={(event) => setPrice(Number(event.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Charge basis: per stay. Configurable charge basis (per night, per person, etc.) is
              planned for Phase D.
            </p>
          </div>
        </div>

        {/* ── Section 3: Includes (placeholder — Phase E) ───────────────── */}
        <div
          className="space-y-1 rounded-xl border border-dashed border-[#CCCCCC] px-4 py-3"
          data-testid="package-master-section-includes"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-[#9B9083]">
            3. Includes
          </p>
          <p className="text-xs text-muted-foreground">
            Package component includes (meal plans, room amenities, front-office services) will be
            managed here in Phase E.
          </p>
        </div>

        {/* ── Section 4: Applicability (placeholder — Phase F) ─────────── */}
        <div
          className="space-y-1 rounded-xl border border-dashed border-[#CCCCCC] px-4 py-3"
          data-testid="package-master-section-applicability"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-[#9B9083]">
            4. Applicability
          </p>
          <p className="text-xs text-muted-foreground">
            Room type and rate plan applicability (with included / optional per link) will be
            configured here in Phase F. Existing applicability links are preserved on save.
          </p>
        </div>

        {/* ── Section 5: Cover Image (placeholder — Phase C) ───────────── */}
        <div
          className="space-y-1 rounded-xl border border-dashed border-[#CCCCCC] px-4 py-3"
          data-testid="package-master-section-cover"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-[#9B9083]">
            5. Cover Image
          </p>
          <p className="text-xs text-muted-foreground">
            Package cover image upload will be available in Phase C.
          </p>
        </div>
      </div>
    </Card3OverlapSheet>
  );
}

// ---------------------------------------------------------------------------
// Helpers retained for Phase E / Phase F wiring — not rendered in Phase B
// ---------------------------------------------------------------------------

function ApplicabilityList({
  title,
  prefix,
  rows,
  selected,
  canEdit,
  onToggle,
}: {
  title: string;
  prefix: string;
  rows: { id: string; code: string; name: string }[];
  selected: string[];
  canEdit: boolean;
  onToggle: (id: string, checked: boolean) => void;
}) {
  return (
    <fieldset className="space-y-2 rounded-xl border px-3 py-2">
      <legend className="px-1 text-sm font-medium text-[#251605]">{title}</legend>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No inherited options available.</p>
      ) : (
        rows.map((row) => {
          const id = `${prefix}-${row.id}`;
          return (
            <div key={row.id} className="flex items-center gap-2">
              <Checkbox
                id={id}
                checked={selected.includes(row.id)}
                disabled={!canEdit}
                className={goldFocus}
                onCheckedChange={(next) => onToggle(row.id, next === true)}
              />
              <Label htmlFor={id}>
                {row.code} — {row.name}
              </Label>
            </div>
          );
        })
      )}
    </fieldset>
  );
}

function RatePlanApplicabilityList({
  rows,
  selected,
  inclusionByPlan,
  canEdit,
  onToggle,
  onInclusionChange,
}: {
  rows: { id: string; code: string; name: string }[];
  selected: string[];
  inclusionByPlan: Record<string, PackageInclusionType>;
  canEdit: boolean;
  onToggle: (id: string, checked: boolean) => void;
  onInclusionChange: (id: string, inclusionType: PackageInclusionType) => void;
}) {
  return (
    <fieldset className="space-y-2 rounded-xl border px-3 py-2">
      <legend className="px-1 text-sm font-medium text-[#251605]">Rate plans (Phase 3)</legend>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No inherited options available.</p>
      ) : (
        rows.map((row) => {
          const id = `package-rate-${row.id}`;
          const checked = selected.includes(row.id);
          return (
            <div key={row.id} className="flex flex-wrap items-center gap-2">
              <Checkbox
                id={id}
                checked={checked}
                disabled={!canEdit}
                className={goldFocus}
                onCheckedChange={(next) => onToggle(row.id, next === true)}
              />
              <Label htmlFor={id} className="min-w-[12rem]">
                {row.code} — {row.name}
              </Label>
              {checked ? (
                <Select
                  value={inclusionByPlan[row.id] ?? "optional"}
                  disabled={!canEdit}
                  onValueChange={(next) => onInclusionChange(row.id, next as PackageInclusionType)}
                >
                  <SelectTrigger className={`${goldFocus} h-8 w-[11rem]`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PACKAGE_INCLUSION_TYPES.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {PACKAGE_INCLUSION_TYPE_LABELS[kind]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>
          );
        })
      )}
    </fieldset>
  );
}

function ComponentSheet({
  open,
  canEdit,
  snapshot,
  initialPackageId,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  snapshot: MealsCard3Snapshot;
  initialPackageId?: string;
  value: PackageComponentCard3Row | null;
  pending: boolean;
  onClose: () => void;
  onSave: (
    payload:
      | {
          id?: string;
          packageId: string;
          kind: "meal_plan";
          mealPlanId: string;
          quantity: number;
          sortOrder: number;
        }
      | {
          id?: string;
          packageId: string;
          kind: "room_amenity";
          roomAmenityId: string;
          quantity: number;
          sortOrder: number;
        }
      | {
          id?: string;
          packageId: string;
          kind: "fo_service";
          foServiceId: string;
          quantity: number;
          sortOrder: number;
        },
  ) => void;
}) {
  const initialKind = value?.kind ?? "meal_plan";
  const initialSource =
    value?.mealPlanId ??
    value?.roomAmenityId ??
    value?.foServiceId ??
    snapshot.mealPlans[0]?.id ??
    "";
  const [packageId, setPackageId] = useState(
    value?.packageId ?? initialPackageId ?? snapshot.packages[0]?.id ?? "",
  );
  const [kind, setKind] = useState<PackageComponentKind>(initialKind);
  const [sourceId, setSourceId] = useState(initialSource);
  const [quantity, setQuantity] = useState(value?.quantity ?? 1);
  const [sortOrder, setSortOrder] = useState(value?.sortOrder ?? 0);
  const sources =
    kind === "meal_plan"
      ? snapshot.mealPlans
      : kind === "room_amenity"
        ? snapshot.roomAmenities
        : snapshot.foServices;

  function changeKind(next: PackageComponentKind) {
    setKind(next);
    const nextSources =
      next === "meal_plan"
        ? snapshot.mealPlans
        : next === "room_amenity"
          ? snapshot.roomAmenities
          : snapshot.foServices;
    setSourceId(nextSources[0]?.id ?? "");
  }

  return (
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      title={value ? "Edit package component" : "Add package component"}
      description="Select an existing source. Source catalogues remain owned by their modules."
      canEdit={canEdit && Boolean(packageId) && Boolean(sourceId)}
      pending={pending}
      submitLabel="Save component"
      onSubmit={() => {
        if (!canEdit || !sourceId) return;
        const base = {
          ...(value ? { id: value.id } : {}),
          packageId,
          quantity,
          sortOrder,
        };
        if (kind === "meal_plan") onSave({ ...base, kind, mealPlanId: sourceId });
        else if (kind === "room_amenity") onSave({ ...base, kind, roomAmenityId: sourceId });
        else onSave({ ...base, kind, foServiceId: sourceId });
      }}
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="component-package">Package</Label>
          <Select value={packageId} disabled={!canEdit} onValueChange={setPackageId}>
            <SelectTrigger id="component-package" className={goldFocus}>
              <SelectValue placeholder="Select a package" />
            </SelectTrigger>
            <SelectContent>
              {snapshot.packages.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.code} — {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="component-kind">Kind</Label>
          <Select
            value={kind}
            disabled={!canEdit}
            onValueChange={(next) => changeKind(next as PackageComponentKind)}
          >
            <SelectTrigger id="component-kind" className={goldFocus}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PACKAGE_COMPONENT_KINDS.map((row) => (
                <SelectItem key={row} value={row}>
                  {PACKAGE_COMPONENT_KIND_LABELS[row]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="component-source">Existing source</Label>
          <Select
            value={sourceId}
            disabled={!canEdit || sources.length === 0}
            onValueChange={setSourceId}
          >
            <SelectTrigger id="component-source" className={goldFocus}>
              <SelectValue placeholder="Select an existing source" />
            </SelectTrigger>
            <SelectContent>
              {sources.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {"code" in row && row.code ? `${row.code} — ` : ""}
                  {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="component-quantity">Quantity</Label>
          <Input
            id="component-quantity"
            type="number"
            min={0.01}
            step="any"
            value={quantity}
            disabled={!canEdit}
            className={goldFocus}
            onChange={(event) => setQuantity(Number(event.target.value))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="component-sort">Sort order</Label>
          <Input
            id="component-sort"
            type="number"
            min={0}
            step={1}
            value={sortOrder}
            disabled={!canEdit}
            className={goldFocus}
            onChange={(event) => setSortOrder(Number(event.target.value))}
          />
        </div>
      </div>
    </Card3OverlapSheet>
  );
}

// Tree-shake guard: these helpers are not rendered in Phase B but must not be
// removed — they will be wired in Phase E and Phase F respectively.
void ComponentSheet;
void ApplicabilityList;
void RatePlanApplicabilityList;

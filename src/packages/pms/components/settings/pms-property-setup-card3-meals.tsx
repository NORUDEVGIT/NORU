import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { Switch } from "@/shared/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Textarea } from "@/shared/components/ui/textarea";
import { PmsPropertySetupCard3Workspace } from "@/packages/pms/components/settings/pms-property-setup-card3-workspace";
import { propertySetupStatusLabel } from "@/packages/pms/lib/pms-property-setup-card1";
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
  PACKAGE_TYPE_LABELS,
  TAX_POSTURE_LABELS,
  type Card3MealsTabId,
  type MealPlanCard3Row,
  type MealsCard3AuditRow,
  type MealsCard3Snapshot,
  type PackageCard3Row,
  type PackageComponentCard3Row,
  type PackageComponentKind,
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
  onBack,
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
  const saveComponent = useServerFn(savePackageComponentCard3);
  const deleteComponent = useServerFn(deletePackageComponentCard3);
  const [tab, setTab] = useState<Card3MealsTabId>("overview");
  const [search, setSearch] = useState("");
  const [showAudit, setShowAudit] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState("all");
  const [mealDraft, setMealDraft] = useState<MealPlanCard3Row | "new" | null>(null);
  const [packageDraft, setPackageDraft] = useState<PackageCard3Row | "new" | null>(null);
  const [componentDraft, setComponentDraft] = useState<PackageComponentCard3Row | "new" | null>(
    null,
  );

  const query = useQuery({
    queryKey: ["pms-card3-meals", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });
  const snapshot: MealsCard3Snapshot | undefined = query.data?.snapshot;
  const audit = (query.data?.audit ?? []) as MealsCard3AuditRow[];
  const readiness = query.data?.readiness;
  const mealPlans = useMemo(() => snapshot?.mealPlans ?? [], [snapshot?.mealPlans]);
  const packages = useMemo(() => snapshot?.packages ?? [], [snapshot?.packages]);
  const components = useMemo(() => snapshot?.components ?? [], [snapshot?.components]);

  const roomTypeById = useMemo(
    () => new Map((snapshot?.roomTypes ?? []).map((row) => [row.id, `${row.code} — ${row.name}`])),
    [snapshot?.roomTypes],
  );
  const ratePlanById = useMemo(
    () => new Map((snapshot?.ratePlans ?? []).map((row) => [row.id, `${row.code} — ${row.name}`])),
    [snapshot?.ratePlans],
  );
  const packageById = useMemo(() => new Map(packages.map((row) => [row.id, row])), [packages]);
  const filteredMeals = useMemo(
    () =>
      mealPlans.filter((row) =>
        matchesQuery(
          search,
          row.code,
          row.name,
          row.typeLabel,
          row.description,
          row.taxPostureLabel,
        ),
      ),
    [mealPlans, search],
  );
  const filteredPackages = useMemo(
    () =>
      packages.filter((row) =>
        matchesQuery(
          search,
          row.code,
          row.name,
          row.typeLabel,
          row.description,
          ...row.roomTypeIds.map((id) => roomTypeById.get(id) ?? ""),
          ...row.ratePlanIds.map((id) => ratePlanById.get(id) ?? ""),
        ),
      ),
    [packages, ratePlanById, roomTypeById, search],
  );
  const filteredComponents = useMemo(
    () =>
      components.filter(
        (row) =>
          (selectedPackageId === "all" || row.packageId === selectedPackageId) &&
          matchesQuery(
            search,
            packageById.get(row.packageId)?.code ?? "",
            packageById.get(row.packageId)?.name ?? "",
            row.kindLabel,
            row.sourceLabel,
            String(row.quantity),
          ),
      ),
    [components, packageById, search, selectedPackageId],
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

  const searchLabel =
    tab === "meal-plans"
      ? "Search meal plans"
      : tab === "packages"
        ? "Search packages"
        : "Search package components";

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as Card3MealsTabId)}>
      <PmsPropertySetupCard3Workspace
        domain={domain}
        onBack={onBack}
        onAuditHistory={() => setShowAudit((open) => !open)}
        tabs={
          <TabsList className="mb-1 flex h-auto flex-wrap">
            {CARD3_MEALS_TABS.map((item) => (
              <TabsTrigger
                key={item.id}
                value={item.id}
                className={goldFocus}
                data-testid={`card3-meals-tab-${item.id}`}
              >
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        }
        search={
          tab === "overview" ? null : (
            <div className="flex flex-wrap gap-2">
              {tab === "package-components" ? (
                <Select value={selectedPackageId} onValueChange={setSelectedPackageId}>
                  <SelectTrigger
                    className={`w-64 ${goldFocus}`}
                    aria-label="Filter components by package"
                  >
                    <SelectValue placeholder="All packages" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All packages</SelectItem>
                    {packages.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.code} — {row.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={searchLabel}
                aria-label={searchLabel}
                className={`max-w-sm ${goldFocus}`}
              />
            </div>
          )
        }
        drawer={
          showAudit ? (
            <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
              <h2 className="font-display text-lg text-[#251605]">Audit History</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {audit.length === 0 ? (
                  <li className="text-muted-foreground">
                    No meal or package changes recorded yet.
                  </li>
                ) : (
                  audit.map((row) => (
                    <li key={row.id}>
                      <p className="font-medium text-[#251605]">{row.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.detail ? `${row.detail} · ` : ""}
                        {row.createdAt}
                      </p>
                    </li>
                  ))
                )}
              </ul>
            </div>
          ) : null
        }
      >
        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading meal plans and packages…</p>
        ) : query.isError || !snapshot ? (
          <p className="text-sm text-destructive">
            {(query.error as Error | undefined)?.message ??
              "Meal Plans & Packages are unavailable."}
          </p>
        ) : (
          <div className="space-y-4" data-testid="pms-card3-meals">
            {tab === "overview" ? (
              <div className="space-y-4">
                <p className="rounded-xl border border-[#E6D7B8] bg-[#f7f4ef] p-4 text-sm text-[#251605]">
                  Room types are inherited from Card 2. Rate plans are inherited from Phase 3. Room
                  amenities and front-office services are reused from their owning modules; this
                  workspace does not create or edit those catalogues.
                </p>
                <p className="rounded-xl border border-[#E6D7B8] bg-white p-4 text-sm text-muted-foreground">
                  This configuration makes no reservation or folio operational changes.
                </p>
                <p className="text-sm font-medium text-[#251605]">
                  Domain status: {propertySetupStatusLabel(readiness?.status ?? "not_started")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {mealPlans.length} meal plans · {packages.length} packages · {components.length}{" "}
                  package components
                </p>
                {(readiness?.blockers ?? []).length > 0 ? (
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {readiness?.blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {tab === "meal-plans" ? (
              <MealsTable
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
                    row.active ? "Active" : "Inactive",
                  ],
                  onEdit: () => setMealDraft(row),
                }))}
              />
            ) : null}

            {tab === "packages" ? (
              <MealsTable
                canEdit={canEdit}
                addLabel="Add package"
                onAdd={() => setPackageDraft("new")}
                columns={[
                  "Code",
                  "Name",
                  "Type",
                  "Description",
                  `Price (${snapshot.currencyCode || "currency"})`,
                  "Room types (Card 2)",
                  "Rate plans (Phase 3)",
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
                    row.roomTypeIds.map((id) => roomTypeById.get(id) ?? id).join(", ") ||
                      "All / none assigned",
                    row.ratePlanIds.map((id) => ratePlanById.get(id) ?? id).join(", ") ||
                      "All / none assigned",
                    row.active ? "Active" : "Inactive",
                  ],
                  onEdit: () => setPackageDraft(row),
                }))}
              />
            ) : null}

            {tab === "package-components" ? (
              <MealsTable
                canEdit={canEdit}
                addLabel="Add package component"
                onAdd={() => setComponentDraft("new")}
                columns={["Package", "Kind", "Existing source", "Quantity", "Sort order"]}
                empty="No matching package components."
                addDisabled={packages.length === 0}
                rows={filteredComponents.map((row) => ({
                  id: row.id,
                  cells: [
                    `${packageById.get(row.packageId)?.code ?? ""} — ${packageById.get(row.packageId)?.name ?? ""}`,
                    row.kindLabel,
                    row.sourceLabel,
                    String(row.quantity),
                    String(row.sortOrder),
                  ],
                  onEdit: () => setComponentDraft(row),
                  onDelete: () => deleteMutation.mutate(row.id),
                }))}
              />
            ) : null}

            <MealPlanSheet
              key={mealDraft === "new" ? "meal-new" : (mealDraft?.id ?? "meal-closed")}
              open={mealDraft !== null}
              canEdit={canEdit}
              value={mealDraft === "new" || mealDraft === null ? null : mealDraft}
              pending={mealMutation.isPending}
              onClose={() => setMealDraft(null)}
              onSave={(payload) => mealMutation.mutate({ restaurantId, ...payload })}
            />
            <PackageSheet
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
            <ComponentSheet
              key={
                componentDraft === "new"
                  ? "component-new"
                  : (componentDraft?.id ?? "component-closed")
              }
              open={componentDraft !== null}
              canEdit={canEdit}
              snapshot={snapshot}
              {...(selectedPackageId === "all" ? {} : { initialPackageId: selectedPackageId })}
              value={componentDraft === "new" || componentDraft === null ? null : componentDraft}
              pending={componentMutation.isPending}
              onClose={() => setComponentDraft(null)}
              onSave={(payload) => componentMutation.mutate({ restaurantId, ...payload })}
            />
          </div>
        )}
      </PmsPropertySetupCard3Workspace>
    </Tabs>
  );
}

function MealsTable({
  canEdit,
  addLabel,
  addDisabled,
  empty,
  columns,
  rows,
  onAdd,
}: {
  canEdit: boolean;
  addLabel: string;
  addDisabled?: boolean;
  empty: string;
  columns: string[];
  rows: { id: string; cells: string[]; onEdit: () => void; onDelete?: () => void }[];
  onAdd: () => void;
}) {
  return (
    <div className="space-y-3">
      {canEdit ? (
        <Button
          type="button"
          disabled={addDisabled}
          onClick={onAdd}
          className={`bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90 ${goldFocus}`}
        >
          {addLabel}
        </Button>
      ) : null}
      <div className="overflow-x-auto rounded-2xl border border-border bg-white">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="border-b bg-[#f7f4ef] text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col" className="px-3 py-2">
                  {column}
                </th>
              ))}
              <th scope="col" className="px-3 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-6 text-muted-foreground">
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t">
                  {row.cells.map((cell, index) => (
                    <td key={`${row.id}-${index}`} className="px-3 py-2 align-top">
                      {cell}
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    {canEdit ? (
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={goldFocus}
                          onClick={row.onEdit}
                        >
                          Edit
                        </Button>
                        {row.onDelete ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className={goldFocus}
                            onClick={row.onDelete}
                          >
                            Delete
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
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
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{value ? "Edit meal plan" : "Add meal plan"}</SheetTitle>
          <SheetDescription>Configure a typed meal plan for this property.</SheetDescription>
        </SheetHeader>
        <form
          className="mt-4 space-y-3 px-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canEdit) return;
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
            });
          }}
        >
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
          {canEdit ? (
            <Button
              type="submit"
              disabled={pending}
              className={`w-full bg-[#C89933] text-[#251605] ${goldFocus}`}
            >
              Save meal plan
            </Button>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
  );
}

function PackageSheet({
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
  }) => void;
}) {
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [type, setType] = useState<PackageType>(value?.type ?? "accommodation");
  const [description, setDescription] = useState(value?.description ?? "");
  const [price, setPrice] = useState(value?.packagePrice ?? 0);
  const [active, setActive] = useState(value?.active ?? true);
  const [roomTypeIds, setRoomTypeIds] = useState(value?.roomTypeIds ?? []);
  const [ratePlanIds, setRatePlanIds] = useState(value?.ratePlanIds ?? []);

  function toggle(
    current: string[],
    id: string,
    checked: boolean,
    setter: (ids: string[]) => void,
  ) {
    setter(checked ? [...new Set([...current, id])] : current.filter((row) => row !== id));
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{value ? "Edit package" : "Add package"}</SheetTitle>
          <SheetDescription>
            Applicability reuses Card 2 room types and Phase 3 rate plans.
          </SheetDescription>
        </SheetHeader>
        <form
          className="mt-4 space-y-3 px-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (canEdit)
              onSave({
                ...(value ? { id: value.id } : {}),
                code,
                name,
                type,
                description,
                packagePrice: price,
                active,
                roomTypeIds,
                ratePlanIds,
              });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="package-code">Code</Label>
            <Input
              id="package-code"
              value={code}
              maxLength={20}
              disabled={!canEdit}
              className={goldFocus}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="package-name">Name</Label>
            <Input
              id="package-name"
              value={name}
              disabled={!canEdit}
              className={goldFocus}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="package-type">Type</Label>
            <Select
              value={type}
              disabled={!canEdit}
              onValueChange={(next) => setType(next as PackageType)}
            >
              <SelectTrigger id="package-type" className={goldFocus}>
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
            <Label htmlFor="package-description">Description</Label>
            <Textarea
              id="package-description"
              value={description}
              disabled={!canEdit}
              className={goldFocus}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="package-price">
              Package price ({currencyCode || "property currency"})
            </Label>
            <Input
              id="package-price"
              type="number"
              min={0}
              step="any"
              value={price}
              disabled={!canEdit}
              className={goldFocus}
              onChange={(event) => setPrice(Number(event.target.value))}
            />
          </div>
          <ApplicabilityList
            title="Room types (Card 2)"
            prefix="package-room"
            rows={roomTypes}
            selected={roomTypeIds}
            canEdit={canEdit}
            onToggle={(id, checked) => toggle(roomTypeIds, id, checked, setRoomTypeIds)}
          />
          <ApplicabilityList
            title="Rate plans (Phase 3)"
            prefix="package-rate"
            rows={ratePlans}
            selected={ratePlanIds}
            canEdit={canEdit}
            onToggle={(id, checked) => toggle(ratePlanIds, id, checked, setRatePlanIds)}
          />
          <ActiveField id="package-active" active={active} canEdit={canEdit} onChange={setActive} />
          {canEdit ? (
            <Button
              type="submit"
              disabled={pending}
              className={`w-full bg-[#C89933] text-[#251605] ${goldFocus}`}
            >
              Save package
            </Button>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
  );
}

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
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{value ? "Edit package component" : "Add package component"}</SheetTitle>
          <SheetDescription>
            Select an existing source. Source catalogues remain owned by their modules.
          </SheetDescription>
        </SheetHeader>
        <form
          className="mt-4 space-y-3 px-1"
          onSubmit={(event) => {
            event.preventDefault();
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
          {canEdit ? (
            <Button
              type="submit"
              disabled={pending || !packageId || !sourceId}
              className={`w-full bg-[#C89933] text-[#251605] ${goldFocus}`}
            >
              Save component
            </Button>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
  );
}

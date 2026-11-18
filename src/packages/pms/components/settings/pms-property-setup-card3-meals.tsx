import { useEffect, useMemo, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useServerFn } from "@tanstack/react-start";

import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";



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

import { Switch } from "@/shared/components/ui/switch";

import { Textarea } from "@/shared/components/ui/textarea";

import { cn } from "@/shared/lib/utils";

import { PmsPropertySetupCard3Workspace } from "@/packages/pms/components/settings/pms-property-setup-card3-workspace";

import {

  Card3InheritedStrip,

  Card3ListSection,

  Card3OverlapSheet,

  Card3StatusDot,

} from "@/packages/pms/components/settings/pms-property-setup-card3-primitives";

import type { Card3Domain } from "@/packages/pms/lib/pms-property-setup-card3";
import type { PropertySetupCardStatus } from "@/packages/pms/lib/pms-property-setup-card1";

import {

  createPackageCoverUpload,

  deletePackageComponentCard3,

  getMealsCard3,

  removePackageCoverImage,

  saveMealPlanCard3,

  setPackageCoverImage,

  savePackageCard3,

  savePackageComponentCard3,

} from "@/packages/pms/lib/meals-card3.functions";

import { PackageBenefitsServicesSection } from "@/packages/pms/components/settings/package-benefits-services-section";
import {
  isValidPackageCode,
  PACKAGE_CODE_STAFF_HINT,
  suggestPackageCode,
} from "@/packages/pms/lib/meals-package-code";

import type { ServiceDateRule } from "@/packages/pms/lib/service-entitlement";

import {

  CARD3_MEALS_TABS,

  PACKAGE_CHARGE_BASES,

  PACKAGE_CHARGE_BASIS_DEFAULT,

  PACKAGE_CHARGE_BASIS_LABELS,

  PACKAGE_COVER_CONTENT_TYPES,

  PACKAGE_COVER_MAX_BYTES,

  type PackageChargeBasis,

  MEAL_PLAN_TYPE_LABELS,

  PACKAGE_COMPONENT_KIND_LABELS,

  PACKAGE_COMPONENT_KINDS,

  PACKAGE_INCLUSION_TYPE_LABELS,

  PACKAGE_INCLUSION_TYPES,

  PACKAGE_TYPE_LABELS,

  SERVICE_TIMING_LABELS,

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
import { friendlySetupError } from "@/packages/pms/lib/setup-form-errors";



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

  chargeBasis: PackageChargeBasis;

  active: boolean;

  serviceTypeIds: string[];

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



export type MealsCatalogueMode = "all" | "meals" | "packages";

export function PmsPropertySetupCard3Meals({

  restaurantId,

  canEdit,

  domain,

  embedded = false,

  catalogueMode = "all",

  onReadiness,

  onMealPlanCreated,

  onPackageCreated,

}: {

  restaurantId: string;

  canEdit: boolean;

  domain?: Card3Domain;

  embedded?: boolean;

  /** Catalogue admin only — Rate Plan Step 3 Manage catalogue / Manage packages overlays. */
  catalogueMode?: MealsCatalogueMode;

  onReadiness?: (status: PropertySetupCardStatus, blockers: string[]) => void;

  onBack?: () => void;

  onMealPlanCreated?: (mealPlanId: string) => void;

  onPackageCreated?: (packageId: string) => void;

}) {
  const showMeals = catalogueMode === "all" || catalogueMode === "meals";
  const showPackages = catalogueMode === "all" || catalogueMode === "packages";
  const catalogueOnly = catalogueMode !== "all";

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

  useEffect(() => {
    const readiness = query.data?.readiness;
    if (!readiness || !onReadiness) return;
    onReadiness(readiness.status, readiness.blockers);
  }, [onReadiness, query.data?.readiness]);

  const mealPlans = useMemo(() => snapshot?.mealPlans ?? [], [snapshot?.mealPlans]);

  const packages = useMemo(() => snapshot?.packages ?? [], [snapshot?.packages]);

  useEffect(() => {
    setPackageDraft((current) => {
      if (!current || current === "new") return current;
      const fresh = packages.find((row) => row.id === current.id);
      if (!fresh) return current;
      if (
        fresh.coverImagePath === current.coverImagePath &&
        fresh.coverUrl === current.coverUrl
      ) {
        return current;
      }
      return {
        ...current,
        coverImagePath: fresh.coverImagePath,
        coverUrl: fresh.coverUrl,
      };
    });
  }, [packages]);

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

    void queryClient.invalidateQueries({ queryKey: ["pms-card2-rates", restaurantId] });

  }



  const mealMutation = useMutation({

    mutationFn: (input: MealPlanInput) => saveMeal({ data: input }),

    onSuccess: (result, variables) => {

      toast.success("Meal plan saved.");

      setMealDraft(null);

      invalidate();

      if (!variables.id) {

        const created = result?.snapshot?.mealPlans?.find(

          (row) => row.code.trim().toUpperCase() === variables.code.trim().toUpperCase(),

        );

        if (created) onMealPlanCreated?.(created.id);

      }

    },

    onError: (error: Error) => toast.error(friendlySetupError(error)),

  });

  const packageMutation = useMutation({

    mutationFn: (input: PackageInput) => savePackage({ data: input }),

  });

  // Component mutations wired for Phase E

  const componentMutation = useMutation({

    mutationFn: (input: ComponentInput) => saveComponent({ data: input }),

    onSuccess: () => {

      toast.success("Package component saved.");

      invalidate();

    },

    onError: (error: Error) => toast.error(friendlySetupError(error)),

  });

  const deleteMutation = useMutation({

    mutationFn: (id: string) => deleteComponent({ data: { restaurantId, id } }),

    onSuccess: () => {

      toast.success("Package component deleted.");

      invalidate();

    },

    onError: (error: Error) => toast.error(friendlySetupError(error)),

  });



  void CARD3_MEALS_TABS;
  void componentDraft;



  const mealsBody = (

    <>

      {query.isLoading ? (

        <p className="text-sm text-muted-foreground">Loading meal plans and packages…</p>

      ) : query.isError || !snapshot ? (

        <p className="text-sm text-destructive">

          {(query.error as Error | undefined)?.message ?? "Meal Plans & Packages are unavailable."}

        </p>

      ) : (

        <div
          className="space-y-4"
          data-testid="pms-card3-meals"
          data-catalogue-mode={catalogueMode}
        >

          {!catalogueOnly ? (
            <Card3InheritedStrip>

              Configure meal plans and packages available for rate plans at this property.

            </Card3InheritedStrip>
          ) : null}



          {/* ── Meal Plans list ── */}

          {showMeals ? (
          <Card3ListSection

            title="Meal plans"

            icon="meal"

            search={mealSearch}

            onSearch={setMealSearch}

            placeholder="Search meal plans"

            canEdit={canEdit}

            addLabel="Add Meal Plan"

            onAdd={() => setMealDraft("new")}

            columns={["Code", "Name", "Type", "Description", "Meals", "Tax treatment", "Status"]}

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
          ) : null}



          {/* Package components live inside Package Master → Includes.
              Meal Service Rules UI retired — operational kitchen schedules are not
              commercial Meal Plan/Package setup. Legacy policy storage remains. */}

          {showPackages ? (
          <Card3ListSection

            title="Packages"

            icon="tag"

            search={packageSearch}

            onSearch={setPackageSearch}

            placeholder="Search packages"

            canEdit={canEdit}

            addLabel="Add Package"

            onAdd={() => setPackageDraft("new")}

            columns={[

              ...(catalogueMode === "packages" ? ["Cover"] : []),

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

                ...(catalogueMode === "packages"
                  ? [
                      row.coverUrl ? (
                        <img
                          key={`${row.id}-cover`}
                          src={row.coverUrl}
                          alt=""
                          className="h-8 w-10 rounded object-cover"
                        />
                      ) : (
                        <span key={`${row.id}-cover`} className="text-muted-foreground">
                          —
                        </span>
                      ),
                    ]
                  : []),

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
          ) : null}



          {/* ── Editors ── */}

          {showMeals ? (
          <MealPlanSheet

            key={mealDraft === "new" ? "meal-new" : (mealDraft?.id ?? "meal-closed")}

            open={mealDraft !== null}

            canEdit={canEdit}

            value={mealDraft === "new" || mealDraft === null ? null : mealDraft}

            pending={mealMutation.isPending}

            className={catalogueOnly ? "z-[90]" : undefined}

            onClose={() => setMealDraft(null)}

            onSave={(payload) => mealMutation.mutate({ restaurantId, ...payload })}

          />
          ) : null}



          {/* Unified Package Master editor — replaces old PackageSheet.

              Writer: savePackageCard3 (canonical). No second package writer. */}

          {showPackages ? (
          <PackageMasterEditor

            key={packageDraft === "new" ? "package-new" : (packageDraft?.id ?? "package-closed")}

            open={packageDraft !== null}

            restaurantId={restaurantId}

            canEdit={canEdit}

            currencyCode={snapshot.currencyCode}

            roomTypes={snapshot.roomTypes}

            ratePlans={snapshot.ratePlans}

            components={components}

            mealPlans={mealPlans}

            roomAmenities={snapshot.roomAmenities}

            foServices={snapshot.foServices}

            departments={snapshot.departments}

            guestServiceCategories={snapshot.guestServiceCategories}

            guestServiceTypes={snapshot.guestServiceTypes}

            existingPackages={packages}

            value={packageDraft === "new" || packageDraft === null ? null : packageDraft}

            pending={packageMutation.isPending}

            componentPending={componentMutation.isPending || deleteMutation.isPending}

            className={catalogueOnly ? "z-[90]" : undefined}

            onClose={() => setPackageDraft(null)}

            onSave={async (payload) => {
              const wasCreate = !payload.id;
              const result = await packageMutation.mutateAsync({ restaurantId, ...payload });
              const saved = result?.snapshot?.packages?.find(
                (row) => row.code.trim().toUpperCase() === payload.code.trim().toUpperCase(),
              );
              if (!saved) throw new Error("Package could not be saved.");
              if (wasCreate) onPackageCreated?.(saved.id);
              return { id: saved.id, name: saved.name };
            }}

            onSaved={() => {
              toast.success("Package saved.");
              invalidate();
            }}

            onSaveComponent={(payload) => componentMutation.mutate({ restaurantId, ...payload })}

            onDeleteComponent={(id) => deleteMutation.mutate(id)}

          />
          ) : null}

        </div>

      )}

    </>

  );

  if (embedded || !domain) return mealsBody;

  return (

    <PmsPropertySetupCard3Workspace domain={domain}>

      {mealsBody}

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



export function MealPlanSheet({
  open,
  canEdit,
  value,
  pending,
  className,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  value: MealPlanCard3Row | null;
  pending: boolean;
  className?: string;
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
      className={className}
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

          <Label htmlFor="meal-code">
            Code <span className="text-destructive">*</span>
          </Label>

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

          <Label htmlFor="meal-name">
            Name <span className="text-destructive">*</span>
          </Label>

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

            <SelectContent className="z-[100]">

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

        <fieldset className="space-y-1.5 rounded-xl border px-3 py-2">

          <legend className="px-1 text-sm font-medium text-[#251605]">Included meals</legend>

          {[

            ["meal-breakfast", "Breakfast", breakfast, setBreakfast],

            ["meal-lunch", "Lunch", lunch, setLunch],

            ["meal-dinner", "Dinner", dinner, setDinner],

          ].map(([id, label, checked, setter]) => (

            <label
              key={String(id)}
              htmlFor={String(id)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors",
                checked
                  ? "border-[#C89933] bg-[#FBF3E0] text-[#251605]"
                  : "border-[#E6E1D8] bg-white text-[#5C5346]",
                !canEdit && "cursor-not-allowed opacity-60",
              )}
            >

              <Checkbox
                id={String(id)}
                checked={Boolean(checked)}
                disabled={!canEdit}
                className={goldFocus}
                onCheckedChange={(next) => (setter as (value: boolean) => void)(next === true)}
              />

              <span>{String(label)}</span>

            </label>

          ))}

        </fieldset>

        <div className="space-y-1">

          <Label htmlFor="meal-tax">Tax treatment</Label>

          <Select

            value={taxPosture}

            disabled={!canEdit}

            onValueChange={(next) => setTaxPosture(next as TaxPosture)}

          >

            <SelectTrigger id="meal-tax" className={goldFocus}>

              <SelectValue />

            </SelectTrigger>

            <SelectContent className="z-[100]">

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

// Package Master Editor

// ---------------------------------------------------------------------------

// Active sections:

//   1. Basic Information  (code, name, type/category, description, active)

//   2. Pricing            (package_price, charge basis)

//   3. Benefits & Services (Guest Service Types via pms_packages.inclusion)

//   4. Cover Image

//

// Writer: savePackageCard3 (canonical). No second package writer created here.

// Legacy room/rate applicability links are preserved on save (not edited here).

// Rate Plan will own package assignment.

// ---------------------------------------------------------------------------



// ---------------------------------------------------------------------------

function validatePackageCoverFile(file: File): string | null {
  if (!(PACKAGE_COVER_CONTENT_TYPES as readonly string[]).includes(file.type)) {
    return "Use a JPG, PNG, or WebP image.";
  }
  if (file.size > PACKAGE_COVER_MAX_BYTES) {
    return "Images must be 8 MB or smaller.";
  }
  return null;
}

async function uploadPackageCoverFile(input: {
  restaurantId: string;
  packageId: string;
  file: File;
  startUpload: (args: {
    data: {
      restaurantId: string;
      packageId: string;
      contentType: (typeof PACKAGE_COVER_CONTENT_TYPES)[number];
      size: number;
    };
  }) => Promise<{ ok: boolean; path?: string; token?: string; message?: string }>;
  setCover: (args: {
    data: { restaurantId: string; packageId: string; storagePath: string };
  }) => Promise<unknown>;
}) {
  const ticket = await input.startUpload({
    data: {
      restaurantId: input.restaurantId,
      packageId: input.packageId,
      contentType: input.file.type as (typeof PACKAGE_COVER_CONTENT_TYPES)[number],
      size: input.file.size,
    },
  });
  if (!ticket.ok || !ticket.path || !ticket.token) {
    throw new Error(ticket.message ?? "Could not start the upload.");
  }
  const uploaded = await supabase.storage
    .from("property-images")
    .uploadToSignedUrl(ticket.path, ticket.token, input.file);
  if (uploaded.error) {
    throw new Error("Upload failed.");
  }
  await input.setCover({
    data: {
      restaurantId: input.restaurantId,
      packageId: input.packageId,
      storagePath: ticket.path,
    },
  });
}

function PackageCoverSection({
  restaurantId,
  packageId,
  packageName,
  coverUrl,
  canEdit,
  pendingFile,
  pendingPreviewUrl,
  onSelectPending,
  onClearPending,
  busy: busyExternal = false,
}: {
  restaurantId: string;
  packageId: string | null;
  packageName: string;
  coverUrl: string | null;
  canEdit: boolean;
  pendingFile: File | null;
  pendingPreviewUrl: string | null;
  onSelectPending: (file: File) => void;
  onClearPending: () => void;
  busy?: boolean;
}) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const startUpload = useServerFn(createPackageCoverUpload);
  const setCover = useServerFn(setPackageCoverImage);
  const removeCover = useServerFn(removePackageCoverImage);

  const working = busy || busyExternal;
  const deferUpload = !packageId;
  const displayUrl = pendingPreviewUrl || coverUrl;
  const hasImage = Boolean(displayUrl);

  function resetFile() {
    if (fileRef.current) fileRef.current.value = "";
  }

  async function refreshCover() {
    await queryClient.invalidateQueries({ queryKey: ["pms-card3-meals", restaurantId] });
  }

  async function onFile(file: File | undefined) {
    if (!canEdit || !file) return;
    const invalid = validatePackageCoverFile(file);
    if (invalid) {
      toast.error(invalid);
      resetFile();
      return;
    }

    // Create mode (or pending retry): keep File locally — do not upload yet.
    if (deferUpload || pendingFile) {
      onSelectPending(file);
      setConfirmRemove(false);
      resetFile();
      return;
    }

    if (!packageId) return;
    setBusy(true);
    try {
      await uploadPackageCoverFile({
        restaurantId,
        packageId,
        file,
        startUpload,
        setCover,
      });
      onClearPending();
      await refreshCover();
      toast.success(coverUrl ? "Cover image replaced." : "Cover image uploaded.");
      setConfirmRemove(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cover image could not be saved.");
    } finally {
      setBusy(false);
      resetFile();
    }
  }

  async function onRemovePersisted() {
    if (!packageId || !canEdit) return;
    setBusy(true);
    try {
      await removeCover({ data: { restaurantId, packageId } });
      await refreshCover();
      toast.success("Cover image removed.");
      setConfirmRemove(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cover image could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  function onRemoveClick() {
    if (pendingFile || pendingPreviewUrl) {
      onClearPending();
      setConfirmRemove(false);
      return;
    }
    if (!packageId) return;
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    void onRemovePersisted();
  }

  return (
    <div
      className="space-y-3 rounded-xl border border-[#E7E0D4] bg-white px-4 py-3"
      data-testid="package-master-section-cover"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-[#9B9083]">4. Cover Image</p>
      <p className="text-xs text-muted-foreground">
        Add a cover image for booking pages and package presentation.
      </p>
      <div className="aspect-[16/10] w-full max-w-xs overflow-hidden rounded-xl border border-[#DDD4C5] bg-[#FAF8F4]">
        {hasImage ? (
          <img
            src={displayUrl ?? undefined}
            alt={packageName || "Package cover"}
            className="h-full w-full object-cover"
            data-testid="pkg-cover-preview"
          />
        ) : (
          <div
            className="flex h-full min-h-28 items-center justify-center px-3 text-center text-xs text-muted-foreground"
            data-testid="pkg-cover-empty"
          >
            No cover image
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Optional. JPG, PNG, or WebP. Max 8 MB.
        {pendingFile ? " Selected image will upload when you save the package." : null}
      </p>
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            data-testid="pkg-cover-file"
            onChange={(event) => void onFile(event.target.files?.[0])}
          />
          {hasImage ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={working}
                data-testid="pkg-cover-replace"
                onClick={() => fileRef.current?.click()}
              >
                {working ? "Working…" : "Replace Image"}
              </Button>
              {confirmRemove && !pendingFile && packageId ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={working}
                    data-testid="pkg-cover-remove-confirm"
                    onClick={() => void onRemovePersisted()}
                  >
                    Remove cover
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={working}
                    onClick={() => setConfirmRemove(false)}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={working}
                  data-testid="pkg-cover-remove"
                  onClick={onRemoveClick}
                >
                  Remove Image
                </Button>
              )}
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={working}
              data-testid="pkg-cover-upload"
              onClick={() => fileRef.current?.click()}
            >
              {working ? "Working…" : "Upload Cover Image"}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function PackageMasterEditor({

  open,

  restaurantId,

  canEdit,

  currencyCode,

  components,

  mealPlans,

  roomAmenities,

  foServices,

  departments,

  guestServiceCategories = [],

  guestServiceTypes = [],

  existingPackages = [],

  value,

  pending,

  componentPending,

  onClose,

  onSave,

  onSaved,

  onSaveComponent,

  onDeleteComponent,

  className,

}: {

  open: boolean;

  restaurantId: string;

  canEdit: boolean;

  currencyCode: string;

  /** @deprecated Legacy prop — room/rate applicability is no longer edited in Package Master. */
  roomTypes?: MealsCard3Snapshot["roomTypes"];

  /** @deprecated Legacy prop — room/rate applicability is no longer edited in Package Master. */
  ratePlans?: MealsCard3Snapshot["ratePlans"];

  /** @deprecated Legacy typed components — Meal Plans / Amenities no longer edited here. */
  components: PackageComponentCard3Row[];

  /** @deprecated Legacy — Meal Plans are Rate Plan owned. */
  mealPlans: MealsCard3Snapshot["mealPlans"];

  /** @deprecated Legacy — Room Amenities are Room Type owned. */
  roomAmenities: MealsCard3Snapshot["roomAmenities"];

  /** @deprecated Legacy FO catalogue — Benefits & Services uses Guest Service Types. */
  foServices: MealsCard3Snapshot["foServices"];

  departments: MealsCard3Snapshot["departments"];

  guestServiceCategories?: MealsCard3Snapshot["guestServiceCategories"];

  guestServiceTypes?: MealsCard3Snapshot["guestServiceTypes"];

  existingPackages?: ReadonlyArray<{ id: string; code: string }>;

  value: PackageCard3Row | null;

  pending: boolean;

  componentPending: boolean;

  className?: string;

  onClose: () => void;

  /**
   * Persist package identity / pricing / benefits.
   * Must return the saved package id so Cover Image can upload afterward.
   */
  onSave: (payload: {

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

  }) => Promise<{ id: string; name: string }>;

  /** Called after package + optional cover succeed, before the editor closes. */
  onSaved?: (pkg: { id: string; name: string }) => void;

  onSaveComponent: (

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

  onDeleteComponent: (id: string) => void;

}) {

  // Section 1 — Basic Information
  // Create: code auto-fills from name until manually edited. Edit: never overwrite stored code.
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(Boolean(value?.code));
  const [codeTouched, setCodeTouched] = useState(false);
  const [type, setType] = useState<PackageType>(value?.type ?? "accommodation");
  const [description, setDescription] = useState(value?.description ?? "");
  const [active, setActive] = useState(value?.active ?? true);



  // Section 2 — Pricing

  const [price, setPrice] = useState(value?.packagePrice ?? 0);

  const [chargeBasis, setChargeBasis] = useState<PackageChargeBasis>(
    value?.chargeBasis ?? PACKAGE_CHARGE_BASIS_DEFAULT,
  );



  // Section 3 — Benefits & Services (Guest Service Types)
  // Held in local modal state so create can select services before first save.
  const [selectedServiceTypeIds, setSelectedServiceTypeIds] = useState<string[]>(
    () => value?.serviceTypeIds ?? [],
  );

  // Section 4 — Cover Image local draft (upload after package id exists).
  const queryClient = useQueryClient();
  const [persistedPackageId, setPersistedPackageId] = useState<string | null>(
    () => value?.id ?? null,
  );
  const [pendingCoverFile, setPendingCoverFile] = useState<File | null>(null);
  const [pendingCoverPreviewUrl, setPendingCoverPreviewUrl] = useState<string | null>(null);
  const [savingPackage, setSavingPackage] = useState(false);

  const startUpload = useServerFn(createPackageCoverUpload);
  const setCover = useServerFn(setPackageCoverImage);

  // Silence unused legacy props retained for caller compatibility.
  void components;
  void mealPlans;
  void roomAmenities;
  void foServices;
  void departments;
  void componentPending;
  void onSaveComponent;
  void onDeleteComponent;

  useEffect(() => {
    return () => {
      if (pendingCoverPreviewUrl) URL.revokeObjectURL(pendingCoverPreviewUrl);
    };
  }, [pendingCoverPreviewUrl]);

  function selectPendingCover(file: File) {
    setPendingCoverPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setPendingCoverFile(file);
  }

  function clearPendingCover() {
    setPendingCoverPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPendingCoverFile(null);
  }

  const normalizedCode = code.trim().toUpperCase();
  const selfPackageId = persistedPackageId ?? value?.id ?? null;
  const codeFormatInvalid = Boolean(normalizedCode) && !isValidPackageCode(normalizedCode);
  const codeDuplicate = Boolean(
    normalizedCode &&
      existingPackages.some(
        (row) =>
          row.code.trim().toUpperCase() === normalizedCode &&
          row.id !== selfPackageId,
      ),
  );
  const codeInlineError = !normalizedCode
    ? codeTouched
      ? "Package code is required."
      : null
    : codeFormatInvalid
      ? PACKAGE_CODE_STAFF_HINT
      : codeDuplicate
        ? "That package code is already used for this property."
        : null;

  function staffFacingPackageSaveError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (
      /Use 1–20 letters, numbers, or underscores/i.test(message) ||
      /"code"\s*:\s*"custom"/i.test(message) ||
      (/^\s*\[\{/.test(message) && /code/i.test(message))
    ) {
      return PACKAGE_CODE_STAFF_HINT;
    }
    if (/23505|already used|duplicate/i.test(message)) {
      return "That package code is already used for this property.";
    }
    return friendlySetupError(
      error instanceof Error ? error : new Error(message),
      "Failed to save package.",
    );
  }

  async function handleSubmit() {
    if (!canEdit || savingPackage) return;
    setCodeTouched(true);
    if (!name.trim()) {
      toast.error("Enter a package name before saving.");
      return;
    }
    if (!normalizedCode || codeFormatInvalid) {
      toast.error(PACKAGE_CODE_STAFF_HINT);
      return;
    }
    if (codeDuplicate) {
      toast.error("That package code is already used for this property.");
      return;
    }

    setSavingPackage(true);
    try {
      // 1–4. Create/update package + benefits. Reuse persisted id after partial cover failure.
      const saved = await onSave({
        ...((persistedPackageId ?? value?.id) ? { id: persistedPackageId ?? value?.id } : {}),
        code: normalizedCode,
        name,
        type,
        description,
        packagePrice: price,
        chargeBasis,
        active,
        serviceTypeIds: selectedServiceTypeIds,
        roomTypeIds: value?.roomTypeIds ?? [],
        ratePlanIds: value?.ratePlanIds ?? [],
        ratePlanLinks: value?.ratePlanLinks ?? [],
      });
      setPersistedPackageId(saved.id);

      // 5–6. Upload pending cover after package id exists.
      if (pendingCoverFile) {
        try {
          await uploadPackageCoverFile({
            restaurantId,
            packageId: saved.id,
            file: pendingCoverFile,
            startUpload,
            setCover,
          });
          clearPendingCover();
          await queryClient.invalidateQueries({ queryKey: ["pms-card3-meals", restaurantId] });
        } catch (coverError: unknown) {
          toast.error(
            (coverError as Error)?.message ??
              "Package saved, but the cover image could not be uploaded. You can try Save again.",
          );
          return;
        }
      }

      if (onSaved) {
        onSaved(saved);
      } else {
        toast.success("Package saved.");
      }
      onClose();
    } catch (error: unknown) {
      toast.error(staffFacingPackageSaveError(error));
    } finally {
      setSavingPackage(false);
    }
  }

  return (

    <Card3OverlapSheet

      open={open}

      onClose={onClose}

      className={className}

      title={value || persistedPackageId ? "Edit package" : "Add package"}

      description="Create a reusable hotel package that can be attached to rate plans."

      canEdit={canEdit}

      pending={pending || savingPackage}

      submitLabel="Save package"

      onSubmit={() => {
        void handleSubmit();
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

              <Label htmlFor="pkg-master-name">Name</Label>

              <Input

                id="pkg-master-name"

                value={name}

                disabled={!canEdit}

                className={goldFocus}

                placeholder="e.g. Weekend Escape"

                onChange={(event) => {
                  const nextName = event.target.value;
                  setName(nextName);
                  if (!codeManuallyEdited) {
                    setCode(suggestPackageCode(nextName));
                  }
                }}

              />

            </div>

            <div className="space-y-1">

              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="pkg-master-code">Code</Label>
                {canEdit && codeManuallyEdited && name.trim() ? (
                  <button
                    type="button"
                    className="text-[10px] font-medium text-[#8A641A] hover:underline"
                    data-testid="pkg-master-code-reset-auto"
                    onClick={() => {
                      setCodeManuallyEdited(false);
                      setCode(suggestPackageCode(name));
                      setCodeTouched(false);
                    }}
                  >
                    Reset to auto
                  </button>
                ) : null}
              </div>

              <div className="relative">
                <Input

                  id="pkg-master-code"

                  value={code}

                  maxLength={20}

                  disabled={!canEdit}

                  className={cn(
                    goldFocus,
                    "pr-14 font-mono uppercase",
                    codeInlineError && "border-destructive",
                  )}

                  placeholder="e.g. WEEKEND_ESCAPE"

                  aria-invalid={codeInlineError ? true : undefined}

                  onBlur={() => setCodeTouched(true)}

                  onChange={(event) => {
                    setCodeManuallyEdited(true);
                    setCode(event.target.value.toUpperCase());
                  }}

                />
                {!codeManuallyEdited && code ? (
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded bg-[#EDE6D8] px-1.5 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wider text-[#5C4528]">
                    Auto
                  </span>
                ) : null}
              </div>
              {codeInlineError ? (
                <p className="text-[11px] text-destructive" data-testid="pkg-master-code-error">
                  {codeInlineError}
                </p>
              ) : null}

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

          </div>

          <div className="space-y-1">

            <Label htmlFor="pkg-master-charge-basis">Charge basis</Label>

            <Select
              value={chargeBasis}
              disabled={!canEdit}
              onValueChange={(next) => setChargeBasis(next as PackageChargeBasis)}
            >
              <SelectTrigger id="pkg-master-charge-basis" data-testid="pkg-master-charge-basis">
                <SelectValue placeholder="Select charge basis" />
              </SelectTrigger>

              <SelectContent>

                {PACKAGE_CHARGE_BASES.map((basis) => (

                  <SelectItem key={basis} value={basis}>

                    {PACKAGE_CHARGE_BASIS_LABELS[basis]}

                  </SelectItem>

                ))}

              </SelectContent>

            </Select>

            <p className="text-xs text-muted-foreground">

              This is the package component price. Room pricing remains controlled by the Rate Plan.

            </p>

            {chargeBasis !== "per_stay" ? (

              <p className="text-xs text-muted-foreground" data-testid="pkg-charge-basis-limit">

                Configured charge basis is stored for package setup. Operational charging currently

                supports Per stay only; other bases are not yet applied automatically.

              </p>

            ) : null}

          </div>

        </div>



        <PackageBenefitsServicesSection
          canEdit={canEdit}
          categories={guestServiceCategories}
          serviceTypes={guestServiceTypes}
          selectedIds={selectedServiceTypeIds}
          onChange={setSelectedServiceTypeIds}
        />



        <PackageCoverSection
          restaurantId={restaurantId}
          packageId={persistedPackageId ?? value?.id ?? null}
          packageName={name}
          coverUrl={value?.coverUrl ?? null}
          canEdit={canEdit}
          pendingFile={pendingCoverFile}
          pendingPreviewUrl={pendingCoverPreviewUrl}
          onSelectPending={selectPendingCover}
          onClearPending={clearPendingCover}
          busy={savingPackage}
        />

      </div>

    </Card3OverlapSheet>

  );

}



// ---------------------------------------------------------------------------

// Legacy Package Master applicability helpers (no longer used in active editor).

// Kept for backward-compatible reads / historical references. Rate Plan will own

// package assignment.

// ---------------------------------------------------------------------------



/** @deprecated Package Master no longer edits room-type applicability. */
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



/** @deprecated Package Master no longer edits rate-plan applicability. */
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

      <legend className="px-1 text-sm font-medium text-[#251605]">Selected rate plans</legend>

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



// Legacy component sheet remains retained for compatibility but is no longer a primary workflow.

void ComponentSheet;

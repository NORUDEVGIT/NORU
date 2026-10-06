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

import { PmsPropertySetupCard3Workspace } from "@/packages/pms/components/settings/pms-property-setup-card3-workspace";

import {

  Card3InheritedStrip,

  Card3ListSection,

  Card3OverlapSheet,

  Card3StatusDot,

} from "@/packages/pms/components/settings/pms-property-setup-card3-primitives";

import type { Card3Domain } from "@/packages/pms/lib/pms-property-setup-card3";

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

import {

  CARD3_MEALS_TABS,

  PACKAGE_COVER_CONTENT_TYPES,

  PACKAGE_COVER_MAX_BYTES,

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

  // Component mutations wired for Phase E

  const componentMutation = useMutation({

    mutationFn: (input: ComponentInput) => saveComponent({ data: input }),

    onSuccess: () => {

      toast.success("Package component saved.");

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

  void componentDraft;



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

            restaurantId={restaurantId}

            canEdit={canEdit}

            currencyCode={snapshot.currencyCode}

            roomTypes={snapshot.roomTypes}

            ratePlans={snapshot.ratePlans}

            components={components}

            mealPlans={mealPlans}

            roomAmenities={snapshot.roomAmenities}

            foServices={snapshot.foServices}

            value={packageDraft === "new" || packageDraft === null ? null : packageDraft}

            pending={packageMutation.isPending}

            componentPending={componentMutation.isPending || deleteMutation.isPending}

            onClose={() => setPackageDraft(null)}

            onSave={(payload) => packageMutation.mutate({ restaurantId, ...payload })}

            onSaveComponent={(payload) => componentMutation.mutate({ restaurantId, ...payload })}

            onDeleteComponent={(id) => deleteMutation.mutate(id)}

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

// Package Master Editor — Phase B + Phase E + Phase F

// ---------------------------------------------------------------------------

// Section structure (see package-master-refactor-plan.md §4 Phase B):

//   1. Basic Information  ← live (code, name, type/category, description, active)

//   2. Pricing            ← live (package_price in property currency)

//   3. Includes           ← live — Phase E

//   4. Applicability      ← live — Phase F (room types + rate plans + inclusion_type)

//   5. Cover Image        ← placeholder — Phase C

//

// Writer: savePackageCard3 (canonical). No second package writer created here.

// Applicability state is edited locally and persisted through savePackageCard3.

// ---------------------------------------------------------------------------



// ---------------------------------------------------------------------------

function PackageCoverSection({
  restaurantId,
  packageId,
  packageName,
  coverUrl,
  canEdit,
}: {
  restaurantId: string;
  packageId: string | null;
  packageName: string;
  coverUrl: string | null;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const startUpload = useServerFn(createPackageCoverUpload);
  const setCover = useServerFn(setPackageCoverImage);
  const removeCover = useServerFn(removePackageCoverImage);

  function resetFile() {
    if (fileRef.current) fileRef.current.value = "";
  }

  async function refreshCover() {
    await queryClient.invalidateQueries({ queryKey: ["pms-card3-meals", restaurantId] });
  }

  async function onFile(file: File | undefined) {
    if (!packageId || !canEdit || !file) return;
    if (!(PACKAGE_COVER_CONTENT_TYPES as readonly string[]).includes(file.type)) {
      toast.error("Use a JPG, PNG, or WebP image.");
      resetFile();
      return;
    }
    if (file.size > PACKAGE_COVER_MAX_BYTES) {
      toast.error("Images must be 8 MB or smaller.");
      resetFile();
      return;
    }
    setBusy(true);
    try {
      const ticket = await startUpload({
        data: {
          restaurantId,
          packageId,
          contentType: file.type as (typeof PACKAGE_COVER_CONTENT_TYPES)[number],
          size: file.size,
        },
      });
      if (!ticket.ok) {
        toast.error(ticket.message ?? "Could not start the upload.");
        return;
      }
      const uploaded = await supabase.storage
        .from("property-images")
        .uploadToSignedUrl(ticket.path, ticket.token, file);
      if (uploaded.error) {
        toast.error("Upload failed.");
        return;
      }
      await setCover({
        data: { restaurantId, packageId, storagePath: ticket.path },
      });
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

  async function onRemove() {
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

  return (
    <div
      className="space-y-3 rounded-xl border border-[#E7E0D4] bg-white px-4 py-3"
      data-testid="package-master-section-cover"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-[#9B9083]">5. Cover Image</p>
      {!packageId ? (
        <p className="text-xs text-muted-foreground" data-testid="pkg-cover-unsaved">
          Save the package first to add a cover image.
        </p>
      ) : (
        <>
          <div className="aspect-[16/10] w-full max-w-xs overflow-hidden rounded-xl border border-[#DDD4C5] bg-[#FAF8F4]">
            {coverUrl ? (
              <img
                src={coverUrl}
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
          <p className="text-[11px] text-muted-foreground">JPG, PNG, or WebP. Max 8 MB.</p>
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
              {coverUrl ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    data-testid="pkg-cover-replace"
                    onClick={() => fileRef.current?.click()}
                  >
                    {busy ? "Working…" : "Replace Image"}
                  </Button>
                  {confirmRemove ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        data-testid="pkg-cover-remove-confirm"
                        onClick={() => void onRemove()}
                      >
                        Remove cover
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
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
                      disabled={busy}
                      data-testid="pkg-cover-remove"
                      onClick={() => setConfirmRemove(true)}
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
                  disabled={busy}
                  data-testid="pkg-cover-upload"
                  onClick={() => fileRef.current?.click()}
                >
                  {busy ? "Working…" : "Upload Cover Image"}
                </Button>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function PackageMasterEditor({

  open,

  restaurantId,

  canEdit,

  currencyCode,

  roomTypes,

  ratePlans,

  components,

  mealPlans,

  roomAmenities,

  foServices,

  value,

  pending,

  componentPending,

  onClose,

  onSave,

  onSaveComponent,

  onDeleteComponent,

}: {

  open: boolean;

  restaurantId: string;

  canEdit: boolean;

  currencyCode: string;

  roomTypes: MealsCard3Snapshot["roomTypes"];

  ratePlans: MealsCard3Snapshot["ratePlans"];

  components: PackageComponentCard3Row[];

  mealPlans: MealsCard3Snapshot["mealPlans"];

  roomAmenities: MealsCard3Snapshot["roomAmenities"];

  foServices: MealsCard3Snapshot["foServices"];

  value: PackageCard3Row | null;

  pending: boolean;

  componentPending: boolean;

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

  const [code, setCode] = useState(value?.code ?? "");

  const [name, setName] = useState(value?.name ?? "");

  const [type, setType] = useState<PackageType>(value?.type ?? "accommodation");

  const [description, setDescription] = useState(value?.description ?? "");

  const [active, setActive] = useState(value?.active ?? true);



  // Section 2 — Pricing

  const [price, setPrice] = useState(value?.packagePrice ?? 0);



  // Section 3 — Includes (Phase E)

  const [inclusionDraft, setInclusionDraft] = useState<{

    id?: string;

    kind: PackageComponentKind;

    sourceId: string;

    quantity: number;

    sortOrder: number;

  } | null>(null);



  const packageComponents = useMemo(() => {

    if (!value?.id) return [];

    return components

      .filter((c) => c.packageId === value.id)

      .sort((a, b) => {

        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;

        return a.sourceLabel.localeCompare(b.sourceLabel) || a.id.localeCompare(b.id);

      });

  }, [components, value?.id]);



  const draftKind = inclusionDraft?.kind;

  const draftSources = useMemo(() => {

    if (!draftKind) return [];

    if (draftKind === "meal_plan") return mealPlans;

    if (draftKind === "room_amenity") return roomAmenities;

    return foServices;

  }, [draftKind, mealPlans, roomAmenities, foServices]);



  function changeDraftKind(nextKind: PackageComponentKind) {

    const nextSources =

      nextKind === "meal_plan"

        ? mealPlans

        : nextKind === "room_amenity"

          ? roomAmenities

          : foServices;

    setInclusionDraft((prev) =>

      prev

        ? {

          ...prev,

          kind: nextKind,

          sourceId: nextSources[0]?.id ?? "",

        }

        : null,

    );

  }



  function startAddInclusion() {

    const nextKind: PackageComponentKind = "meal_plan";

    const initialSource = mealPlans[0]?.id ?? roomAmenities[0]?.id ?? foServices[0]?.id ?? "";

    const nextSortOrder =

      packageComponents.length > 0 ? Math.max(...packageComponents.map((c) => c.sortOrder)) + 1 : 0;

    setInclusionDraft({

      kind: nextKind,

      sourceId: initialSource,

      quantity: 1,

      sortOrder: nextSortOrder,

    });

  }



  function startEditInclusion(comp: PackageComponentCard3Row) {

    const sourceId = comp.mealPlanId || comp.roomAmenityId || comp.foServiceId || "";

    setInclusionDraft({

      id: comp.id,

      kind: comp.kind,

      sourceId,

      quantity: comp.quantity,

      sortOrder: comp.sortOrder,

    });

  }



  function saveDraftInclusion() {

    if (!value?.id || !inclusionDraft || !inclusionDraft.sourceId) return;

    if (inclusionDraft.quantity <= 0 || inclusionDraft.sortOrder < 0) return;



    const base = {

      ...(inclusionDraft.id ? { id: inclusionDraft.id } : {}),

      packageId: value.id,

      quantity: inclusionDraft.quantity,

      sortOrder: inclusionDraft.sortOrder,

    };



    if (inclusionDraft.kind === "meal_plan") {

      onSaveComponent({

        ...base,

        kind: "meal_plan",

        mealPlanId: inclusionDraft.sourceId,

      });

    } else if (inclusionDraft.kind === "room_amenity") {

      onSaveComponent({

        ...base,

        kind: "room_amenity",

        roomAmenityId: inclusionDraft.sourceId,

      });

    } else {

      onSaveComponent({

        ...base,

        kind: "fo_service",

        foServiceId: inclusionDraft.sourceId,

      });

    }

    setInclusionDraft(null);

  }



  // Section 4 — Applicability (Phase F)

  type ApplicabilityMode = "all" | "selected";

  const [roomTypeMode, setRoomTypeMode] = useState<ApplicabilityMode>(
    (value?.roomTypeIds.length ?? 0) > 0 ? "selected" : "all",
  );

  const [selectedRoomTypeIds, setSelectedRoomTypeIds] = useState<string[]>(
    value?.roomTypeIds ?? [],
  );

  const [ratePlanMode, setRatePlanMode] = useState<ApplicabilityMode>(
    (value?.ratePlanIds.length ?? 0) > 0 ? "selected" : "all",
  );

  const [selectedRatePlanIds, setSelectedRatePlanIds] = useState<string[]>(
    value?.ratePlanIds ?? [],
  );

  const [ratePlanInclusionById, setRatePlanInclusionById] = useState<
    Record<string, PackageInclusionType>
  >(() =>
    Object.fromEntries(
      (value?.ratePlanLinks ?? []).map((link) => [link.ratePlanId, link.inclusionType]),
    ),
  );

  function toggleRoomType(id: string, checked: boolean) {
    setSelectedRoomTypeIds((current) =>
      checked
        ? current.includes(id)
          ? current
          : [...current, id]
        : current.filter((roomTypeId) => roomTypeId !== id),
    );
  }

  function toggleRatePlan(id: string, checked: boolean) {
    setSelectedRatePlanIds((current) =>
      checked
        ? current.includes(id)
          ? current
          : [...current, id]
        : current.filter((ratePlanId) => ratePlanId !== id),
    );

    if (checked) {
      setRatePlanInclusionById((current) => ({
        ...current,
        [id]: current[id] ?? "optional",
      }));
    }
  }

  function changeRatePlanInclusion(id: string, inclusionType: PackageInclusionType) {
    setRatePlanInclusionById((current) => ({
      ...current,
      [id]: inclusionType,
    }));
  }



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

        if (roomTypeMode === "selected" && selectedRoomTypeIds.length === 0) {
          toast.error("Select at least one room type or choose All Room Types.");
          return;
        }

        if (ratePlanMode === "selected" && selectedRatePlanIds.length === 0) {
          toast.error("Select at least one rate plan or choose All Rate Plans.");
          return;
        }

        onSave({

          ...(value ? { id: value.id } : {}),

          code,

          name,

          type,

          description,

          packagePrice: price,

          active,

          roomTypeIds: roomTypeMode === "all" ? [] : selectedRoomTypeIds,

          ratePlanIds: ratePlanMode === "all" ? [] : selectedRatePlanIds,

          ratePlanLinks:
            ratePlanMode === "all"
              ? []
              : selectedRatePlanIds.map((ratePlanId) => ({
                ratePlanId,
                inclusionType: ratePlanInclusionById[ratePlanId] ?? "optional",
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



        {/* ── Section 3: Includes (Phase E) ─────────────────────────────── */}

        <div

          className="space-y-3 rounded-xl border border-[#E6D7B8] bg-[#FDFAF5] px-4 py-3"

          data-testid="package-master-section-includes"

        >

          <div className="flex flex-wrap items-center justify-between gap-2">

            <div>

              <p className="text-xs font-semibold uppercase tracking-wide text-[#6B6458]">

                3. Includes

              </p>

              <p className="text-xs text-muted-foreground">

                Meal plans, room amenities, and front-office services included in this package.

              </p>

            </div>

            {value?.id && canEdit && !inclusionDraft ? (

              <Button

                type="button"

                variant="outline"

                size="sm"

                className="h-8 border-[#C89933] text-xs font-medium text-[#251605] hover:bg-[#E6D7B8]/40"

                disabled={componentPending}

                onClick={startAddInclusion}

                data-testid="pkg-master-add-inclusion"

              >

                + Add Inclusion

              </Button>

            ) : null}

          </div>



          {!value?.id ? (

            <p

              className="rounded-lg border border-dashed border-[#CCCCCC] p-3 text-xs text-muted-foreground"

              data-testid="pkg-master-includes-unsaved-note"

            >

              Save the package first to manage inclusions.

            </p>

          ) : (

            <div className="space-y-3">

              {/* Inline Add / Edit Inclusion Form */}

              {inclusionDraft ? (

                <div

                  className="space-y-3 rounded-lg border border-[#C89933]/60 bg-white p-3 shadow-sm"

                  data-testid="pkg-master-inclusion-form"

                >

                  <div className="flex items-center justify-between border-b border-[#E6E1D8] pb-2">

                    <p className="text-xs font-semibold text-[#251605]">

                      {inclusionDraft.id ? "Edit Inclusion" : "Add Inclusion"}

                    </p>

                    <span className="text-[11px] text-muted-foreground">

                      Linked to existing property catalogues

                    </span>

                  </div>



                  <div className="grid gap-3 sm:grid-cols-2">

                    <div className="space-y-1">

                      <Label htmlFor="pkg-comp-kind">Component Type</Label>

                      <Select

                        value={inclusionDraft.kind}

                        disabled={!canEdit || componentPending}

                        onValueChange={(next) => changeDraftKind(next as PackageComponentKind)}

                      >

                        <SelectTrigger id="pkg-comp-kind" className={goldFocus}>

                          <SelectValue />

                        </SelectTrigger>

                        <SelectContent>

                          {PACKAGE_COMPONENT_KINDS.map((kindKey) => (

                            <SelectItem key={kindKey} value={kindKey}>

                              {PACKAGE_COMPONENT_KIND_LABELS[kindKey]}

                            </SelectItem>

                          ))}

                        </SelectContent>

                      </Select>

                    </div>



                    <div className="space-y-1">

                      <Label htmlFor="pkg-comp-source">Source</Label>

                      <Select

                        value={inclusionDraft.sourceId}

                        disabled={!canEdit || componentPending || draftSources.length === 0}

                        onValueChange={(next) =>

                          setInclusionDraft((prev) => (prev ? { ...prev, sourceId: next } : null))

                        }

                      >

                        <SelectTrigger id="pkg-comp-source" className={goldFocus}>

                          <SelectValue

                            placeholder={

                              draftSources.length === 0

                                ? "No items available in catalogue"

                                : "Select a source"

                            }

                          />

                        </SelectTrigger>

                        <SelectContent>

                          {draftSources.map((row) => (

                            <SelectItem key={row.id} value={row.id}>

                              {"code" in row && row.code ? `${row.code} — ` : ""}

                              {row.name}

                            </SelectItem>

                          ))}

                        </SelectContent>

                      </Select>

                      {draftSources.length === 0 ? (

                        <p className="text-[11px] text-destructive">

                          No {PACKAGE_COMPONENT_KIND_LABELS[inclusionDraft.kind].toLowerCase()}{" "}

                          items found in catalogue.

                        </p>

                      ) : null}

                    </div>



                    <div className="space-y-1">

                      <Label htmlFor="pkg-comp-quantity">Quantity</Label>

                      <Input

                        id="pkg-comp-quantity"

                        type="number"

                        min={0.01}

                        step="any"

                        value={inclusionDraft.quantity}

                        disabled={!canEdit || componentPending}

                        className={goldFocus}

                        onChange={(e) => {

                          const val = Number(e.target.value);

                          setInclusionDraft((prev) => (prev ? { ...prev, quantity: val } : null));

                        }}

                      />

                      {inclusionDraft.quantity <= 0 ? (

                        <p className="text-[11px] text-destructive">

                          Quantity must be greater than 0.

                        </p>

                      ) : null}

                    </div>



                    <div className="space-y-1">

                      <Label htmlFor="pkg-comp-sort">Sort Order</Label>

                      <Input

                        id="pkg-comp-sort"

                        type="number"

                        min={0}

                        step={1}

                        value={inclusionDraft.sortOrder}

                        disabled={!canEdit || componentPending}

                        className={goldFocus}

                        onChange={(e) => {

                          const val = Math.max(0, Math.floor(Number(e.target.value) || 0));

                          setInclusionDraft((prev) => (prev ? { ...prev, sortOrder: val } : null));

                        }}

                      />

                    </div>

                  </div>



                  <div className="flex justify-end gap-2 border-t border-[#E6E1D8] pt-2">

                    <Button

                      type="button"

                      variant="outline"

                      size="sm"

                      className="h-8 text-xs"

                      onClick={() => setInclusionDraft(null)}

                      disabled={componentPending}

                    >

                      Cancel

                    </Button>

                    <Button

                      type="button"

                      size="sm"

                      className="h-8 bg-[#C89933] text-xs font-medium text-[#251605] hover:bg-[#C89933]/90"

                      disabled={

                        !canEdit ||

                        componentPending ||

                        !inclusionDraft.sourceId ||

                        inclusionDraft.quantity <= 0 ||

                        inclusionDraft.sortOrder < 0

                      }

                      onClick={saveDraftInclusion}

                      data-testid="pkg-master-save-inclusion"

                    >

                      {componentPending ? "Saving…" : "Save Inclusion"}

                    </Button>

                  </div>

                </div>

              ) : null}



              {/* Inclusions Table */}

              <div className="overflow-x-auto rounded-lg border border-[#E6D7B8] bg-white">

                <table

                  className="w-full text-left text-xs text-[#251605]"

                  data-testid="pkg-master-inclusions-table"

                >

                  <thead>

                    <tr className="border-b border-[#E6D7B8] bg-[#FAF7F0] text-[10px] uppercase tracking-wide text-[#6B6458]">

                      <th className="px-3 py-2 font-semibold">Inclusion / Source Name</th>

                      <th className="px-3 py-2 font-semibold">Type</th>

                      <th className="px-3 py-2 text-center font-semibold">Quantity</th>

                      <th className="px-3 py-2 text-center font-semibold">Sort Order</th>

                      <th className="px-3 py-2 text-right font-semibold">Action</th>

                    </tr>

                  </thead>

                  <tbody>

                    {packageComponents.length === 0 ? (

                      <tr>

                        <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">

                          No inclusions added yet. Click "+ Add Inclusion" to attach

                          items.

                        </td>

                      </tr>

                    ) : (

                      packageComponents.map((comp) => (

                        <tr

                          key={comp.id}

                          className="border-b border-[#E6E1D8] last:border-0 hover:bg-[#FDFAF5]"

                          data-testid={`pkg-component-row-${comp.id}`}

                        >

                          <td className="px-3 py-2 font-medium">{comp.sourceLabel || "—"}</td>

                          <td className="px-3 py-2 text-muted-foreground">{comp.kindLabel}</td>

                          <td className="px-3 py-2 text-center">{comp.quantity}</td>

                          <td className="px-3 py-2 text-center">{comp.sortOrder}</td>

                          <td className="px-3 py-2 text-right">

                            <div className="flex items-center justify-end gap-1">

                              <Button

                                type="button"

                                variant="ghost"

                                size="sm"

                                className="h-7 px-2 text-xs text-[#251605] hover:bg-[#E6D7B8]/40"

                                disabled={!canEdit || componentPending}

                                onClick={() => startEditInclusion(comp)}

                              >

                                Edit

                              </Button>

                              <Button

                                type="button"

                                variant="ghost"

                                size="sm"

                                className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"

                                disabled={!canEdit || componentPending}

                                onClick={() => onDeleteComponent(comp.id)}

                              >

                                Remove

                              </Button>

                            </div>

                          </td>

                        </tr>

                      ))

                    )}

                  </tbody>

                </table>

              </div>

            </div>

          )}

        </div>



        {/* ── Section 4: Applicability (Phase F) ─────────────────────────── */}

        <div

          className="space-y-4 rounded-xl border border-[#E6D7B8] bg-[#FDFAF5] px-4 py-3"

          data-testid="package-master-section-applicability"

        >

          <div>

            <p className="text-xs font-semibold uppercase tracking-wide text-[#6B6458]">

              4. Applicability

            </p>

            <p className="text-xs text-muted-foreground">

              Control which room types and rate plans can use this package. Empty link sets mean

              the package is available to all inherited options.

            </p>

          </div>



          <div className="space-y-3 rounded-xl border bg-white px-3 py-3">

            <div className="flex flex-wrap items-start justify-between gap-3">

              <div>

                <p className="text-sm font-medium text-[#251605]">Room Type Applicability</p>

                <p className="text-xs text-muted-foreground">

                  Choose whether this package is available for every room type or only selected room types.

                </p>

              </div>

              <Select

                value={roomTypeMode}

                disabled={!canEdit}

                onValueChange={(next) => setRoomTypeMode(next as ApplicabilityMode)}

              >

                <SelectTrigger

                  className={`${goldFocus} h-9 w-[12rem]`}

                  data-testid="pkg-room-applicability-mode"

                >

                  <SelectValue />

                </SelectTrigger>

                <SelectContent>

                  <SelectItem value="all">All Room Types</SelectItem>

                  <SelectItem value="selected">Selected Room Types</SelectItem>

                </SelectContent>

              </Select>

            </div>



            {roomTypeMode === "all" ? (

              <div

                className="rounded-lg border border-dashed border-[#D8C9AA] bg-[#FDFAF5] px-3 py-2 text-xs text-muted-foreground"

                data-testid="pkg-room-applicability-all"

              >

                Available for all room types. No room-type links will be stored.

              </div>

            ) : (

              <div className="space-y-2">

                <ApplicabilityList

                  title="Selected room types"

                  prefix="package-room"

                  rows={roomTypes}

                  selected={selectedRoomTypeIds}

                  canEdit={canEdit}

                  onToggle={toggleRoomType}

                />

                {selectedRoomTypeIds.length === 0 ? (

                  <p className="text-[11px] text-destructive">

                    Select at least one room type, or switch to All Room Types.

                  </p>

                ) : null}

              </div>

            )}

          </div>



          <div className="space-y-3 rounded-xl border bg-white px-3 py-3">

            <div className="flex flex-wrap items-start justify-between gap-3">

              <div>

                <p className="text-sm font-medium text-[#251605]">Rate Plan Applicability</p>

                <p className="text-xs text-muted-foreground">

                  Restrict the package to selected rate plans and define whether each relationship is included in the rate or offered as an optional add-on.

                </p>

              </div>

              <Select

                value={ratePlanMode}

                disabled={!canEdit}

                onValueChange={(next) => setRatePlanMode(next as ApplicabilityMode)}

              >

                <SelectTrigger

                  className={`${goldFocus} h-9 w-[12rem]`}

                  data-testid="pkg-rate-applicability-mode"

                >

                  <SelectValue />

                </SelectTrigger>

                <SelectContent>

                  <SelectItem value="all">All Rate Plans</SelectItem>

                  <SelectItem value="selected">Selected Rate Plans</SelectItem>

                </SelectContent>

              </Select>

            </div>



            {ratePlanMode === "all" ? (

              <div

                className="rounded-lg border border-dashed border-[#D8C9AA] bg-[#FDFAF5] px-3 py-2 text-xs text-muted-foreground"

                data-testid="pkg-rate-applicability-all"

              >

                Available for all rate plans. No rate-plan links will be stored.

              </div>

            ) : (

              <div className="space-y-2">

                <RatePlanApplicabilityList

                  rows={ratePlans}

                  selected={selectedRatePlanIds}

                  inclusionByPlan={ratePlanInclusionById}

                  canEdit={canEdit}

                  onToggle={toggleRatePlan}

                  onInclusionChange={changeRatePlanInclusion}

                />

                {selectedRatePlanIds.length === 0 ? (

                  <p className="text-[11px] text-destructive">

                    Select at least one rate plan, or switch to All Rate Plans.

                  </p>

                ) : null}

              </div>

            )}



            <p className="text-[11px] text-muted-foreground">

              Included / optional is package merchandising metadata only. It does not change room pricing, folio posting, or reservation package binding.

            </p>

          </div>

        </div>



        <PackageCoverSection
          restaurantId={restaurantId}
          packageId={value?.id ?? null}
          packageName={name}
          coverUrl={value?.coverUrl ?? null}
          canEdit={canEdit}
        />

      </div>

    </Card3OverlapSheet>

  );

}



// ---------------------------------------------------------------------------

// Applicability helpers used by Package Master Phase F

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

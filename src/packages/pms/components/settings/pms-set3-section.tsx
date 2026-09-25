import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { ReadinessChip } from "@/packages/pms/components/settings/pms-set1-section";
import type { Set1Checklist } from "@/packages/pms/lib/pms-set1-foundation";
import {
  MEAL_PLAN_TYPE_LABELS,
  MEAL_PLAN_TYPES,
  PACKAGE_TYPE_LABELS,
  PACKAGE_TYPES,
  SET3_GUESTS_HREF,
  SET3_GUEST_RULES_UNAVAILABLE,
  SET3_GUEST_RULES_UNSAVED,
  SET3_ID_TYPES_WARNING,
  SET3_ID_VIP_UNAVAILABLE,
  SET3_MEALS_WARNING,
  SET3_PACKAGES_WARNING,
  SET3_RATES_HREF,
  SET3_RATES_REVENUE_HREF,
  SET3_RATES_UNAVAILABLE,
  SET3_VIP_WARNING,
  TAX_POSTURE_LABELS,
  TAX_POSTURES,
  type GuestProfileRules,
  type MealPlanType,
  type PackageType,
  type PmsGuestIdType,
  type PmsGuestVipLevel,
  type PmsMealPlan,
  type PmsPackage,
  type Set3Snapshot,
  type TaxPosture,
} from "@/packages/pms/lib/pms-set3-rates-guest";
import {
  savePmsGuestIdType,
  savePmsGuestProfileRules,
  savePmsGuestVipLevel,
  savePmsMealPlan,
  savePmsPackage,
} from "@/packages/pms/lib/pms-set3-rates-guest.functions";
import { WAVE4_SET3_FLAG_COPY } from "@/packages/pms/lib/guest-profile-wave4";
import { PmsPreferenceOptionsEditor } from "@/packages/pms/components/settings/pms-preference-options-editor";

function refreshSet3(queryClient: ReturnType<typeof useQueryClient>, restaurantId: string) {
  void queryClient.invalidateQueries({ queryKey: ["pms-set1-foundation", restaurantId] });
  void queryClient.invalidateQueries({ queryKey: ["pms-set1-audit", restaurantId] });
}

function linesToList(value: string): string[] {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl text-[#251605]">{value}</p>
    </div>
  );
}

export function Set3RatesSection({
  restaurantId,
  snapshot,
  checklist,
  canEdit,
}: {
  restaurantId: string;
  snapshot: Set3Snapshot;
  checklist: Set1Checklist;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const saveMeal = useServerFn(savePmsMealPlan);
  const savePackage = useServerFn(savePmsPackage);
  const [mealOpen, setMealOpen] = useState(false);
  const [packageOpen, setPackageOpen] = useState(false);
  const [editingMeal, setEditingMeal] = useState<PmsMealPlan | null>(null);
  const [editingPackage, setEditingPackage] = useState<PmsPackage | null>(null);

  const mealMutation = useMutation({
    mutationFn: (input: {
      id?: string;
      code: string;
      name: string;
      type: MealPlanType;
      active: boolean;
      included: string[];
      chargeable: string[];
      applicableOutletIds: string[];
      taxPosture: TaxPosture;
    }) => saveMeal({ data: { restaurantId, ...input } }),
    onSuccess: () => {
      toast.success("Meal plan saved.");
      setMealOpen(false);
      refreshSet3(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const packageMutation = useMutation({
    mutationFn: (input: {
      id?: string;
      type: PackageType;
      code: string;
      name: string;
      active: boolean;
      inclusion: string[];
    }) => savePackage({ data: { restaurantId, ...input } }),
    onSuccess: () => {
      toast.success("Package saved.");
      setPackageOpen(false);
      refreshSet3(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section
      id="rates"
      className="space-y-4 rounded-2xl border border-border bg-card p-5"
      data-testid="pms-set3-rates"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg text-[#251605]">Rates &amp; meal plans</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Rate plan masters are configured in Property Setup. Meal and package catalogues are edited here.
            Daily rates and restrictions stay in Rate &amp; Revenue.
          </p>
        </div>
        <ReadinessChip readiness={checklist.domains.rates.readiness} />
      </div>
      <dl className="grid gap-3 sm:grid-cols-3">
        <SummaryStat label="Active rate plans" value={snapshot.activeRatePlanCount} />
        <SummaryStat
          label="Meal plans"
          value={snapshot.mealPlans.filter((row) => row.active).length}
        />
        <SummaryStat
          label="Packages"
          value={snapshot.packages.filter((row) => row.active).length}
        />
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90" asChild>
          <a href={SET3_RATES_HREF} data-testid="set3-configure-rates">
            Configure rates
          </a>
        </Button>
        <Button variant="outline" asChild>
          <a href={SET3_RATES_REVENUE_HREF} data-testid="set3-open-rates-workspace">
            Open Rate &amp; Revenue
          </a>
        </Button>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium text-[#251605]">Meal plans</h3>
          {canEdit && snapshot.mealPlansAvailable ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingMeal(null);
                setMealOpen(true);
              }}
            >
              Add meal plan
            </Button>
          ) : null}
        </div>
        {!snapshot.mealPlansAvailable ? (
          <p className="text-sm text-muted-foreground">{SET3_RATES_UNAVAILABLE}</p>
        ) : snapshot.mealPlans.length === 0 ? (
          <p className="text-sm text-[#C89933]">{SET3_MEALS_WARNING}</p>
        ) : (
          <ul className="space-y-2">
            {snapshot.mealPlans.map((meal) => (
              <li
                key={meal.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">{meal.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      meal.code,
                      MEAL_PLAN_TYPE_LABELS[meal.type],
                      meal.active ? "Active" : "Inactive",
                    ].join(" · ")}
                  </p>
                </div>
                {canEdit ? (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingMeal(meal);
                        setMealOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        mealMutation.mutate({
                          id: meal.id,
                          code: meal.code,
                          name: meal.name,
                          type: meal.type,
                          active: !meal.active,
                          included: meal.included,
                          chargeable: meal.chargeable,
                          applicableOutletIds: meal.applicableOutletIds,
                          taxPosture: meal.taxPosture,
                        })
                      }
                    >
                      {meal.active ? "Deactivate" : "Reactivate"}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium text-[#251605]">Packages</h3>
          {canEdit && snapshot.packagesAvailable ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingPackage(null);
                setPackageOpen(true);
              }}
            >
              Add package
            </Button>
          ) : null}
        </div>
        {!snapshot.packagesAvailable ? (
          <p className="text-sm text-muted-foreground">{SET3_RATES_UNAVAILABLE}</p>
        ) : snapshot.packages.length === 0 ? (
          <p className="text-sm text-[#C89933]">{SET3_PACKAGES_WARNING}</p>
        ) : (
          <ul className="space-y-2">
            {snapshot.packages.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">{row.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      row.code,
                      PACKAGE_TYPE_LABELS[row.type],
                      row.active ? "Active" : "Inactive",
                    ].join(" · ")}
                  </p>
                </div>
                {canEdit ? (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingPackage(row);
                        setPackageOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        packageMutation.mutate({
                          id: row.id,
                          type: row.type,
                          code: row.code,
                          name: row.name,
                          active: !row.active,
                          inclusion: row.inclusion,
                        })
                      }
                    >
                      {row.active ? "Deactivate" : "Reactivate"}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <MealDialog
        open={mealOpen}
        onOpenChange={setMealOpen}
        meal={editingMeal}
        saving={mealMutation.isPending}
        onSubmit={(values) => mealMutation.mutate(values)}
      />
      <PackageDialog
        open={packageOpen}
        onOpenChange={setPackageOpen}
        row={editingPackage}
        saving={packageMutation.isPending}
        onSubmit={(values) => packageMutation.mutate(values)}
      />
    </section>
  );
}

function MealDialog({
  open,
  onOpenChange,
  meal,
  saving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meal: PmsMealPlan | null;
  saving: boolean;
  onSubmit: (values: {
    id?: string;
    code: string;
    name: string;
    type: MealPlanType;
    active: boolean;
    included: string[];
    chargeable: string[];
    applicableOutletIds: string[];
    taxPosture: TaxPosture;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [type, setType] = useState<MealPlanType>("breakfast");
  const [active, setActive] = useState(true);
  const [included, setIncluded] = useState("");
  const [chargeable, setChargeable] = useState("");
  const [taxPosture, setTaxPosture] = useState<TaxPosture>("inherit");
  useEffect(() => {
    if (!open) return;
    setName(meal?.name ?? "");
    setCode(meal?.code ?? "");
    setType(meal?.type ?? "breakfast");
    setActive(meal?.active ?? true);
    setIncluded((meal?.included ?? []).join("\n"));
    setChargeable((meal?.chargeable ?? []).join("\n"));
    setTaxPosture(meal?.taxPosture ?? "inherit");
  }, [open, meal]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{meal ? "Edit meal plan" : "Add meal plan"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="set3-meal-name">Name</Label>
            <Input
              id="set3-meal-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="set3-meal-code">Code</Label>
              <Input
                id="set3-meal-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(value) => setType(value as MealPlanType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEAL_PLAN_TYPES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {MEAL_PLAN_TYPE_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="set3-meal-included">Included items (one per line)</Label>
            <textarea
              id="set3-meal-included"
              className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={included}
              onChange={(event) => setIncluded(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="set3-meal-chargeable">Chargeable extras (one per line)</Label>
            <textarea
              id="set3-meal-chargeable"
              className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={chargeable}
              onChange={(event) => setChargeable(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Tax posture</Label>
            <Select
              value={taxPosture}
              onValueChange={(value) => setTaxPosture(value as TaxPosture)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TAX_POSTURES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {TAX_POSTURE_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || !code.trim() || saving}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
            onClick={() =>
              onSubmit({
                ...(meal?.id ? { id: meal.id } : {}),
                name,
                code,
                type,
                active,
                included: linesToList(included),
                chargeable: linesToList(chargeable),
                applicableOutletIds: meal?.applicableOutletIds ?? [],
                taxPosture,
              })
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PackageDialog({
  open,
  onOpenChange,
  row,
  saving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: PmsPackage | null;
  saving: boolean;
  onSubmit: (values: {
    id?: string;
    type: PackageType;
    code: string;
    name: string;
    active: boolean;
    inclusion: string[];
  }) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [type, setType] = useState<PackageType>("accommodation");
  const [active, setActive] = useState(true);
  const [inclusion, setInclusion] = useState("");
  useEffect(() => {
    if (!open) return;
    setName(row?.name ?? "");
    setCode(row?.code ?? "");
    setType(row?.type ?? "accommodation");
    setActive(row?.active ?? true);
    setInclusion((row?.inclusion ?? []).join("\n"));
  }, [open, row]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row ? "Edit package" : "Add package"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="set3-package-name">Name</Label>
            <Input
              id="set3-package-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="set3-package-code">Code</Label>
              <Input
                id="set3-package-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(value) => setType(value as PackageType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PACKAGE_TYPES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {PACKAGE_TYPE_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="set3-package-inclusion">Inclusions (one per line)</Label>
            <textarea
              id="set3-package-inclusion"
              className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={inclusion}
              onChange={(event) => setInclusion(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || !code.trim() || saving}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
            onClick={() =>
              onSubmit({
                ...(row?.id ? { id: row.id } : {}),
                name,
                code,
                type,
                active,
                inclusion: linesToList(inclusion),
              })
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Set3GuestSection({
  restaurantId,
  snapshot,
  checklist,
  canEdit,
}: {
  restaurantId: string;
  snapshot: Set3Snapshot;
  checklist: Set1Checklist;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const saveRules = useServerFn(savePmsGuestProfileRules);
  const saveIdType = useServerFn(savePmsGuestIdType);
  const saveVip = useServerFn(savePmsGuestVipLevel);
  const [draft, setDraft] = useState<GuestProfileRules>(snapshot.guestRules);
  const [idOpen, setIdOpen] = useState(false);
  const [vipOpen, setVipOpen] = useState(false);
  const [editingId, setEditingId] = useState<PmsGuestIdType | null>(null);
  const [editingVip, setEditingVip] = useState<PmsGuestVipLevel | null>(null);

  useEffect(() => {
    setDraft(snapshot.guestRules);
  }, [snapshot.guestRules]);

  const rulesMutation = useMutation({
    mutationFn: () =>
      saveRules({
        data: {
          restaurantId,
          requiredFields: draft.requiredFields,
          consentDefaults: draft.consentDefaults,
          companyRelationshipEnabled: draft.companyRelationshipEnabled,
        },
      }),
    onSuccess: () => {
      toast.success("Guest profile rules saved.");
      refreshSet3(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const idMutation = useMutation({
    mutationFn: (input: { id?: string; code: string; name: string; active: boolean }) =>
      saveIdType({ data: { restaurantId, ...input } }),
    onSuccess: () => {
      toast.success("ID type saved.");
      setIdOpen(false);
      refreshSet3(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const vipMutation = useMutation({
    mutationFn: (input: { id?: string; code: string; name: string; active: boolean }) =>
      saveVip({ data: { restaurantId, ...input } }),
    onSuccess: () => {
      toast.success("VIP level saved.");
      setVipOpen(false);
      refreshSet3(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const domain = checklist.domains["guest-profile"];

  return (
    <section
      id="guest-profile"
      className="space-y-4 rounded-2xl border border-border bg-card p-5"
      data-testid="pms-set3-guest"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg text-[#251605]">Guest profile rules</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Required fields and consent defaults for new guests. Profiles stay on the guest
            directory.
          </p>
        </div>
        <ReadinessChip readiness={domain.readiness} />
      </div>

      {!snapshot.guestRulesAvailable ? (
        <p className="text-sm text-muted-foreground">{SET3_GUEST_RULES_UNAVAILABLE}</p>
      ) : (
        <div className="space-y-4">
          {!draft.savedAt ? (
            <p className="text-sm text-[#C89933]">{SET3_GUEST_RULES_UNSAVED}</p>
          ) : null}
          <div className="space-y-3">
            <h3 className="font-medium text-[#251605]">Required fields</h3>
            <p className="text-xs text-muted-foreground">
              First name always stays required. Require a phone number or an email address.
            </p>
            <ToggleRow
              id="set3-req-first"
              label="First name"
              checked={true}
              disabled
              onCheckedChange={() => undefined}
            />
            <ToggleRow
              id="set3-req-last"
              label="Last name"
              checked={draft.requiredFields.lastName}
              disabled={!canEdit}
              onCheckedChange={(checked) =>
                setDraft((prev) => ({
                  ...prev,
                  requiredFields: { ...prev.requiredFields, lastName: checked },
                }))
              }
            />
            <ToggleRow
              id="set3-req-phone"
              label="Phone"
              checked={draft.requiredFields.phone}
              disabled={!canEdit}
              onCheckedChange={(checked) =>
                setDraft((prev) => ({
                  ...prev,
                  requiredFields: { ...prev.requiredFields, phone: checked },
                }))
              }
            />
            <ToggleRow
              id="set3-req-email"
              label="Email"
              checked={draft.requiredFields.email}
              disabled={!canEdit}
              onCheckedChange={(checked) =>
                setDraft((prev) => ({
                  ...prev,
                  requiredFields: { ...prev.requiredFields, email: checked },
                }))
              }
            />
          </div>
          <div className="space-y-3">
            <h3 className="font-medium text-[#251605]">Consent defaults</h3>
            <ToggleRow
              id="set3-consent-data"
              label="Data processing"
              checked={draft.consentDefaults.dataProcessing}
              disabled={!canEdit}
              onCheckedChange={(checked) =>
                setDraft((prev) => ({
                  ...prev,
                  consentDefaults: { ...prev.consentDefaults, dataProcessing: checked },
                }))
              }
            />
            <ToggleRow
              id="set3-consent-marketing"
              label="Marketing"
              checked={draft.consentDefaults.marketing}
              disabled={!canEdit}
              onCheckedChange={(checked) =>
                setDraft((prev) => ({
                  ...prev,
                  consentDefaults: { ...prev.consentDefaults, marketing: checked },
                }))
              }
            />
          </div>
          <ToggleRow
            id="set3-company"
            label="Company relationship"
            checked={draft.companyRelationshipEnabled}
            disabled={!canEdit}
            onCheckedChange={(checked) =>
              setDraft((prev) => ({ ...prev, companyRelationshipEnabled: checked }))
            }
          />
          <p className="text-xs text-muted-foreground">{WAVE4_SET3_FLAG_COPY}</p>
          {canEdit ? (
            <Button
              className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
              disabled={rulesMutation.isPending}
              onClick={() => rulesMutation.mutate()}
            >
              {rulesMutation.isPending ? "Saving…" : "Save guest rules"}
            </Button>
          ) : null}
        </div>
      )}

      <Button variant="outline" asChild>
        <a href={SET3_GUESTS_HREF} data-testid="set3-open-guest-profiles">
          Open guest profiles
        </a>
      </Button>

      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium text-[#251605]">ID types</h3>
          {canEdit && snapshot.idVipAvailable ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingId(null);
                setIdOpen(true);
              }}
            >
              Add ID type
            </Button>
          ) : null}
        </div>
        {!snapshot.idVipAvailable ? (
          <p className="text-sm text-muted-foreground">{SET3_ID_VIP_UNAVAILABLE}</p>
        ) : snapshot.idTypes.length === 0 ? (
          <p className="text-sm text-[#C89933]">{SET3_ID_TYPES_WARNING}</p>
        ) : (
          <CatalogueList
            rows={snapshot.idTypes}
            canEdit={canEdit}
            onEdit={(row) => {
              setEditingId(row);
              setIdOpen(true);
            }}
            onToggle={(row) =>
              idMutation.mutate({ id: row.id, code: row.code, name: row.name, active: !row.active })
            }
          />
        )}
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium text-[#251605]">VIP levels</h3>
          {canEdit && snapshot.idVipAvailable ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingVip(null);
                setVipOpen(true);
              }}
            >
              Add VIP level
            </Button>
          ) : null}
        </div>
        {!snapshot.idVipAvailable ? (
          <p className="text-sm text-muted-foreground">{SET3_ID_VIP_UNAVAILABLE}</p>
        ) : snapshot.vipLevels.length === 0 ? (
          <p className="text-sm text-[#C89933]">{SET3_VIP_WARNING}</p>
        ) : (
          <CatalogueList
            rows={snapshot.vipLevels}
            canEdit={canEdit}
            onEdit={(row) => {
              setEditingVip(row);
              setVipOpen(true);
            }}
            onToggle={(row) =>
              vipMutation.mutate({
                id: row.id,
                code: row.code,
                name: row.name,
                active: !row.active,
              })
            }
          />
        )}
      </div>

      <CatalogueDialog
        open={idOpen}
        onOpenChange={setIdOpen}
        title={editingId ? "Edit ID type" : "Add ID type"}
        row={editingId}
        saving={idMutation.isPending}
        onSubmit={(values) => idMutation.mutate(values)}
      />
      <PmsPreferenceOptionsEditor restaurantId={restaurantId} canEdit={canEdit} />

      <CatalogueDialog
        open={vipOpen}
        onOpenChange={setVipOpen}
        title={editingVip ? "Edit VIP level" : "Add VIP level"}
        row={editingVip}
        saving={vipMutation.isPending}
        onSubmit={(values) => vipMutation.mutate(values)}
      />
    </section>
  );
}

function ToggleRow({
  id,
  label,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-3 py-3">
      <Label htmlFor={id}>{label}</Label>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function CatalogueList({
  rows,
  canEdit,
  onEdit,
  onToggle,
}: {
  rows: Array<{ id: string; code: string; name: string; active: boolean }>;
  canEdit: boolean;
  onEdit: (row: { id: string; code: string; name: string; active: boolean }) => void;
  onToggle: (row: { id: string; code: string; name: string; active: boolean }) => void;
}) {
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
        >
          <div>
            <p className="text-sm font-medium">{row.name}</p>
            <p className="text-xs text-muted-foreground">
              {row.code} · {row.active ? "Active" : "Inactive"}
            </p>
          </div>
          {canEdit ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => onEdit(row)}>
                Edit
              </Button>
              <Button variant="outline" size="sm" onClick={() => onToggle(row)}>
                {row.active ? "Deactivate" : "Reactivate"}
              </Button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function CatalogueDialog({
  open,
  onOpenChange,
  title,
  row,
  saving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  row: { id: string; code: string; name: string; active: boolean } | null;
  saving: boolean;
  onSubmit: (values: { id?: string; code: string; name: string; active: boolean }) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [active, setActive] = useState(true);
  useEffect(() => {
    if (!open) return;
    setName(row?.name ?? "");
    setCode(row?.code ?? "");
    setActive(row?.active ?? true);
  }, [open, row]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor={`set3-cat-name-${title}`}>Name</Label>
            <Input
              id={`set3-cat-name-${title}`}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`set3-cat-code-${title}`}>Code</Label>
            <Input
              id={`set3-cat-code-${title}`}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || !code.trim() || saving}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
            onClick={() => onSubmit({ ...(row?.id ? { id: row.id } : {}), name, code, active })}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

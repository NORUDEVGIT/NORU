import { useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Check, Search, X } from "lucide-react";
import { toast } from "sonner";

import { saveCommercialSeasonCard3 } from "@/packages/pms/lib/commercial-card3.functions";
import { friendlySetupError } from "@/packages/pms/lib/setup-form-errors";
import {
  PRICING_SEASON_CODE_STAFF_HINT,
  PRICING_SEASON_WIZARD_STEPS,
  SEASON_TYPE_LABELS,
  SEASON_TYPES,
  type CommercialCard3Snapshot,
  type CommercialSeasonRow,
  type PricingSeasonWizardStepId,
  type SeasonType,
} from "@/packages/pms/lib/commercial-card3.server";
import {
  isValidPricingSeasonCode,
  pricingSeasonCodeIsTaken,
  suggestPricingSeasonCode,
} from "@/packages/pms/lib/commercial-season-code";
import {
  PROPERTY_SETUP_CONTROL_CLASS,
  PROPERTY_SETUP_TEXTAREA_CLASS,
} from "@/packages/pms/lib/pms-property-setup-ui";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
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

export type PricingSeasonWizardForm = {
  name: string;
  code: string;
  seasonType: SeasonType;
  validFrom: string;
  validTo: string;
  description: string;
  active: boolean;
  roomTypeIds: string[];
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyForm(): PricingSeasonWizardForm {
  return {
    name: "",
    code: "",
    seasonType: "high",
    validFrom: todayIso(),
    validTo: "",
    description: "",
    active: true,
    roomTypeIds: [],
  };
}

function formFromSeason(row: CommercialSeasonRow): PricingSeasonWizardForm {
  return {
    name: row.name,
    code: row.code,
    seasonType: row.seasonType,
    validFrom: row.validFrom,
    validTo: row.validTo,
    description: row.description,
    active: row.active,
    roomTypeIds: [...row.roomTypeIds],
  };
}

export function formatSeasonPeriod(from: string, to: string): string {
  if (!from && !to) return "—";
  if (from && to) return `${from} → ${to}`;
  return from || to;
}

export function formatSeasonAppliesTo(
  roomTypeIds: string[],
  roomTypes: CommercialCard3Snapshot["roomTypes"],
): string {
  if (roomTypeIds.length === 0) return "All room types";
  const byId = new Map(roomTypes.map((row) => [row.id, row.name]));
  const labels = roomTypeIds.map((id) => byId.get(id) ?? "Room type");
  if (labels.length <= 2) return labels.join(", ");
  return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
}

function datesOverlap(aFrom: string, aTo: string, bFrom: string, bTo: string): boolean {
  return aFrom <= bTo && bFrom <= aTo;
}

function staffFacingSeasonSaveError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (
    /Use 1–20 letters/i.test(message) ||
    /"code"\s*:\s*"custom"/i.test(message) ||
    (/^\s*\[\{/.test(message) && /code/i.test(message))
  ) {
    return PRICING_SEASON_CODE_STAFF_HINT;
  }
  if (/23505|already used|duplicate/i.test(message)) {
    return "That pricing season code is already used for this property.";
  }
  if (/Valid to must be|on or after/i.test(message)) {
    return "Valid To must be on or after Valid From.";
  }
  return friendlySetupError(
    error instanceof Error ? error : new Error(message),
    "Could not save pricing season.",
  );
}

function WizardCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-[#E6E1D8] bg-white p-4 shadow-xs">
      <h3 className="text-sm font-semibold text-[#251605]">{title}</h3>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function ReviewRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-[#251605]">{value}</span>
    </div>
  );
}

export function PricingSeasonWizard({
  restaurantId,
  canEdit,
  snapshot,
  editing,
  onClose,
  onCompleted,
}: {
  restaurantId: string;
  canEdit: boolean;
  snapshot: CommercialCard3Snapshot;
  editing?: CommercialSeasonRow | null;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const saveSeason = useServerFn(saveCommercialSeasonCard3);
  const isEdit = Boolean(editing?.id);
  const [step, setStep] = useState<PricingSeasonWizardStepId>(1);
  const [form, setForm] = useState<PricingSeasonWizardForm>(() =>
    editing ? formFromSeason(editing) : emptyForm(),
  );
  const codeLocked = isEdit;
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [roomSearch, setRoomSearch] = useState("");

  const existingCodes = useMemo(
    () => snapshot.seasons.map((row) => row.code),
    [snapshot.seasons],
  );

  const activeRoomTypes = useMemo(
    () => snapshot.roomTypes.filter((row) => row.active || form.roomTypeIds.includes(row.id)),
    [snapshot.roomTypes, form.roomTypeIds],
  );

  const filteredRoomTypes = useMemo(() => {
    const q = roomSearch.trim().toLowerCase();
    if (!q) return activeRoomTypes;
    return activeRoomTypes.filter(
      (row) =>
        row.name.toLowerCase().includes(q) || row.code.toLowerCase().includes(q),
    );
  }, [activeRoomTypes, roomSearch]);

  const overlappingSeasons = useMemo(() => {
    if (!form.validFrom || !form.validTo || form.validTo < form.validFrom) return [];
    return snapshot.seasons.filter((row) => {
      if (editing?.id && row.id === editing.id) return false;
      if (!row.active) return false;
      return datesOverlap(form.validFrom, form.validTo, row.validFrom, row.validTo);
    });
  }, [snapshot.seasons, form.validFrom, form.validTo, editing?.id]);

  const step1Valid =
    Boolean(form.name.trim()) &&
    Boolean(form.code.trim()) &&
    isValidPricingSeasonCode(form.code) &&
    !pricingSeasonCodeIsTaken(form.code, existingCodes, editing?.code) &&
    Boolean(form.validFrom) &&
    Boolean(form.validTo) &&
    form.validTo >= form.validFrom;

  function patchForm(partial: Partial<PricingSeasonWizardForm>) {
    setForm((prev) => {
      const next = { ...prev, ...partial };
      if (!codeLocked && partial.name !== undefined) {
        next.code = suggestPricingSeasonCode(partial.name);
      }
      return next;
    });
  }

  function goNext() {
    if (step === 1 && !step1Valid) {
      setAttempted(true);
      if (!form.name.trim()) toast.error("Season name is required.");
      else if (!form.code.trim() || !isValidPricingSeasonCode(form.code)) {
        toast.error(PRICING_SEASON_CODE_STAFF_HINT);
      } else if (pricingSeasonCodeIsTaken(form.code, existingCodes, editing?.code)) {
        toast.error("That pricing season code is already used for this property.");
      } else if (!form.validFrom || !form.validTo) {
        toast.error("Valid From and Valid To are required.");
      } else toast.error("Valid To must be on or after Valid From.");
      return;
    }
    setStep((prev) => Math.min(3, prev + 1) as PricingSeasonWizardStepId);
  }

  function goBack() {
    setStep((prev) => Math.max(1, prev - 1) as PricingSeasonWizardStepId);
  }

  async function completeWizard() {
    if (!canEdit || saving) return;
    if (!step1Valid) {
      setAttempted(true);
      toast.error("Finish required season fields before completing.");
      setStep(1);
      return;
    }
    setSaving(true);
    try {
      await saveSeason({
        data: {
          restaurantId,
          ...(editing ? { id: editing.id } : {}),
          code: form.code.trim().toUpperCase(),
          name: form.name.trim(),
          seasonType: form.seasonType,
          validFrom: form.validFrom,
          validTo: form.validTo,
          description: form.description.trim() || undefined,
          active: form.active,
          roomTypeIds: form.roomTypeIds,
          // Omit rateAdjustmentPercent so legacy hint values are preserved on edit.
        },
      });
      toast.success(editing ? "Pricing season updated." : "Pricing season created.");
      onCompleted();
    } catch (error) {
      toast.error(staffFacingSeasonSaveError(error));
    } finally {
      setSaving(false);
    }
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
        data-testid="pms-card3-pricing-season-wizard"
        className={cn(
          "z-50 flex max-h-[88vh] min-h-0 w-[min(900px,calc(100vw-48px))] max-w-none sm:max-w-none",
          "flex-col gap-0 overflow-hidden rounded-2xl border border-[#DDD4C5] bg-[#F7F4EE] p-0 shadow-xl",
          "[&>button.absolute]:hidden",
        )}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <header className="relative shrink-0 bg-[#1F140A] px-5 py-2.5 pr-12 text-[#F3E9D8]">
          <DialogTitle className="font-display text-sm font-semibold text-white">
            {editing ? "Edit Pricing Season" : "Create Pricing Season"}
          </DialogTitle>
          <DialogDescription className="text-[11px] text-[#C4B6A0]">
            Step {step} of 3
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
          aria-label="Pricing season wizard steps"
        >
          {PRICING_SEASON_WIZARD_STEPS.map((row) => {
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
                onClick={() => setStep(row.id)}
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
          {step === 1 ? (
            <div className="space-y-3">
              <WizardCard title="Season Details">
                <div className="space-y-1">
                  <Label htmlFor="season-wiz-name">Season Name *</Label>
                  <Input
                    id="season-wiz-name"
                    value={form.name}
                    disabled={!canEdit}
                    className={PROPERTY_SETUP_CONTROL_CLASS}
                    aria-invalid={attempted && !form.name.trim()}
                    onChange={(event) => patchForm({ name: event.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="season-wiz-code">Season Code</Label>
                    {!isEdit ? (
                      <span className="rounded-[4px] bg-[#ECEAE4] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#5C5346]">
                        Auto
                      </span>
                    ) : null}
                  </div>
                  <Input
                    id="season-wiz-code"
                    value={form.code}
                    readOnly
                    disabled
                    className={PROPERTY_SETUP_CONTROL_CLASS}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {isEdit
                      ? "Code stays the same after the season is saved."
                      : "Generated from the season name. Locked after save."}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="season-wiz-type">Season Type</Label>
                  <Select
                    value={form.seasonType}
                    disabled={!canEdit}
                    onValueChange={(next) => patchForm({ seasonType: next as SeasonType })}
                  >
                    <SelectTrigger id="season-wiz-type" className={PROPERTY_SETUP_CONTROL_CLASS}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEASON_TYPES.map((kind) => (
                        <SelectItem key={kind} value={kind}>
                          {SEASON_TYPE_LABELS[kind]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="season-wiz-from">Valid From *</Label>
                    <Input
                      id="season-wiz-from"
                      type="date"
                      value={form.validFrom}
                      disabled={!canEdit}
                      className={PROPERTY_SETUP_CONTROL_CLASS}
                      aria-invalid={attempted && !form.validFrom}
                      onChange={(event) => patchForm({ validFrom: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="season-wiz-to">Valid To *</Label>
                    <Input
                      id="season-wiz-to"
                      type="date"
                      value={form.validTo}
                      disabled={!canEdit}
                      className={PROPERTY_SETUP_CONTROL_CLASS}
                      aria-invalid={
                        attempted && (!form.validTo || form.validTo < form.validFrom)
                      }
                      onChange={(event) => patchForm({ validTo: event.target.value })}
                    />
                  </div>
                </div>
                {overlappingSeasons.length > 0 ? (
                  <p className="rounded-[6px] border border-[#D9D0C3] bg-[#FAF8F5] px-3 py-2 text-[11px] text-[#5C5346]">
                    This period overlaps{" "}
                    {overlappingSeasons.length === 1
                      ? `“${overlappingSeasons[0].name}”`
                      : `${overlappingSeasons.length} other active seasons`}
                    . Overlaps are allowed — Rate & Pricing still owns actual price changes.
                  </p>
                ) : null}
                <div className="space-y-1">
                  <Label htmlFor="season-wiz-desc">Description</Label>
                  <Textarea
                    id="season-wiz-desc"
                    value={form.description}
                    disabled={!canEdit}
                    className={PROPERTY_SETUP_TEXTAREA_CLASS}
                    rows={3}
                    onChange={(event) => patchForm({ description: event.target.value })}
                  />
                </div>
                <div className="flex items-center justify-between rounded-[6px] border border-[#CCCCCC] px-3 py-2.5">
                  <div>
                    <Label htmlFor="season-wiz-active">Active</Label>
                    <p className="text-[11px] text-[#756A5B]">
                      Inactive seasons stay on file but are not offered as current periods.
                    </p>
                  </div>
                  <Switch
                    id="season-wiz-active"
                    checked={form.active}
                    disabled={!canEdit}
                    onCheckedChange={(active) => patchForm({ active })}
                  />
                </div>
                <p className="text-[11px] text-[#5C5346]">
                  Pricing seasons name commercial date periods. They do not change Rate Plan base
                  prices by themselves.
                </p>
              </WizardCard>
            </div>
          ) : null}

          {step === 2 ? (
            <WizardCard title="Applicability">
              <p className="text-[11px] text-[#5C5346]">
                Choose which room types this season may apply to. Leave none selected to apply to
                all room types.
              </p>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  value={roomSearch}
                  onChange={(event) => setRoomSearch(event.target.value)}
                  placeholder="Search room types"
                  className={cn(PROPERTY_SETUP_CONTROL_CLASS, "pl-8")}
                />
              </div>
              {filteredRoomTypes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No room types available.</p>
              ) : (
                <div className="max-h-64 space-y-2 overflow-y-auto rounded-[6px] border border-[#E6E1D8] p-2">
                  {filteredRoomTypes.map((row) => {
                    const id = `season-room-${row.id}`;
                    const checked = form.roomTypeIds.includes(row.id);
                    return (
                      <div
                        key={row.id}
                        className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 hover:bg-[#FBF9F5]"
                      >
                        <Checkbox
                          id={id}
                          checked={checked}
                          disabled={!canEdit}
                          onCheckedChange={(next) => {
                            const on = next === true;
                            setForm((prev) => ({
                              ...prev,
                              roomTypeIds: on
                                ? [...prev.roomTypeIds, row.id]
                                : prev.roomTypeIds.filter((value) => value !== row.id),
                            }));
                          }}
                        />
                        <Label htmlFor={id} className="flex-1 cursor-pointer font-normal">
                          <span className="text-sm text-[#251605]">{row.name}</span>
                          {!row.active ? (
                            <span className="ml-2 text-[10px] text-muted-foreground">Inactive</span>
                          ) : null}
                        </Label>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                {form.roomTypeIds.length === 0
                  ? "Applies to all room types"
                  : `Selected: ${form.roomTypeIds.length} room type${form.roomTypeIds.length === 1 ? "" : "s"}`}
              </p>
            </WizardCard>
          ) : null}

          {step === 3 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <WizardCard title="Season">
                <ReviewRow label="Name" value={form.name.trim() || "—"} />
                <ReviewRow label="Type" value={SEASON_TYPE_LABELS[form.seasonType]} />
                <ReviewRow label="Status" value={form.active ? "Active" : "Inactive"} />
              </WizardCard>
              <WizardCard title="Period">
                <ReviewRow label="Valid From" value={form.validFrom || "—"} />
                <ReviewRow label="Valid To" value={form.validTo || "—"} />
              </WizardCard>
              <WizardCard title="Applicability">
                <ReviewRow
                  label="Room types"
                  value={formatSeasonAppliesTo(form.roomTypeIds, snapshot.roomTypes)}
                />
              </WizardCard>
            </div>
          ) : null}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[#E6DFD3] bg-[#FBF9F5] px-5 py-3">
          {step === 1 ? (
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={goBack} disabled={saving}>
              <ArrowLeft className="mr-1 size-3.5" />
              Back
            </Button>
          )}
          {step < 3 ? (
            <Button
              type="button"
              className="bg-[#C89933] text-[#251605] hover:bg-[#B8892A]"
              onClick={goNext}
              disabled={!canEdit}
            >
              Continue
              <ArrowRight className="ml-1 size-3.5" />
            </Button>
          ) : (
            <Button
              type="button"
              className="bg-[#C89933] text-[#251605] hover:bg-[#B8892A]"
              onClick={() => void completeWizard()}
              disabled={!canEdit || saving}
            >
              {saving ? "Saving…" : "Complete Pricing Season"}
            </Button>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}

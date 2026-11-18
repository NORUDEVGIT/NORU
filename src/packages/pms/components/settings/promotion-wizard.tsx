import { useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Check, Search, X } from "lucide-react";
import { toast } from "sonner";

import { saveCommercialPromotionCard3 } from "@/packages/pms/lib/commercial-card3.functions";
import {
  PROMOTION_CODE_STAFF_HINT,
  PROMOTION_WIZARD_STEPS,
  PROMO_CREATE_KINDS,
  PROMO_KIND_LABELS,
  type CommercialCard3Snapshot,
  type CommercialPromotionRow,
  type PromoKind,
  type PromotionWizardStepId,
} from "@/packages/pms/lib/commercial-card3.server";
import {
  isValidPromotionCode,
  promotionCodeIsTaken,
  suggestPromotionCode,
} from "@/packages/pms/lib/commercial-promotion-code";
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

export type PromotionWizardForm = {
  name: string;
  code: string;
  promoKind: PromoKind;
  description: string;
  active: boolean;
  promoValue: string;
  validFrom: string;
  validTo: string;
  roomTypeIds: string[];
  /** Preserved on edit; not shown as free-text Conditions. */
  conditions: string;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyForm(): PromotionWizardForm {
  return {
    name: "",
    code: "",
    promoKind: "percent",
    description: "",
    active: true,
    promoValue: "",
    validFrom: todayIso(),
    validTo: "",
    roomTypeIds: [],
    conditions: "",
  };
}

function formFromPromotion(row: CommercialPromotionRow): PromotionWizardForm {
  return {
    name: row.name,
    code: row.code,
    promoKind: row.promoKind,
    description: row.description,
    active: row.active,
    promoValue: String(row.promoValue),
    validFrom: row.validFrom,
    validTo: row.validTo,
    roomTypeIds: [...row.roomTypeIds],
    conditions: row.conditions,
  };
}

function parsePromoValue(kind: PromoKind, raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  if (kind === "percent" && n > 100) return null;
  if (kind === "free_night" && (!Number.isInteger(n) || n < 1)) return null;
  return n;
}

export function formatPromotionDiscount(kind: PromoKind, value: number): string {
  if (kind === "percent") return `${value}%`;
  if (kind === "free_night") {
    return `${value} free night${value === 1 ? "" : "s"}`;
  }
  return String(value);
}

export function formatPromotionStayWindow(from: string, to: string): string {
  if (!from && !to) return "—";
  if (from && to) return `${from} → ${to}`;
  return from || to;
}

export function formatPromotionAppliesTo(
  roomTypeIds: string[],
  roomTypes: CommercialCard3Snapshot["roomTypes"],
): string {
  if (roomTypeIds.length === 0) return "All room types";
  const byId = new Map(roomTypes.map((row) => [row.id, row.name]));
  const labels = roomTypeIds.map((id) => byId.get(id) ?? "Room type");
  if (labels.length <= 2) return labels.join(", ");
  return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
}

function staffFacingPromotionSaveError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (
    /Use 1–20 letters/i.test(message) ||
    /"code"\s*:\s*"custom"/i.test(message) ||
    (/^\s*\[\{/.test(message) && /code/i.test(message))
  ) {
    return PROMOTION_CODE_STAFF_HINT;
  }
  if (/23505|already used|duplicate/i.test(message)) {
    return "That promotion code is already used for this property.";
  }
  if (/Percent promotions cannot exceed 100/i.test(message)) {
    return "Percentage discount cannot exceed 100.";
  }
  if (/Free Night promotions cannot be created|cannot be converted/i.test(message)) {
    return message;
  }
  if (/Free-night promotions/i.test(message)) {
    return "Free night offers need a whole number of nights of 1 or more.";
  }
  if (/Valid to must be/i.test(message)) {
    return "Stay To must be on or after Stay From.";
  }
  return message || "Could not save promotion.";
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

export function PromotionWizard({
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
  editing?: CommercialPromotionRow | null;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const savePromotion = useServerFn(saveCommercialPromotionCard3);
  const isEdit = Boolean(editing?.id);
  const isLegacyFreeNight = editing?.promoKind === "free_night";
  const selectableKinds = isLegacyFreeNight
    ? (["free_night"] as const)
    : PROMO_CREATE_KINDS;
  const [step, setStep] = useState<PromotionWizardStepId>(1);
  const [form, setForm] = useState<PromotionWizardForm>(() =>
    editing ? formFromPromotion(editing) : emptyForm(),
  );
  const codeLocked = isEdit;
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [roomSearch, setRoomSearch] = useState("");

  const existingCodes = useMemo(
    () => snapshot.promotions.map((row) => row.code),
    [snapshot.promotions],
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

  const parsedValue = parsePromoValue(form.promoKind, form.promoValue);
  const step1Valid =
    Boolean(form.name.trim()) &&
    Boolean(form.code.trim()) &&
    isValidPromotionCode(form.code) &&
    !promotionCodeIsTaken(form.code, existingCodes, editing?.code);
  const step2Valid =
    parsedValue != null &&
    Boolean(form.validFrom) &&
    Boolean(form.validTo) &&
    form.validTo >= form.validFrom;

  function patchForm(partial: Partial<PromotionWizardForm>) {
    setForm((prev) => {
      const next = { ...prev, ...partial };
      if (!codeLocked && partial.name !== undefined) {
        next.code = suggestPromotionCode(partial.name);
      }
      return next;
    });
  }

  function goNext() {
    if (step === 1 && !step1Valid) {
      setAttempted(true);
      if (!form.name.trim()) toast.error("Promotion name is required.");
      else if (!form.code.trim() || !isValidPromotionCode(form.code)) {
        toast.error(PROMOTION_CODE_STAFF_HINT);
      } else if (promotionCodeIsTaken(form.code, existingCodes, editing?.code)) {
        toast.error("That promotion code is already used for this property.");
      }
      return;
    }
    if (step === 2 && !step2Valid) {
      setAttempted(true);
      if (parsedValue == null) toast.error("Enter a valid discount value.");
      else if (!form.validFrom || !form.validTo) {
        toast.error("Stay From and Stay To are required.");
      } else toast.error("Stay To must be on or after Stay From.");
      return;
    }
    setStep((prev) => Math.min(4, prev + 1) as PromotionWizardStepId);
  }

  function goBack() {
    setStep((prev) => Math.max(1, prev - 1) as PromotionWizardStepId);
  }

  async function completeWizard() {
    if (!canEdit || saving) return;
    if (!step1Valid || !step2Valid) {
      setAttempted(true);
      toast.error("Finish required promotion fields before completing.");
      setStep(!step1Valid ? 1 : 2);
      return;
    }
    if (parsedValue == null) return;
    setSaving(true);
    try {
      await savePromotion({
        data: {
          restaurantId,
          ...(editing ? { id: editing.id } : {}),
          code: form.code.trim().toUpperCase(),
          name: form.name.trim(),
          promoKind: form.promoKind,
          promoValue: parsedValue,
          validFrom: form.validFrom,
          validTo: form.validTo,
          // Preserve legacy free-text conditions on edit; do not invent structured fields.
          conditions: form.conditions.trim() || undefined,
          description: form.description.trim() || undefined,
          active: form.active,
          roomTypeIds: form.roomTypeIds,
        },
      });
      toast.success(editing ? "Promotion updated." : "Promotion created.");
      onCompleted();
    } catch (error) {
      toast.error(staffFacingPromotionSaveError(error));
    } finally {
      setSaving(false);
    }
  }

  const valueHint =
    form.promoKind === "percent"
      ? "Example: 10 for 10%"
      : form.promoKind === "free_night"
        ? "Whole nights only"
        : "Amount off the Rate Plan price";

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        overlayClassName="bg-[#1F140A]/70"
        data-testid="pms-card3-promotion-wizard"
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
            {editing ? "Edit Promotion" : "Create Promotion"}
          </DialogTitle>
          <DialogDescription className="text-[11px] text-[#C4B6A0]">
            Step {step} of 4
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
          aria-label="Promotion wizard steps"
        >
          {PROMOTION_WIZARD_STEPS.map((row) => {
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
          {isLegacyFreeNight ? (
            <p className="mb-3 rounded-[6px] border border-[#D9D0C3] bg-white px-3 py-2 text-[11px] text-[#5C5346]">
              This is a legacy Free Night promotion. Pricing and activation do not apply Free Night
              offers. The type cannot be changed here — keep the record for history, or create a
              new percentage or fixed amount promotion instead.
            </p>
          ) : null}
          {step === 1 ? (
            <WizardCard title="Promotion Details">
              <div className="space-y-1">
                <Label htmlFor="promo-wiz-name">Promotion Name *</Label>
                <Input
                  id="promo-wiz-name"
                  value={form.name}
                  disabled={!canEdit}
                  className={PROPERTY_SETUP_CONTROL_CLASS}
                  aria-invalid={attempted && !form.name.trim()}
                  onChange={(event) => patchForm({ name: event.target.value })}
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="promo-wiz-code">Promotion Code</Label>
                  {!isEdit ? (
                    <span className="rounded-[4px] bg-[#ECEAE4] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#5C5346]">
                      Auto
                    </span>
                  ) : null}
                </div>
                <Input
                  id="promo-wiz-code"
                  value={form.code}
                  readOnly
                  disabled
                  className={PROPERTY_SETUP_CONTROL_CLASS}
                />
                <p className="text-[11px] text-muted-foreground">
                  {isEdit
                    ? "Code stays the same after the promotion is saved."
                    : "Generated from the promotion name. Locked after save."}
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="promo-wiz-type">Promotion Type *</Label>
                <Select
                  value={form.promoKind}
                  disabled={!canEdit || isLegacyFreeNight}
                  onValueChange={(next) => {
                    const promoKind = next as PromoKind;
                    if (isLegacyFreeNight) return;
                    setForm((prev) => ({
                      ...prev,
                      promoKind,
                    }));
                  }}
                >
                  <SelectTrigger id="promo-wiz-type" className={PROPERTY_SETUP_CONTROL_CLASS}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableKinds.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {PROMO_KIND_LABELS[kind]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="promo-wiz-desc">Description</Label>
                <Textarea
                  id="promo-wiz-desc"
                  value={form.description}
                  disabled={!canEdit}
                  className={PROPERTY_SETUP_TEXTAREA_CLASS}
                  rows={3}
                  onChange={(event) => patchForm({ description: event.target.value })}
                />
              </div>
              <div className="flex items-center justify-between rounded-[6px] border border-[#CCCCCC] px-3 py-2.5">
                <div>
                  <Label htmlFor="promo-wiz-active">Active</Label>
                  <p className="text-[11px] text-[#756A5B]">
                    Inactive promotions stay on file but are not offered.
                  </p>
                </div>
                <Switch
                  id="promo-wiz-active"
                  checked={form.active}
                  disabled={!canEdit}
                  onCheckedChange={(active) => patchForm({ active })}
                />
              </div>
            </WizardCard>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              <WizardCard title="Discount">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="promo-wiz-discount-type">Discount Type</Label>
                    <Select
                      value={form.promoKind}
                      disabled={!canEdit || isLegacyFreeNight}
                      onValueChange={(next) => {
                        if (isLegacyFreeNight) return;
                        patchForm({ promoKind: next as PromoKind });
                      }}
                    >
                      <SelectTrigger
                        id="promo-wiz-discount-type"
                        className={PROPERTY_SETUP_CONTROL_CLASS}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {selectableKinds.map((kind) => (
                          <SelectItem key={kind} value={kind}>
                            {PROMO_KIND_LABELS[kind]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="promo-wiz-value">Discount Value *</Label>
                    <Input
                      id="promo-wiz-value"
                      type="number"
                      min={0}
                      step={form.promoKind === "free_night" ? 1 : 0.01}
                      value={form.promoValue}
                      disabled={!canEdit}
                      className={PROPERTY_SETUP_CONTROL_CLASS}
                      aria-invalid={attempted && parsedValue == null}
                      onChange={(event) => patchForm({ promoValue: event.target.value })}
                    />
                    <p className="text-[11px] text-muted-foreground">{valueHint}</p>
                  </div>
                </div>
                <p className="text-[11px] text-[#5C5346]">
                  Discount applies on top of the Rate Plan price. It does not change the Rate Plan
                  base rate.
                </p>
              </WizardCard>

              <WizardCard title="Stay Window">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="promo-wiz-from">Stay From *</Label>
                    <Input
                      id="promo-wiz-from"
                      type="date"
                      value={form.validFrom}
                      disabled={!canEdit}
                      className={PROPERTY_SETUP_CONTROL_CLASS}
                      onChange={(event) => patchForm({ validFrom: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="promo-wiz-to">Stay To *</Label>
                    <Input
                      id="promo-wiz-to"
                      type="date"
                      value={form.validTo}
                      disabled={!canEdit}
                      className={PROPERTY_SETUP_CONTROL_CLASS}
                      onChange={(event) => patchForm({ validTo: event.target.value })}
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Eligible stay dates for this offer. Booking-window and lead-time rules are not
                  configured on this catalogue.
                </p>
              </WizardCard>
            </div>
          ) : null}

          {step === 3 ? (
            <WizardCard title="Applicability">
              <p className="text-[11px] text-[#5C5346]">
                Choose which room types this promotion may apply to. Leave none selected to allow
                all room types. Rate Plan targeting is managed when the promotion is activated for
                sale.
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
                    const id = `promo-room-${row.id}`;
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
                Selected:{" "}
                {form.roomTypeIds.length === 0
                  ? "All room types"
                  : `${form.roomTypeIds.length} room type${form.roomTypeIds.length === 1 ? "" : "s"}`}
              </p>
            </WizardCard>
          ) : null}

          {step === 4 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <WizardCard title="Promotion">
                <ReviewRow label="Name" value={form.name.trim() || "—"} />
                <ReviewRow label="Code" value={form.code || "—"} />
                <ReviewRow label="Type" value={PROMO_KIND_LABELS[form.promoKind]} />
                <ReviewRow label="Status" value={form.active ? "Active" : "Inactive"} />
              </WizardCard>
              <WizardCard title="Offer">
                <ReviewRow
                  label="Discount"
                  value={
                    parsedValue == null
                      ? "—"
                      : formatPromotionDiscount(form.promoKind, parsedValue)
                  }
                />
                <ReviewRow
                  label="Stay window"
                  value={formatPromotionStayWindow(form.validFrom, form.validTo)}
                />
              </WizardCard>
              <WizardCard title="Applicability">
                <ReviewRow
                  label="Room types"
                  value={formatPromotionAppliesTo(form.roomTypeIds, snapshot.roomTypes)}
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
          {step < 4 ? (
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
              {saving ? "Saving…" : "Complete Promotion"}
            </Button>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}

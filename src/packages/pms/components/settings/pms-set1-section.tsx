import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { COMMON_CURRENCIES, COMMON_TIMEZONES, formatMoney } from "@/shared/lib/property-time";
import { FoFeeDefaultsEditor } from "@/packages/pms/components/settings/fo-fee-defaults-editor";
import { PmsDocumentHeader } from "@/packages/pms/components/settings/pms-document-header";
import { activatePmsSet1, savePmsSet1Foundation } from "@/packages/pms/lib/pms-set1-foundation.functions";
import {
  DEPOSIT_TYPE_LABELS,
  DEPOSIT_TYPES,
  FEE_BASIS_LABELS,
  FEE_BASES,
  PROPERTY_TYPE_LABELS,
  PROPERTY_TYPES,
  SET1_ACTIVATE_LABEL,
  SET1_BUSINESS_DATE_COPY,
  SET1_CI_CO_EQUAL_WARNING,
  SET1_COLUMNS_UNAVAILABLE,
  SET1_HUB_HREF,
  SET1_OPS_HELPER,
  SET1_TAX_HONESTY,
  SET1_TAX_RM_SHARE,
  canActivateSet1,
  ciCoEqual,
  formatClockLabel,
  overallLabel,
  readinessLabel,
  type Set1Checklist,
  type Set1Foundation,
  type Set1IdentityDraft,
  type Set1OpsDraft,
  type Set1PoliciesDraft,
  type Set1Readiness,
  type Set1SectionId,
  type Set1TaxesDraft,
} from "@/packages/pms/lib/pms-set1-foundation";
import { usePropertyBusinessDate } from "@/packages/pms/lib/use-property-business-date";
import { cn } from "@/shared/lib/utils";

export function ReadinessChip({ readiness }: { readiness: Set1Readiness }) {
  const styles: Record<Set1Readiness, string> = {
    complete: "border-[#436436]/40 bg-[#436436]/10 text-[#436436]",
    warning: "border-[#C89933]/50 bg-[#C89933]/10 text-[#251605]",
    incomplete: "border-[#CCCCCC] bg-muted/60 text-muted-foreground",
    blocked: "border-destructive/40 bg-destructive/10 text-destructive",
  };
  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium", styles[readiness])}>
      {readinessLabel(readiness)}
    </span>
  );
}

function StickyBar({
  dirty,
  busy,
  disabledReason,
  onDiscard,
  onSave,
  gold = true,
  saveLabel = "Save",
}: {
  dirty: boolean;
  busy: boolean;
  disabledReason?: string | null;
  onDiscard: () => void;
  onSave: () => void;
  gold?: boolean;
  saveLabel?: string;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-1 mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/95 px-1 py-3 backdrop-blur">
      <Button type="button" variant="outline" disabled={!dirty || busy} onClick={onDiscard}>
        Discard
      </Button>
      <Button
        type="button"
        disabled={!dirty || busy || Boolean(disabledReason)}
        onClick={onSave}
        className={gold ? "bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90" : undefined}
      >
        {busy ? "Saving…" : saveLabel}
      </Button>
    </div>
  );
}

function useDirtyGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}

export function Set1IdentitySection({
  restaurantId,
  snapshot,
  canEdit,
}: {
  restaurantId: string;
  snapshot: Set1Foundation;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(savePmsSet1Foundation);
  const [draft, setDraft] = useState<Set1IdentityDraft>(snapshot.identity);
  useEffect(() => setDraft(snapshot.identity), [snapshot.identity]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(snapshot.identity);
  useDirtyGuard(dirty);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          restaurantId,
          section: "identity",
          name: draft.name,
          email: draft.email || null,
          phone: draft.phone || null,
          address: draft.address || null,
          city: draft.city || null,
          postcode: draft.postcode || null,
          country: draft.country || null,
          logoUrl: draft.logoUrl || null,
          timezone: draft.timezone,
          currencyCode: draft.currencyCode,
          propertyCode: draft.propertyCode || null,
          legalName: draft.legalName || null,
          propertyType: draft.propertyType || null,
          taxIdentities: draft.taxIdentities,
        },
      }),
    onSuccess: () => {
      toast.success("Identity saved.");
      void queryClient.invalidateQueries({ queryKey: ["pms-set1-foundation", restaurantId] });
      void queryClient.invalidateQueries({ queryKey: ["my-restaurants"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section id="identity" className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div>
        <h2 className="font-display text-lg text-[#251605]">Identity</h2>
        <p className="mt-1 text-sm text-muted-foreground">Live name, address and logo appear on documents.</p>
      </div>
      <PmsDocumentHeader identity={snapshot.identity} />
      <Field id="set1-name" label="Display name" value={draft.name} disabled={!canEdit} onChange={(name) => setDraft((p) => ({ ...p, name }))} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="set1-phone" label="Phone" type="tel" value={draft.phone} disabled={!canEdit} onChange={(phone) => setDraft((p) => ({ ...p, phone }))} />
        <Field id="set1-email" label="Email" type="email" value={draft.email} disabled={!canEdit} onChange={(email) => setDraft((p) => ({ ...p, email }))} />
      </div>
      <Field id="set1-address" label="Address" value={draft.address} disabled={!canEdit} onChange={(address) => setDraft((p) => ({ ...p, address }))} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="set1-city" label="City" value={draft.city} disabled={!canEdit} onChange={(city) => setDraft((p) => ({ ...p, city }))} />
        <Field id="set1-postcode" label="Postcode" value={draft.postcode} disabled={!canEdit} onChange={(postcode) => setDraft((p) => ({ ...p, postcode }))} />
        <Field id="set1-country" label="Country" value={draft.country} disabled={!canEdit} onChange={(country) => setDraft((p) => ({ ...p, country }))} />
      </div>
      <Field id="set1-logo" label="Logo URL" value={draft.logoUrl} disabled={!canEdit} onChange={(logoUrl) => setDraft((p) => ({ ...p, logoUrl }))} />
      {snapshot.foundationColumnsAvailable ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="set1-code" label="Property code" value={draft.propertyCode} disabled={!canEdit} onChange={(propertyCode) => setDraft((p) => ({ ...p, propertyCode }))} />
            <Field id="set1-legal" label="Legal name" value={draft.legalName} disabled={!canEdit} onChange={(legalName) => setDraft((p) => ({ ...p, legalName }))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="set1-type">Property type</Label>
            <Select
              value={draft.propertyType || "unset"}
              onValueChange={(value) =>
                setDraft((p) => ({ ...p, propertyType: value === "unset" ? "" : (value as Set1IdentityDraft["propertyType"]) }))
              }
              disabled={!canEdit}
            >
              <SelectTrigger id="set1-type" className="h-12 rounded-xl">
                <SelectValue placeholder="Choose a type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">Not set</SelectItem>
                {PROPERTY_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {PROPERTY_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium">Tax identities</p>
            {draft.taxIdentities.map((row, index) => (
              <div key={`${index}-${row.label}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <Input
                  placeholder="Label"
                  value={row.label}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setDraft((prev) => {
                      const next = [...prev.taxIdentities];
                      next[index] = { ...row, label: event.target.value };
                      return { ...prev, taxIdentities: next };
                    })
                  }
                />
                <Input
                  placeholder="Value"
                  value={row.value}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setDraft((prev) => {
                      const next = [...prev.taxIdentities];
                      next[index] = { ...row, value: event.target.value };
                      return { ...prev, taxIdentities: next };
                    })
                  }
                />
                {canEdit ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDraft((prev) => ({ ...prev, taxIdentities: prev.taxIdentities.filter((_, i) => i !== index) }))}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            ))}
            {canEdit ? (
              <Button type="button" variant="outline" onClick={() => setDraft((prev) => ({ ...prev, taxIdentities: [...prev.taxIdentities, { label: "", value: "" }] }))}>
                Add tax identity
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{SET1_COLUMNS_UNAVAILABLE}</p>
      )}
      <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="set1-timezone">Timezone</Label>
          <Select value={draft.timezone} onValueChange={(timezone) => setDraft((p) => ({ ...p, timezone }))} disabled={!canEdit}>
            <SelectTrigger id="set1-timezone" className="h-12 rounded-xl">
              <SelectValue placeholder="Choose a timezone" />
            </SelectTrigger>
            <SelectContent>
              {COMMON_TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="set1-currency">Currency</Label>
          <Select value={draft.currencyCode} onValueChange={(currencyCode) => setDraft((p) => ({ ...p, currencyCode }))} disabled={!canEdit}>
            <SelectTrigger id="set1-currency" className="h-12 rounded-xl">
              <SelectValue placeholder="Choose a currency" />
            </SelectTrigger>
            <SelectContent>
              {COMMON_CURRENCIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {canEdit ? (
        <StickyBar
          dirty={dirty}
          busy={mutation.isPending}
          onDiscard={() => setDraft(snapshot.identity)}
          onSave={() => mutation.mutate()}
        />
      ) : null}
    </section>
  );
}

export function Set1OpsSection({
  restaurantId,
  snapshot,
  canEdit,
}: {
  restaurantId: string;
  snapshot: Set1Foundation;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(savePmsSet1Foundation);
  const [draft, setDraft] = useState<Set1OpsDraft>(snapshot.ops);
  useEffect(() => setDraft(snapshot.ops), [snapshot.ops]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(snapshot.ops);
  useDirtyGuard(dirty);
  const equal = ciCoEqual(draft.checkInTime, draft.checkOutTime);
  const businessDate = usePropertyBusinessDate(restaurantId, snapshot.timezone);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          restaurantId,
          section: "ops",
          checkInTime: draft.checkInTime,
          checkOutTime: draft.checkOutTime,
          hotelDayOpen: draft.hotelDayOpen,
        },
      }),
    onSuccess: () => {
      toast.success("Check-in times saved.");
      void queryClient.invalidateQueries({ queryKey: ["pms-set1-foundation", restaurantId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section id="ops" className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div>
        <h2 className="font-display text-lg text-[#251605]">Check-in &amp; business date</h2>
        <p className="mt-1 text-sm text-muted-foreground">{SET1_OPS_HELPER}</p>
      </div>
      {snapshot.foundationColumnsAvailable ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="set1-ci">Check-in time</Label>
            <Input
              id="set1-ci"
              type="time"
              value={draft.checkInTime}
              disabled={!canEdit}
              onChange={(event) => setDraft((p) => ({ ...p, checkInTime: event.target.value }))}
              className="h-12 rounded-xl"
            />
            <p className="text-xs text-muted-foreground">{formatClockLabel(draft.checkInTime, snapshot.timezone)}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="set1-co">Check-out time</Label>
            <Input
              id="set1-co"
              type="time"
              value={draft.checkOutTime}
              disabled={!canEdit}
              onChange={(event) => setDraft((p) => ({ ...p, checkOutTime: event.target.value }))}
              className="h-12 rounded-xl"
            />
            <p className="text-xs text-muted-foreground">{formatClockLabel(draft.checkOutTime, snapshot.timezone)}</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{SET1_COLUMNS_UNAVAILABLE}</p>
      )}
      {equal ? <p className="text-sm text-[#C89933]">{SET1_CI_CO_EQUAL_WARNING}</p> : null}
      {snapshot.foundationColumnsAvailable ? (
        <div className="flex items-center justify-between rounded-xl border border-border px-3 py-3">
          <Label htmlFor="set1-hotel-day">Hotel day open</Label>
          <Switch
            id="set1-hotel-day"
            checked={draft.hotelDayOpen}
            disabled={!canEdit}
            onCheckedChange={(hotelDayOpen) => setDraft((p) => ({ ...p, hotelDayOpen }))}
          />
        </div>
      ) : null}
      <div className="rounded-xl border border-[#CCCCCC] bg-muted/30 p-4" data-testid="set1-business-date-readonly">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Business date</p>
        <p className="mt-1 font-medium text-[#251605]">{businessDate}</p>
        <p className="mt-1 text-sm text-muted-foreground">{SET1_BUSINESS_DATE_COPY}</p>
      </div>
      {canEdit && snapshot.foundationColumnsAvailable ? (
        <StickyBar dirty={dirty} busy={mutation.isPending} onDiscard={() => setDraft(snapshot.ops)} onSave={() => mutation.mutate()} />
      ) : null}
    </section>
  );
}

export function Set1TaxesSection({
  restaurantId,
  snapshot,
  canEdit,
}: {
  restaurantId: string;
  snapshot: Set1Foundation;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(savePmsSet1Foundation);
  const [draft, setDraft] = useState<Set1TaxesDraft>(snapshot.taxes);
  const [confirmOpen, setConfirmOpen] = useState(false);
  useEffect(() => setDraft(snapshot.taxes), [snapshot.taxes]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(snapshot.taxes);
  useDirtyGuard(dirty);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          restaurantId,
          section: "taxes",
          taxInclusive: draft.taxInclusive,
          taxName: draft.taxName || null,
          taxRate: draft.taxRate,
          serviceEnabled: draft.serviceEnabled,
          serviceRate: draft.serviceRate,
        },
      }),
    onSuccess: () => {
      setConfirmOpen(false);
      toast.success("Tax settings saved. New postings use these rates.");
      void queryClient.invalidateQueries({ queryKey: ["pms-set1-foundation", restaurantId] });
    },
    onError: (error: Error) => {
      setConfirmOpen(false);
      toast.error(error.message);
    },
  });

  return (
    <section id="taxes" className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div>
        <h2 className="font-display text-lg text-[#251605]">Taxes</h2>
        <p className="mt-1 text-sm text-muted-foreground">{SET1_TAX_HONESTY}</p>
        <p className="mt-1 text-sm text-muted-foreground">{SET1_TAX_RM_SHARE}</p>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Tax mode</p>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { value: false, label: "Exclusive" },
              { value: true, label: "Inclusive" },
            ] as const
          ).map((option) => (
            <button
              key={String(option.value)}
              type="button"
              disabled={!canEdit}
              onClick={() => setDraft((p) => ({ ...p, taxInclusive: option.value }))}
              className={cn(
                "h-12 rounded-2xl border text-sm font-semibold",
                draft.taxInclusive === option.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {snapshot.foundationColumnsAvailable ? (
        <Field id="set1-tax-name" label="Tax name" value={draft.taxName} disabled={!canEdit} onChange={(taxName) => setDraft((p) => ({ ...p, taxName }))} />
      ) : (
        <p className="text-sm text-muted-foreground">{SET1_COLUMNS_UNAVAILABLE}</p>
      )}
      <div className="space-y-2">
        <Label htmlFor="set1-tax-rate">Room stay rate</Label>
        <div className="relative">
          <Input
            id="set1-tax-rate"
            inputMode="decimal"
            disabled={!canEdit}
            value={String(draft.taxRate)}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              if (!Number.isFinite(parsed) && event.target.value !== "") return;
              setDraft((p) => ({ ...p, taxRate: Number(event.target.value) || 0 }));
            }}
            className="h-12 pr-10"
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-sm text-muted-foreground">%</span>
        </div>
        <p className="text-xs text-muted-foreground">Applies to Room stay. Extra named rates are not in this wave.</p>
      </div>
      <div className="space-y-3 rounded-xl border border-border p-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="set1-service">Service charge</Label>
          <Switch
            id="set1-service"
            checked={draft.serviceEnabled}
            disabled={!canEdit}
            onCheckedChange={(serviceEnabled) => setDraft((p) => ({ ...p, serviceEnabled }))}
          />
        </div>
        {draft.serviceEnabled ? (
          <div className="relative">
            <Input
              id="set1-service-rate"
              inputMode="decimal"
              disabled={!canEdit}
              value={String(draft.serviceRate)}
              onChange={(event) => setDraft((p) => ({ ...p, serviceRate: Number(event.target.value) || 0 }))}
              className="h-12 pr-10"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-sm text-muted-foreground">%</span>
          </div>
        ) : null}
      </div>
      {canEdit ? (
        <>
          <StickyBar dirty={dirty} busy={mutation.isPending} onDiscard={() => setDraft(snapshot.taxes)} onSave={() => setConfirmOpen(true)} />
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent className="border-[#C89933]">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-[#251605]">Confirm tax settings</AlertDialogTitle>
                <AlertDialogDescription>{SET1_TAX_HONESTY}</AlertDialogDescription>
              </AlertDialogHeader>
              <div className="rounded-xl border border-[#CCCCCC] p-3 text-sm">
                <p>Before: {snapshot.taxes.taxInclusive ? "Inclusive" : "Exclusive"} · {snapshot.taxes.taxName || "Unnamed"} {snapshot.taxes.taxRate}%</p>
                <p className="text-[#436436]">After: {draft.taxInclusive ? "Inclusive" : "Exclusive"} · {draft.taxName || "Unnamed"} {draft.taxRate}%</p>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                  onClick={(event) => {
                    event.preventDefault();
                    mutation.mutate();
                  }}
                >
                  Confirm
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : null}
    </section>
  );
}

export function Set1PoliciesSection({
  restaurantId,
  role,
  snapshot,
  canEdit,
}: {
  restaurantId: string;
  role: string;
  snapshot: Set1Foundation;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(savePmsSet1Foundation);
  const [draft, setDraft] = useState<Set1PoliciesDraft>(snapshot.policies);
  const [confirmOpen, setConfirmOpen] = useState(false);
  useEffect(() => setDraft(snapshot.policies), [snapshot.policies]);
  const dirty = JSON.stringify({ ...draft, fees: undefined }) !== JSON.stringify({ ...snapshot.policies, fees: undefined });
  useDirtyGuard(dirty);
  const money = (value: number) => formatMoney(value, snapshot.identity.currencyCode);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          restaurantId,
          section: "policies",
          cancelWindowHours: draft.cancelWindowHours,
          cancelFeeBasis: draft.cancelFeeBasis || null,
          noshowFeeBasis: draft.noshowFeeBasis || null,
          depositRequired: draft.depositRequired,
          depositType: draft.depositType || null,
          depositValue: draft.depositValue,
          earlyCheckinAllowed: draft.earlyCheckinAllowed,
          earlyCheckinFee: draft.earlyCheckinFee,
          earlyCheckinNeedsApproval: draft.earlyCheckinNeedsApproval,
          lateCheckoutAllowed: draft.lateCheckoutAllowed,
          lateCheckoutFee: draft.lateCheckoutFee,
          lateCheckoutNeedsApproval: draft.lateCheckoutNeedsApproval,
          cancelFeeRequired: snapshot.policies.fees.cancelFeeRequired,
          cancelFeeDefault: snapshot.policies.fees.cancelFeeDefault,
          noshowFeeRequired: snapshot.policies.fees.noshowFeeRequired,
          noshowFeeDefault: snapshot.policies.fees.noshowFeeDefault,
        },
      }),
    onSuccess: () => {
      setConfirmOpen(false);
      toast.success("Policies saved.");
      void queryClient.invalidateQueries({ queryKey: ["pms-set1-foundation", restaurantId] });
    },
    onError: (error: Error) => {
      setConfirmOpen(false);
      toast.error(error.message);
    },
  });

  return (
    <section id="policies" className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div>
        <h2 className="font-display text-lg text-[#251605]">Policies &amp; fees</h2>
        <p className="mt-1 text-sm text-muted-foreground">Cancel and no-show amounts stay on the existing 0042 columns.</p>
      </div>
      <FoFeeDefaultsEditor restaurantId={restaurantId} role={role} currencyCode={snapshot.identity.currencyCode} />
      {snapshot.foundationColumnsAvailable ? (
        <div className="space-y-4 border-t border-border pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              id="set1-cancel-window"
              label="Cancel window (hours)"
              type="number"
              value={draft.cancelWindowHours}
              disabled={!canEdit}
              onChange={(cancelWindowHours) => setDraft((p) => ({ ...p, cancelWindowHours }))}
            />
            <BasisSelect
              id="set1-cancel-basis"
              label="Cancel fee basis"
              value={draft.cancelFeeBasis}
              disabled={!canEdit}
              onChange={(cancelFeeBasis) => setDraft((p) => ({ ...p, cancelFeeBasis }))}
            />
            <BasisSelect
              id="set1-noshow-basis"
              label="No-show fee basis"
              value={draft.noshowFeeBasis}
              disabled={!canEdit}
              onChange={(noshowFeeBasis) => setDraft((p) => ({ ...p, noshowFeeBasis }))}
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border px-3 py-3">
            <Label htmlFor="set1-deposit">Deposit required</Label>
            <Switch
              id="set1-deposit"
              checked={draft.depositRequired}
              disabled={!canEdit}
              onCheckedChange={(depositRequired) => setDraft((p) => ({ ...p, depositRequired }))}
            />
          </div>
          {draft.depositRequired ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="set1-deposit-type">Deposit type</Label>
                <Select
                  value={draft.depositType || "unset"}
                  disabled={!canEdit}
                  onValueChange={(value) => setDraft((p) => ({ ...p, depositType: value === "unset" ? "" : (value as Set1PoliciesDraft["depositType"]) }))}
                >
                  <SelectTrigger id="set1-deposit-type" className="h-12 rounded-xl">
                    <SelectValue placeholder="Choose a type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">Not set</SelectItem>
                    {DEPOSIT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {DEPOSIT_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Field id="set1-deposit-value" label="Deposit value" type="number" value={draft.depositValue} disabled={!canEdit} onChange={(depositValue) => setDraft((p) => ({ ...p, depositValue }))} />
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-border p-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="set1-early">Early check-in allowed</Label>
                <Switch id="set1-early" checked={draft.earlyCheckinAllowed} disabled={!canEdit} onCheckedChange={(earlyCheckinAllowed) => setDraft((p) => ({ ...p, earlyCheckinAllowed }))} />
              </div>
              <Field id="set1-early-fee" label="Early check-in fee" type="number" value={draft.earlyCheckinFee} disabled={!canEdit} onChange={(earlyCheckinFee) => setDraft((p) => ({ ...p, earlyCheckinFee }))} />
              <div className="flex items-center justify-between">
                <Label htmlFor="set1-early-approval">Needs approval</Label>
                <Switch id="set1-early-approval" checked={draft.earlyCheckinNeedsApproval} disabled={!canEdit} onCheckedChange={(earlyCheckinNeedsApproval) => setDraft((p) => ({ ...p, earlyCheckinNeedsApproval }))} />
              </div>
            </div>
            <div className="space-y-3 rounded-xl border border-border p-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="set1-late">Late check-out allowed</Label>
                <Switch id="set1-late" checked={draft.lateCheckoutAllowed} disabled={!canEdit} onCheckedChange={(lateCheckoutAllowed) => setDraft((p) => ({ ...p, lateCheckoutAllowed }))} />
              </div>
              <Field id="set1-late-fee" label="Late check-out fee" type="number" value={draft.lateCheckoutFee} disabled={!canEdit} onChange={(lateCheckoutFee) => setDraft((p) => ({ ...p, lateCheckoutFee }))} />
              <div className="flex items-center justify-between">
                <Label htmlFor="set1-late-approval">Needs approval</Label>
                <Switch id="set1-late-approval" checked={draft.lateCheckoutNeedsApproval} disabled={!canEdit} onCheckedChange={(lateCheckoutNeedsApproval) => setDraft((p) => ({ ...p, lateCheckoutNeedsApproval }))} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{SET1_COLUMNS_UNAVAILABLE}</p>
      )}
      {canEdit && snapshot.foundationColumnsAvailable ? (
        <>
          <StickyBar dirty={dirty} busy={mutation.isPending} onDiscard={() => setDraft(snapshot.policies)} onSave={() => setConfirmOpen(true)} />
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent className="border-[#C89933]">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-[#251605]">Confirm policy changes</AlertDialogTitle>
                <AlertDialogDescription>Review Before → After for money-affecting fields.</AlertDialogDescription>
              </AlertDialogHeader>
              <dl className="space-y-2 rounded-xl border border-[#CCCCCC] p-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">Previous deposit</dt>
                    <dd>{snapshot.policies.depositRequired ? `${snapshot.policies.depositType} ${snapshot.policies.depositValue}` : "Not required"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">New deposit</dt>
                    <dd className="text-[#436436]">{draft.depositRequired ? `${draft.depositType} ${draft.depositValue}` : "Not required"}</dd>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">Previous early / late fees</dt>
                    <dd>
                      {money(Number(snapshot.policies.earlyCheckinFee) || 0)} / {money(Number(snapshot.policies.lateCheckoutFee) || 0)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">New early / late fees</dt>
                    <dd className="text-[#436436]">
                      {money(Number(draft.earlyCheckinFee) || 0)} / {money(Number(draft.lateCheckoutFee) || 0)}
                    </dd>
                  </div>
                </div>
              </dl>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                  onClick={(event) => {
                    event.preventDefault();
                    mutation.mutate();
                  }}
                >
                  Confirm
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : null}
    </section>
  );
}

export function Set1GoLiveSection({
  restaurantId,
  role,
  snapshot,
  checklist,
  canEdit,
}: {
  restaurantId: string;
  role: string;
  snapshot: Set1Foundation;
  checklist: Set1Checklist;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const activate = useServerFn(activatePmsSet1);
  const owner = canActivateSet1(role);
  const mutation = useMutation({
    mutationFn: () => activate({ data: { restaurantId } }),
    onSuccess: () => {
      toast.success("Foundation settings are live.");
      void queryClient.invalidateQueries({ queryKey: ["pms-set1-foundation", restaurantId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section id="golive" className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg text-[#251605]">Go-live</h2>
          <p className="mt-1 text-sm text-muted-foreground">SET1 domains only. Never a fake Complete.</p>
        </div>
        <ReadinessChip readiness={checklist.overall === "ready" ? "complete" : checklist.overall === "warning" ? "warning" : "blocked"} />
      </div>
      <p className="text-sm font-medium text-[#251605]">Overall {overallLabel(checklist.overall)}</p>
      <ul className="space-y-3">
        {(["identity", "ops", "taxes", "policies"] as Set1SectionId[]).map((id) => {
          const domain = checklist.domains[id];
          return (
            <li key={id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium capitalize">{id === "ops" ? "Check-in & business date" : id === "policies" ? "Policies & fees" : id}</p>
                <ReadinessChip readiness={domain.readiness} />
              </div>
              {domain.missing.length ? (
                <p className="mt-1 text-sm text-muted-foreground">Missing: {domain.missing.join(", ")}</p>
              ) : null}
              {domain.warnings.length ? (
                <p className="mt-1 text-sm text-muted-foreground">{domain.warnings[0]}</p>
              ) : null}
              <a href={`${SET1_HUB_HREF}#${id}`} className="mt-2 inline-flex text-sm font-medium text-[#C89933]">
                Configure
              </a>
            </li>
          );
        })}
      </ul>
      {owner ? (
        <div className="space-y-2">
          <Button
            type="button"
            disabled={!checklist.canActivate || mutation.isPending || snapshot.pmsSet1Live}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90 disabled:opacity-50"
            onClick={() => mutation.mutate()}
          >
            {snapshot.pmsSet1Live ? "Property is live" : mutation.isPending ? "Activating…" : SET1_ACTIVATE_LABEL}
          </Button>
          {!checklist.canActivate && !snapshot.pmsSet1Live ? (
            <p className="text-sm text-muted-foreground">
              Activate stays off while mandatory items are incomplete: {checklist.mandatoryMissing.join(", ") || "see the list above"}.
            </p>
          ) : null}
        </div>
      ) : canEdit ? (
        <p className="text-sm text-muted-foreground">Managers can complete the checklist. Only the owner can activate.</p>
      ) : null}
    </section>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 rounded-xl text-base"
      />
    </div>
  );
}

function BasisSelect({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: Set1PoliciesDraft["cancelFeeBasis"]) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || "unset"} disabled={disabled === true} onValueChange={(next) => onChange(next === "unset" ? "" : (next as Set1PoliciesDraft["cancelFeeBasis"]))}>
        <SelectTrigger id={id} className="h-12 rounded-xl">
          <SelectValue placeholder="Choose a basis" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unset">Not set</SelectItem>
          {FEE_BASES.map((basis) => (
            <SelectItem key={basis} value={basis}>
              {FEE_BASIS_LABELS[basis]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function Set1SectionView({
  section,
  restaurantId,
  role,
  snapshot,
  checklist,
  canEdit,
}: {
  section: Set1SectionId;
  restaurantId: string;
  role: string;
  snapshot: Set1Foundation;
  checklist: Set1Checklist;
  canEdit: boolean;
}) {
  const body = useMemo(() => {
    if (section === "identity") return <Set1IdentitySection restaurantId={restaurantId} snapshot={snapshot} canEdit={canEdit} />;
    if (section === "ops") return <Set1OpsSection restaurantId={restaurantId} snapshot={snapshot} canEdit={canEdit} />;
    if (section === "taxes") return <Set1TaxesSection restaurantId={restaurantId} snapshot={snapshot} canEdit={canEdit} />;
    if (section === "policies") return <Set1PoliciesSection restaurantId={restaurantId} role={role} snapshot={snapshot} canEdit={canEdit} />;
    return <Set1GoLiveSection restaurantId={restaurantId} role={role} snapshot={snapshot} checklist={checklist} canEdit={canEdit} />;
  }, [section, restaurantId, role, snapshot, checklist, canEdit]);
  return body;
}

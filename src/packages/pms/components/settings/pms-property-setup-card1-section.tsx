import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Textarea } from "@/shared/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { COMMON_CURRENCIES, COMMON_TIMEZONES } from "@/shared/lib/property-time";
import { PROPERTY_TYPE_LABELS, PROPERTY_TYPES, SET1_HUB_HREF } from "@/packages/pms/lib/pms-set1-foundation";
import { Set2StructureSection } from "@/packages/pms/components/settings/pms-set2-section";
import type { Set1Checklist } from "@/packages/pms/lib/pms-set1-foundation";
import type { Set2Snapshot } from "@/packages/pms/lib/pms-set2-structure";
import { usePropertyBusinessDate } from "@/packages/pms/lib/use-property-business-date";
import { savePmsPropertySetupCard1 } from "@/packages/pms/lib/pms-property-setup-card1.functions";
import {
  CARD1_AGREEMENT_OUT,
  CARD1_BUSINESS_DATE_CURRENT_COPY,
  CARD1_CAPACITY_COPY,
  CARD1_COLUMNS_UNAVAILABLE,
  CARD1_FINISH_COPY,
  CARD1_FULL_ADDRESS_COPY,
  CARD1_LANGUAGES,
  CARD1_OPENING_DATE_OUT,
  CARD1_ROOMS_HREF,
  CARD1_STEPS,
  CARD1_TITLE,
  CARD1_VAT_GATE_COPY,
  ETHIOPIA_REGIONS,
  LEGAL_ENTITY_TYPE_LABELS,
  LEGAL_ENTITY_TYPES,
  STAR_RATINGS,
  card1StructureWarnings,
  card1TaxWarnings,
  composeFullAddress,
  displayedCard1BusinessDate,
  nextCard1Step,
  vatCertificateRequired,
  type Card1Draft,
  type Card1Snapshot,
  type Card1StepId,
} from "@/packages/pms/lib/pms-property-setup-card1";
import { cn } from "@/shared/lib/utils";

function Field({
  id,
  label,
  value,
  disabled,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} disabled={disabled} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="h-12" />
    </div>
  );
}

export function PmsPropertySetupCard1Section({
  restaurantId,
  snapshot,
  set2,
  checklist,
  canEdit,
  initialStep = "identity",
}: {
  restaurantId: string;
  snapshot: Card1Snapshot;
  set2: Set2Snapshot;
  checklist: Set1Checklist;
  canEdit: boolean;
  initialStep?: Card1StepId;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(savePmsPropertySetupCard1);
  const [step, setStep] = useState<Card1StepId>(initialStep);
  const [draft, setDraft] = useState<Card1Draft>(snapshot.draft);
  useEffect(() => setDraft(snapshot.draft), [snapshot.draft]);
  const composedAddress = useMemo(() => composeFullAddress(draft), [draft]);
  const currentBusinessDate = usePropertyBusinessDate(restaurantId, snapshot.timezone || draft.timezone);
  const dirty = JSON.stringify(draft) !== JSON.stringify(snapshot.draft);

  const mutation = useMutation({
    mutationFn: (mode: "draft" | "continue" | "finish") =>
      save({
        data: {
          restaurantId,
          step,
          mode,
          draft: {
            ...draft,
            starRating: draft.starRating === "" ? "" : draft.starRating,
          },
        },
      }),
    onSuccess: (result, mode) => {
      void queryClient.invalidateQueries({ queryKey: ["pms-set1-foundation", restaurantId] });
      void queryClient.invalidateQueries({ queryKey: ["pms-card1", restaurantId] });
      void queryClient.invalidateQueries({ queryKey: ["pms-set1-audit", restaurantId] });
      toast.success(mode === "finish" ? "Card 1 saved. Property is not Activated." : "Draft saved.");
      if (mode === "continue") {
        const next = nextCard1Step(step);
        if (next) setStep(next);
      }
      if (mode === "finish") {
        window.location.hash = "";
        window.history.replaceState(null, "", SET1_HUB_HREF);
      }
      if (result.snapshot) setDraft(result.snapshot.draft);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const taxWarnings = card1TaxWarnings(draft);
  const structureWarnings = card1StructureWarnings(draft, set2);

  return (
    <section className="space-y-4" data-testid="pms-card1-workspace">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-2xl text-[#251605]">{CARD1_TITLE}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Step {CARD1_STEPS.find((row) => row.id === step)?.number} of 8 · {CARD1_STEPS.find((row) => row.id === step)?.title}</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href={SET1_HUB_HREF}>Back</a>
        </Button>
      </div>

      <ol className="grid gap-2 sm:grid-cols-4 xl:grid-cols-8" data-testid="pms-card1-steps">
        {CARD1_STEPS.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => setStep(row.id)}
              className={cn(
                "w-full rounded-xl border px-2 py-2 text-left text-xs",
                step === row.id ? "border-[#C89933] bg-[#C89933]/10 text-[#251605]" : "border-border text-muted-foreground",
              )}
            >
              <span className="font-semibold">{row.number}</span> {row.title}
            </button>
          </li>
        ))}
      </ol>

      {!snapshot.card1ColumnsAvailable ? (
        <p className="text-sm text-muted-foreground">{CARD1_COLUMNS_UNAVAILABLE}</p>
      ) : null}

      <div className="rounded-2xl border border-border bg-card p-5">
        {step === "identity" ? <IdentityStep draft={draft} setDraft={setDraft} canEdit={canEdit} /> : null}
        {step === "address" ? <AddressStep draft={draft} setDraft={setDraft} canEdit={canEdit} composedAddress={composedAddress} /> : null}
        {step === "contacts" ? <ContactsStep draft={draft} setDraft={setDraft} canEdit={canEdit} /> : null}
        {step === "checkin" ? <CheckinStep draft={draft} setDraft={setDraft} canEdit={canEdit} /> : null}
        {step === "business-date" ? (
          <BusinessDateStep
            draft={draft}
            setDraft={setDraft}
            canEdit={canEdit}
            currentState={displayedCard1BusinessDate(snapshot.businessDate ?? currentBusinessDate, snapshot.timezone)}
          />
        ) : null}
        {step === "legal" ? <LegalStep draft={draft} setDraft={setDraft} canEdit={canEdit} /> : null}
        {step === "tax" ? <TaxStep draft={draft} setDraft={setDraft} canEdit={canEdit} warnings={taxWarnings} /> : null}
        {step === "structure" ? (
          <StructureStep
            restaurantId={restaurantId}
            draft={draft}
            canEdit={canEdit}
            set2={set2}
            checklist={checklist}
            snapshot={snapshot}
            warnings={structureWarnings}
          />
        ) : null}
      </div>

      {canEdit ? (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/95 py-3" data-testid="pms-card1-chrome">
          <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate("draft")}>
            Save Draft
          </Button>
          {step === "structure" ? (
            <Button
              type="button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate("finish")}
              className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
            >
              {mutation.isPending ? "Saving…" : "Complete Card 1"}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate("continue")}
              className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
            >
              {mutation.isPending ? "Saving…" : "Save & Continue"}
            </Button>
          )}
          {step === "structure" ? (
            <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate("finish")}>
              Save & Finish
            </Button>
          ) : null}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">{CARD1_FINISH_COPY}</p>
      {dirty ? <p className="sr-only">Unsaved Card 1 changes</p> : null}
    </section>
  );
}

function IdentityStep({
  draft,
  setDraft,
  canEdit,
}: {
  draft: Card1Draft;
  setDraft: Dispatch<SetStateAction<Card1Draft>>;
  canEdit: boolean;
}) {
  return (
    <div className="space-y-4" data-testid="pms-card1-step-identity">
      <p className="text-sm text-muted-foreground">{CARD1_OPENING_DATE_OUT}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="card1-name" label="Property name" value={draft.name} disabled={!canEdit} onChange={(name) => setDraft((p) => ({ ...p, name }))} />
        <Field id="card1-trading-name" label="Trading name" value={draft.tradingName} disabled={!canEdit} onChange={(tradingName) => setDraft((p) => ({ ...p, tradingName }))} />
        <Field id="card1-property-code" label="Property code" value={draft.propertyCode} disabled={!canEdit} onChange={(propertyCode) => setDraft((p) => ({ ...p, propertyCode }))} />
        <div className="space-y-2">
          <Label htmlFor="card1-property-type">Property type</Label>
          <Select value={draft.propertyType || "unset"} onValueChange={(value) => setDraft((p) => ({ ...p, propertyType: value === "unset" ? "" : value }))} disabled={!canEdit}>
            <SelectTrigger id="card1-property-type" className="h-12">
              <SelectValue placeholder="Not set" />
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
        <div className="space-y-2">
          <Label htmlFor="card1-star">Star rating</Label>
          <Select value={draft.starRating === "" ? "unset" : String(draft.starRating)} onValueChange={(value) => setDraft((p) => ({ ...p, starRating: value === "unset" ? "" : (Number(value) as 1 | 2 | 3 | 4 | 5) }))} disabled={!canEdit}>
            <SelectTrigger id="card1-star" className="h-12">
              <SelectValue placeholder="Not set" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unset">Not set</SelectItem>
              {STAR_RATINGS.map((rating) => (
                <SelectItem key={rating} value={String(rating)}>
                  {rating} star
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="card1-language">Default language</Label>
          <Select value={draft.defaultLanguage || "en"} onValueChange={(defaultLanguage) => setDraft((p) => ({ ...p, defaultLanguage }))} disabled={!canEdit}>
            <SelectTrigger id="card1-language" className="h-12">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CARD1_LANGUAGES.map((language) => (
                <SelectItem key={language.id} value={language.id}>
                  {language.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="card1-timezone">Timezone</Label>
          <Select value={draft.timezone} onValueChange={(timezone) => setDraft((p) => ({ ...p, timezone }))} disabled={!canEdit}>
            <SelectTrigger id="card1-timezone" className="h-12">
              <SelectValue />
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
          <Label htmlFor="card1-currency">Currency</Label>
          <Select value={draft.currencyCode} onValueChange={(currencyCode) => setDraft((p) => ({ ...p, currencyCode }))} disabled={!canEdit}>
            <SelectTrigger id="card1-currency" className="h-12">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMMON_CURRENCIES.map((currency) => (
                <SelectItem key={currency.code} value={currency.code}>
                  {currency.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="card1-short-description">Short description</Label>
        <Textarea id="card1-short-description" value={draft.shortDescription} disabled={!canEdit} onChange={(event) => setDraft((p) => ({ ...p, shortDescription: event.target.value }))} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="card1-brand-name" label="Brand name" value={draft.brandName} disabled={!canEdit} onChange={(brandName) => setDraft((p) => ({ ...p, brandName }))} />
        <Field id="card1-brand-code" label="Brand code" value={draft.brandCode} disabled={!canEdit} onChange={(brandCode) => setDraft((p) => ({ ...p, brandCode }))} />
        <Field id="card1-chain-name" label="Chain name" value={draft.chainName} disabled={!canEdit} onChange={(chainName) => setDraft((p) => ({ ...p, chainName }))} />
      </div>
      <div className="flex items-center justify-between rounded-xl border border-border p-3">
        <Label htmlFor="card1-trading-docs">Show trading name on documents</Label>
        <Switch id="card1-trading-docs" checked={draft.identityToggles.showTradingNameOnDocuments} disabled={!canEdit} onCheckedChange={(showTradingNameOnDocuments) => setDraft((p) => ({ ...p, identityToggles: { ...p.identityToggles, showTradingNameOnDocuments } }))} />
      </div>
      <div className="flex items-center justify-between rounded-xl border border-border p-3">
        <Label htmlFor="card1-chain">Chain property</Label>
        <Switch id="card1-chain" checked={draft.identityToggles.chainProperty} disabled={!canEdit} onCheckedChange={(chainProperty) => setDraft((p) => ({ ...p, identityToggles: { ...p.identityToggles, chainProperty } }))} />
      </div>
      <Field id="card1-logo" label="Logo URL" value={draft.logoUrl} disabled={!canEdit} onChange={(logoUrl) => setDraft((p) => ({ ...p, logoUrl }))} />
    </div>
  );
}

function AddressStep({
  draft,
  setDraft,
  canEdit,
  composedAddress,
}: {
  draft: Card1Draft;
  setDraft: Dispatch<SetStateAction<Card1Draft>>;
  canEdit: boolean;
  composedAddress: string;
}) {
  return (
    <div className="space-y-4" data-testid="pms-card1-step-address">
      <p className="text-sm text-muted-foreground">{CARD1_FULL_ADDRESS_COPY}</p>
      <div className="space-y-2">
        <Label htmlFor="card1-full-address">Full Address</Label>
        <Input id="card1-full-address" value={composedAddress} readOnly disabled data-testid="card1-full-address" className="h-12 bg-muted/40" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="card1-house" label="House / plot" value={draft.addressHouseNo} disabled={!canEdit} onChange={(addressHouseNo) => setDraft((p) => ({ ...p, addressHouseNo }))} />
        <Field id="card1-street" label="Street" value={draft.address} disabled={!canEdit} onChange={(address) => setDraft((p) => ({ ...p, address }))} />
        <Field id="card1-kebele" label="Kebele" value={draft.addressKebele} disabled={!canEdit} onChange={(addressKebele) => setDraft((p) => ({ ...p, addressKebele }))} />
        <Field id="card1-woreda" label="Woreda" value={draft.addressWoreda} disabled={!canEdit} onChange={(addressWoreda) => setDraft((p) => ({ ...p, addressWoreda }))} />
        <Field id="card1-zone" label="Zone" value={draft.addressZone} disabled={!canEdit} onChange={(addressZone) => setDraft((p) => ({ ...p, addressZone }))} />
        <Field id="card1-subcity" label="Sub-city" value={draft.addressSubcity} disabled={!canEdit} onChange={(addressSubcity) => setDraft((p) => ({ ...p, addressSubcity }))} />
        <Field id="card1-city" label="City" value={draft.city} disabled={!canEdit} onChange={(city) => setDraft((p) => ({ ...p, city }))} />
        <div className="space-y-2">
          <Label htmlFor="card1-region">Region</Label>
          <Select value={draft.addressRegion || "unset"} onValueChange={(value) => setDraft((p) => ({ ...p, addressRegion: value === "unset" ? "" : value }))} disabled={!canEdit}>
            <SelectTrigger id="card1-region" className="h-12">
              <SelectValue placeholder="Not set" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unset">Not set</SelectItem>
              {ETHIOPIA_REGIONS.map((region) => (
                <SelectItem key={region} value={region}>
                  {region}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Field id="card1-postcode" label="Postcode" value={draft.postcode} disabled={!canEdit} onChange={(postcode) => setDraft((p) => ({ ...p, postcode }))} />
        <Field id="card1-country" label="Country" value={draft.country} disabled={!canEdit} onChange={(country) => setDraft((p) => ({ ...p, country }))} />
        <Field id="card1-lat" label="Latitude" value={draft.latitude} disabled={!canEdit} onChange={(latitude) => setDraft((p) => ({ ...p, latitude }))} />
        <Field id="card1-lng" label="Longitude" value={draft.longitude} disabled={!canEdit} onChange={(longitude) => setDraft((p) => ({ ...p, longitude }))} />
      </div>
    </div>
  );
}

function ContactsStep({
  draft,
  setDraft,
  canEdit,
}: {
  draft: Card1Draft;
  setDraft: Dispatch<SetStateAction<Card1Draft>>;
  canEdit: boolean;
}) {
  return (
    <div className="space-y-4" data-testid="pms-card1-step-contacts">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="card1-phone" label="Phone" value={draft.phone} disabled={!canEdit} onChange={(phone) => setDraft((p) => ({ ...p, phone }))} />
        <Field id="card1-email" label="Email" value={draft.email} disabled={!canEdit} onChange={(email) => setDraft((p) => ({ ...p, email }))} />
        <Field id="card1-whatsapp" label="WhatsApp" value={draft.whatsapp} disabled={!canEdit} onChange={(whatsapp) => setDraft((p) => ({ ...p, whatsapp }))} />
        <Field id="card1-website" label="Website" value={draft.social.website} disabled={!canEdit} onChange={(website) => setDraft((p) => ({ ...p, social: { ...p.social, website } }))} />
        <Field id="card1-facebook" label="Facebook" value={draft.social.facebook} disabled={!canEdit} onChange={(facebook) => setDraft((p) => ({ ...p, social: { ...p.social, facebook } }))} />
        <Field id="card1-instagram" label="Instagram" value={draft.social.instagram} disabled={!canEdit} onChange={(instagram) => setDraft((p) => ({ ...p, social: { ...p.social, instagram } }))} />
        <Field id="card1-tripadvisor" label="Tripadvisor" value={draft.social.tripadvisor} disabled={!canEdit} onChange={(tripadvisor) => setDraft((p) => ({ ...p, social: { ...p.social, tripadvisor } }))} />
      </div>
      <div className="space-y-3">
        <p className="text-sm font-medium">Department contacts</p>
        {draft.departmentContacts.map((row, index) => (
          <div key={`${row.department}-${index}`} className="grid gap-2 sm:grid-cols-4">
            <Input placeholder="Department" value={row.department} disabled={!canEdit} onChange={(event) => setDraft((p) => {
              const next = [...p.departmentContacts];
              next[index] = { ...row, department: event.target.value };
              return { ...p, departmentContacts: next };
            })} />
            <Input placeholder="Name" value={row.name} disabled={!canEdit} onChange={(event) => setDraft((p) => {
              const next = [...p.departmentContacts];
              next[index] = { ...row, name: event.target.value };
              return { ...p, departmentContacts: next };
            })} />
            <Input placeholder="Phone" value={row.phone} disabled={!canEdit} onChange={(event) => setDraft((p) => {
              const next = [...p.departmentContacts];
              next[index] = { ...row, phone: event.target.value };
              return { ...p, departmentContacts: next };
            })} />
            <Input placeholder="Email" value={row.email} disabled={!canEdit} onChange={(event) => setDraft((p) => {
              const next = [...p.departmentContacts];
              next[index] = { ...row, email: event.target.value };
              return { ...p, departmentContacts: next };
            })} />
          </div>
        ))}
        {canEdit ? (
          <Button type="button" variant="outline" onClick={() => setDraft((p) => ({ ...p, departmentContacts: [...p.departmentContacts, { department: "", name: "", phone: "", email: "" }] }))}>
            Add department contact
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function CheckinStep({
  draft,
  setDraft,
  canEdit,
}: {
  draft: Card1Draft;
  setDraft: Dispatch<SetStateAction<Card1Draft>>;
  canEdit: boolean;
}) {
  return (
    <div className="space-y-4" data-testid="pms-card1-step-checkin">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="card1-ci" label="Check-in time" value={draft.checkInTime} disabled={!canEdit} onChange={(checkInTime) => setDraft((p) => ({ ...p, checkInTime }))} placeholder="15:00" />
        <Field id="card1-co" label="Check-out time" value={draft.checkOutTime} disabled={!canEdit} onChange={(checkOutTime) => setDraft((p) => ({ ...p, checkOutTime }))} placeholder="11:00" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="card1-ci-policy">Check-in policy</Label>
        <Textarea id="card1-ci-policy" value={draft.checkinPolicyText} disabled={!canEdit} onChange={(event) => setDraft((p) => ({ ...p, checkinPolicyText: event.target.value }))} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="card1-co-policy">Check-out policy</Label>
        <Textarea id="card1-co-policy" value={draft.checkoutPolicyText} disabled={!canEdit} onChange={(event) => setDraft((p) => ({ ...p, checkoutPolicyText: event.target.value }))} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="card1-early-policy">Early check-in policy</Label>
        <Textarea id="card1-early-policy" value={draft.earlyCheckinPolicyText} disabled={!canEdit} onChange={(event) => setDraft((p) => ({ ...p, earlyCheckinPolicyText: event.target.value }))} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="card1-late-policy">Late check-out policy</Label>
        <Textarea id="card1-late-policy" value={draft.lateCheckoutPolicyText} disabled={!canEdit} onChange={(event) => setDraft((p) => ({ ...p, lateCheckoutPolicyText: event.target.value }))} />
      </div>
    </div>
  );
}

function BusinessDateStep({
  draft,
  setDraft,
  canEdit,
  currentState,
}: {
  draft: Card1Draft;
  setDraft: Dispatch<SetStateAction<Card1Draft>>;
  canEdit: boolean;
  currentState: string;
}) {
  return (
    <div className="space-y-4" data-testid="pms-card1-step-business-date">
      <p className="text-sm text-muted-foreground">{CARD1_BUSINESS_DATE_CURRENT_COPY}</p>
      <div className="space-y-2">
        <Label htmlFor="card1-business-date-current">CURRENT STATE</Label>
        <Input id="card1-business-date-current" value={currentState} readOnly disabled data-testid="card1-business-date-current" className="h-12 bg-muted/40" />
      </div>
      <div className="flex items-center justify-between rounded-xl border border-border p-3">
        <Label htmlFor="card1-blockers">Track close blockers</Label>
        <Switch
          id="card1-blockers"
          checked={draft.businessDateConfig.closeBlockersEnabled}
          disabled={!canEdit}
          onCheckedChange={(closeBlockersEnabled) =>
            setDraft((p) => ({ ...p, businessDateConfig: { ...p.businessDateConfig, closeBlockersEnabled } }))
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="card1-bd-notes">CONFIG notes</Label>
        <Textarea id="card1-bd-notes" value={draft.businessDateConfig.notes} disabled={!canEdit} onChange={(event) => setDraft((p) => ({ ...p, businessDateConfig: { ...p.businessDateConfig, notes: event.target.value } }))} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="card1-bd-blocker-list">Blocker labels</Label>
        <Textarea
          id="card1-bd-blocker-list"
          value={draft.businessDateBlockers.join("\n")}
          disabled={!canEdit}
          onChange={(event) => setDraft((p) => ({ ...p, businessDateBlockers: event.target.value.split("\n").map((row) => row.trim()).filter(Boolean) }))}
        />
      </div>
    </div>
  );
}

function LegalStep({
  draft,
  setDraft,
  canEdit,
}: {
  draft: Card1Draft;
  setDraft: Dispatch<SetStateAction<Card1Draft>>;
  canEdit: boolean;
}) {
  return (
    <div className="space-y-4" data-testid="pms-card1-step-legal">
      <p className="text-sm text-muted-foreground">{CARD1_AGREEMENT_OUT}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="card1-legal-name" label="Legal name" value={draft.legalName} disabled={!canEdit} onChange={(legalName) => setDraft((p) => ({ ...p, legalName }))} />
        <Field id="card1-legal-entity" label="Legal entity name" value={draft.legalEntityName} disabled={!canEdit} onChange={(legalEntityName) => setDraft((p) => ({ ...p, legalEntityName }))} />
        <div className="space-y-2">
          <Label htmlFor="card1-entity-type">Entity type</Label>
          <Select value={draft.legalEntityType || "unset"} onValueChange={(value) => setDraft((p) => ({ ...p, legalEntityType: value === "unset" ? "" : (value as typeof draft.legalEntityType) }))} disabled={!canEdit}>
            <SelectTrigger id="card1-entity-type" className="h-12">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unset">Not set</SelectItem>
              {LEGAL_ENTITY_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {LEGAL_ENTITY_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Field id="card1-reg" label="Registration number" value={draft.registrationNumber} disabled={!canEdit} onChange={(registrationNumber) => setDraft((p) => ({ ...p, registrationNumber }))} />
      </div>
      <UploadRefs label="Legal document refs" kind="legal" refs={draft.legalUploadRefs} canEdit={canEdit} onChange={(legalUploadRefs) => setDraft((p) => ({ ...p, legalUploadRefs }))} />
    </div>
  );
}

function TaxStep({
  draft,
  setDraft,
  canEdit,
  warnings,
}: {
  draft: Card1Draft;
  setDraft: Dispatch<SetStateAction<Card1Draft>>;
  canEdit: boolean;
  warnings: string[];
}) {
  return (
    <div className="space-y-4" data-testid="pms-card1-step-tax">
      <p className="text-sm text-muted-foreground">{CARD1_VAT_GATE_COPY}</p>
      <div className="flex items-center justify-between rounded-xl border border-border p-3">
        <Label htmlFor="card1-vat-registered">VAT Registered</Label>
        <Switch id="card1-vat-registered" checked={draft.vatRegistered} disabled={!canEdit} onCheckedChange={(vatRegistered) => setDraft((p) => ({ ...p, vatRegistered }))} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="card1-vat-number" label="VAT number" value={draft.vatNumber} disabled={!canEdit} onChange={(vatNumber) => setDraft((p) => ({ ...p, vatNumber }))} />
        <Field id="card1-tin" label="TIN" value={draft.tinNumber} disabled={!canEdit} onChange={(tinNumber) => setDraft((p) => ({ ...p, tinNumber }))} />
        <Field id="card1-licence" label="Licence number" value={draft.licenceNumber} disabled={!canEdit} onChange={(licenceNumber) => setDraft((p) => ({ ...p, licenceNumber }))} />
      </div>
      {vatCertificateRequired(draft.vatRegistered) ? (
        <UploadRefs
          label="VAT certificate"
          kind="vat_certificate"
          required
          refs={draft.taxUploadRefs}
          canEdit={canEdit}
          onChange={(taxUploadRefs) => setDraft((p) => ({ ...p, taxUploadRefs }))}
        />
      ) : (
        <UploadRefs label="Tax document refs" kind="tax" refs={draft.taxUploadRefs.filter((row) => row.kind !== "vat_certificate")} canEdit={canEdit} onChange={(taxUploadRefs) => setDraft((p) => ({ ...p, taxUploadRefs }))} />
      )}
      {warnings.map((warning) => (
        <p key={warning} className="text-sm text-[#C89933]" data-testid="card1-vat-warning">
          {warning}
        </p>
      ))}
    </div>
  );
}

function StructureStep({
  restaurantId,
  draft,
  canEdit,
  set2,
  checklist,
  snapshot,
  warnings,
}: {
  restaurantId: string;
  draft: Card1Draft;
  canEdit: boolean;
  set2: Set2Snapshot;
  checklist: Set1Checklist;
  snapshot: Card1Snapshot;
  warnings: string[];
}) {
  return (
    <div className="space-y-4" data-testid="pms-card1-step-structure">
      <p className="text-sm text-muted-foreground">{CARD1_CAPACITY_COPY}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <RuleChip label="Building required" on={draft.structureRules.buildingRequired} />
        <RuleChip label="Wing optional" on={draft.structureRules.wingOptional} />
        <RuleChip label="Floor required" on={draft.structureRules.floorRequired} />
      </div>
      <div className="rounded-xl border border-border p-3 text-sm" data-testid="card1-derived-capacity">
        Derived capacity: {snapshot.derivedCapacity.rooms} rooms · {snapshot.derivedCapacity.roomTypes} room types
      </div>
      <a href={CARD1_ROOMS_HREF} className="inline-flex text-sm font-medium text-[#C89933]">
        Open room inventory
      </a>
      {warnings.map((warning) => (
        <p key={warning} className="text-sm text-[#C89933]">
          {warning}
        </p>
      ))}
      <Set2StructureSection restaurantId={restaurantId} snapshot={set2} checklist={checklist} canEdit={canEdit} />
      <p className="sr-only">{CARD1_FINISH_COPY}</p>
    </div>
  );
}

function RuleChip({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="rounded-xl border border-border px-3 py-2 text-sm" data-testid={`card1-rule-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <p className="font-medium text-[#251605]">{label}</p>
      <p className="text-muted-foreground">{on ? "On" : "Off"}</p>
    </div>
  );
}

function UploadRefs({
  label,
  kind,
  refs,
  canEdit,
  required,
  onChange,
}: {
  label: string;
  kind: string;
  refs: { name: string; kind: string }[];
  canEdit: boolean;
  required?: boolean;
  onChange: (refs: { name: string; kind: string }[]) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`card1-upload-${kind}`}>
        {label}
        {required ? " (required)" : ""}
      </Label>
      {refs.map((row, index) => (
        <Input
          key={`${row.kind}-${index}`}
          value={row.name}
          disabled={!canEdit}
          onChange={(event) => {
            const next = [...refs];
            next[index] = { ...row, name: event.target.value };
            onChange(next);
          }}
        />
      ))}
      {canEdit ? (
        <Button type="button" variant="outline" onClick={() => onChange([...refs, { name: "", kind }])}>
          Add {label.toLowerCase()}
        </Button>
      ) : null}
    </div>
  );
}

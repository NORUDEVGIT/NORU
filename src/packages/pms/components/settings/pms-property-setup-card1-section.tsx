import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { SET1_HUB_HREF } from "@/packages/pms/lib/pms-set1-foundation";
import type { Set1Checklist } from "@/packages/pms/lib/pms-set1-foundation";
import type { Set2Snapshot } from "@/packages/pms/lib/pms-set2-structure";
import { savePmsPropertySetupCard1 } from "@/packages/pms/lib/pms-property-setup-card1.functions";
import {
  CARD1_ADDRESS_SUBTITLE,
  CARD1_AGREEMENT_OUT,
  CARD1_COLUMNS_UNAVAILABLE,
  CARD1_FINISH_COPY,
  CARD1_PMS_NAV,
  CARD1_PROPERTY_CODE_TOOLTIP,
  CARD1_SIDEBAR_OUT,
  CARD1_STEPS,
  CARD1_SUBTITLE,
  CARD1_WORKSPACE_TITLE,
  composeFullAddress,
  evaluateCard1StepStatus,
  nextCard1Step,
  previousCard1Step,
  card1StructureWarnings,
  card1TaxWarnings,
  propertySetupStatusLabel,
  validateAddressFields,
  validateIdentityFields,
  type Card1AddressFieldErrors,
  type Card1Draft,
  type Card1IdentityFieldErrors,
  type Card1Snapshot,
  type Card1StepId,
} from "@/packages/pms/lib/pms-property-setup-card1";
import { cn } from "@/shared/lib/utils";
import {
  AddressStep,
  BusinessDateStep,
  CheckinStep,
  ContactsStep,
  IdentityStep,
  LegalStep,
  StructureStep,
  TaxStep,
} from "@/packages/pms/components/settings/pms-property-setup-card1-steps";

export function PmsPropertySetupCard1Section({
  restaurantId,
  snapshot,
  set2,
  checklist: _checklist,
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
  const [identityErrors, setIdentityErrors] = useState<Card1IdentityFieldErrors>({});
  const [addressErrors, setAddressErrors] = useState<Card1AddressFieldErrors>({});
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(snapshot.logoPreviewUrl);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState(snapshot.coverPreviewUrl);
  useEffect(() => {
    setDraft(snapshot.draft);
    setLogoPreviewUrl(snapshot.logoPreviewUrl);
    setCoverPreviewUrl(snapshot.coverPreviewUrl);
  }, [snapshot.draft, snapshot.logoPreviewUrl, snapshot.coverPreviewUrl]);
  const composedAddress = useMemo(() => composeFullAddress(draft), [draft]);
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
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      }
      if (result.snapshot) {
        setDraft(result.snapshot.draft);
        setLogoPreviewUrl(result.snapshot.logoPreviewUrl);
        setCoverPreviewUrl(result.snapshot.coverPreviewUrl);
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const taxWarnings = card1TaxWarnings(draft);
  const structureWarnings = card1StructureWarnings(draft, set2);

  function goBack() {
    const previous = previousCard1Step(step);
    if (previous) {
      if (dirty && !window.confirm("Leave this step with unsaved changes?")) return;
      setStep(previous);
      return;
    }
    if (dirty && !window.confirm("Return to Property Setup with unsaved changes?")) return;
    window.location.hash = "";
    window.history.replaceState(null, "", SET1_HUB_HREF);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  function saveMode(mode: "draft" | "continue" | "finish") {
    if (mode === "continue" && step === "identity") {
      const nextErrors = validateIdentityFields(draft);
      setIdentityErrors(nextErrors);
      if (Object.keys(nextErrors).length > 0) return;
    }
    if (mode === "continue" && step === "address") {
      const nextErrors = validateAddressFields(draft);
      setAddressErrors(nextErrors);
      if (Object.keys(nextErrors).length > 0) return;
    }
    mutation.mutate(mode);
  }

  const completedCount = CARD1_STEPS.filter(
    (row) => evaluateCard1StepStatus(row.id, draft, snapshot.status.card1Steps[row.id], set2) === "complete",
  ).length;
  const progressPct = Math.round((completedCount / CARD1_STEPS.length) * 100);
  const addressStatus = evaluateCard1StepStatus("address", draft, snapshot.status.card1Steps.address, set2);
  const addressLiveErrors = validateAddressFields(draft);
  const addressStatusLabel =
    addressStatus === "complete"
      ? "Complete"
      : Object.keys(addressLiveErrors).length > 0
        ? "Needs Attention"
        : "In Progress";
  const nextStep = nextCard1Step(step);

  return (
    <section
      className="min-h-[calc(100dvh-3.75rem)] bg-[#F7F4EE]"
      data-testid="pms-card1-workspace"
      data-card1-fullscreen="true"
    >
      <div className="sr-only">{CARD1_SIDEBAR_OUT}</div>
      <nav className="flex flex-wrap items-center gap-1 bg-[#251605] px-4 py-2 text-white" data-testid="pms-card1-top-nav" aria-label="PMS">
        {CARD1_PMS_NAV.map((item) => (
          <a
            key={item.id}
            href={item.href}
            className={cn(
              "rounded-lg px-2.5 py-1.5 text-xs",
              item.id === "settings" ? "bg-[#C89933] text-[#251605]" : "text-white/80 hover:bg-white/10 hover:text-white",
            )}
          >
            {item.label}
          </a>
        ))}
      </nav>

      <div className="px-4 py-5 sm:px-6" data-testid="pms-card1-fullscreen">
        <div className="mb-5">
          <h1 className="font-display text-3xl text-[#251605]">
            {step === "address" ? "Address & Location" : CARD1_WORKSPACE_TITLE}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{step === "address" ? CARD1_ADDRESS_SUBTITLE : CARD1_SUBTITLE}</p>
        </div>

        <ol
          className="mb-5 flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-4 sm:overflow-visible xl:grid-cols-8"
          data-testid="pms-card1-steps"
        >
          {CARD1_STEPS.map((row) => {
            const status = evaluateCard1StepStatus(row.id, draft, snapshot.status.card1Steps[row.id], set2);
            const active = step === row.id;
            return (
              <li key={row.id} className="min-w-[10.5rem] sm:min-w-0">
                <button
                  type="button"
                  onClick={() => setStep(row.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-full border px-3 py-2 text-left text-xs",
                    active
                      ? "border-transparent bg-[#C89933] text-[#251605]"
                      : status === "complete"
                        ? "border-[#E4DCCB] bg-[#F3EEE4] text-[#251605]"
                        : "border-[#E4DCCB] bg-[#F3EEE4] text-[#6B6458]",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                      active ? "bg-white/80 text-[#251605]" : "bg-white text-[#251605]",
                    )}
                  >
                    {status === "complete" && !active ? "✓" : row.number}
                  </span>
                  <span className="leading-tight">{row.title}</span>
                </button>
              </li>
            );
          })}
        </ol>

        {!snapshot.card1ColumnsAvailable ? (
          <p className="mb-4 text-sm text-muted-foreground">{CARD1_COLUMNS_UNAVAILABLE}</p>
        ) : null}

        {step === "identity" ? (
          <IdentityStep
            restaurantId={restaurantId}
            draft={draft}
            setDraft={setDraft}
            canEdit={canEdit}
            logoPreviewUrl={logoPreviewUrl}
            coverPreviewUrl={coverPreviewUrl}
            errors={identityErrors}
            onClearError={(key) => setIdentityErrors((prev) => ({ ...prev, [key]: undefined }))}
          />
        ) : null}
        {step === "address" ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_17.5rem]">
            <AddressStep
              draft={draft}
              setDraft={setDraft}
              canEdit={canEdit}
              composedAddress={composedAddress}
              errors={addressErrors}
              onClearError={(key) => setAddressErrors((prev) => ({ ...prev, [key]: undefined }))}
            />
            <aside className="space-y-3 xl:sticky xl:top-4 xl:self-start" data-testid="pms-card1-status-rail">
              <section className="rounded-2xl border border-[#E4DCCB] bg-white p-4">
                <p className="text-sm font-medium text-[#251605]">Setup Progress</p>
                <div className="mt-3 flex items-center gap-3">
                  <div
                    className="relative h-14 w-14 shrink-0 rounded-full"
                    style={{ background: `conic-gradient(#C89933 ${progressPct}%, #EDE6D8 ${progressPct}%)` }}
                    aria-hidden
                  >
                    <div className="absolute inset-1 flex items-center justify-center rounded-full bg-white text-[11px] font-semibold text-[#251605]">
                      {progressPct}%
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-[#251605]">
                      {completedCount} of {CARD1_STEPS.length} sections completed
                    </p>
                  </div>
                </div>
              </section>
              <section className="rounded-2xl border border-[#E4DCCB] bg-white p-4">
                <p className="text-xs text-muted-foreground">Current Section</p>
                <p className="mt-1 text-sm font-medium text-[#251605]">Address & Location</p>
              </section>
              {nextStep ? (
                <section className="rounded-2xl border border-[#E4DCCB] bg-white p-4">
                  <p className="text-xs text-muted-foreground">Next Step</p>
                  <p className="mt-1 text-sm font-medium text-[#251605]">
                    {CARD1_STEPS.find((row) => row.id === nextStep)?.title}
                  </p>
                </section>
              ) : null}
              <section className="rounded-2xl border border-[#E4DCCB] bg-white p-4">
                <p className="text-xs text-muted-foreground">Property Code</p>
                <p className="mt-1 text-sm font-medium text-[#251605]">{draft.propertyCode || "NRC————"}</p>
                <p className="mt-1 text-xs text-muted-foreground">{CARD1_PROPERTY_CODE_TOOLTIP}</p>
              </section>
              <section className="rounded-2xl border border-[#E4DCCB] bg-white p-4">
                <p className="text-xs text-muted-foreground">Address Status</p>
                <p className="mt-1 text-sm font-medium text-[#251605]">{addressStatusLabel}</p>
                <p className="sr-only">{propertySetupStatusLabel(addressStatus)}</p>
              </section>
            </aside>
          </div>
        ) : null}
        {step === "contacts" ? <ContactsStep draft={draft} setDraft={setDraft} canEdit={canEdit} /> : null}
        {step === "checkin" ? <CheckinStep draft={draft} setDraft={setDraft} canEdit={canEdit} /> : null}
        {step === "business-date" ? (
          <BusinessDateStep draft={draft} setDraft={setDraft} canEdit={canEdit} currentState={snapshot.currentState} />
        ) : null}
        {step === "legal" ? <LegalStep draft={draft} setDraft={setDraft} canEdit={canEdit} /> : null}
        {step === "tax" ? <TaxStep draft={draft} setDraft={setDraft} canEdit={canEdit} warnings={taxWarnings} /> : null}
        {step === "structure" ? (
          <StructureStep
            restaurantId={restaurantId}
            draft={draft}
            setDraft={setDraft}
            canEdit={canEdit}
            set2={set2}
            snapshot={snapshot}
            warnings={structureWarnings}
          />
        ) : null}

        {canEdit ? (
          <div className="sticky bottom-0 z-10 mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-[#CCCCCC] bg-[#F7F4EE]/95 py-3" data-testid="pms-card1-chrome">
            <Button type="button" variant="outline" disabled={mutation.isPending} onClick={goBack}>
              Back
            </Button>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => saveMode("draft")}>
                Save Draft
              </Button>
              {step === "structure" ? (
                <>
                  <Button
                    type="button"
                    disabled={mutation.isPending}
                    onClick={() => saveMode("finish")}
                    className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                  >
                    {mutation.isPending ? "Saving…" : "Complete Card 1"}
                  </Button>
                  <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => saveMode("finish")}>
                    Save & Finish
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  disabled={mutation.isPending}
                  onClick={() => saveMode("continue")}
                  className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                >
                  {mutation.isPending ? "Saving…" : "Save & Continue"}
                </Button>
              )}
            </div>
          </div>
        ) : null}
        <p className="mt-3 text-xs text-muted-foreground">{CARD1_FINISH_COPY}</p>
        <p className="sr-only">{CARD1_AGREEMENT_OUT}</p>
        {dirty ? <p className="sr-only">Unsaved Card 1 changes</p> : null}
      </div>
    </section>
  );
}

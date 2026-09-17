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
  CARD1_AGREEMENT_OUT,
  CARD1_COLUMNS_UNAVAILABLE,
  CARD1_FINISH_COPY,
  CARD1_PMS_NAV,
  CARD1_SIDEBAR_OUT,
  CARD1_STEPS,
  CARD1_SUBTITLE,
  composeFullAddress,
  evaluateCard1StepStatus,
  nextCard1Step,
  previousCard1Step,
  card1StructureWarnings,
  card1TaxWarnings,
  type Card1Draft,
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
  useEffect(() => setDraft(snapshot.draft), [snapshot.draft]);
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
      if (result.snapshot) setDraft(result.snapshot.draft);
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
        <div className="mb-4">
          <h1 className="font-display text-3xl text-[#251605]">Property & Business Setup</h1>
          <p className="mt-1 text-sm text-muted-foreground">{CARD1_SUBTITLE}</p>
        </div>

        <ol className="mb-5 grid gap-2 sm:grid-cols-4 xl:grid-cols-8" data-testid="pms-card1-steps">
          {CARD1_STEPS.map((row) => {
            const status = evaluateCard1StepStatus(row.id, draft, snapshot.status.card1Steps[row.id], set2);
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setStep(row.id)}
                  className={cn(
                    "w-full rounded-xl border px-2 py-2 text-left text-xs",
                    step === row.id
                      ? "border-[#C89933] bg-[#C89933]/10 text-[#251605]"
                      : status === "complete"
                        ? "border-[#436436]/40 bg-[#436436]/10 text-[#251605]"
                        : "border-[#CCCCCC] text-muted-foreground",
                  )}
                >
                  <span className="font-semibold">{status === "complete" && step !== row.id ? "✓" : row.number}</span> {row.title}
                </button>
              </li>
            );
          })}
        </ol>

        {!snapshot.card1ColumnsAvailable ? (
          <p className="mb-4 text-sm text-muted-foreground">{CARD1_COLUMNS_UNAVAILABLE}</p>
        ) : null}

        {step === "identity" ? <IdentityStep draft={draft} setDraft={setDraft} canEdit={canEdit} /> : null}
        {step === "address" ? <AddressStep draft={draft} setDraft={setDraft} canEdit={canEdit} composedAddress={composedAddress} /> : null}
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
          <div className="sticky bottom-0 z-10 mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-[#CCCCCC] bg-[#F7F4EE]/95 py-3" data-testid="pms-card1-chrome">
            <Button type="button" variant="outline" disabled={mutation.isPending} onClick={goBack}>
              Back
            </Button>
            <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate("draft")}>
              Save Draft
            </Button>
            {step === "structure" ? (
              <>
                <Button
                  type="button"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate("finish")}
                  className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                >
                  {mutation.isPending ? "Saving…" : "Complete Card 1"}
                </Button>
                <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate("finish")}>
                  Save & Finish
                </Button>
              </>
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
          </div>
        ) : null}
        <p className="mt-3 text-xs text-muted-foreground">{CARD1_FINISH_COPY}</p>
        <p className="sr-only">{CARD1_AGREEMENT_OUT}</p>
        {dirty ? <p className="sr-only">Unsaved Card 1 changes</p> : null}
      </div>
    </section>
  );
}

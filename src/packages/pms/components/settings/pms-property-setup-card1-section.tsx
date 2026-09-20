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
  CARD1_SIDEBAR_OUT,
  CARD1_STEPS,
  composeFullAddress,
  continueLabel,
  evaluateCard1Status,
  evaluateCard1StepStatus,
  finishLabel,
  nextCard1Step,
  previousCard1Step,
  card1StructureWarnings,
  card1TaxWarnings,
  validateAddressFields,
  validateIdentityFields,
  type Card1AddressFieldErrors,
  type Card1Draft,
  type Card1IdentityFieldErrors,
  type Card1Snapshot,
  type Card1StepId,
} from "@/packages/pms/lib/pms-property-setup-card1";
import {
  isShortDescriptionOverLimit,
  propertySetupStatusesPercent,
} from "@/packages/pms/lib/pms-property-setup-ui";
import {
  PropertySetupStatusRail,
  PropertySetupStepNav,
  PropertySetupWorkspaceShell,
} from "@/packages/pms/components/settings/setup-kit";
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
      toast.success(
        mode === "finish" ? "Card 1 saved. Property is not Activated." : "Draft saved.",
      );
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
  const cardStatus = evaluateCard1Status(draft, snapshot.status, set2);
  const railSections = CARD1_STEPS.map((row) => ({
    id: row.id,
    title: row.title,
    status: evaluateCard1StepStatus(row.id, draft, snapshot.status.card1Steps[row.id], set2),
  }));
  const railStatuses = railSections.map((row) => row.status);
  const complete = railStatuses.filter((status) => status === "complete").length;
  const inProgress = railStatuses.filter((status) => status === "in_progress").length;
  const notStarted = railStatuses.filter((status) => status === "not_started").length;
  const percent = propertySetupStatusesPercent(railStatuses);
  const blockers = [
    ...Object.values(identityErrors).filter((value): value is string => Boolean(value)),
    ...Object.values(addressErrors).filter((value): value is string => Boolean(value)),
  ];
  const warnings = [...taxWarnings, ...structureWarnings];

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
    if (isShortDescriptionOverLimit(draft.shortDescription)) {
      toast.error("Short description must be 80 characters or fewer.");
      return;
    }
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

  return (
    <section
      className="flex min-h-[calc(100dvh-3.75rem)] min-w-0 flex-1 flex-col bg-[#F7F4EE]"
      data-testid="pms-card1-workspace"
      data-card1-fullscreen="true"
    >
      <div className="sr-only">{CARD1_SIDEBAR_OUT}</div>
      <div className="min-w-0 flex-1" data-testid="pms-card1-fullscreen">
        <PropertySetupWorkspaceShell
          cardNumber={1}
          status={cardStatus}
          percent={percent}
          sections={railSections}
          complete={complete}
          inProgress={inProgress}
          notStarted={notStarted}
          blockers={blockers}
          warnings={warnings}
          onBack={goBack}
          onSaveDraft={canEdit ? () => saveMode("draft") : undefined}
          onContinue={() => saveMode(step === "structure" ? "finish" : "continue")}
          saveDraftDisabled={mutation.isPending || !canEdit}
          continueDisabled={mutation.isPending || !canEdit}
          continuePending={mutation.isPending}
          saveDraftPending={mutation.isPending}
          dirty={dirty}
          continueLabel={continueLabel(step)}
          footerTestId="pms-card1-chrome"
          footer={canEdit ? undefined : null}
          extraFooter={
            step === "structure" && canEdit ? (
              <Button
                type="button"
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => saveMode("finish")}
              >
                {finishLabel(step)}
              </Button>
            ) : null
          }
          rail={
            <div data-testid="pms-card1-status-rail">
              <PropertySetupStatusRail
                percent={percent}
                sections={railSections}
                complete={complete}
                inProgress={inProgress}
                notStarted={notStarted}
                blockers={blockers}
                warnings={warnings}
              />
            </div>
          }
          stepNav={
            <div data-testid="pms-card1-steps">
              <PropertySetupStepNav
                activeId={step}
                onSelect={(id) => setStep(id as Card1StepId)}
                steps={CARD1_STEPS.map((row) => ({
                  id: row.id,
                  number: row.number,
                  title: row.title,
                  status: evaluateCard1StepStatus(
                    row.id,
                    draft,
                    snapshot.status.card1Steps[row.id],
                    set2,
                  ),
                }))}
              />
            </div>
          }
        >
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
            <AddressStep
              draft={draft}
              setDraft={setDraft}
              canEdit={canEdit}
              composedAddress={composedAddress}
              errors={addressErrors}
              onClearError={(key) => setAddressErrors((prev) => ({ ...prev, [key]: undefined }))}
            />
          ) : null}
          {step === "contacts" ? (
            <ContactsStep
              draft={draft}
              setDraft={setDraft}
              canEdit={canEdit}
              departmentOptions={snapshot.departmentOptions}
            />
          ) : null}
          {step === "checkin" ? (
            <CheckinStep draft={draft} setDraft={setDraft} canEdit={canEdit} />
          ) : null}
          {step === "business-date" ? (
            <BusinessDateStep
              draft={draft}
              setDraft={setDraft}
              canEdit={canEdit}
              currentState={snapshot.currentState}
            />
          ) : null}
          {step === "legal" ? (
            <LegalStep
              restaurantId={restaurantId}
              draft={draft}
              setDraft={setDraft}
              canEdit={canEdit}
            />
          ) : null}
          {step === "tax" ? (
            <TaxStep
              restaurantId={restaurantId}
              draft={draft}
              setDraft={setDraft}
              canEdit={canEdit}
              warnings={taxWarnings}
            />
          ) : null}
          {step === "structure" ? (
            <StructureStep
              restaurantId={restaurantId}
              draft={draft}
              setDraft={setDraft}
              canEdit={canEdit}
              set2={set2}
              snapshot={snapshot}
              warnings={structureWarnings}
              propertyAreas={snapshot.propertyAreaEntities}
              functionalHardeningAvailable={snapshot.functionalHardeningAvailable}
            />
          ) : null}

          <p className="mt-3 text-xs text-muted-foreground">{CARD1_FINISH_COPY}</p>
          <p className="sr-only">{CARD1_AGREEMENT_OUT}</p>
          {dirty ? <p className="sr-only">Unsaved Card 1 changes</p> : null}
        </PropertySetupWorkspaceShell>
      </div>
    </section>
  );
}

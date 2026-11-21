import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Loader2 } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { SET1_HUB_HREF } from "@/packages/pms/lib/pms-set1-foundation";
import { finishPropertySetupCardAndAdvance } from "@/packages/pms/lib/pms-property-setup-navigation";
import type { Set1Checklist } from "@/packages/pms/lib/pms-set1-foundation";
import type { Set2Snapshot } from "@/packages/pms/lib/pms-set2-structure";
import { savePmsPropertySetupCard1 } from "@/packages/pms/lib/pms-property-setup-card1.functions";
import {
  CARD1_AGREEMENT_OUT,
  CARD1_HASH,
  CARD1_SIDEBAR_OUT,
  CARD1_STEPS,
  clearCard1SessionDraft,
  composeFullAddress,
  continueLabel,
  evaluateCard1Status,
  evaluateCard1StepStatus,
  finishLabel,
  hasVatCertificate,
  loadCard1SessionDraft,
  nextCard1Step,
  normalizeCard1StepId,
  previousCard1Step,
  saveCard1SessionDraft,
  card1StructureWarnings,
  card1TaxWarnings,
  validateAddressFields,
  validateIdentityFields,
  type Card1AddressFieldErrors,
  type Card1DepartmentOption,
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
  CheckinStep,
  IdentityStep,
  LegalStep,
  StructureStep,
} from "@/packages/pms/components/settings/pms-property-setup-card1-steps";
import { BusinessDateRecoveryControl } from "@/packages/pms/components/settings/business-date-recovery-dialog";

export function PmsPropertySetupCard1Section({
  restaurantId,
  snapshot,
  set2,
  checklist: _checklist,
  canEdit,
  initialStep = "identity",
  role = "",
}: {
  restaurantId: string;
  snapshot: Card1Snapshot;
  set2: Set2Snapshot;
  checklist: Set1Checklist;
  canEdit: boolean;
  initialStep?: Card1StepId;
  role?: string;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(savePmsPropertySetupCard1);
  const [step, setStep] = useState<Card1StepId>(() => {
    const backup = loadCard1SessionDraft(restaurantId);
    if (backup && JSON.stringify(backup.draft) !== JSON.stringify(snapshot.draft)) {
      return normalizeCard1StepId(backup.activeStep) ?? initialStep;
    }
    return initialStep;
  });
  const [draft, setDraft] = useState<Card1Draft>(() => {
    const backup = loadCard1SessionDraft(restaurantId);
    if (backup && JSON.stringify(backup.draft) !== JSON.stringify(snapshot.draft)) {
      return backup.draft;
    }
    return snapshot.draft;
  });
  const [restoredFromSession, setRestoredFromSession] = useState<boolean>(() => {
    const backup = loadCard1SessionDraft(restaurantId);
    return Boolean(backup && JSON.stringify(backup.draft) !== JSON.stringify(snapshot.draft));
  });
  const [departmentOptions, setDepartmentOptions] = useState<Card1DepartmentOption[]>(
    snapshot.departmentOptions,
  );
  const [identityErrors, setIdentityErrors] = useState<Card1IdentityFieldErrors>({});
  const [addressErrors, setAddressErrors] = useState<Card1AddressFieldErrors>({});
  const [legalErrors, setLegalErrors] = useState<{ vatNumber?: string; vatCertificate?: string }>({});
  const [saveIntent, setSaveIntent] = useState<"draft" | "continue" | "extra" | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(snapshot.logoPreviewUrl);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState(snapshot.coverPreviewUrl);
  const [propertyImagePreviews, setPropertyImagePreviews] = useState<Record<string, string>>(
    snapshot.propertyImagePreviews ?? {},
  );
  const dirty = JSON.stringify(draft) !== JSON.stringify(snapshot.draft);

  const lastRestaurantIdRef = useRef(restaurantId);
  useEffect(() => {
    const restaurantChanged = lastRestaurantIdRef.current !== restaurantId;
    if (restaurantChanged) {
      lastRestaurantIdRef.current = restaurantId;
      const backup = loadCard1SessionDraft(restaurantId);
      if (backup && JSON.stringify(backup.draft) !== JSON.stringify(snapshot.draft)) {
        setDraft(backup.draft);
        setStep(normalizeCard1StepId(backup.activeStep) ?? initialStep);
        setRestoredFromSession(true);
      } else {
        setDraft(snapshot.draft);
        setStep(initialStep);
        setRestoredFromSession(false);
      }
      setLogoPreviewUrl(snapshot.logoPreviewUrl);
      setCoverPreviewUrl(snapshot.coverPreviewUrl);
      setPropertyImagePreviews(snapshot.propertyImagePreviews ?? {});
      setDepartmentOptions(snapshot.departmentOptions);
      return;
    }

    if (!dirty) {
      setDraft(snapshot.draft);
    }
    setLogoPreviewUrl(snapshot.logoPreviewUrl);
    setCoverPreviewUrl(snapshot.coverPreviewUrl);
    setPropertyImagePreviews(snapshot.propertyImagePreviews ?? {});
    setDepartmentOptions(snapshot.departmentOptions);
  }, [
    restaurantId,
    snapshot.draft,
    snapshot.logoPreviewUrl,
    snapshot.coverPreviewUrl,
    snapshot.propertyImagePreviews,
    snapshot.departmentOptions,
    dirty,
    initialStep,
  ]);

  useEffect(() => {
    if (dirty) {
      saveCard1SessionDraft(restaurantId, draft, step);
      return;
    }
    clearCard1SessionDraft(restaurantId);
  }, [dirty, restaurantId, draft, step]);

  const composedAddress = useMemo(() => composeFullAddress(draft), [draft]);

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
      clearCard1SessionDraft(restaurantId);
      setRestoredFromSession(false);
      toast.success(
        mode === "finish" ? "Property & Business saved." : mode === "draft" ? "Draft saved." : "Saved.",
      );
      if (mode === "continue") {
        const next = nextCard1Step(step);
        if (next) setStep(next);
      }
      if (mode === "finish") {
        finishPropertySetupCardAndAdvance(CARD1_HASH);
      }
      if (result.snapshot) {
        setDraft(result.snapshot.draft);
        setLogoPreviewUrl(result.snapshot.logoPreviewUrl);
        setCoverPreviewUrl(result.snapshot.coverPreviewUrl);
        setPropertyImagePreviews(result.snapshot.propertyImagePreviews ?? {});
        setDepartmentOptions(result.snapshot.departmentOptions);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
    onSettled: () => setSaveIntent(null),
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

  function performExit() {
    const search = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const returnTo = search?.get("returnTo") || search?.get("from");
    if (returnTo) {
      window.location.href = returnTo;
      return;
    }
    window.location.hash = "";
    window.history.replaceState(null, "", SET1_HUB_HREF);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  function goBack() {
    const previous = previousCard1Step(step);
    if (previous) {
      setStep(previous);
      return;
    }
    performExit();
  }

  function focusFirstInvalidField() {
    window.setTimeout(() => {
      const root = document.querySelector("[data-testid='pms-card1-workspace']");
      const target = root?.querySelector<HTMLElement>("[aria-invalid='true']");
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.focus({ preventScroll: true });
    }, 0);
  }

  function saveMode(
    mode: "draft" | "continue" | "finish",
    intent: "draft" | "continue" | "extra" = mode === "draft" ? "draft" : "continue",
  ) {
    if (isShortDescriptionOverLimit(draft.shortDescription)) {
      focusFirstInvalidField();
      return;
    }
    if (mode === "continue" && step === "identity") {
      const nextErrors = validateIdentityFields(draft);
      setIdentityErrors(nextErrors);
      if (Object.keys(nextErrors).length > 0) {
        focusFirstInvalidField();
        return;
      }
    }
    if (mode === "continue" && step === "address") {
      const nextErrors = validateAddressFields(draft);
      setAddressErrors(nextErrors);
      if (Object.keys(nextErrors).length > 0) {
        focusFirstInvalidField();
        return;
      }
    }
    if ((mode === "continue" || mode === "finish") && step === "legal" && draft.vatRegistered) {
      const nextLegal: { vatNumber?: string; vatCertificate?: string } = {};
      if (!draft.vatNumber.trim()) {
        nextLegal.vatNumber = "VAT number is required while VAT Registered is On.";
        toast.error("VAT number is required while VAT Registered is On.");
      }
      if (!hasVatCertificate(draft.taxUploadRefs)) {
        nextLegal.vatCertificate = "VAT certificate is required while VAT Registered is On.";
        toast.error("VAT certificate is required while VAT Registered is On.");
      }
      setLegalErrors(nextLegal);
      if (Object.keys(nextLegal).length > 0) {
        focusFirstInvalidField();
        return;
      }
    }
    setSaveIntent(intent);
    mutation.mutate(mode);
  }

  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#F7F4EE]"
      data-testid="pms-card1-workspace"
      data-card1-fullscreen="true"
    >
      <div className="sr-only">{CARD1_SIDEBAR_OUT}</div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="pms-card1-fullscreen">
        <PropertySetupWorkspaceShell
          cardNumber={1}
          fill
          status={cardStatus}
          percent={percent}
          sections={railSections}
          complete={complete}
          inProgress={inProgress}
          notStarted={notStarted}
          blockers={blockers}
          warnings={warnings}
          onBack={goBack}
          onSaveDraft={canEdit ? () => saveMode("draft", "draft") : undefined}
          onContinue={() => saveMode(step === "structure" ? "finish" : "continue", "continue")}
          saveDraftDisabled={mutation.isPending || !canEdit}
          continueDisabled={mutation.isPending || !canEdit}
          continuePending={mutation.isPending && saveIntent === "continue"}
          saveDraftPending={mutation.isPending && saveIntent === "draft"}
          dirty={dirty}
          continueLabel={step === "structure" ? "Complete" : continueLabel(step)}
          footerTestId="pms-card1-chrome"
          footer={canEdit ? undefined : null}
          extraFooter={
            step === "structure" && canEdit ? (
              <Button
                type="button"
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => saveMode("finish", "extra")}
              >
                {mutation.isPending && saveIntent === "extra" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
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
                marked
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
          {restoredFromSession ? (
            <div
              className="mb-4 flex flex-col gap-2 rounded-lg border border-blue-200 bg-blue-50/80 p-3 text-sm text-blue-900 sm:flex-row sm:items-center sm:justify-between dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200"
              data-testid="pms-card1-session-restored-banner"
            >
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse shrink-0" />
                <span>Unsaved draft restored from your previous editing session.</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs font-medium text-blue-800 hover:bg-blue-100 hover:text-blue-900 dark:text-blue-200 dark:hover:bg-blue-900/50"
                  onClick={() => {
                    clearCard1SessionDraft(restaurantId);
                    setDraft(snapshot.draft);
                    setRestoredFromSession(false);
                    toast.info("Unsaved draft discarded; restored saved values.");
                  }}
                  data-testid="pms-card1-discard-session-draft"
                >
                  Discard Restored Draft
                </Button>
              </div>
            </div>
          ) : null}

          {!snapshot.card1ColumnsAvailable ? (
            <p className="mb-4 text-sm text-muted-foreground">
              Property & Business fields are unavailable.
            </p>
          ) : null}

          {step === "identity" ? (
            <IdentityStep
              restaurantId={restaurantId}
              draft={draft}
              setDraft={setDraft}
              canEdit={canEdit}
              logoPreviewUrl={logoPreviewUrl}
              coverPreviewUrl={coverPreviewUrl}
              propertyImagePreviews={propertyImagePreviews}
              errors={identityErrors}
              onClearError={(key) => setIdentityErrors((prev) => ({ ...prev, [key]: undefined }))}
            />
          ) : null}
          {step === "address" ? (
            <AddressStep
              restaurantId={restaurantId}
              draft={draft}
              setDraft={setDraft}
              canEdit={canEdit}
              composedAddress={composedAddress}
              errors={addressErrors}
              onClearError={(key) => setAddressErrors((prev) => ({ ...prev, [key]: undefined }))}
              departmentOptions={departmentOptions}
              onDepartmentsChange={setDepartmentOptions}
              websiteError={identityErrors.websiteUrl}
            />
          ) : null}
          {step === "checkin" ? (
            <CheckinStep
              draft={draft}
              setDraft={setDraft}
              canEdit={canEdit}
              currentState={snapshot.currentState}
              businessDateAction={
                <BusinessDateRecoveryControl
                  restaurantId={restaurantId}
                  role={role}
                  currentBusinessDate={snapshot.currentState.businessDate}
                  pmsSet1Live={snapshot.pmsSet1Live}
                />
              }
            />
          ) : null}
          {step === "legal" ? (
            <LegalStep
              restaurantId={restaurantId}
              draft={draft}
              setDraft={setDraft}
              canEdit={canEdit}
              warnings={taxWarnings}
              vatNumberError={legalErrors.vatNumber}
              vatCertificateError={legalErrors.vatCertificate}
              onClearVatNumber={() => setLegalErrors((prev) => ({ ...prev, vatNumber: undefined }))}
              onClearVatCertificate={() =>
                setLegalErrors((prev) => ({ ...prev, vatCertificate: undefined }))
              }
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

          <p className="sr-only">{CARD1_AGREEMENT_OUT}</p>
          {dirty ? <p className="sr-only">Unsaved Card 1 changes</p> : null}
        </PropertySetupWorkspaceShell>
      </div>
    </section>
  );
}

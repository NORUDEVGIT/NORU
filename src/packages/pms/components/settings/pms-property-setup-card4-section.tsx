import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { PmsPropertySetupWorkspace } from "@/packages/pms/components/settings/pms-property-setup-workspace";
import {
  Card4ProfileTypesGuide,
  PmsCard4ProfileTypes,
} from "@/packages/pms/components/settings/pms-card4-profile-types";
import { SET1_HUB_HREF } from "@/packages/pms/lib/pms-set1-foundation";
import { getPmsCard4ProfileTypes } from "@/packages/pms/lib/profile-types-card4.functions";
import {
  CARD1_PMS_NAV,
  propertySetupStatusLabel,
  type PropertySetupCardStatus,
} from "@/packages/pms/lib/pms-property-setup-card1";
import {
  CARD4_SIDEBAR_OUT,
  CARD4_STEPS,
  CARD4_SUBTITLE,
  CARD4_WORKSPACE_TITLE,
  card4CompletedCount,
  card4ProgressPct,
  card4StepById,
  evaluateCard4StepStatus,
  nextCard4Step,
  type Card4StepId,
} from "@/packages/pms/lib/pms-property-setup-card4";

export function PmsPropertySetupCard4Section({
  restaurantId,
  canEdit,
  initialStep = "profile-types",
}: {
  restaurantId: string;
  canEdit: boolean;
  initialStep?: Card4StepId;
}) {
  const [step, setStep] = useState<Card4StepId>(initialStep);
  const [saveRequest, setSaveRequest] = useState<{ token: number; thenNext: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [canSave, setCanSave] = useState(false);
  const loadTypes = useServerFn(getPmsCard4ProfileTypes);
  const typesQuery = useQuery({
    queryKey: ["pms-card4-profile-types", restaurantId],
    queryFn: () => loadTypes({ data: { restaurantId } }),
    retry: false,
  });
  const profileTypesConfigured = (typesQuery.data?.types.length ?? 0) > 0;

  const onSavingChange = useCallback((nextSaving: boolean, nextCanSave: boolean) => {
    setSaving(nextSaving);
    setCanSave(nextCanSave);
  }, []);

  const current = card4StepById(step);
  const next = nextCard4Step(step);
  const stepStatuses: Partial<Record<Card4StepId, PropertySetupCardStatus>> = {
    "profile-types": evaluateCard4StepStatus("profile-types", undefined, profileTypesConfigured),
    "required-fields": "not_started",
    "identity-documents": "not_started",
    preferences: "not_started",
    "company-business": "not_started",
  };
  const completedCount = card4CompletedCount(stepStatuses);
  const progressPct = card4ProgressPct(completedCount);
  const cardStatus: PropertySetupCardStatus = profileTypesConfigured
    ? "in_progress"
    : "not_started";

  function goHub() {
    window.location.hash = "";
    window.history.replaceState(null, "", SET1_HUB_HREF);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  function requestSave(thenNext: boolean) {
    setSaveRequest((prev) => ({ token: (prev?.token ?? 0) + 1, thenNext }));
  }

  function onSaved(thenNext: boolean) {
    if (thenNext && next) setStep(next);
  }

  function goContinue() {
    if (step === "profile-types") {
      requestSave(true);
      return;
    }
    if (next) setStep(next);
  }

  const placeholder = current.placeholder;

  return (
    <PmsPropertySetupWorkspace
      testIdPrefix="pms-card4"
      sidebarOutCopy={CARD4_SIDEBAR_OUT}
      nav={CARD1_PMS_NAV}
      title={CARD4_WORKSPACE_TITLE}
      subtitle={CARD4_SUBTITLE}
      steps={CARD4_STEPS.map((row) => ({
        id: row.id,
        number: row.number,
        title: row.title,
        status: stepStatuses[row.id] ?? "not_started",
      }))}
      activeStepId={step}
      onSelectStep={(id) => setStep(id as Card4StepId)}
      progressPct={progressPct}
      completedCount={completedCount}
      currentSection={current.title}
      nextStepTitle={next ? card4StepById(next).title : null}
      cardStatusLabel={propertySetupStatusLabel(cardStatus)}
      progressLabel="Guest Profile Rules"
      onBack={goHub}
      backLabel="Cancel"
      saveDraftDisabled={!canEdit || step !== "profile-types" || !canSave || saving}
      continueDisabled={!canEdit || (step === "profile-types" && (!canSave || saving))}
      continuePending={saving}
      onSaveDraft={() => requestSave(false)}
      onContinue={goContinue}
      continueLabel="Save & Next"
      railExtras={
        step === "profile-types" ? (
          <Card4ProfileTypesGuide count={typesQuery.data?.types.length ?? 0} />
        ) : null
      }
    >
      {step === "profile-types" ? (
        <PmsCard4ProfileTypes
          restaurantId={restaurantId}
          canEdit={canEdit}
          onSavingChange={onSavingChange}
          saveRequest={saveRequest}
          onSaved={onSaved}
        />
      ) : (
        <div
          className="rounded-2xl border border-dashed border-[#CCCCCC] bg-white p-8"
          data-testid={`card4-placeholder-${step}`}
        >
          <h2 className="font-display text-2xl text-[#251605]">{current.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{placeholder}</p>
        </div>
      )}
    </PmsPropertySetupWorkspace>
  );
}

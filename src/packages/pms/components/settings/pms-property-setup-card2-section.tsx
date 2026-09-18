import { useState } from "react";

import { PmsPropertySetupWorkspace } from "@/packages/pms/components/settings/pms-property-setup-workspace";
import { SET1_HUB_HREF } from "@/packages/pms/lib/pms-set1-foundation";
import {
  CARD1_PMS_NAV,
  propertySetupStatusLabel,
  type PropertySetupCardStatus,
} from "@/packages/pms/lib/pms-property-setup-card1";
import {
  CARD2_SIDEBAR_OUT,
  CARD2_STEPS,
  CARD2_SUBTITLE,
  CARD2_WORKSPACE_TITLE,
  card2CompletedCount,
  card2ProgressPct,
  card2StepById,
  evaluateCard2StepStatus,
  nextCard2Step,
  previousCard2Step,
  type Card2StepId,
} from "@/packages/pms/lib/pms-property-setup-card2";

export function PmsPropertySetupCard2Section({
  cardStatus,
  canEdit,
  initialStep = "room-types",
}: {
  cardStatus: PropertySetupCardStatus;
  canEdit: boolean;
  initialStep?: Card2StepId;
}) {
  const [step, setStep] = useState<Card2StepId>(initialStep);
  const current = card2StepById(step);
  const next = nextCard2Step(step);
  const stepStatuses = {} as Partial<Record<Card2StepId, PropertySetupCardStatus>>;
  const completedCount = card2CompletedCount(stepStatuses);
  const progressPct = card2ProgressPct(stepStatuses);

  function goBack() {
    const previous = previousCard2Step(step);
    if (previous) {
      setStep(previous);
      return;
    }
    window.location.hash = "";
    window.history.replaceState(null, "", SET1_HUB_HREF);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  function goContinue() {
    if (!next) return;
    setStep(next);
  }

  return (
    <PmsPropertySetupWorkspace
      testIdPrefix="pms-card2"
      sidebarOutCopy={CARD2_SIDEBAR_OUT}
      nav={CARD1_PMS_NAV}
      title={CARD2_WORKSPACE_TITLE}
      subtitle={CARD2_SUBTITLE}
      steps={CARD2_STEPS.map((row) => ({
        id: row.id,
        number: row.number,
        title: row.title,
        status: evaluateCard2StepStatus(row.id, stepStatuses[row.id]),
      }))}
      activeStepId={step}
      onSelectStep={(id) => setStep(id as Card2StepId)}
      progressPct={progressPct}
      completedCount={completedCount}
      currentSection={current.title}
      nextStepTitle={next ? card2StepById(next).title : null}
      cardStatusLabel={propertySetupStatusLabel(cardStatus)}
      progressLabel="Rooms & Operations Progress"
      onBack={goBack}
      saveDraftDisabled
      continueDisabled={!canEdit || !next}
      onContinue={goContinue}
    >
      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm" data-testid={`pms-card2-step-${step}`}>
        <h2 className="font-display text-xl text-[#251605]">{current.title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {step === "room-types"
            ? "Configure room types, physical rooms and bulk room generation."
            : current.placeholder}
        </p>
        <p className="mt-4 text-sm text-[#251605]">{current.placeholder}</p>
      </section>
    </PmsPropertySetupWorkspace>
  );
}

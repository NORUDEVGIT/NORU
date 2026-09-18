import { useCallback, useRef, useState } from "react";

import { PmsPropertySetupWorkspace } from "@/packages/pms/components/settings/pms-property-setup-workspace";
import { PmsPropertySetupCard2RoomTypes } from "@/packages/pms/components/settings/pms-property-setup-card2-room-types";
import { SET1_HUB_HREF } from "@/packages/pms/lib/pms-set1-foundation";
import {
  CARD1_PMS_NAV,
  propertySetupStatusLabel,
  type Card2StepStatusMap,
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
  restaurantId,
  cardStatus,
  card2Steps,
  canEdit,
  initialStep = "room-types",
}: {
  restaurantId: string;
  cardStatus: PropertySetupCardStatus;
  card2Steps?: Card2StepStatusMap;
  canEdit: boolean;
  initialStep?: Card2StepId;
}) {
  const [step, setStep] = useState<Card2StepId>(initialStep);
  const [roomTypesStatus, setRoomTypesStatus] = useState<PropertySetupCardStatus>(
    card2Steps?.["room-types"] ?? "not_started",
  );
  const [continuePending, setContinuePending] = useState(false);
  const actionsRef = useRef<{ saveDraft: () => Promise<boolean>; saveAndContinue: () => Promise<boolean> } | null>(
    null,
  );

  const current = card2StepById(step);
  const next = nextCard2Step(step);
  const stepStatuses: Partial<Record<Card2StepId, PropertySetupCardStatus>> = {
    ...card2Steps,
    "room-types": roomTypesStatus,
  };
  const completedCount = card2CompletedCount(stepStatuses);
  const progressPct = card2ProgressPct(stepStatuses);

  const onReadiness = useCallback((status: PropertySetupCardStatus, _blockers: string[]) => {
    setRoomTypesStatus(status);
  }, []);

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

  async function goContinue() {
    if (step === "room-types") {
      setContinuePending(true);
      const ready = (await actionsRef.current?.saveAndContinue()) ?? false;
      setContinuePending(false);
      if (!ready) return;
    }
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
      cardStatusLabel={propertySetupStatusLabel(cardStatus === "complete" ? "in_progress" : cardStatus)}
      progressLabel="Rooms & Operations Progress"
      onBack={goBack}
      saveDraftDisabled={!canEdit || step !== "room-types"}
      onSaveDraft={() => void actionsRef.current?.saveDraft()}
      continueDisabled={!canEdit || !next}
      continuePending={continuePending}
      onContinue={() => void goContinue()}
    >
      {step === "room-types" ? (
        <PmsPropertySetupCard2RoomTypes
          restaurantId={restaurantId}
          canEdit={canEdit}
          onReadiness={onReadiness}
          registerActions={(actions) => {
            actionsRef.current = actions;
          }}
        />
      ) : (
        <section className="rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm" data-testid={`pms-card2-step-${step}`}>
          <h2 className="font-display text-xl text-[#251605]">{current.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{current.placeholder}</p>
        </section>
      )}
    </PmsPropertySetupWorkspace>
  );
}

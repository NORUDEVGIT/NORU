import { useCallback, useRef, useState } from "react";

import { PmsPropertySetupWorkspace } from "@/packages/pms/components/settings/pms-property-setup-workspace";
import { PmsPropertySetupCard2RoomTypes } from "@/packages/pms/components/settings/pms-property-setup-card2-room-types";
import {
  PmsPropertySetupCard2Amenities,
  type AmenitiesRailStats,
} from "@/packages/pms/components/settings/pms-property-setup-card2-amenities";
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

function amenitiesStatusLabel(status: PropertySetupCardStatus, blockers: string[]): string {
  if (status === "complete") return "Ready";
  if (status === "in_progress" && blockers.length > 0) return "Needs Attention";
  if (status === "in_progress") return "In Progress";
  return "Not Started";
}

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
  const [amenitiesStatus, setAmenitiesStatus] = useState<PropertySetupCardStatus>(
    card2Steps?.amenities ?? "not_started",
  );
  const [amenitiesStats, setAmenitiesStats] = useState<AmenitiesRailStats | null>(null);
  const [continuePending, setContinuePending] = useState(false);
  const actionsRef = useRef<{ saveDraft: () => Promise<boolean>; saveAndContinue: () => Promise<boolean> } | null>(
    null,
  );

  const current = card2StepById(step);
  const next = nextCard2Step(step);
  const stepStatuses: Partial<Record<Card2StepId, PropertySetupCardStatus>> = {
    ...card2Steps,
    "room-types": roomTypesStatus,
    amenities: amenitiesStatus,
  };
  const completedCount = card2CompletedCount(stepStatuses);
  const progressPct = card2ProgressPct(stepStatuses);

  const onRoomTypesReadiness = useCallback((status: PropertySetupCardStatus, _blockers: string[]) => {
    setRoomTypesStatus(status);
  }, []);
  const onAmenitiesReadiness = useCallback((status: PropertySetupCardStatus, _blockers: string[]) => {
    setAmenitiesStatus(status);
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
    if (step === "room-types" || step === "amenities") {
      setContinuePending(true);
      const ready = (await actionsRef.current?.saveAndContinue()) ?? false;
      setContinuePending(false);
      if (!ready) return;
    }
    if (!next) return;
    setStep(next);
  }

  const amenitiesRail =
    step === "amenities" && amenitiesStats ? (
      <>
        <section className="rounded-2xl border border-[#CCCCCC] bg-white p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Amenities Status</p>
          <p className="mt-1 text-sm font-medium text-[#251605]">
            {amenitiesStatusLabel(amenitiesStats.stepStatus, amenitiesStats.blockers)}
          </p>
        </section>
        <section className="rounded-2xl border border-[#CCCCCC] bg-white p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Configured Amenities</p>
          <p className="mt-1 text-sm font-medium text-[#251605]">{amenitiesStats.total}</p>
          <p className="mt-2 text-xs text-muted-foreground">Uncategorized Amenities</p>
          <p className="mt-1 text-sm font-medium text-[#251605]">{amenitiesStats.uncategorized}</p>
          <p className="mt-2 text-xs text-muted-foreground">Room Types Configured</p>
          <p className="mt-1 text-sm font-medium text-[#251605]">{amenitiesStats.typesConfigured}</p>
          <p className="mt-2 text-xs text-muted-foreground">Rooms With Overrides</p>
          <p className="mt-1 text-sm font-medium text-[#251605]">{amenitiesStats.roomsWithOverrides}</p>
        </section>
        {amenitiesStats.blockers.length > 0 ? (
          <section className="rounded-2xl border border-[#CCCCCC] bg-white p-4 shadow-sm">
            <p className="text-xs text-muted-foreground">Blockers</p>
            <ul className="mt-1 list-disc pl-4 text-sm text-[#251605]">
              {amenitiesStats.blockers.map((row) => (
                <li key={row}>{row}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </>
    ) : null;

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
      saveDraftDisabled={!canEdit || (step !== "room-types" && step !== "amenities")}
      onSaveDraft={() => void actionsRef.current?.saveDraft()}
      continueDisabled={!canEdit || !next}
      continuePending={continuePending}
      onContinue={() => void goContinue()}
      railExtras={amenitiesRail}
    >
      {step === "room-types" ? (
        <PmsPropertySetupCard2RoomTypes
          restaurantId={restaurantId}
          canEdit={canEdit}
          onReadiness={onRoomTypesReadiness}
          registerActions={(actions) => {
            actionsRef.current = actions;
          }}
        />
      ) : step === "amenities" ? (
        <PmsPropertySetupCard2Amenities
          restaurantId={restaurantId}
          canEdit={canEdit}
          onReadiness={onAmenitiesReadiness}
          onStats={setAmenitiesStats}
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

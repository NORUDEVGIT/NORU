import { useCallback, useRef, useState } from "react";

import { PmsPropertySetupCard2RoomTypes } from "@/packages/pms/components/settings/pms-property-setup-card2-room-types";
import { PmsPropertySetupCard2Housekeeping } from "@/packages/pms/components/settings/pms-property-setup-card2-housekeeping";
import {
  PmsPropertySetupCard2Amenities,
  type AmenitiesRailStats,
} from "@/packages/pms/components/settings/pms-property-setup-card2-amenities";
import {
  PmsPropertySetupCard2Inventory,
  type InventoryRailStats,
} from "@/packages/pms/components/settings/pms-property-setup-card2-inventory";
import {
  PmsPropertySetupCard2Maintenance,
  type MaintenanceRailStats,
} from "@/packages/pms/components/settings/pms-property-setup-card2-maintenance";
import {
  PropertySetupPanel,
  PropertySetupStatusRail,
  PropertySetupStepNav,
  PropertySetupWorkspaceShell,
} from "@/packages/pms/components/settings/setup-kit";
import { SET1_HUB_HREF } from "@/packages/pms/lib/pms-set1-foundation";
import { propertySetupRailCounts } from "@/packages/pms/lib/pms-property-setup-ui";
import type {
  Card2StepStatusMap,
  PropertySetupCardStatus,
} from "@/packages/pms/lib/pms-property-setup-card1";
import {
  CARD2_SIDEBAR_OUT,
  CARD2_STEPS,
  CARD2_SUBTITLE,
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
  const [housekeepingStatus, setHousekeepingStatus] = useState<PropertySetupCardStatus>(
    card2Steps?.housekeeping ?? "not_started",
  );
  const [housekeepingBlockers, setHousekeepingBlockers] = useState<string[]>([]);
  const [housekeepingWarnings, setHousekeepingWarnings] = useState<string[]>([]);
  const [amenitiesStatus, setAmenitiesStatus] = useState<PropertySetupCardStatus>(
    card2Steps?.amenities ?? "not_started",
  );
  const [amenitiesStats, setAmenitiesStats] = useState<AmenitiesRailStats | null>(null);
  const [inventoryStatus, setInventoryStatus] = useState<PropertySetupCardStatus>(
    card2Steps?.["inventory-rules"] ?? "not_started",
  );
  const [inventoryStats, setInventoryStats] = useState<InventoryRailStats | null>(null);
  const [maintenanceStatus, setMaintenanceStatus] = useState<PropertySetupCardStatus>(
    card2Steps?.maintenance ?? "not_started",
  );
  const [maintenanceStats, setMaintenanceStats] = useState<MaintenanceRailStats | null>(null);
  const [continuePending, setContinuePending] = useState(false);
  const actionsRef = useRef<{
    saveDraft: () => Promise<boolean>;
    saveAndContinue: () => Promise<boolean>;
  } | null>(null);

  const current = card2StepById(step);
  const next = nextCard2Step(step);
  const stepStatuses: Partial<Record<Card2StepId, PropertySetupCardStatus>> = {
    ...card2Steps,
    "room-types": roomTypesStatus,
    amenities: amenitiesStatus,
    housekeeping: housekeepingStatus,
    "inventory-rules": inventoryStatus,
    maintenance: maintenanceStatus,
  };
  const railSections = CARD2_STEPS.map((row) => ({
    id: row.id,
    title: row.title,
    status: evaluateCard2StepStatus(row.id, stepStatuses[row.id]),
  }));
  const counts = propertySetupRailCounts(railSections.map((row) => row.status));
  const railBlockers =
    step === "housekeeping"
      ? housekeepingBlockers
      : step === "inventory-rules"
        ? (inventoryStats?.blockers ?? [])
        : step === "amenities"
          ? (amenitiesStats?.blockers ?? [])
          : step === "maintenance"
            ? (maintenanceStats?.blockers ?? [])
            : [];
  const railWarnings = step === "housekeeping" ? housekeepingWarnings : [];

  const onRoomTypesReadiness = useCallback(
    (status: PropertySetupCardStatus, _blockers: string[]) => {
      setRoomTypesStatus(status);
    },
    [],
  );
  const onHousekeepingReadiness = useCallback(
    (status: PropertySetupCardStatus, blockers: string[], warnings: string[]) => {
      setHousekeepingStatus(status);
      setHousekeepingBlockers(blockers);
      setHousekeepingWarnings(warnings);
    },
    [],
  );
  const onAmenitiesReadiness = useCallback(
    (status: PropertySetupCardStatus, _blockers: string[]) => {
      setAmenitiesStatus(status);
    },
    [],
  );
  const onInventoryReadiness = useCallback(
    (status: PropertySetupCardStatus, _blockers: string[]) => {
      setInventoryStatus(status);
    },
    [],
  );
  const onMaintenanceReadiness = useCallback(
    (status: PropertySetupCardStatus, _blockers: string[]) => {
      setMaintenanceStatus(status);
    },
    [],
  );

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
    if (
      step === "room-types" ||
      step === "amenities" ||
      step === "housekeeping" ||
      step === "inventory-rules" ||
      step === "maintenance"
    ) {
      setContinuePending(true);
      const ready = (await actionsRef.current?.saveAndContinue()) ?? false;
      setContinuePending(false);
      if (!ready) return;
    }
    if (!next) return;
    setStep(next);
  }

  async function selectStep(target: Card2StepId) {
    const currentIndex = CARD2_STEPS.findIndex((item) => item.id === step);
    const targetIndex = CARD2_STEPS.findIndex((item) => item.id === target);
    if (step === "housekeeping" && targetIndex > currentIndex) {
      setContinuePending(true);
      const ready = (await actionsRef.current?.saveAndContinue()) ?? false;
      setContinuePending(false);
      if (!ready) return;
    }
    setStep(target);
  }

  const operationalFacts =
    step === "housekeeping" ? (
      <PropertySetupPanel
        title="Housekeeping"
        icon="housekeeping"
        helper="Operating setup for this step."
      >
        <p className="text-sm text-[#251605]">
          {amenitiesStatusLabel(housekeepingStatus, housekeepingBlockers)}
        </p>
        <p className="text-sm text-muted-foreground">
          {housekeepingBlockers.length} blockers · {housekeepingWarnings.length} warnings
        </p>
      </PropertySetupPanel>
    ) : step === "inventory-rules" && inventoryStats ? (
      <PropertySetupPanel
        title="Inventory"
        icon="inventory"
        helper="Live inventory counts for this property."
      >
        <div className="grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-3">
          <p>Physical rooms: {inventoryStats.physicalRoomCount}</p>
          <p>Room-level sellable: {inventoryStats.roomLevelSellableCount}</p>
          <p>Canonical capacity: {inventoryStats.canonicalEngineSellableRoomCount}</p>
          <p>Block policies: {inventoryStats.blockPoliciesConfigured} / 9</p>
        </div>
        {inventoryStats.configuredButNotOperational ? (
          <p className="text-sm text-[#9A6A12]">
            Overbooking policy configured — engine support not active
          </p>
        ) : null}
      </PropertySetupPanel>
    ) : step === "amenities" && amenitiesStats ? (
      <PropertySetupPanel title="Amenities" icon="amenity" helper="Configured amenity coverage.">
        <div className="grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-3">
          <p>Configured: {amenitiesStats.total}</p>
          <p>Uncategorized: {amenitiesStats.uncategorized}</p>
          <p>Room types configured: {amenitiesStats.typesConfigured}</p>
          <p>Rooms with overrides: {amenitiesStats.roomsWithOverrides}</p>
        </div>
      </PropertySetupPanel>
    ) : step === "maintenance" && maintenanceStats ? (
      <PropertySetupPanel
        title="Maintenance"
        icon="maintenance"
        helper="Status rules and policies."
      >
        <div className="grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-3">
          <p>Status rules: {maintenanceStats.configuredStatusRules} / 6</p>
          <p>OOS policy: {maintenanceStats.oosPolicyConfigured ? "Enabled" : "Disabled"}</p>
          <p>OOO policy: {maintenanceStats.oooPolicyConfigured ? "Enabled" : "Disabled"}</p>
          <p>
            Preventive: {maintenanceStats.preventiveMaintenanceEnabled ? "Enabled" : "Disabled"}
          </p>
        </div>
      </PropertySetupPanel>
    ) : null;

  return (
    <section
      className="flex min-h-[calc(100dvh-3.75rem)] min-w-0 flex-1 flex-col bg-[#F7F4EE]"
      data-testid="pms-card2-workspace"
      data-card-fullscreen="true"
    >
      <div className="sr-only">{CARD2_SIDEBAR_OUT}</div>
      <div className="min-w-0 flex-1" data-testid="pms-card2-fullscreen">
        <PropertySetupWorkspaceShell
          cardNumber={2}
          status={cardStatus === "complete" ? "in_progress" : cardStatus}
          description={CARD2_SUBTITLE}
          sections={railSections}
          complete={counts.complete}
          inProgress={counts.inProgress}
          notStarted={counts.notStarted}
          blockers={railBlockers}
          warnings={railWarnings}
          onBack={goBack}
          onSaveDraft={
            canEdit &&
            (step === "room-types" ||
              step === "amenities" ||
              step === "housekeeping" ||
              step === "inventory-rules" ||
              step === "maintenance")
              ? () => void actionsRef.current?.saveDraft()
              : undefined
          }
          saveDraftDisabled={!canEdit}
          continueDisabled={!canEdit}
          continuePending={continuePending}
          onContinue={() => void goContinue()}
          footerTestId="pms-card2-chrome"
          rail={
            <div data-testid="pms-card2-status-rail">
              <PropertySetupStatusRail
                sections={railSections}
                complete={counts.complete}
                inProgress={counts.inProgress}
                notStarted={counts.notStarted}
                blockers={railBlockers}
                warnings={railWarnings}
              />
            </div>
          }
          stepNav={
            <div data-testid="pms-card2-steps">
              <PropertySetupStepNav
                activeId={step}
                onSelect={(id) => void selectStep(id as Card2StepId)}
                steps={railSections.map((row, index) => ({
                  id: row.id,
                  number: index + 1,
                  title: row.title,
                  status: row.status,
                }))}
              />
            </div>
          }
        >
          <div className="space-y-4" data-testid={`pms-card2-step-${step}`}>
            {operationalFacts}
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
            ) : step === "inventory-rules" ? (
              <PmsPropertySetupCard2Inventory
                restaurantId={restaurantId}
                canEdit={canEdit}
                onReadiness={onInventoryReadiness}
                onStats={setInventoryStats}
                registerActions={(actions) => {
                  actionsRef.current = actions;
                }}
              />
            ) : step === "housekeeping" ? (
              <PmsPropertySetupCard2Housekeeping
                restaurantId={restaurantId}
                canEdit={canEdit}
                onReadiness={onHousekeepingReadiness}
                registerActions={(actions) => {
                  actionsRef.current = actions;
                }}
              />
            ) : step === "maintenance" ? (
              <PmsPropertySetupCard2Maintenance
                restaurantId={restaurantId}
                canEdit={canEdit}
                onReadiness={onMaintenanceReadiness}
                onStats={setMaintenanceStats}
                registerActions={(actions) => {
                  actionsRef.current = actions;
                }}
              />
            ) : (
              <PropertySetupPanel title={current.title} icon="room">
                <p className="text-sm text-muted-foreground">{current.placeholder}</p>
              </PropertySetupPanel>
            )}
          </div>
        </PropertySetupWorkspaceShell>
      </div>
    </section>
  );
}

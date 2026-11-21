import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { PmsPropertySetupCard2RoomTypes } from "@/packages/pms/components/settings/pms-property-setup-card2-room-types";
import { PmsPropertySetupCard2Housekeeping } from "@/packages/pms/components/settings/pms-property-setup-card2-housekeeping";
import { type AmenitiesRailStats } from "@/packages/pms/components/settings/pms-property-setup-card2-amenities";
import {
  PmsPropertySetupCard2Inventory,
  type InventoryRailStats,
} from "@/packages/pms/components/settings/pms-property-setup-card2-inventory";
import {
  PmsPropertySetupCard2Maintenance,
  type MaintenanceRailStats,
} from "@/packages/pms/components/settings/pms-property-setup-card2-maintenance";
import { PmsPropertySetupCard2Rates } from "@/packages/pms/components/settings/pms-property-setup-card2-rates";
import { getMealsCard3 } from "@/packages/pms/lib/meals-card3.functions";
import {
  PropertySetupPanel,
  PropertySetupStepNav,
  PropertySetupWorkspaceShell,
} from "@/packages/pms/components/settings/setup-kit";
import { SET1_HUB_HREF } from "@/packages/pms/lib/pms-set1-foundation";
import { finishPropertySetupCardAndAdvance } from "@/packages/pms/lib/pms-property-setup-navigation";
import type {
  Card2StepStatusMap,
  PropertySetupCardStatus,
} from "@/packages/pms/lib/pms-property-setup-card1";
import {
  CARD2_HASH,
  CARD2_NAV_STEPS,
  CARD2_STEPS,
  card2StepById,
  card2StepFromSearch,
  evaluateCard2StepStatus,
  nextCard2Step,
  previousCard2Step,
  resolveCard2NavStep,
  type Card2StepId,
} from "@/packages/pms/lib/pms-property-setup-card2";
import { evaluateCard2AmenitiesReadiness } from "@/packages/pms/lib/rooms-amenities.functions";

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
  const [step, setStep] = useState<Card2StepId>(() => {
    if (typeof window !== "undefined") {
      const fromSearch = card2StepFromSearch(window.location.search);
      if (fromSearch) return resolveCard2NavStep(fromSearch);
    }
    return resolveCard2NavStep(initialStep);
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const applyFromSearch = () => {
      const fromSearch = card2StepFromSearch(window.location.search);
      if (fromSearch) {
        setStep(resolveCard2NavStep(fromSearch));
      }
    };
    applyFromSearch();
    window.addEventListener("popstate", applyFromSearch);
    window.addEventListener("hashchange", applyFromSearch);
    return () => {
      window.removeEventListener("popstate", applyFromSearch);
      window.removeEventListener("hashchange", applyFromSearch);
    };
  }, []);

  // Legacy ?card2Step=amenities → Room Types (catalogue lives in Room Type wizard Step 3).
  // Legacy ?card2Step=meal-plans-packages → Rate & Pricing (catalogue lives in Rate Plan Step 3).
  useEffect(() => {
    if (step === "amenities") setStep("room-types");
    if (step === "meal-plans-packages") setStep("rates-pricing");
  }, [step]);
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
  const [ratesStatus, setRatesStatus] = useState<PropertySetupCardStatus>(
    card2Steps?.["rates-pricing"] ?? "not_started",
  );
  const [ratesBlockers, setRatesBlockers] = useState<string[]>([]);
  const [ratesWarnings, setRatesWarnings] = useState<string[]>([]);
  const [mealsStatus, setMealsStatus] = useState<PropertySetupCardStatus>(
    card2Steps?.["meal-plans-packages"] ?? "not_started",
  );
  const loadMeals = useServerFn(getMealsCard3);
  const loadAmenitiesReady = useServerFn(evaluateCard2AmenitiesReadiness);
  const mealsQuery = useQuery({
    queryKey: ["pms-card3-meals", restaurantId],
    queryFn: () => loadMeals({ data: { restaurantId } }),
  });
  const amenitiesReadyQuery = useQuery({
    queryKey: ["pms-card2-amenities-ready", restaurantId],
    queryFn: () => loadAmenitiesReady({ data: { restaurantId } }),
  });
  useEffect(() => {
    const readiness = mealsQuery.data?.readiness;
    if (!readiness) return;
    setMealsStatus(readiness.status);
  }, [mealsQuery.data?.readiness]);
  useEffect(() => {
    const ready = amenitiesReadyQuery.data;
    if (!ready) return;
    setAmenitiesStatus(ready.stepStatus);
    setAmenitiesStats({
      total: ready.catalogCount ?? 0,
      active: ready.activeCatalogCount ?? 0,
      uncategorized: ready.uncategorizedCount ?? 0,
      typesConfigured: ready.typesConfigured ?? 0,
      roomsWithOverrides: ready.roomsWithOverrides ?? 0,
      blockers: ready.blockers ?? [],
      stepStatus: ready.stepStatus,
    });
  }, [amenitiesReadyQuery.data]);
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
    "rates-pricing": ratesStatus,
    "meal-plans-packages": mealsStatus,
  };
  const navSections = CARD2_NAV_STEPS.map((row, index) => ({
    id: row.id,
    number: index + 1,
    title: row.title,
    status: evaluateCard2StepStatus(row.id, stepStatuses[row.id]),
  }));
  const stepBlockers =
    step === "housekeeping"
      ? housekeepingBlockers
      : step === "rates-pricing"
        ? ratesBlockers
        : step === "inventory-rules"
          ? (inventoryStats?.blockers ?? [])
          : step === "maintenance"
            ? (maintenanceStats?.blockers ?? [])
            : step === "room-types"
              ? (amenitiesStats?.blockers ?? [])
              : [];
  const stepWarnings =
    step === "housekeeping"
      ? housekeepingWarnings
      : step === "rates-pricing"
        ? ratesWarnings
        : [];

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
  const onRatesReadiness = useCallback(
    (status: PropertySetupCardStatus, blockers: string[], warnings: string[]) => {
      setRatesStatus(status);
      setRatesBlockers(blockers);
      setRatesWarnings(warnings);
    },
    [],
  );
  function goBack() {
    const previous = previousCard2Step(step);
    if (previous) {
      setStep(previous);
      return;
    }
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

  async function goContinue() {
    if (
      step === "room-types" ||
      step === "housekeeping" ||
      step === "inventory-rules" ||
      step === "maintenance"
    ) {
      setContinuePending(true);
      const ready = (await actionsRef.current?.saveAndContinue()) ?? false;
      setContinuePending(false);
      if (!ready) return;
    }
    if (!next) {
      finishPropertySetupCardAndAdvance(CARD2_HASH);
      return;
    }
    setStep(next);
  }

  async function selectStep(target: Card2StepId) {
    const resolved = resolveCard2NavStep(target);
    const currentIndex = CARD2_STEPS.findIndex((item) => item.id === step);
    const targetIndex = CARD2_STEPS.findIndex((item) => item.id === resolved);
    if (step === "housekeeping" && targetIndex > currentIndex) {
      setContinuePending(true);
      const ready = (await actionsRef.current?.saveAndContinue()) ?? false;
      setContinuePending(false);
      if (!ready) return;
    }
    setStep(resolved);
  }

  const canSaveDraft =
    canEdit &&
    (step === "room-types" ||
      step === "housekeeping" ||
      step === "inventory-rules" ||
      step === "maintenance");

  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#F7F4EE]"
      data-testid="pms-card2-workspace"
      data-card-fullscreen="true"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="pms-card2-fullscreen">
        <PropertySetupWorkspaceShell
          cardNumber={2}
          fill
          status={cardStatus}
          onBack={goBack}
          onSaveDraft={canSaveDraft ? () => void actionsRef.current?.saveDraft() : undefined}
          saveDraftDisabled={!canEdit}
          continueDisabled={!canEdit}
          continuePending={continuePending}
          continueLabel={next ? "Save & Continue" : "Save & Finish"}
          onContinue={() => void goContinue()}
          footerTestId="pms-card2-chrome"
          stepNav={
            <div data-testid="pms-card2-steps">
              <PropertySetupStepNav
                marked
                activeId={
                  step === "amenities"
                    ? "room-types"
                    : step === "meal-plans-packages"
                      ? "rates-pricing"
                      : step
                }
                onSelect={(id) => void selectStep(id as Card2StepId)}
                steps={navSections}
              />
            </div>
          }
        >
          <div className="space-y-3" data-testid={`pms-card2-step-${step}`}>
            {stepBlockers.length > 0 || stepWarnings.length > 0 ? (
              <div
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
                data-testid="pms-card2-step-notice"
              >
                {stepBlockers[0] ?? stepWarnings[0]}
                {stepBlockers.length + stepWarnings.length > 1 ? (
                  <span className="text-amber-800/80">
                    {" "}
                    · {stepBlockers.length + stepWarnings.length - 1} more
                  </span>
                ) : null}
              </div>
            ) : null}
            {step === "room-types" || step === "amenities" ? (
              <PmsPropertySetupCard2RoomTypes
                restaurantId={restaurantId}
                canEdit={canEdit}
                onReadiness={onRoomTypesReadiness}
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
            ) : step === "rates-pricing" || step === "meal-plans-packages" ? (
              <PmsPropertySetupCard2Rates
                restaurantId={restaurantId}
                canEdit={canEdit}
                onReadiness={onRatesReadiness}
                onNavigateToRoomTypes={() => setStep("room-types")}
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

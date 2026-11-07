/**
 * PMS Settings hub.
 *
 * This is the only property-setup editor. Do not restore
 * `PmsPropertySetupWorkspace` as a second identity, tax, or policy editor.
 * Rooms stay on Room & Inventory. Rates and Distribution keep their own desks.
 */
import { useEffect, useState } from "react";
import { PmsAccessDenied } from "@/packages/pms/components/pms/pms-route-gate";
import {
  pmsSettingsCardEditable,
  pmsSettingsCardVisible,
  pmsSettingsSectionEditable,
  pmsSettingsSectionVisible,
} from "@/packages/pms/lib/pms-client-access";
import { usePmsPermissions } from "@/packages/pms/lib/use-pms-permissions";
import { PMS_PERMISSIONS } from "@/packages/pms/lib/pms-permissions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  SettingsDashboardChrome,
  SettingsSetupProgressPanel,
} from "@/packages/pms/components/settings/pms-settings-dashboard";
import { settingsDashboardStatusLabel } from "@/packages/pms/lib/pms-settings-dashboard";

import { Check, Menu, RefreshCw } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { PmsFilterChoiceRow, PmsFilterMenu } from "@/packages/pms/components/pms-filter-menu";
import { SHELL_ICON_BUTTON } from "@/packages/pms/components/reservations/reservation-shell-slots";
import { cn } from "@/shared/lib/utils";
import { Set1SectionView } from "@/packages/pms/components/settings/pms-set1-section";
import { PmsPropertySetupCard1Section } from "@/packages/pms/components/settings/pms-property-setup-card1-section";
import { PmsPropertySetupCard2Section } from "@/packages/pms/components/settings/pms-property-setup-card2-section";
import {
  Set2OutletsSection,
  Set2RoomsSection,
  Set2StructureSection,
} from "@/packages/pms/components/settings/pms-set2-section";
import {
  Set3GuestSection,
  Set3RatesSection,
} from "@/packages/pms/components/settings/pms-set3-section";
import {
  Set4HousekeepingSection,
  Set4MaintenanceSection,
  Set4RoomInventorySection,
} from "@/packages/pms/components/settings/pms-set4-section";
import {
  Set5DepartmentsSection,
  Set5GuestServicesSection,
  Set5IntegrationsSection,
  Set5NotificationsSection,
  Set5SecuritySection,
} from "@/packages/pms/components/settings/pms-set5-section";
import {
  Set6DistributionSection,
  Set6OfflineSyncSection,
  Set6ReportsSection,
  Set6SalesEventsSection,
} from "@/packages/pms/components/settings/pms-set6-section";
import { getPmsSet1Foundation } from "@/packages/pms/lib/pms-set1-foundation.functions";
import {
  SET1_HUB_HREF,
  SET2_LIVE_HASHES,
  SET3_LIVE_HASHES,
  SET4_LIVE_HASHES,
  SET5_LIVE_HASHES,
  SET6_LIVE_HASHES,
  POLISH1_LIVE_HASHES,
  resolveSet1SectionHash,
  type Set1SectionId,
} from "@/packages/pms/lib/pms-set1-foundation";
import { emptySet2Snapshot } from "@/packages/pms/lib/pms-set2-structure";
import { emptySet3Snapshot } from "@/packages/pms/lib/pms-set3-rates-guest";
import { emptySet4Snapshot } from "@/packages/pms/lib/pms-set4-hk-inventory";
import { emptySet5Snapshot } from "@/packages/pms/lib/pms-set5-depts-guestsvc";
import { emptySet6Snapshot } from "@/packages/pms/lib/pms-set6-sales-distribution";
import { emptyPolish1Snapshot } from "@/packages/pms/lib/pms-polish1-payment-admin";
import {
  Polish1AdministrationSection,
  Polish1PaymentMethodsSection,
} from "@/packages/pms/components/settings/pms-polish1-section";
import { getPmsPropertySetupCard1 } from "@/packages/pms/lib/pms-property-setup-card1.functions";
import {
  CARD1_HASH,
  CARD1_STEPS,
  PROPERTY_SETUP_CARDS,
  evaluateCard1Status,
  evaluateProgrammeCardStatus,
  isCard1WorkspaceHash,
  type PropertySetupCardStatus,
} from "@/packages/pms/lib/pms-property-setup-card1";
import { CARD2_HASH, isCard2WorkspaceHash } from "@/packages/pms/lib/pms-property-setup-card2";
import {
  CARD3_HASH,
  card3LegacyMealsRedirectHref,
  isCard3WorkspaceHash,
} from "@/packages/pms/lib/pms-property-setup-card3";
import { CARD5_HASH, isCard5WorkspaceHash } from "@/packages/pms/lib/pms-property-setup-card5";
import { CARD6_HASH, isCard6WorkspaceHash } from "@/packages/pms/lib/pms-property-setup-card6";
import { CARD7_HASH, isCard7WorkspaceHash } from "@/packages/pms/lib/pms-property-setup-card7";
import { CARD8_HASH, isCard8WorkspaceHash } from "@/packages/pms/lib/pms-property-setup-card8";
import { PmsPropertySetupCard3Section } from "@/packages/pms/components/settings/pms-property-setup-card3-section";
import { PmsPropertySetupCard5Section } from "@/packages/pms/components/settings/pms-property-setup-card5-section";
import { CARD4_HASH, isCard4WorkspaceHash } from "@/packages/pms/lib/pms-property-setup-card4";
import { PmsPropertySetupCard4Section } from "@/packages/pms/components/settings/pms-property-setup-card4-section";
import { PmsPropertySetupCard6Section } from "@/packages/pms/components/settings/pms-property-setup-card6-section";
import { PmsPropertySetupCard7Section } from "@/packages/pms/components/settings/pms-property-setup-card7-section";
import { PmsPropertySetupCard8Section } from "@/packages/pms/components/settings/pms-property-setup-card8-section";
import { getFiscalIntegrationStatus } from "@/packages/pms/lib/fiscal/fiscal.functions";
import { getPmsCard6Integrations } from "@/packages/pms/lib/integrations-card6.functions";
import { getPmsCard4Status } from "@/packages/pms/lib/card4-readiness.functions";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";

function currentSection(): Set1SectionId | null {
  if (typeof window === "undefined") return null;
  return resolveSet1SectionHash(window.location.hash);
}

function currentCard1Open(): boolean {
  if (typeof window === "undefined") return true;
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw) return true;
  return isCard1WorkspaceHash(window.location.hash);
}

function currentCard2Open(): boolean {
  if (typeof window === "undefined") return false;
  return isCard2WorkspaceHash(window.location.hash);
}

function currentCard3Open(): boolean {
  if (typeof window === "undefined") return false;
  return isCard3WorkspaceHash(window.location.hash);
}

function currentCard5Open(): boolean {
  if (typeof window === "undefined") return false;
  return isCard5WorkspaceHash(window.location.hash);
}

function currentCard4Open(): boolean {
  if (typeof window === "undefined") return false;
  return isCard4WorkspaceHash(window.location.hash);
}

function currentCard6Open(): boolean {
  if (typeof window === "undefined") return false;
  return isCard6WorkspaceHash(window.location.hash);
}

function currentCard7Open(): boolean {
  if (typeof window === "undefined") return false;
  return isCard7WorkspaceHash(window.location.hash);
}

function currentCard8Open(): boolean {
  if (typeof window === "undefined") return false;
  return isCard8WorkspaceHash(window.location.hash);
}

function openSettingsWorkspace(hash: string) {
  if (typeof window === "undefined") return;
  const next = hash ? `${SET1_HUB_HREF}#${hash}` : SET1_HUB_HREF;
  window.history.pushState(null, "", next);
  window.dispatchEvent(new Event("hashchange"));
}

export function PmsSet1Hub({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
  const access = usePmsPermissions(restaurantId);
  const accessSnapshot = { isOwner: access.isOwner, codes: access.permissions };
  const load = useServerFn(getPmsSet1Foundation);
  const loadCard1 = useServerFn(getPmsPropertySetupCard1);
  const [section, setSection] = useState<Set1SectionId | null>(currentSection);
  const [card1Open, setCard1Open] = useState(currentCard1Open);
  const [card2Open, setCard2Open] = useState(currentCard2Open);
  const [card3Open, setCard3Open] = useState(currentCard3Open);
  const [card5Open, setCard5Open] = useState(currentCard5Open);
  const [card4Open, setCard4Open] = useState(currentCard4Open);
  const [card6Open, setCard6Open] = useState(currentCard6Open);
  const [card7Open, setCard7Open] = useState(currentCard7Open);
  const [card8Open, setCard8Open] = useState(currentCard8Open);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const qc = useQueryClient();

  useEffect(() => {
    const apply = () => {
      const raw = window.location.hash.replace(/^#/, "");
      if (raw === "card-1" || raw === "card1") {
        window.history.replaceState(null, "", `${SET1_HUB_HREF}#${CARD1_HASH}`);
      }
      if (raw === "card-2" || raw === "card2") {
        window.history.replaceState(null, "", `${SET1_HUB_HREF}#${CARD2_HASH}`);
      }
      if (raw === "card-3" || raw === "card3") {
        window.history.replaceState(null, "", `${SET1_HUB_HREF}#${CARD3_HASH}`);
      }
      const mealsRedirect = card3LegacyMealsRedirectHref(window.location.search);
      if (mealsRedirect) {
        window.history.replaceState(null, "", mealsRedirect);
      }
      if (raw === "card-5" || raw === "card5") {
        window.history.replaceState(null, "", `${SET1_HUB_HREF}#${CARD5_HASH}`);
      }
      if (raw === "card-4" || raw === "card4") {
        window.history.replaceState(null, "", `${SET1_HUB_HREF}#${CARD4_HASH}`);
      }
      if (raw === "card-6" || raw === "card6") {
        window.history.replaceState(null, "", `${SET1_HUB_HREF}#${CARD6_HASH}`);
      }
      if (raw === "card-7" || raw === "card7") {
        window.history.replaceState(null, "", `${SET1_HUB_HREF}#${CARD7_HASH}`);
      }
      if (raw === "card-8" || raw === "card8") {
        window.history.replaceState(null, "", `${SET1_HUB_HREF}#${CARD8_HASH}`);
      }
      if (!window.location.hash.replace(/^#/, "")) {
        window.history.replaceState(null, "", `${SET1_HUB_HREF}#${CARD1_HASH}`);
      }
      const resolved = resolveSet1SectionHash(raw);
      if (resolved && resolved !== raw) {
        window.history.replaceState(null, "", `${SET1_HUB_HREF}#${resolved}`);
      }
      setSection(currentSection());
      setCard1Open(currentCard1Open());
      setCard2Open(currentCard2Open());
      setCard3Open(currentCard3Open());
      setCard5Open(currentCard5Open());
      setCard4Open(currentCard4Open());
      setCard6Open(currentCard6Open());
      setCard7Open(currentCard7Open());
      setCard8Open(currentCard8Open());
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  const loadFiscalStatus = useServerFn(getFiscalIntegrationStatus);
  const loadCard6Integrations = useServerFn(getPmsCard6Integrations);
  const loadCard4Status = useServerFn(getPmsCard4Status);

  const card4StatusQuery = useQuery({
    queryKey: ["pms-card4-status", restaurantId],
    queryFn: () => loadCard4Status({ data: { restaurantId } }),
    retry: false,
    staleTime: 60_000,
  });

  const card6FiscalQuery = useQuery({
    queryKey: ["fiscal-integration", restaurantId],
    queryFn: () => loadFiscalStatus({ data: { restaurantId } }),
    retry: false,
    staleTime: 60_000,
  });
  const card6IntegrationsQuery = useQuery({
    queryKey: ["pms-card6-integrations", restaurantId],
    queryFn: () => loadCard6Integrations({ data: { restaurantId } }),
    retry: false,
    staleTime: 60_000,
  });

  const query = useQuery({
    queryKey: ["pms-set1-foundation", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
    retry: false,
  });
  const card1Query = useQuery({
    queryKey: ["pms-card1", restaurantId],
    queryFn: () => loadCard1({ data: { restaurantId } }),
    retry: false,
  });

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading settings…</p>;
  if (query.isError || !query.data) {
    return (
      <p className="text-sm text-destructive">
        {(query.error as Error | undefined)?.message ?? "Settings are unavailable."}
      </p>
    );
  }

  const { snapshot, checklist, canActivate, role, set2, set3, set4, set5, set6, polish1 } = query.data;
  const card1Status = card1Query.data
    ? evaluateCard1Status(
        card1Query.data.snapshot.draft,
        card1Query.data.snapshot.status,
        card1Query.data.set2,
      )
    : "not_started";
  const dashboardStatuses: PropertySetupCardStatus[] = PROPERTY_SETUP_CARDS.map((card) => {
    if (!card1Query.data) return "not_started";
    const status = evaluateProgrammeCardStatus(
      card.id,
      card1Query.data.snapshot.status,
      card1Status,
    );
    if (card.number === 3 && status === "not_started") {
      const hasPaymentMethods = (polish1?.paymentMethods?.length ?? 0) > 0;
      const hasRatePlans = (set3?.activeRatePlanCount ?? 0) > 0;
      if (hasPaymentMethods || hasRatePlans) {
        return "in_progress";
      }
    }
    if (card.number === 4) {
      if (card4StatusQuery.data?.status && card4StatusQuery.data.status !== "not_started") {
        return card4StatusQuery.data.status;
      }
      if (status !== "not_started") {
        return status;
      }
    }
    if (card.number === 6 && status === "not_started") {
      const hasFiscal =
        card6FiscalQuery.data?.status && card6FiscalQuery.data.status !== "not_configured";
      const hasIntegrations = (card6IntegrationsQuery.data?.integrations.length ?? 0) > 0;
      if (hasFiscal || hasIntegrations) {
        return "in_progress";
      }
    }
    return status;
  });

  const openCardNumber = card1Open
    ? 1
    : card2Open
      ? 2
      : card3Open
        ? 3
        : card4Open
          ? 4
          : card5Open
            ? 5
            : card6Open
              ? 6
              : card7Open
                ? 7
                : card8Open
                  ? 8
                  : null;
  const openCardDenied =
    openCardNumber != null &&
    !access.isLoading &&
    !access.isError &&
    !pmsSettingsCardVisible(accessSnapshot, openCardNumber);
  const sectionDenied =
    section != null &&
    !access.isLoading &&
    !access.isError &&
    !pmsSettingsSectionVisible(accessSnapshot, section);
  const sectionEditable =
    section != null && pmsSettingsSectionEditable(accessSnapshot, section);
  const workspaceOpen =
    card1Open ||
    card2Open ||
    card3Open ||
    card4Open ||
    card5Open ||
    card6Open ||
    card7Open ||
    card8Open;

  const activeWorkspace =
    card1Open
      ? "property-business"
      : card2Open
        ? "rooms-inventory"
        : card3Open
          ? "rates-guest-rules"
          : card4Open
            ? "housekeeping-maintenance"
            : card5Open
              ? "departments-services"
              : card6Open
                ? "notifications-security"
                : card7Open
                  ? "sales-distribution"
                  : card8Open
                    ? "payments-administration"
                    : "property-business";
  const permittedCardIds = PROPERTY_SETUP_CARDS.filter(
    (card) =>
      !access.isLoading && !access.isError && pmsSettingsCardVisible(accessSnapshot, card.number),
  ).map((card) => card.id);
  const visibleCardIds = PROPERTY_SETUP_CARDS.filter((card, index) => {
    if (!permittedCardIds.includes(card.id)) return false;
    const status = dashboardStatuses[index] ?? "not_started";
    if (statusFilter !== "all") {
      if (statusFilter === "needs_attention" && status !== "in_progress") return false;
      if (statusFilter !== "needs_attention" && status !== statusFilter) return false;
    }
    if (areaFilter !== "all" && card.id !== areaFilter) return false;
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return true;
    return `${card.title} ${card.purpose}`.toLowerCase().includes(needle);
  }).map((card) => card.id);
  const filterCount = (statusFilter !== "all" ? 1 : 0) + (areaFilter !== "all" ? 1 : 0);
  const searchNeedle = searchQuery.trim().toLowerCase();
  const searchHits = searchNeedle
    ? [
        ...PROPERTY_SETUP_CARDS.filter((card) => visibleCardIds.includes(card.id)).map((card) => ({
          id: card.id,
          title: card.title,
          hash: card.hash ?? CARD1_HASH,
          hint: card.purpose,
        })),
        ...CARD1_STEPS.filter(
          (step) =>
            permittedCardIds.includes("property-business") &&
            step.title.toLowerCase().includes(searchNeedle),
        ).map((step) => ({
          id: `card1-${step.id}`,
          title: step.title,
          hash: CARD1_HASH,
          hint: "Property & Business",
        })),
      ]
    : [];

  const hubBody = (
    <div className="flex min-h-full flex-col gap-3 bg-[#F7F4EE] p-3 sm:p-4" data-testid="pms-set1-hub">
      <section className="relative w-full min-w-0 rounded-lg border border-[#DDD4C5] bg-white px-2 py-1.5 shadow-sm">
        <div className="flex w-full min-w-0 items-center gap-1.5">
          <SettingsBurger
            active={activeWorkspace}
            onSelect={openSettingsWorkspace}
            allowedIds={permittedCardIds}
            statuses={dashboardStatuses}
          />
          <div className="relative min-w-0 flex-1">
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search settings…"
              aria-label="Search settings"
              className="h-9 min-w-0 w-full text-xs"
            />
            {searchNeedle ? (
              <div
                className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-30 overflow-hidden rounded-md border border-[#DDD4C5] bg-white shadow-md"
                data-testid="settings-search-results"
              >
                {searchHits.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No matching settings.</p>
                ) : (
                  searchHits.map((hit) => (
                    <button
                      key={hit.id}
                      type="button"
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-[#F7F4EE]"
                      onClick={() => {
                        openSettingsWorkspace(hit.hash);
                        setSearchQuery("");
                      }}
                    >
                      <span className="text-sm font-medium text-[#251605]">{hit.title}</span>
                      {hit.hint ? (
                        <span className="line-clamp-1 text-[11px] text-[#756A5B]">{hit.hint}</span>
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
          <PmsFilterMenu
            activeCount={filterCount}
            onClear={() => {
              setStatusFilter("all");
              setAreaFilter("all");
            }}
            buttonTestId="settings-filters-button"
            menuTestId="settings-filters-menu"
          >
            <PmsFilterChoiceRow
              label="Status"
              value={statusFilter}
              current={
                statusFilter === "complete"
                  ? "Ready"
                  : statusFilter === "in_progress"
                    ? "In Progress"
                    : statusFilter === "needs_attention"
                      ? "Needs Attention"
                      : statusFilter === "not_started"
                        ? "Not Started"
                        : ""
              }
              options={[
                ["all", "All statuses"],
                ["complete", "Ready"],
                ["in_progress", "In Progress"],
                ["needs_attention", "Needs Attention"],
                ["not_started", "Not Started"],
              ]}
              onChange={setStatusFilter}
            />
            <PmsFilterChoiceRow
              label="Area"
              value={areaFilter}
              current={PROPERTY_SETUP_CARDS.find((card) => card.id === areaFilter)?.title ?? ""}
              options={[
                ["all", "All areas"],
                ...PROPERTY_SETUP_CARDS.filter((card) => permittedCardIds.includes(card.id)).map(
                  (card) => [card.id, card.title] as const,
                ),
              ]}
              onChange={setAreaFilter}
            />
          </PmsFilterMenu>
          <SettingsSetupProgressPanel
            statuses={dashboardStatuses.filter((_, index) =>
              permittedCardIds.includes(PROPERTY_SETUP_CARDS[index]?.id ?? ""),
            )}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={SHELL_ICON_BUTTON}
            aria-label="Refresh"
            title="Refresh"
            onClick={() => {
              void qc.invalidateQueries({ queryKey: ["pms-set1-foundation", restaurantId] });
              void qc.invalidateQueries({ queryKey: ["pms-card1", restaurantId] });
            }}
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </section>

      {access.isLoading ? (
        <p className="text-sm text-muted-foreground">Checking access…</p>
      ) : access.isError || openCardDenied || sectionDenied ? (
        <PmsAccessDenied
          message={
            access.isError
              ? "Settings access could not be checked. Try again."
              : "Your permissions don't include this settings area."
          }
        />
      ) : card1Open ? (
        card1Query.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading Property & Business…</p>
        ) : card1Query.isError || !card1Query.data ? (
          <p className="text-sm text-destructive">
            {(card1Query.error as Error | undefined)?.message ?? "Property & Business is unavailable."}
          </p>
        ) : (
          <PmsPropertySetupCard1Section
            restaurantId={restaurantId}
            snapshot={card1Query.data.snapshot}
            set2={query.data.set2 ?? emptySet2Snapshot()}
            checklist={checklist}
            canEdit={pmsSettingsCardEditable(accessSnapshot, 1)}
            role={card1Query.data.role}
          />
        )
      ) : card2Open ? (
        <PmsPropertySetupCard2Section
          restaurantId={restaurantId}
          cardStatus={
            card1Query.data
              ? evaluateProgrammeCardStatus(
                  "rooms-inventory",
                  card1Query.data.snapshot.status,
                  evaluateCard1Status(
                    card1Query.data.snapshot.draft,
                    card1Query.data.snapshot.status,
                    card1Query.data.set2,
                  ),
                )
              : "not_started"
          }
          card2Steps={card1Query.data?.snapshot.status.card2Steps ?? {}}
          canEdit={pmsSettingsCardEditable(accessSnapshot, 2)}
        />
      ) : card3Open ? (
        <PmsPropertySetupCard3Section restaurantId={restaurantId} canEdit={pmsSettingsCardEditable(accessSnapshot, 3)} />
      ) : card5Open ? (
        <PmsPropertySetupCard5Section restaurantId={restaurantId} canEdit={pmsSettingsCardEditable(accessSnapshot, 5)} />
      ) : card4Open ? (
        <PmsPropertySetupCard4Section restaurantId={restaurantId} canEdit={pmsSettingsCardEditable(accessSnapshot, 4)} />
      ) : card6Open ? (
        <PmsPropertySetupCard6Section restaurantId={restaurantId} canEdit={pmsSettingsCardEditable(accessSnapshot, 6)} />
      ) : card7Open ? (
        <PmsPropertySetupCard7Section restaurantId={restaurantId} canEdit={pmsSettingsCardEditable(accessSnapshot, 7)} />
      ) : card8Open ? (
        <PmsPropertySetupCard8Section restaurantId={restaurantId} canEdit={pmsSettingsCardEditable(accessSnapshot, 8)} />
      ) : section ? (
        <div className="space-y-4">
          {(SET2_LIVE_HASHES as readonly string[]).includes(section) ? (
            section === "structure" ? (
              <Set2StructureSection
                restaurantId={restaurantId}
                snapshot={set2 ?? emptySet2Snapshot()}
                checklist={checklist}
                canEdit={sectionEditable}
              />
            ) : section === "rooms" ? (
              <Set2RoomsSection
                restaurantId={restaurantId}
                snapshot={set2 ?? emptySet2Snapshot()}
                checklist={checklist}
                canEdit={sectionEditable}
              />
            ) : (
              <Set2OutletsSection
                restaurantId={restaurantId}
                snapshot={set2 ?? emptySet2Snapshot()}
                checklist={checklist}
                canEdit={sectionEditable}
              />
            )
          ) : (SET3_LIVE_HASHES as readonly string[]).includes(section) ? (
            section === "rates" ? (
              <Set3RatesSection
                restaurantId={restaurantId}
                snapshot={set3 ?? emptySet3Snapshot()}
                checklist={checklist}
                canEdit={sectionEditable}
              />
            ) : (
              <Set3GuestSection
                restaurantId={restaurantId}
                snapshot={set3 ?? emptySet3Snapshot()}
                checklist={checklist}
                canEdit={sectionEditable}
              />
            )
          ) : (SET4_LIVE_HASHES as readonly string[]).includes(section) ? (
            section === "housekeeping-rules" ? (
              <Set4HousekeepingSection
                restaurantId={restaurantId}
                snapshot={set4 ?? emptySet4Snapshot()}
                checklist={checklist}
                canEdit={sectionEditable}
              />
            ) : section === "room-inventory-rules" ? (
              <Set4RoomInventorySection
                restaurantId={restaurantId}
                snapshot={set4 ?? emptySet4Snapshot()}
                checklist={checklist}
                canEdit={sectionEditable}
              />
            ) : (
              <Set4MaintenanceSection
                restaurantId={restaurantId}
                snapshot={set4 ?? emptySet4Snapshot()}
                checklist={checklist}
                canEdit={sectionEditable}
              />
            )
          ) : (POLISH1_LIVE_HASHES as readonly string[]).includes(section) ? (
            section === "payment-methods" ? (
              <Polish1PaymentMethodsSection
                restaurantId={restaurantId}
                snapshot={polish1 ?? emptyPolish1Snapshot()}
                checklist={checklist}
                canEdit={sectionEditable}
              />
            ) : (
              <Polish1AdministrationSection
                restaurantId={restaurantId}
                snapshot={polish1 ?? emptyPolish1Snapshot()}
                set5={set5 ?? emptySet5Snapshot()}
                checklist={checklist}
                canEdit={sectionEditable}
              />
            )
          ) : (SET5_LIVE_HASHES as readonly string[]).includes(section) ? (
            section === "departments" ? (
              <Set5DepartmentsSection
                restaurantId={restaurantId}
                snapshot={set5 ?? emptySet5Snapshot()}
                checklist={checklist}
                canEdit={sectionEditable}
              />
            ) : section === "guest-services-types" ? (
              <Set5GuestServicesSection
                restaurantId={restaurantId}
                snapshot={set5 ?? emptySet5Snapshot()}
                checklist={checklist}
                canEdit={sectionEditable}
              />
            ) : section === "notifications" ? (
              <Set5NotificationsSection
                restaurantId={restaurantId}
                snapshot={set5 ?? emptySet5Snapshot()}
                checklist={checklist}
                canEdit={sectionEditable}
              />
            ) : section === "integrations" ? (
              <Set5IntegrationsSection
                restaurantId={restaurantId}
                snapshot={set5 ?? emptySet5Snapshot()}
                checklist={checklist}
                canEdit={sectionEditable}
              />
            ) : (
              <Set5SecuritySection
                restaurantId={restaurantId}
                snapshot={set5 ?? emptySet5Snapshot()}
                checklist={checklist}
                canEdit={sectionEditable}
              />
            )
          ) : (SET6_LIVE_HASHES as readonly string[]).includes(section) ? (
            section === "sales-events" ? (
              <Set6SalesEventsSection
                restaurantId={restaurantId}
                snapshot={set6 ?? emptySet6Snapshot()}
                checklist={checklist}
                canEdit={sectionEditable}
              />
            ) : section === "distribution" ? (
              <Set6DistributionSection
                restaurantId={restaurantId}
                snapshot={set6 ?? emptySet6Snapshot()}
                checklist={checklist}
                canEdit={sectionEditable}
              />
            ) : section === "reports" ? (
              <Set6ReportsSection
                restaurantId={restaurantId}
                snapshot={set6 ?? emptySet6Snapshot()}
                checklist={checklist}
                canEdit={sectionEditable}
              />
            ) : (
              <Set6OfflineSyncSection
                restaurantId={restaurantId}
                snapshot={set6 ?? emptySet6Snapshot()}
                checklist={checklist}
                canEdit={sectionEditable}
              />
            )
          ) : (
            <Set1SectionView
              section={section}
              restaurantId={restaurantId}
              role={role}
              snapshot={snapshot}
              checklist={checklist}
              canEdit={sectionEditable}
              canActivate={Boolean(canActivate) && access.can(PMS_PERMISSIONS.CONFIG_PROPERTY_ACTIVATE)}
            />
          )}
        </div>
      ) : null}
    </div>
  );

  return (
    <SettingsDashboardChrome
      membership={membership}
      contentClassName="p-0"
    >
      {hubBody}
    </SettingsDashboardChrome>
  );
}

function SettingsBurger({
  active,
  onSelect,
  allowedIds,
  statuses,
}: {
  active: string;
  onSelect: (hash: string) => void;
  allowedIds: readonly string[];
  statuses: readonly PropertySetupCardStatus[];
}) {
  const [open, setOpen] = useState(false);
  const items = PROPERTY_SETUP_CARDS.filter((card) => allowedIds.includes(card.id));
  const activeLabel =
    PROPERTY_SETUP_CARDS.find((card) => card.id === active)?.title ?? "Property & Business";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Settings area: ${activeLabel}`}
          title={activeLabel}
          data-testid="settings-nav-trigger"
          className={cn(
            "inline-flex h-8 max-w-[14rem] shrink-0 items-center gap-1.5 rounded-md px-2 text-[#251605]",
            "opacity-80 transition-opacity hover:bg-[#F3EEE4] hover:opacity-100",
            "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]",
            "data-[state=open]:bg-[#F3EEE4] data-[state=open]:opacity-100",
          )}
        >
          <Menu className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate text-xs font-medium">{activeLabel}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-80 p-1.5"
        data-testid="settings-workspace-nav"
        aria-label="Settings"
      >
        <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Settings
        </p>
        <div className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
          {items.map((item) => {
            const isActive = item.id === active;
            const status =
              statuses[PROPERTY_SETUP_CARDS.findIndex((card) => card.id === item.id)] ??
              "not_started";
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`settings-nav-${item.id}`}
                onClick={() => {
                  setOpen(false);
                  onSelect(item.hash);
                }}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                  isActive
                    ? "bg-[#F4E9D0] font-medium text-[#251605]"
                    : "text-foreground hover:bg-[#F7F4EE]",
                )}
              >
                <Check
                  className={cn(
                    "size-3.5 shrink-0 text-[#C89933]",
                    isActive ? "opacity-100" : "opacity-0",
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                    status === "complete" && "bg-emerald-50 text-emerald-800",
                    status === "in_progress" && "bg-amber-50 text-amber-800",
                    status === "not_started" && "bg-[#ECEAE4] text-[#756A5B]",
                  )}
                >
                  {settingsDashboardStatusLabel(status)}
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

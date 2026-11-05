/**
 * PMS Settings hub.
 *
 * This is the only property-setup editor. Do not restore
 * `PmsPropertySetupWorkspace` as a second identity, tax, or policy editor.
 * Rooms stay on Room & Inventory. Rates and Distribution keep their own desks.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  SettingsDashboardChrome,
  SettingsPropertySetupCards,
  SettingsSetupProgressPanel,
} from "@/packages/pms/components/settings/pms-settings-dashboard";

import { Menu, RefreshCw } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { PmsFilterChoiceRow, PmsFilterMenu } from "@/packages/pms/components/pms-filter-menu";
import { SHELL_ICON_BUTTON } from "@/packages/pms/components/reservations/reservation-shell-slots";
import { cn } from "@/shared/lib/utils";
import { PermissionDeniedPanel } from "@/packages/pms/components/frontoffice/coming-soon-panel";
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
  SET1_DENIED,
  SET1_HUB_HREF,
  SET2_LIVE_HASHES,
  SET3_LIVE_HASHES,
  SET4_LIVE_HASHES,
  SET5_LIVE_HASHES,
  SET6_LIVE_HASHES,
  POLISH1_LIVE_HASHES,
  canOpenSet1Hub,
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
  PROPERTY_SETUP_CARDS,
  evaluateCard1Status,
  card1TaxWarnings,
  evaluateProgrammeCardStatus,
  isCard1WorkspaceHash,
  propertySetupStatusLabel,
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
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";

function currentSection(): Set1SectionId | null {
  if (typeof window === "undefined") return null;
  return resolveSet1SectionHash(window.location.hash);
}

function currentCard1Open(): boolean {
  if (typeof window === "undefined") return false;
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

const SETTINGS_BURGER_GROUPS = [
  { id: "overview", label: "Overview", items: [{ id: "overview", title: "Overview", hash: "" }] },
  {
    id: "property",
    label: "Property",
    items: PROPERTY_SETUP_CARDS.filter((card) => card.number <= 2).map((card) => ({
      id: card.id,
      title: card.title,
      hash: card.hash,
    })),
  },
  {
    id: "commercial",
    label: "Commercial",
    items: PROPERTY_SETUP_CARDS.filter((card) => card.number === 3 || card.number === 4).map((card) => ({
      id: card.id,
      title: card.title,
      hash: card.hash,
    })),
  },
  {
    id: "organization",
    label: "Organization",
    items: PROPERTY_SETUP_CARDS.filter((card) => card.number === 5 || card.number === 6).map((card) => ({
      id: card.id,
      title: card.title,
      hash: card.hash,
    })),
  },
  {
    id: "administration",
    label: "Administration",
    items: PROPERTY_SETUP_CARDS.filter((card) => card.number >= 7).map((card) => ({
      id: card.id,
      title: card.title,
      hash: card.hash,
    })),
  },
] as const;

function openSettingsWorkspace(hash: string) {
  if (typeof window === "undefined") return;
  const next = hash ? `${SET1_HUB_HREF}#${hash}` : SET1_HUB_HREF;
  window.history.pushState(null, "", next);
  window.dispatchEvent(new Event("hashchange"));
}

export function PmsSet1Hub({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
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
  const [helpOpen, setHelpOpen] = useState(false);
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

  const query = useQuery({
    queryKey: ["pms-set1-foundation", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
    retry: false,
  });
  const card1Query = useQuery({
    queryKey: ["pms-card1", restaurantId],
    queryFn: () => loadCard1({ data: { restaurantId } }),
    retry: false,
    enabled: canOpenSet1Hub(membership.role),
  });

  if (!canOpenSet1Hub(membership.role)) {
    return <PermissionDeniedPanel message={SET1_DENIED} />;
  }

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading settings…</p>;
  if (query.isError || !query.data) {
    return (
      <p className="text-sm text-destructive">
        {(query.error as Error | undefined)?.message ?? "Settings are unavailable."}
      </p>
    );
  }

  const { snapshot, checklist, canEdit, role, set2, set3, set4, set5, set6, polish1 } = query.data;
  const card1Status = card1Query.data
    ? evaluateCard1Status(
        card1Query.data.snapshot.draft,
        card1Query.data.snapshot.status,
        card1Query.data.set2,
      )
    : "not_started";
  const dashboardStatuses: PropertySetupCardStatus[] = PROPERTY_SETUP_CARDS.map((card) =>
    card1Query.data
      ? evaluateProgrammeCardStatus(card.id, card1Query.data.snapshot.status, card1Status)
      : "not_started",
  );
  const dashboardSummaries = PROPERTY_SETUP_CARDS.map((card) => {
    const rows: string[] = [];
    if (card.number === 1) {
      const name = card1Query.data?.snapshot.draft.name.trim() || membership.restaurant.name;
      if (name) rows.push(name);
      if (card1Query.data && card1TaxWarnings(card1Query.data.snapshot.draft).length > 0) {
        rows.push("Tax identity pending");
      }
    }
    if (card.number === 2 && set2) {
      if (set2.roomTypeCount > 0) rows.push(`${set2.roomTypeCount} room types`);
      if (set2.roomCount > 0) rows.push(`${set2.roomCount} rooms`);
    }
    if (card.number === 3 && set3?.activeRatePlanCount > 0) {
      rows.push(`${set3.activeRatePlanCount} rate plans`);
    }
    if (card.number === 5 && set5?.departments.length) {
      rows.push(`${set5.departments.length} departments`);
    }
    void `${SET1_HUB_HREF}#${card.hash}`;
    return rows;
  });

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
                    : "overview";
  const visibleCardIds = PROPERTY_SETUP_CARDS.filter((card, index) => {
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

  const hubBody = (
    <div className="flex min-h-full flex-col gap-3 bg-[#F7F4EE] p-3 sm:p-4" data-testid="pms-set1-hub">
      <section className="relative w-full min-w-0 rounded-lg border border-[#DDD4C5] bg-white px-2 py-1.5 shadow-sm">
        <div className="flex w-full min-w-0 items-center gap-1.5">
          <SettingsBurger active={activeWorkspace} onSelect={openSettingsWorkspace} />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search settings…"
            aria-label="Search settings"
            className="h-9 min-w-0 flex-1 text-xs"
          />
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
                ...PROPERTY_SETUP_CARDS.map((card) => [card.id, card.title] as const),
              ]}
              onChange={setAreaFilter}
            />
          </PmsFilterMenu>
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
      <SettingsSetupProgressPanel statuses={dashboardStatuses} />

      {card1Open ? (
        card1Query.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading Property & Business…</p>
        ) : card1Query.isError || !card1Query.data ? (
          <p className="text-sm text-destructive">
            {(card1Query.error as Error | undefined)?.message ?? "Card 1 is unavailable."}
          </p>
        ) : (
          <PmsPropertySetupCard1Section
            restaurantId={restaurantId}
            snapshot={card1Query.data.snapshot}
            set2={query.data.set2 ?? emptySet2Snapshot()}
            checklist={checklist}
            canEdit={canEdit}
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
          canEdit={canEdit}
        />
      ) : card3Open ? (
        <PmsPropertySetupCard3Section restaurantId={restaurantId} canEdit={canEdit} />
      ) : card5Open ? (
        <PmsPropertySetupCard5Section restaurantId={restaurantId} canEdit={canEdit} />
      ) : card4Open ? (
        <PmsPropertySetupCard4Section restaurantId={restaurantId} canEdit={canEdit} />
      ) : card6Open ? (
        <PmsPropertySetupCard6Section restaurantId={restaurantId} canEdit={canEdit} />
      ) : card7Open ? (
        <PmsPropertySetupCard7Section restaurantId={restaurantId} canEdit={canEdit} />
      ) : card8Open ? (
        <PmsPropertySetupCard8Section restaurantId={restaurantId} canEdit={canEdit} />
      ) : section ? (
        <div className="space-y-4">
          {(SET2_LIVE_HASHES as readonly string[]).includes(section) ? (
            section === "structure" ? (
              <Set2StructureSection
                restaurantId={restaurantId}
                snapshot={set2 ?? emptySet2Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            ) : section === "rooms" ? (
              <Set2RoomsSection
                restaurantId={restaurantId}
                snapshot={set2 ?? emptySet2Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            ) : (
              <Set2OutletsSection
                restaurantId={restaurantId}
                snapshot={set2 ?? emptySet2Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            )
          ) : (SET3_LIVE_HASHES as readonly string[]).includes(section) ? (
            section === "rates" ? (
              <Set3RatesSection
                restaurantId={restaurantId}
                snapshot={set3 ?? emptySet3Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            ) : (
              <Set3GuestSection
                restaurantId={restaurantId}
                snapshot={set3 ?? emptySet3Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            )
          ) : (SET4_LIVE_HASHES as readonly string[]).includes(section) ? (
            section === "housekeeping-rules" ? (
              <Set4HousekeepingSection
                restaurantId={restaurantId}
                snapshot={set4 ?? emptySet4Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            ) : section === "room-inventory-rules" ? (
              <Set4RoomInventorySection
                restaurantId={restaurantId}
                snapshot={set4 ?? emptySet4Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            ) : (
              <Set4MaintenanceSection
                restaurantId={restaurantId}
                snapshot={set4 ?? emptySet4Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            )
          ) : (POLISH1_LIVE_HASHES as readonly string[]).includes(section) ? (
            section === "payment-methods" ? (
              <Polish1PaymentMethodsSection
                restaurantId={restaurantId}
                snapshot={polish1 ?? emptyPolish1Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            ) : (
              <Polish1AdministrationSection
                restaurantId={restaurantId}
                snapshot={polish1 ?? emptyPolish1Snapshot()}
                set5={set5 ?? emptySet5Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            )
          ) : (SET5_LIVE_HASHES as readonly string[]).includes(section) ? (
            section === "departments" ? (
              <Set5DepartmentsSection
                restaurantId={restaurantId}
                snapshot={set5 ?? emptySet5Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            ) : section === "guest-services-types" ? (
              <Set5GuestServicesSection
                restaurantId={restaurantId}
                snapshot={set5 ?? emptySet5Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            ) : section === "notifications" ? (
              <Set5NotificationsSection
                restaurantId={restaurantId}
                snapshot={set5 ?? emptySet5Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            ) : section === "integrations" ? (
              <Set5IntegrationsSection
                restaurantId={restaurantId}
                snapshot={set5 ?? emptySet5Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            ) : (
              <Set5SecuritySection
                restaurantId={restaurantId}
                snapshot={set5 ?? emptySet5Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            )
          ) : (SET6_LIVE_HASHES as readonly string[]).includes(section) ? (
            section === "sales-events" ? (
              <Set6SalesEventsSection
                restaurantId={restaurantId}
                snapshot={set6 ?? emptySet6Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            ) : section === "distribution" ? (
              <Set6DistributionSection
                restaurantId={restaurantId}
                snapshot={set6 ?? emptySet6Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            ) : section === "reports" ? (
              <Set6ReportsSection
                restaurantId={restaurantId}
                snapshot={set6 ?? emptySet6Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            ) : (
              <Set6OfflineSyncSection
                restaurantId={restaurantId}
                snapshot={set6 ?? emptySet6Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            )
          ) : (
            <Set1SectionView
              section={section}
              restaurantId={restaurantId}
              role={role}
              snapshot={snapshot}
              checklist={checklist}
              canEdit={canEdit}
            />
          )}
        </div>
      ) : (
        <SettingsPropertySetupCards
          statuses={dashboardStatuses}
          summaries={dashboardSummaries}
          visibleIds={visibleCardIds}
        />
      )}
    </div>
  );

  return (
    <SettingsDashboardChrome
      membership={membership}
      helpOpen={helpOpen}
      onHelpOpenChange={setHelpOpen}
      contentClassName="p-0"
    >
      {hubBody}
    </SettingsDashboardChrome>
  );
}

function SettingsBurger({
  active,
  onSelect,
}: {
  active: string;
  onSelect: (hash: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Settings navigation"
          title="Settings navigation"
          data-testid="settings-nav-trigger"
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-[#251605]",
            "opacity-50 transition-opacity hover:bg-[#F3EEE4] hover:opacity-100",
            "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]",
            "data-[state=open]:bg-[#F3EEE4] data-[state=open]:opacity-100",
          )}
        >
          <Menu className="size-4" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-64 p-1.5"
        data-testid="settings-workspace-nav"
        aria-label="Settings"
      >
        <div className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
          {SETTINGS_BURGER_GROUPS.map((group) => (
            <div key={group.id}>
              {group.id === "overview" ? null : (
                <p className="px-2.5 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {group.label}
                </p>
              )}
              {group.items.map((item) => {
                const isActive = item.id === active;
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
                      "flex w-full items-center rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                      isActive
                        ? "bg-[#F4E9D0] font-medium text-[#251605]"
                        : "text-foreground hover:bg-[#F7F4EE]",
                    )}
                  >
                    {item.title}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

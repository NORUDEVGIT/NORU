import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  BedDouble,
  CalendarDays,
  ClipboardList,
  History,
  Menu,
  Scale,
  ShieldAlert,
  Wrench,
} from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { resolvePmsReturnTo } from "@/packages/pms/lib/cashiering-shell";
import { cn } from "@/shared/lib/utils";

import {
  RoomsDashboardTab,
  RoomBoardKpiStrip,
} from "@/packages/pms/components/rooms/rooms-dashboard";
import type { RoomKpiFilter } from "@/packages/pms/components/rooms/room-board-utils";
import {
  RoomInventoryShellProvider,
  type RoomInventoryShellSlots,
} from "@/packages/pms/components/rooms/room-inventory-shell";
import { RoomInventoryChrome } from "@/packages/pms/components/rooms/room-inventory-chrome";
import {
  RoomInventoryAvailabilityView,
  RoomInventoryBlocksView,
  RoomInventoryCalendarView,
} from "@/packages/pms/components/rooms/room-inventory-inventory";
import {
  RoomBulkOperationsView,
  RoomFloorPlanView,
  RoomHistoryAuditView,
  RoomMaintenanceView,
  RoomOfflineSyncView,
  RoomReportsView,
  RoomSnapshotView,
} from "@/packages/pms/components/rooms/room-inventory-more";
import {
  RoomAssignmentEligibilityView,
  RoomInventoryRulesView,
  RoomOverbookingView,
} from "@/packages/pms/components/rooms/room-inventory-rules";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { getRoomsAccess } from "@/packages/pms/lib/rooms.functions";

type RoomInventoryView =
  | "room-board"
  | "availability"
  | "calendar"
  | "blocks"
  | "assignment-eligibility"
  | "inventory-rules"
  | "overbooking"
  | "floor-plan"
  | "maintenance"
  | "bulk-operations"
  | "snapshot"
  | "history-audit"
  | "reports"
  | "offline-sync";

type PrimarySection = "room-board" | "inventory" | "rules" | "more";

interface ViewDefinition {
  id: RoomInventoryView;
  label: string;
  section: PrimarySection;
  description: string;
}

const VIEW_DEFINITIONS: ViewDefinition[] = [
  {
    id: "room-board",
    label: "Room Board",
    section: "room-board",
    description:
      "Live operational view of room status, occupancy, housekeeping readiness and restrictions.",
  },

  {
    id: "availability",
    label: "Availability",
    section: "inventory",
    description:
      "Review room-type availability, sellable capacity, reservations and operational holds.",
  },
  {
    id: "calendar",
    label: "Calendar",
    section: "inventory",
    description: "Review inventory availability and restrictions across dates and room types.",
  },
  {
    id: "blocks",
    label: "Blocks",
    section: "inventory",
    description: "Create and manage dated operational inventory blocks and approval workflows.",
  },

  {
    id: "assignment-eligibility",
    label: "Assignment Eligibility",
    section: "rules",
    description:
      "Evaluate whether a specific room is eligible for a stay and understand blockers and warnings.",
  },
  {
    id: "inventory-rules",
    label: "Inventory Rules",
    section: "rules",
    description:
      "Review the operational effect of the inventory rules configured in Property Setup.",
  },
  {
    id: "overbooking",
    label: "Overbooking",
    section: "rules",
    description:
      "Review overbooking policy and operational limits. Overbooking remains disabled in v1.",
  },

  {
    id: "floor-plan",
    label: "Floor Plan",
    section: "more",
    description:
      "Visual floor-based room operations view for status, selection and daily room control.",
  },
  {
    id: "maintenance",
    label: "Maintenance",
    section: "more",
    description:
      "Log a room issue, start the work, and complete it. Completing a request updates that room's maintenance condition.",
  },
  {
    id: "bulk-operations",
    label: "Bulk Operations",
    section: "more",
    description:
      "Apply approved operational actions to multiple rooms from one controlled workflow.",
  },
  {
    id: "snapshot",
    label: "Snapshot",
    section: "more",
    description:
      "View a point-in-time operational summary of rooms, restrictions and inventory health.",
  },
  {
    id: "history-audit",
    label: "History & Audit",
    section: "more",
    description: "Review immutable Room & Inventory operational events and changes.",
  },
  {
    id: "reports",
    label: "Reports",
    section: "more",
    description: "Review and export operational room and inventory reports.",
  },
  {
    id: "offline-sync",
    label: "Offline & Sync",
    section: "more",
    description: "Review synchronization status and operational continuity indicators.",
  },
];

const INVENTORY_VIEWS: RoomInventoryView[] = ["availability", "calendar", "blocks"];

const RULE_VIEWS: RoomInventoryView[] = [
  "assignment-eligibility",
  "inventory-rules",
  "overbooking",
];

const MORE_VIEWS: RoomInventoryView[] = [
  "floor-plan",
  "maintenance",
  "bulk-operations",
  "snapshot",
  "history-audit",
  "reports",
  "offline-sync",
];

const HIDDEN_MORE_VIEWS = new Set<RoomInventoryView>([
  "floor-plan",
  "bulk-operations",
  "snapshot",
  "reports",
  "offline-sync",
]);

const MORE_VISIBLE_VIEWS: RoomInventoryView[] = MORE_VIEWS.filter(
  (view) => !HIDDEN_MORE_VIEWS.has(view),
);

const VALID_VIEWS = new Set<RoomInventoryView>(VIEW_DEFINITIONS.map((view) => view.id));

function normalizeInitialView(initialTab?: string): RoomInventoryView {
  if (!initialTab) return "room-board";

  if (initialTab === "dashboard") return "room-board";

  if (VALID_VIEWS.has(initialTab as RoomInventoryView)) {
    if (HIDDEN_MORE_VIEWS.has(initialTab as RoomInventoryView)) {
      return "room-board";
    }
    return initialTab as RoomInventoryView;
  }

  return "room-board";
}

function viewDefinition(view: RoomInventoryView): ViewDefinition {
  return VIEW_DEFINITIONS.find((definition) => definition.id === view) ?? VIEW_DEFINITIONS[0]!;
}

const BURGER_GROUPS: Array<{ label: string | null; views: RoomInventoryView[] }> = [
  { label: null, views: ["room-board"] },
  { label: "Inventory", views: INVENTORY_VIEWS },
  { label: "Rules", views: RULE_VIEWS },
  { label: "More", views: MORE_VISIBLE_VIEWS },
];

const BURGER_ICONS: Partial<Record<RoomInventoryView, typeof BedDouble>> = {
  "room-board": BedDouble,
  availability: CalendarDays,
  calendar: CalendarDays,
  blocks: ClipboardList,
  "assignment-eligibility": Scale,
  "inventory-rules": Scale,
  overbooking: ShieldAlert,
  maintenance: Wrench,
  "history-audit": History,
};

export function RoomsWorkspace({
  membership,
  initialTab,
  returnTo,
  returnToLabel,
}: {
  membership: RestaurantMembership;
  initialTab?: string | undefined;
  returnTo?: string | undefined;
  returnToLabel?: string | undefined;
}) {
  const restaurantId = membership.restaurant.id;
  const { hasPrevious, computedLabel, handleReturn } = resolvePmsReturnTo({
    returnTo,
    returnToLabel,
  });

  const [view, setView] = useState<RoomInventoryView>(() => normalizeInitialView(initialTab));
  const [commandSearch, setCommandSearch] = useState("");
  const [kpiFilter, setKpiFilter] = useState<RoomKpiFilter>("all");
  const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null>(null);
  const [shellSlots, setShellSlots] = useState<RoomInventoryShellSlots>({
    controls: null,
    filter: null,
    actions: null,
    cta: null,
  });
  const setControlsSlot = useCallback((node: HTMLDivElement | null) => {
    setShellSlots((current) =>
      current.controls === node ? current : { ...current, controls: node },
    );
  }, []);
  const setFilterSlot = useCallback((node: HTMLDivElement | null) => {
    setShellSlots((current) => (current.filter === node ? current : { ...current, filter: node }));
  }, []);
  const setActionsSlot = useCallback((node: HTMLDivElement | null) => {
    setShellSlots((current) =>
      current.actions === node ? current : { ...current, actions: node },
    );
  }, []);
  const setCtaSlot = useCallback((node: HTMLDivElement | null) => {
    setShellSlots((current) => (current.cta === node ? current : { ...current, cta: node }));
  }, []);

  useEffect(() => {
    setView(normalizeInitialView(initialTab));
  }, [initialTab]);

  const fetchAccess = useServerFn(getRoomsAccess);

  const accessQuery = useQuery({
    queryKey: ["rooms-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });

  if (accessQuery.isLoading) {
    return (
      <div className="px-6 py-10 text-sm text-muted-foreground">Loading Room & Inventory…</div>
    );
  }

  if (!accessQuery.data?.canManage) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl font-semibold">Room & Inventory</h1>

        <p className="mt-2 text-sm text-muted-foreground">
          You do not currently have access to Room & Inventory operations for this property.
        </p>
      </div>
    );
  }

  function selectView(nextView: RoomInventoryView) {
    setView(nextView);
  }

  function renderView() {
    switch (view) {
      case "room-board":
        return (
          <RoomsDashboardTab
            restaurantId={restaurantId}
            commandSearch={commandSearch}
            canConfigure={accessQuery.data?.canConfigure === true}
            canBlockEdit={accessQuery.data?.canBlockEdit === true}
            canManageRestrictions={accessQuery.data?.canRestrictionEdit === true}
            kpiFilter={kpiFilter}
            onKpiFilterChange={setKpiFilter}
          />
        );
      case "availability":
        return (
          <RoomInventoryAvailabilityView
            restaurantId={restaurantId}
            onOpenBlocks={() => selectView("blocks")}
          />
        );
      case "calendar":
        return (
          <RoomInventoryCalendarView
            restaurantId={restaurantId}
            propertyName={membership.restaurant.name}
          />
        );
      case "blocks":
        return (
          <RoomInventoryBlocksView
            restaurantId={restaurantId}
            createPrefill={null}
            canBlockEdit={accessQuery.data?.canBlockEdit === true}
          />
        );
      case "assignment-eligibility":
        return <RoomAssignmentEligibilityView restaurantId={restaurantId} />;
      case "inventory-rules":
        return <RoomInventoryRulesView restaurantId={restaurantId} />;
      case "overbooking":
        return <RoomOverbookingView restaurantId={restaurantId} />;
      case "floor-plan":
        return <RoomFloorPlanView restaurantId={restaurantId} />;
      case "maintenance":
        return <RoomMaintenanceView restaurantId={restaurantId} />;
      case "bulk-operations":
        return <RoomBulkOperationsView onOpenBlocks={() => selectView("blocks")} />;
      case "snapshot":
        return <RoomSnapshotView restaurantId={restaurantId} />;
      case "history-audit":
        return <RoomHistoryAuditView restaurantId={restaurantId} />;
      case "reports":
        return (
          <RoomReportsView
            onOpenAvailability={() => selectView("availability")}
            onOpenBlocks={() => selectView("blocks")}
          />
        );
      case "offline-sync":
        return <RoomOfflineSyncView />;
    }
  }

  return (
    <RoomInventoryChrome
      membership={membership}
      suppressReturnButton
      onRoomSearch={(value) => {
        setCommandSearch(value);
        selectView("room-board");
      }}
    >
      <RoomInventoryShellProvider value={shellSlots}>
        <div className="flex min-h-[calc(100vh-4rem)] flex-col gap-3 bg-[#F7F4EE] p-3 sm:p-4">
          <RoomBoardKpiStrip
            restaurantId={restaurantId}
            activeFilter={kpiFilter}
            onSelectFilter={(filter) => {
              setKpiFilter(filter);
              if (view !== "room-board") selectView("room-board");
            }}
          />
          <section
            ref={setToolbarSlot}
            className="relative flex min-h-12 w-full min-w-0 items-center gap-1.5 rounded-lg border border-[#DDD4C5] bg-white py-1.5 pl-12 pr-2 shadow-sm"
            data-testid="room-inventory-toolbar"
            data-view={view}
          >
            <RoomsBurger active={view} toolbarSlot={toolbarSlot} onSelect={selectView} />
            <div ref={setControlsSlot} className="flex min-w-0 flex-1 items-center gap-1.5" />
            <div className="relative z-10 flex shrink-0 items-center gap-1.5">
              <div ref={setFilterSlot} className="shrink-0 empty:hidden" />
              <div
                ref={setActionsSlot}
                className="flex shrink-0 items-center gap-1.5 empty:hidden"
              />
              <div ref={setCtaSlot} className="flex shrink-0 items-center gap-1.5 empty:hidden" />
            </div>
            {hasPrevious ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleReturn}
                data-testid="rooms-return-to-previous"
                className="h-9 shrink-0 gap-1.5 border-[#DDD4C5] bg-white px-3 text-xs font-semibold text-[#5C5346] hover:bg-[#F7F4EE] hover:text-[#251605]"
              >
                <ArrowLeft className="size-3.5 text-[#8A6A24]" />
                {computedLabel}
              </Button>
            ) : null}
          </section>
          <main className="min-w-0">{renderView()}</main>
        </div>
      </RoomInventoryShellProvider>
    </RoomInventoryChrome>
  );
}

function RoomsBurger({
  active,
  toolbarSlot,
  onSelect,
}: {
  active: RoomInventoryView;
  toolbarSlot: HTMLElement | null;
  onSelect: (view: RoomInventoryView) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = (
    <div
      className={cn(
        "pointer-events-none z-30",
        toolbarSlot ? "absolute left-1 top-1/2 -translate-y-1/2" : "absolute top-3 left-3",
      )}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Rooms and Inventory navigation"
            title="Rooms and Inventory navigation"
            data-testid="room-inventory-nav-trigger"
            className={cn(
              "pointer-events-auto inline-flex size-8 items-center justify-center rounded-md text-[#251605]",
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
          className="pointer-events-auto w-64 p-1.5"
          data-testid="room-inventory-workspace-nav"
          aria-label="Rooms and Inventory"
        >
          <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Rooms & Inventory
          </p>
          <div className="flex flex-col gap-0.5">
            {BURGER_GROUPS.map((group) => (
              <div key={group.label ?? "room-board"} className="flex flex-col gap-0.5">
                {group.label ? (
                  <p className="px-2.5 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {group.label}
                  </p>
                ) : null}
                {group.views.map((item) => {
                  const Icon = BURGER_ICONS[item] ?? BedDouble;
                  const isActive = item === active;
                  return (
                    <button
                      key={item}
                      type="button"
                      data-testid={`room-nav-${item}`}
                      onClick={() => {
                        setOpen(false);
                        onSelect(item);
                      }}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                        isActive
                          ? "bg-[#F4E9D0] font-medium text-[#251605]"
                          : "text-foreground hover:bg-[#F7F4EE]",
                      )}
                    >
                      <Icon className="size-4 shrink-0 text-[#8A6A24]" aria-hidden="true" />
                      <span className="flex-1">{viewDefinition(item).label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
  return toolbarSlot ? createPortal(trigger, toolbarSlot) : trigger;
}

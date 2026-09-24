import { useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown } from "lucide-react";

import { RoomsDashboardTab } from "@/packages/pms/components/rooms/rooms-dashboard";
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
  type AssignmentInspectionPrefill,
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
      "Review room maintenance state and operational impact without replacing the Maintenance domain.",
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

const VALID_VIEWS = new Set<RoomInventoryView>(VIEW_DEFINITIONS.map((view) => view.id));

function normalizeInitialView(initialTab?: string): RoomInventoryView {
  if (!initialTab) return "room-board";

  if (initialTab === "dashboard") return "room-board";

  if (VALID_VIEWS.has(initialTab as RoomInventoryView)) {
    return initialTab as RoomInventoryView;
  }

  return "room-board";
}

function sectionForView(view: RoomInventoryView): PrimarySection {
  return VIEW_DEFINITIONS.find((definition) => definition.id === view)?.section ?? "room-board";
}

function viewDefinition(view: RoomInventoryView): ViewDefinition {
  return VIEW_DEFINITIONS.find((definition) => definition.id === view) ?? VIEW_DEFINITIONS[0]!;
}

function SectionButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "relative flex h-10 items-center gap-1.5 px-2.5 text-xs font-medium transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {children}

      {active ? (
        <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#C89933]" />
      ) : null}
    </button>
  );
}

function SecondaryButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "relative flex h-9 items-center px-2.5 text-xs font-medium transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {children}

      {active ? (
        <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#C89933]" />
      ) : null}
    </button>
  );
}

export function RoomsWorkspace({
  membership,
  initialTab,
}: {
  membership: RestaurantMembership;
  initialTab?: string | undefined;
}) {
  const restaurantId = membership.restaurant.id;

  const [view, setView] = useState<RoomInventoryView>(() => normalizeInitialView(initialTab));

  const [moreOpen, setMoreOpen] = useState(false);
  const [commandSearch, setCommandSearch] = useState("");
  const [assignmentPrefill, setAssignmentPrefill] = useState<AssignmentInspectionPrefill | null>(
    null,
  );

  useEffect(() => {
    setView(normalizeInitialView(initialTab));
  }, [initialTab]);

  const fetchAccess = useServerFn(getRoomsAccess);

  const accessQuery = useQuery({
    queryKey: ["rooms-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });

  const activeSection = sectionForView(view);

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
    setMoreOpen(false);
  }

  function inspectAssignment(prefill: AssignmentInspectionPrefill) {
    setAssignmentPrefill(prefill);
    selectView("assignment-eligibility");
  }

  function renderView() {
    switch (view) {
      case "room-board":
        return (
          <RoomsDashboardTab
            restaurantId={restaurantId}
            commandSearch={commandSearch}
            canConfigure={accessQuery.data?.canConfigure === true}
            onInspectAssignment={(room) =>
              inspectAssignment({ roomId: room.id, roomTypeId: room.roomTypeId })
            }
            onOpenBlocks={() => selectView("blocks")}
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
            onViewAffectedRooms={(search) => {
              setCommandSearch(search);
              selectView("room-board");
            }}
            onEditBlocks={() => selectView("blocks")}
          />
        );
      case "blocks":
        return <RoomInventoryBlocksView restaurantId={restaurantId} />;
      case "assignment-eligibility":
        return (
          <RoomAssignmentEligibilityView restaurantId={restaurantId} prefill={assignmentPrefill} />
        );
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

  function selectPrimary(section: PrimarySection) {
    if (section === "room-board") {
      selectView("room-board");
      return;
    }

    if (section === "inventory") {
      selectView(INVENTORY_VIEWS.includes(view) ? view : "availability");
      return;
    }

    if (section === "rules") {
      selectView(RULE_VIEWS.includes(view) ? view : "assignment-eligibility");
      return;
    }

    setMoreOpen((current) => !current);
  }

  return (
    <RoomInventoryChrome
      membership={membership}
      onRoomSearch={(value) => {
        setCommandSearch(value);
        selectView("room-board");
      }}
    >
      <div className="min-w-0 bg-[#F7F4EE]">
        <div className="border-b border-border bg-background">
          <div className="px-5 pt-4 sm:px-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Operations
            </p>

            <h1 className="mt-0.5 font-display text-2xl font-semibold tracking-tight text-foreground">
              Room & Inventory
            </h1>

            <p className="mt-1 text-sm text-muted-foreground">
              Manage room status, inventory, and operational readiness across your property.
            </p>
          </div>

          <div className="relative mt-3 flex items-end gap-3 px-5 sm:px-6">
            <SectionButton
              active={activeSection === "room-board"}
              onClick={() => selectPrimary("room-board")}
            >
              Room Board
            </SectionButton>

            <SectionButton
              active={activeSection === "inventory"}
              onClick={() => selectPrimary("inventory")}
            >
              Inventory
            </SectionButton>

            <SectionButton
              active={activeSection === "rules"}
              onClick={() => selectPrimary("rules")}
            >
              Rules
            </SectionButton>

            <div className="relative">
              <SectionButton
                active={activeSection === "more"}
                onClick={() => selectPrimary("more")}
              >
                More
                <ChevronDown
                  className={[
                    "h-3.5 w-3.5 transition-transform",
                    moreOpen ? "rotate-180" : "",
                  ].join(" ")}
                />
              </SectionButton>

              {moreOpen ? (
                <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-56 overflow-hidden rounded-xl border border-border bg-popover p-1.5 shadow-xl">
                  {MORE_VIEWS.map((item) => {
                    const definition = viewDefinition(item);
                    const active = view === item;

                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => selectView(item)}
                        className={[
                          "flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition-colors",
                          active
                            ? "bg-muted font-medium text-foreground"
                            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                        ].join(" ")}
                      >
                        {definition.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>

          {activeSection === "inventory" ? (
            <div className="flex items-end gap-1 border-t border-border/60 px-6">
              {INVENTORY_VIEWS.map((item) => (
                <SecondaryButton key={item} active={view === item} onClick={() => selectView(item)}>
                  {viewDefinition(item).label}
                </SecondaryButton>
              ))}
            </div>
          ) : null}

          {activeSection === "rules" ? (
            <div className="flex items-end gap-1 border-t border-border/60 px-6">
              {RULE_VIEWS.map((item) => (
                <SecondaryButton key={item} active={view === item} onClick={() => selectView(item)}>
                  {viewDefinition(item).label}
                </SecondaryButton>
              ))}
            </div>
          ) : null}
        </div>

        <main className="p-3 sm:p-4">{renderView()}</main>
      </div>
    </RoomInventoryChrome>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X } from "lucide-react";

import {
  ReservationStatusBadge,
  formatStayDate,
} from "@/packages/pms/components/bookings/reservation-bits";
import { VipBadge } from "@/packages/pms/components/guests/guest-bits";
import {
  AssignRoomDialog,
  CheckOutDialog,
} from "@/packages/pms/components/frontoffice/front-office-dialogs";
import {
  PmsFilterGroup,
  PmsFilterPopover,
  PmsFilterSelect,
  PmsFilterToggle,
} from "@/packages/pms/components/pms-filter-popover";
import { ReservationShellSlot } from "@/packages/pms/components/reservations/reservation-shell-slots";
import type { FrontOfficeStay } from "@/packages/pms/lib/frontoffice.functions";
import { RESERVATION_STATUSES } from "@/packages/pms/lib/reservation-dates";
import {
  EXCEPTION_CONTROL_EMPTY,
  RESERVATION_EXCEPTION_KEY_LABELS,
  RESERVATION_EXCEPTION_OWNER_LABELS,
  RESERVATION_EXCEPTION_SOURCE_LABELS,
  reservationExceptionActionLabel,
  stayFromExceptionItem,
} from "@/packages/pms/lib/reservation-workspace/exceptions";
import { getReservationExceptions } from "@/packages/pms/lib/reservation-workspace/exceptions.server";
import type {
  ReservationExceptionActionTarget,
  ReservationExceptionItem,
  ReservationExceptionKey,
  ReservationExceptionResponsibleModule,
  ReservationExceptionSeverity,
  ReservationExceptionSourceModule,
} from "@/packages/pms/lib/reservation-workspace/shared-read-models";
import {
  RESERVATION_EXCEPTION_KEYS,
  RESERVATION_EXCEPTION_RESPONSIBLE_MODULES,
  RESERVATION_EXCEPTION_SOURCE_MODULES,
} from "@/packages/pms/lib/reservation-workspace/shared-read-models";
import { Button } from "@/shared/components/ui/button";
import { Sheet, SheetContent } from "@/shared/components/ui/sheet";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";

type FoKind = "assign_room" | "check_out";

/** Choices staged inside the More filters menu; applied with "Apply filters". */
type ExceptionMenuDraft = {
  severity: ReservationExceptionSeverity | "all";
  key: ReservationExceptionKey | "all";
  sourceModule: ReservationExceptionSourceModule | "all";
  responsibleModule: ReservationExceptionResponsibleModule | "all";
  status: (typeof RESERVATION_STATUSES)[number] | "all";
  blockingOnly: boolean;
};

const DEFAULT_MENU_DRAFT: ExceptionMenuDraft = {
  severity: "all",
  key: "all",
  sourceModule: "all",
  responsibleModule: "all",
  status: "all",
  blockingOnly: false,
};

const SEVERITY_OPTIONS: Array<[ExceptionMenuDraft["severity"], string]> = [
  ["all", "All severities"],
  ["high", "Critical"],
  ["standard", "Attention"],
];

type FilterChip = { id: string; label: string; remove: () => void };

function useDesktopOverlay() {
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return desktop;
}

function formatMoney(value: number | null, currency: string): string {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function financialLabel(item: ReservationExceptionItem, currency: string): string {
  if (item.financial.state === "permission_denied") return "Permission denied";
  if (item.financial.state !== "available") return "Coming soon";
  if (item.financial.balance != null) return formatMoney(item.financial.balance, currency);
  if (item.financial.folioId) return "Folio open";
  return "No folio";
}

function itemIdentity(item: ReservationExceptionItem): string {
  return `${item.reservationId ?? "_"}:${item.key}:${item.room?.roomId ?? item.stay.arrivalDate}`;
}

export function ReservationControlWorkspace({
  restaurantId,
  search = "",
  onSearchChange,
  currencyCode,
  canManage,
  onOpenReservation,
  onOpenCalendar,
}: {
  restaurantId: string;
  /** Search text (guest, reservation, room, type, reason). Owned by the parent so the header search can drive it too. */
  search?: string;
  onSearchChange?: (value: string) => void;
  currencyCode: string;
  canManage: boolean;
  onOpenReservation: (reservationId: string) => void;
  onOpenCalendar: () => void;
}) {
  const queryClient = useQueryClient();
  const desktop = useDesktopOverlay();
  const loadExceptions = useServerFn(getReservationExceptions);

  // Applied filters (these drive the query).
  const [severity, setSeverity] = useState<ReservationExceptionSeverity | "all">("all");
  const [key, setKey] = useState<ReservationExceptionKey | "all">("all");
  const [sourceModule, setSourceModule] = useState<ReservationExceptionSourceModule | "all">("all");
  const [responsibleModule, setResponsibleModule] = useState<
    ReservationExceptionResponsibleModule | "all"
  >("all");
  const [status, setStatus] = useState<(typeof RESERVATION_STATUSES)[number] | "all">("all");
  const [blockingOnly, setBlockingOnly] = useState(false);

  // More filters menu state.
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [menuDraft, setMenuDraft] = useState<ExceptionMenuDraft>(DEFAULT_MENU_DRAFT);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [foAction, setFoAction] = useState<{ kind: FoKind; stay: FrontOfficeStay } | null>(null);

  const snapshotQuery = useQuery({
    queryKey: [
      "pms-reservation-exceptions",
      restaurantId,
      severity,
      key,
      sourceModule,
      responsibleModule,
      status,
    ],
    queryFn: () =>
      loadExceptions({
        data: {
          restaurantId,
          severity: severity === "all" ? undefined : severity,
          key: key === "all" ? undefined : key,
          sourceModule: sourceModule === "all" ? undefined : sourceModule,
          responsibleModule: responsibleModule === "all" ? undefined : responsibleModule,
          status: status === "all" ? undefined : status,
        },
      }),
    placeholderData: keepPreviousData,
  });

  const snapshot = snapshotQuery.data;
  const totals = snapshot?.totals;
  const kpis = totals
    ? [
        { id: "total" as const, label: "Total Open", value: totals.total },
        { id: "high" as const, label: "Critical", value: totals.high },
        { id: "standard" as const, label: "Attention", value: totals.standard },
        { id: "blocking" as const, label: "Blocking", value: totals.blocking },
      ]
    : [];

  // Blocking filter + search run on the rows already loaded.
  const items = useMemo(() => {
    const rows = snapshot?.items ?? [];
    const q = search.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (!blockingOnly || row.blocking) &&
        (!q ||
          [
            row.guest.name,
            row.confirmationNumber,
            row.room?.roomNumber,
            row.room?.roomTypeName,
            row.summary,
            RESERVATION_EXCEPTION_KEY_LABELS[row.key],
          ].some((field) => field?.toLowerCase().includes(q))),
    );
  }, [snapshot?.items, blockingOnly, search]);
  const selected = items.find((row) => itemIdentity(row) === selectedId) ?? null;

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["pms-reservation-exceptions", restaurantId] });
  }

  /* More filters menu: choices are staged in `menuDraft` and applied together. */
  function patchMenuDraft(patch: Partial<ExceptionMenuDraft>) {
    setMenuDraft((current) => ({ ...current, ...patch }));
  }

  function applyMenuFilters(next: ExceptionMenuDraft) {
    setSeverity(next.severity);
    setKey(next.key);
    setSourceModule(next.sourceModule);
    setResponsibleModule(next.responsibleModule);
    setStatus(next.status);
    setBlockingOnly(next.blockingOnly);
    setFilterMenuOpen(false);
  }

  function handleFilterMenuOpenChange(open: boolean) {
    setFilterMenuOpen(open);
    if (open) {
      setMenuDraft({ severity, key, sourceModule, responsibleModule, status, blockingOnly });
    }
  }

  const filterChips: FilterChip[] = [];
  if (severity !== "all") {
    filterChips.push({
      id: "severity",
      label: severity === "high" ? "Critical" : "Attention",
      remove: () => setSeverity("all"),
    });
  }
  if (key !== "all") {
    filterChips.push({
      id: "key",
      label: RESERVATION_EXCEPTION_KEY_LABELS[key],
      remove: () => setKey("all"),
    });
  }
  if (sourceModule !== "all") {
    filterChips.push({
      id: "source",
      label: `Source: ${RESERVATION_EXCEPTION_SOURCE_LABELS[sourceModule]}`,
      remove: () => setSourceModule("all"),
    });
  }
  if (responsibleModule !== "all") {
    filterChips.push({
      id: "owner",
      label: `Owner: ${RESERVATION_EXCEPTION_OWNER_LABELS[responsibleModule]}`,
      remove: () => setResponsibleModule("all"),
    });
  }
  if (status !== "all") {
    filterChips.push({
      id: "status",
      label: status.replaceAll("_", " "),
      remove: () => setStatus("all"),
    });
  }
  if (blockingOnly) {
    filterChips.push({
      id: "blocking",
      label: "Blocking only",
      remove: () => setBlockingOnly(false),
    });
  }

  function selectItem(item: ReservationExceptionItem) {
    setSelectedId(itemIdentity(item));
    setMobileOpen(true);
  }

  function launchTarget(item: ReservationExceptionItem, target: ReservationExceptionActionTarget) {
    if (target === "open_housekeeping") return;
    if (target === "open_room_rack") {
      onOpenCalendar();
      return;
    }
    const stay = stayFromExceptionItem(item);
    if (target === "assign_room" && stay && canManage) {
      setFoAction({ kind: "assign_room", stay });
      return;
    }
    if (target === "check_out" && stay && canManage) {
      setFoAction({ kind: "check_out", stay });
      return;
    }
    if (item.reservationId) onOpenReservation(item.reservationId);
  }

  return (
    <div className="space-y-3" data-testid="reservation-control-workspace">
      {snapshot?.warnings.length ? (
        <p className="text-xs text-amber-800">
          {snapshot.warnings.includes("financial_signals_unavailable")
            ? "Financial exceptions are omitted because folio signals are unavailable. "
            : null}
          {snapshot.truncated
            ? "This queue is truncated. Search only covers the rows loaded. "
            : null}
          {snapshot.warnings.includes("blocks_unavailable")
            ? "Inventory blocks could not be loaded. "
            : null}
        </p>
      ) : null}

      <ReservationShellSlot name="filter">
          <PmsFilterPopover
            title="Filter Exceptions"
            activeCount={filterChips.length}
            open={filterMenuOpen}
            onOpenChange={handleFilterMenuOpenChange}
            onClear={() => applyMenuFilters(DEFAULT_MENU_DRAFT)}
            onApply={() => applyMenuFilters(menuDraft)}
          >
            <PmsFilterGroup
              title="Severity"
              summary={
                menuDraft.severity === "all"
                  ? undefined
                  : SEVERITY_OPTIONS.find(([id]) => id === menuDraft.severity)?.[1]
              }
              defaultOpen={menuDraft.severity !== "all"}
            >
              <PmsFilterSelect
                value={menuDraft.severity}
                onValueChange={(value) =>
                  patchMenuDraft({ severity: value as ExceptionMenuDraft["severity"] })
                }
                options={SEVERITY_OPTIONS}
                ariaLabel="Severity"
              />
            </PmsFilterGroup>
            <PmsFilterGroup
              title="Exception type"
              summary={
                menuDraft.key === "all" ? undefined : RESERVATION_EXCEPTION_KEY_LABELS[menuDraft.key]
              }
              defaultOpen={menuDraft.key !== "all"}
            >
              <PmsFilterSelect
                value={menuDraft.key}
                onValueChange={(value) =>
                  patchMenuDraft({ key: value as ExceptionMenuDraft["key"] })
                }
                options={[
                  ["all", "All types"],
                  ...RESERVATION_EXCEPTION_KEYS.map(
                    (value) => [value, RESERVATION_EXCEPTION_KEY_LABELS[value]] as const,
                  ),
                ]}
                ariaLabel="Exception type"
              />
            </PmsFilterGroup>
            <PmsFilterGroup
              title="Source"
              summary={
                menuDraft.sourceModule === "all"
                  ? undefined
                  : RESERVATION_EXCEPTION_SOURCE_LABELS[menuDraft.sourceModule]
              }
              defaultOpen={menuDraft.sourceModule !== "all"}
            >
              <PmsFilterSelect
                value={menuDraft.sourceModule}
                onValueChange={(value) =>
                  patchMenuDraft({ sourceModule: value as ExceptionMenuDraft["sourceModule"] })
                }
                options={[
                  ["all", "All sources"],
                  ...RESERVATION_EXCEPTION_SOURCE_MODULES.map(
                    (value) => [value, RESERVATION_EXCEPTION_SOURCE_LABELS[value]] as const,
                  ),
                ]}
                ariaLabel="Source"
              />
            </PmsFilterGroup>
            <PmsFilterGroup
              title="Owner"
              summary={
                menuDraft.responsibleModule === "all"
                  ? undefined
                  : RESERVATION_EXCEPTION_OWNER_LABELS[menuDraft.responsibleModule]
              }
              defaultOpen={menuDraft.responsibleModule !== "all"}
            >
              <PmsFilterSelect
                value={menuDraft.responsibleModule}
                onValueChange={(value) =>
                  patchMenuDraft({
                    responsibleModule: value as ExceptionMenuDraft["responsibleModule"],
                  })
                }
                options={[
                  ["all", "All owners"],
                  ...RESERVATION_EXCEPTION_RESPONSIBLE_MODULES.map(
                    (value) => [value, RESERVATION_EXCEPTION_OWNER_LABELS[value]] as const,
                  ),
                ]}
                ariaLabel="Owner"
              />
            </PmsFilterGroup>
            <PmsFilterGroup
              title="Reservation status"
              summary={menuDraft.status === "all" ? undefined : menuDraft.status.replaceAll("_", " ")}
              defaultOpen={menuDraft.status !== "all"}
            >
              <PmsFilterSelect
                value={menuDraft.status}
                onValueChange={(value) =>
                  patchMenuDraft({ status: value as ExceptionMenuDraft["status"] })
                }
                options={[
                  ["all", "All statuses"],
                  ...RESERVATION_STATUSES.map(
                    (value) => [value, value.replaceAll("_", " ")] as const,
                  ),
                ]}
                ariaLabel="Reservation status"
              />
            </PmsFilterGroup>
            <PmsFilterGroup
              title="Blocking"
              summary={menuDraft.blockingOnly ? "Blocking only" : undefined}
              defaultOpen={menuDraft.blockingOnly}
            >
              <PmsFilterToggle
                label="Blocking exceptions only"
                checked={menuDraft.blockingOnly}
                onChange={(blockingOnly) => patchMenuDraft({ blockingOnly })}
              />
            </PmsFilterGroup>
          </PmsFilterPopover>
      </ReservationShellSlot>

      {filterChips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <ul className="flex flex-wrap gap-2" data-testid="exception-filter-chips">
            {filterChips.map((chip) => (
              <li key={chip.id}>
                <button
                  type="button"
                  aria-label={`Remove filter ${chip.label}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#c9a24a] bg-[#f5ead0] py-0.5 pl-3 pr-2 text-xs font-bold text-[#4a2c1a]"
                  onClick={chip.remove}
                >
                  {chip.label}
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              applyMenuFilters(DEFAULT_MENU_DRAFT);
              onSearchChange?.("");
            }}
          >
            Clear all
          </Button>
        </div>
      ) : null}

      <div
        className={cn(
          "grid min-w-0 gap-3",
          selected && "xl:grid-cols-[minmax(0,1fr)_300px]",
        )}
      >
        <section className="min-w-0 overflow-hidden rounded-xl border border-[#DDD4C5] bg-white shadow-sm">
          {snapshotQuery.isError ? (
            <div className="space-y-2 p-4">
              <p className="text-sm text-destructive">
                {snapshotQuery.error instanceof Error
                  ? snapshotQuery.error.message
                  : "Could not load exceptions."}
              </p>
              <Button variant="outline" size="sm" onClick={() => void snapshotQuery.refetch()}>
                Retry
              </Button>
            </div>
          ) : snapshotQuery.isLoading && !snapshot ? (
            <div className="space-y-2 p-4" aria-label="Loading exceptions">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {search.trim() ? "No exceptions match your search." : EXCEPTION_CONTROL_EMPTY}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-[#F7F4EE] text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Guest</th>
                    <th className="px-3 py-2">Reservation</th>
                    <th className="px-3 py-2">Stay</th>
                    <th className="px-3 py-2">Room</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const id = itemIdentity(item);
                    return (
                      <tr
                        key={id}
                        className={cn(
                          "cursor-pointer border-t border-[#EEE6D8] hover:bg-[#F7F4EE]",
                          selectedId === id && "bg-[#F4E9D0]/60",
                        )}
                        onClick={() => selectItem(item)}
                      >
                        <td className="px-3 py-2 font-medium">
                          {RESERVATION_EXCEPTION_KEY_LABELS[item.key]}
                        </td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-1">
                            {item.guest.name}
                            {item.guest.vip ? <VipBadge /> : null}
                          </span>
                        </td>
                        <td className="px-3 py-2 tabular-nums">{item.confirmationNumber ?? "—"}</td>
                        <td className="px-3 py-2">
                          {formatStayDate(item.stay.arrivalDate)} –{" "}
                          {formatStayDate(item.stay.departureDate)}
                        </td>
                        <td className="px-3 py-2">{item.room?.roomNumber ?? "Unassigned"}</td>
                        <td className="px-3 py-2">
                          {item.stay.status ? (
                            <ReservationStatusBadge status={item.stay.status} />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {RESERVATION_EXCEPTION_OWNER_LABELS[item.responsibleModule]}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {selected ? (
          <aside className="relative hidden min-w-0 xl:block">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 z-10 size-7"
              aria-label="Close exception details"
              onClick={() => setSelectedId(null)}
            >
              <X className="size-4" />
            </Button>
            <ExceptionDrawer
              item={selected}
              currencyCode={currencyCode}
              canManage={canManage}
              onOpenReservation={onOpenReservation}
              onLaunch={launchTarget}
            />
          </aside>
        ) : null}
      </div>

      <div className="xl:hidden">
        <Sheet open={!desktop && mobileOpen && selected !== null} onOpenChange={setMobileOpen}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
            <ExceptionDrawer
              item={selected}
              currencyCode={currencyCode}
              canManage={canManage}
              onOpenReservation={onOpenReservation}
              onLaunch={launchTarget}
            />
          </SheetContent>
        </Sheet>
      </div>

      {foAction?.kind === "assign_room" ? (
        <AssignRoomDialog
          restaurantId={restaurantId}
          stay={foAction.stay}
          open
          onOpenChange={(open) => {
            if (!open) {
              setFoAction(null);
              invalidate();
            }
          }}
        />
      ) : null}
      {foAction?.kind === "check_out" ? (
        <CheckOutDialog
          restaurantId={restaurantId}
          stay={foAction.stay}
          open
          onOpenChange={(open) => {
            if (!open) {
              setFoAction(null);
              invalidate();
            }
          }}
        />
      ) : null}
    </div>
  );
}

function ExceptionDrawer({
  item,
  currencyCode,
  canManage,
  onOpenReservation,
  onLaunch,
}: {
  item: ReservationExceptionItem | null;
  currencyCode: string;
  canManage: boolean;
  onOpenReservation: (reservationId: string) => void;
  onLaunch: (item: ReservationExceptionItem, target: ReservationExceptionActionTarget) => void;
}) {
  if (!item) {
    return (
      <div
        className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
        data-testid="exception-quick-view"
      >
        <p className="text-sm text-muted-foreground">
          Select an exception to inspect stay, room and owner actions.
        </p>
      </div>
    );
  }

  const actionLabel = reservationExceptionActionLabel(item.actionTarget);
  const canPrimary =
    item.actionTarget === "open_housekeeping" ||
    item.actionTarget === "open_room_rack" ||
    Boolean(item.reservationId);

  return (
    <div
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="exception-quick-view"
    >
      <p className="flex items-center gap-2 font-display text-lg">
        {item.guest.name}
        {item.guest.vip ? <VipBadge /> : null}
      </p>
      <p className="text-xs text-muted-foreground">
        {item.confirmationNumber ?? "Property exception"}
      </p>
      <dl className="mt-3 space-y-2 text-sm">
        <Field label="Type" value={RESERVATION_EXCEPTION_KEY_LABELS[item.key]} />
        <Field
          label="Severity"
          value={`${item.severity === "high" ? "Critical" : "Attention"}${item.blocking ? " · Blocking" : ""}`}
        />
        <Field label="Reason" value={item.summary} />
        <Field label="Source" value={RESERVATION_EXCEPTION_SOURCE_LABELS[item.sourceModule]} />
        <Field label="Owner" value={RESERVATION_EXCEPTION_OWNER_LABELS[item.responsibleModule]} />
        <Field
          label="Status"
          value={item.stay.status ? item.stay.status.replaceAll("_", " ") : "—"}
        />
        <Field
          label="Stay"
          value={`${formatStayDate(item.stay.arrivalDate)} – ${formatStayDate(item.stay.departureDate)}`}
        />
        <Field label="Room" value={item.room?.roomNumber ?? "Unassigned"} />
        <Field label="Room type" value={item.room?.roomTypeName ?? "—"} />
        <Field label="Financial" value={financialLabel(item, currencyCode)} />
        <Field
          label="Deposit"
          value={
            item.financial.state !== "available"
              ? financialLabel(item, currencyCode)
              : item.financial.depositWaived
                ? "Waived"
                : item.financial.depositPosted == null
                  ? "—"
                  : formatMoney(item.financial.depositPosted, currencyCode)
          }
        />
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        {canPrimary && item.actionTarget === "open_housekeeping" ? (
          <Button size="sm" asChild>
            <Link to="/restaurant/pms/housekeeping">Open Housekeeping</Link>
          </Button>
        ) : canPrimary ? (
          <Button
            size="sm"
            disabled={
              (item.actionTarget === "assign_room" || item.actionTarget === "check_out") &&
              !canManage
            }
            onClick={() => onLaunch(item, item.actionTarget)}
          >
            {actionLabel}
          </Button>
        ) : null}
        {item.reservationId ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onOpenReservation(item.reservationId as string)}
          >
            Open Reservation
          </Button>
        ) : null}
        {item.guest.id ? (
          <Button size="sm" variant="outline" asChild>
            <Link to="/restaurant/pms/guests/$guestId" params={{ guestId: item.guest.id }}>
              Guest Profile
            </Link>
          </Button>
        ) : null}
        {item.financial.state === "available" && item.reservationId ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onOpenReservation(item.reservationId as string)}
          >
            Open Folio
          </Button>
        ) : null}
        {item.reservationId ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onOpenReservation(item.reservationId as string)}
          >
            History
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

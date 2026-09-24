import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Ban, ShieldAlert, TriangleAlert } from "lucide-react";

import { ReservationStatusBadge, formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { VipBadge } from "@/packages/pms/components/guests/guest-bits";
import {
  AssignRoomDialog,
  CheckOutDialog,
} from "@/packages/pms/components/frontoffice/front-office-dialogs";
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
  currencyCode,
  canManage,
  onOpenReservation,
  onOpenCalendar,
}: {
  restaurantId: string;
  currencyCode: string;
  canManage: boolean;
  onOpenReservation: (reservationId: string) => void;
  onOpenCalendar: () => void;
}) {
  const queryClient = useQueryClient();
  const desktop = useDesktopOverlay();
  const loadExceptions = useServerFn(getReservationExceptions);

  const [severity, setSeverity] = useState<ReservationExceptionSeverity | "all">("all");
  const [key, setKey] = useState<ReservationExceptionKey | "all">("all");
  const [sourceModule, setSourceModule] = useState<ReservationExceptionSourceModule | "all">("all");
  const [responsibleModule, setResponsibleModule] = useState<
    ReservationExceptionResponsibleModule | "all"
  >("all");
  const [status, setStatus] = useState<(typeof RESERVATION_STATUSES)[number] | "all">("all");
  const [blockingOnly, setBlockingOnly] = useState(false);
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
  const items = useMemo(() => {
    const rows = snapshot?.items ?? [];
    return blockingOnly ? rows.filter((row) => row.blocking) : rows;
  }, [snapshot?.items, blockingOnly]);
  const selected = items.find((row) => itemIdentity(row) === selectedId) ?? null;

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["pms-reservation-exceptions", restaurantId] });
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

  const totals = snapshot?.totals;
  const kpis = totals
    ? [
        { id: "total" as const, label: "Total Open", value: totals.total, icon: <AlertTriangle className="size-4" /> },
        { id: "high" as const, label: "Critical", value: totals.high, icon: <ShieldAlert className="size-4" /> },
        { id: "standard" as const, label: "Attention", value: totals.standard, icon: <TriangleAlert className="size-4" /> },
        { id: "blocking" as const, label: "Blocking", value: totals.blocking, icon: <Ban className="size-4" /> },
      ]
    : [];

  return (
    <div className="space-y-4" data-testid="reservation-control-workspace">
      <p className="text-xs text-muted-foreground">
        Business date {snapshot?.businessDate ?? "—"} · derived from current Front Office state. Rows
        clear only when the underlying issue is fixed.
      </p>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Exception totals">
        {snapshotQuery.isLoading && !snapshot
          ? Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-20 rounded-xl" />)
          : kpis.map((kpi) => (
              <button
                key={kpi.id}
                type="button"
                className="text-left"
                onClick={() => {
                  setBlockingOnly(kpi.id === "blocking");
                  setSeverity(kpi.id === "high" ? "high" : kpi.id === "standard" ? "standard" : "all");
                }}
              >
                <KpiCard label={kpi.label} value={kpi.value} icon={kpi.icon} />
              </button>
            ))}
      </section>

      {snapshot?.warnings.length ? (
        <p className="text-xs text-amber-800">
          {snapshot.warnings.includes("financial_signals_unavailable")
            ? "Financial exceptions are omitted because folio signals are unavailable. "
            : null}
          {snapshot.truncated ? "This queue is truncated. " : null}
          {snapshot.warnings.includes("blocks_unavailable") ? "Inventory blocks could not be loaded. " : null}
        </p>
      ) : null}

      <section className="rounded-xl border border-[#DDD4C5] bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <FilterSelect
            label="Severity"
            value={severity}
            onChange={(value) => setSeverity(value as typeof severity)}
            options={[
              ["all", "All severities"],
              ["high", "Critical"],
              ["standard", "Attention"],
            ]}
          />
          <FilterSelect
            label="Exception type"
            value={key}
            onChange={(value) => setKey(value as typeof key)}
            options={[
              ["all", "All types"],
              ...RESERVATION_EXCEPTION_KEYS.map(
                (value) => [value, RESERVATION_EXCEPTION_KEY_LABELS[value]] as [string, string],
              ),
            ]}
          />
          <FilterSelect
            label="Source"
            value={sourceModule}
            onChange={(value) => setSourceModule(value as typeof sourceModule)}
            options={[
              ["all", "All sources"],
              ...RESERVATION_EXCEPTION_SOURCE_MODULES.map(
                (value) => [value, RESERVATION_EXCEPTION_SOURCE_LABELS[value]] as [string, string],
              ),
            ]}
          />
          <FilterSelect
            label="Owner"
            value={responsibleModule}
            onChange={(value) => setResponsibleModule(value as typeof responsibleModule)}
            options={[
              ["all", "All owners"],
              ...RESERVATION_EXCEPTION_RESPONSIBLE_MODULES.map(
                (value) => [value, RESERVATION_EXCEPTION_OWNER_LABELS[value]] as [string, string],
              ),
            ]}
          />
          <FilterSelect
            label="Reservation status"
            value={status}
            onChange={(value) => setStatus(value as typeof status)}
            options={[
              ["all", "All statuses"],
              ...RESERVATION_STATUSES.map(
                (value) => [value, value.replaceAll("_", " ")] as [string, string],
              ),
            ]}
          />
        </div>
      </section>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
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
            <p className="p-6 text-sm text-muted-foreground">{EXCEPTION_CONTROL_EMPTY}</p>
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
                          {formatStayDate(item.stay.arrivalDate)} – {formatStayDate(item.stay.departureDate)}
                        </td>
                        <td className="px-3 py-2">{item.room?.roomNumber ?? "Unassigned"}</td>
                        <td className="px-3 py-2">
                          {item.stay.status ? <ReservationStatusBadge status={item.stay.status} /> : "—"}
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

        <aside className="hidden min-w-0 xl:block">
          <ExceptionDrawer
            item={selected}
            currencyCode={currencyCode}
            canManage={canManage}
            onOpenReservation={onOpenReservation}
            onLaunch={launchTarget}
          />
        </aside>
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
      <div className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm" data-testid="exception-quick-view">
        <p className="text-sm text-muted-foreground">Select an exception to inspect stay, room and owner actions.</p>
      </div>
    );
  }

  const actionLabel = reservationExceptionActionLabel(item.actionTarget);
  const canPrimary =
    item.actionTarget === "open_housekeeping" ||
    item.actionTarget === "open_room_rack" ||
    Boolean(item.reservationId);

  return (
    <div className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm" data-testid="exception-quick-view">
      <p className="flex items-center gap-2 font-display text-lg">
        {item.guest.name}
        {item.guest.vip ? <VipBadge /> : null}
      </p>
      <p className="text-xs text-muted-foreground">{item.confirmationNumber ?? "Property exception"}</p>
      <dl className="mt-3 space-y-2 text-sm">
        <Field label="Type" value={RESERVATION_EXCEPTION_KEY_LABELS[item.key]} />
        <Field
          label="Severity"
          value={`${item.severity === "high" ? "Critical" : "Attention"}${item.blocking ? " · Blocking" : ""}`}
        />
        <Field label="Reason" value={item.summary} />
        <Field label="Source" value={RESERVATION_EXCEPTION_SOURCE_LABELS[item.sourceModule]} />
        <Field label="Owner" value={RESERVATION_EXCEPTION_OWNER_LABELS[item.responsibleModule]} />
        <Field label="Status" value={item.stay.status ? item.stay.status.replaceAll("_", " ") : "—"} />
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
              (item.actionTarget === "assign_room" || item.actionTarget === "check_out") && !canManage
            }
            onClick={() => onLaunch(item, item.actionTarget)}
          >
            {actionLabel}
          </Button>
        ) : null}
        {item.reservationId ? (
          <Button size="sm" variant="outline" onClick={() => onOpenReservation(item.reservationId as string)}>
            Open Reservation
          </Button>
        ) : null}
        {item.guest.id ? (
          <Button size="sm" variant="outline" asChild>
            <Link to="/restaurant/pms/reservations/guests/$guestId" params={{ guestId: item.guest.id }}>
              Guest Profile
            </Link>
          </Button>
        ) : null}
        {item.financial.state === "available" && item.reservationId ? (
          <Button size="sm" variant="outline" onClick={() => onOpenReservation(item.reservationId as string)}>
            Open Folio
          </Button>
        ) : null}
        {item.reservationId ? (
          <Button size="sm" variant="ghost" onClick={() => onOpenReservation(item.reservationId as string)}>
            History
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
      {label}
      <select
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function KpiCard({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="rounded-xl border border-[#DDD4C5] bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2 text-muted-foreground">
        <p className="text-[11px] font-medium uppercase tracking-wide">{label}</p>
        {icon}
      </div>
      <p className="mt-1 font-display text-xl tabular-nums">{value}</p>
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

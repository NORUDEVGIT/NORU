import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";

import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { ReservationStatusBadge, formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { ArrivalQuickViewSheet } from "@/packages/pms/components/frontoffice/arrival-quick-view";
import {
  AssignRoomDialog,
  CheckInDialog,
} from "@/packages/pms/components/frontoffice/front-office-dialogs";
import { ExpectedArrivalDialog } from "@/packages/pms/components/workspaces/arrivals-departures-dialogs";
import { FO_ARRIVAL_EXCEPTION_LABELS } from "@/packages/pms/lib/fo-arrival";
import {
  listFrontOfficeArrivalsDesk,
  type FoArrivalDeskRow,
  type FoArrivalQuickView,
} from "@/packages/pms/lib/fo-arrival.functions";
import { getBookingsAccess } from "@/packages/pms/lib/reservations.functions";
import type { ArrivalRow } from "@/packages/pms/lib/reservation-workspace/shared-read-models";
import { usePropertyBusinessDate } from "@/packages/pms/lib/use-property-business-date";
import { useRestaurantTimezone } from "@/packages/restaurant-management/state/restaurant-context";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { PageHeading } from "@/core/state/pms-context";
import { cn } from "@/shared/lib/utils";

const ALL = "all";

export type ArrivalsVariant = "arrivals" | "checkin" | "assignment";

function etaRowFromQv(qv: FoArrivalQuickView): ArrivalRow {
  return {
    reservationId: qv.stay.id,
    confirmationNumber: qv.stay.confirmationNumber,
    guest: {
      id: qv.stay.guestId,
      name: qv.guest.fullName,
      vip: qv.guest.vip,
      phone: qv.guest.phone,
      email: qv.guest.email,
    },
    stay: {
      arrivalDate: qv.stay.arrivalDate,
      departureDate: qv.stay.departureDate,
      nights: qv.stay.nights,
      adults: qv.stay.adults,
      children: qv.stay.children,
      status: qv.stay.status,
    },
    room: {
      roomTypeId: qv.stay.roomTypeId,
      roomTypeName: qv.stay.roomTypeName,
      roomId: qv.stay.roomId,
      roomNumber: qv.stay.roomNumber,
      assigned: qv.room.assigned,
      housekeepingStatus: qv.room.housekeepingStatus,
      operationalStatus: qv.room.status,
      ready: qv.room.ready,
    },
    commercial: { source: qv.stay.source ?? null, guaranteeMethod: qv.stay.guaranteeMethod ?? null },
    financial: {
      state: qv.financial.lane === "live" ? "available" : qv.financial.lane === "permission_denied" ? "permission_denied" : "not_available",
      folioId: qv.financial.folioId,
      balance: null,
      depositPosted: qv.financial.depositPosted,
      depositWaived: qv.financial.depositWaived,
    },
    operational: {
      specialRequests: qv.stay.specialRequests,
      unassigned: !qv.room.assigned,
      walkInIncomplete: qv.stay.walkInIncomplete === true,
      expectedArrivalTime: qv.eta.expectedArrivalAt,
      exceptionKeys: qv.exceptions
        .map((item) => item.key)
        .filter((key) =>
          ["unassigned", "room_not_ready", "room_unavailable", "payment_issue", "special_request"].includes(key),
        ) as ArrivalRow["operational"]["exceptionKeys"],
    },
    hints: {
      canOpen: true,
      canAssignRoom: qv.hints.canAssignRoom,
      canCheckIn: qv.hints.canCheckIn,
      canUpdateEta: qv.hints.canUpdateEta,
      canViewGuest: qv.hints.canViewGuest,
      canOpenFolio: qv.hints.canOpenFolio,
    },
  };
}

function depositLabel(row: FoArrivalDeskRow): string {
  if (row.financialLane === "permission_denied") return "Permission denied";
  if (row.financialLane !== "live") return "—";
  if (row.depositWaived) return "Waived";
  if (row.depositPosted != null && row.depositPosted > 0) return "Posted";
  if (row.hints.needsDeposit || row.exceptionKeys.includes("payment_issue")) return "Required";
  return "—";
}

function readinessLabel(row: FoArrivalDeskRow): string {
  if (!row.assigned) return "Unassigned";
  return row.roomReady ? "Ready" : "Not ready";
}

export function ArrivalsWorkspace({
  membership,
  variant = "arrivals",
  embedded = false,
}: {
  membership: RestaurantMembership;
  variant?: ArrivalsVariant;
  embedded?: boolean;
}) {
  const restaurantId = membership.restaurant.id;
  const timezone = useRestaurantTimezone();
  const today = usePropertyBusinessDate(restaurantId, timezone);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [date, setDate] = useState(today);
  useEffect(() => {
    setDate(today);
  }, [today]);
  const [status, setStatus] = useState(variant === "checkin" ? "confirmed" : ALL);
  const [assignment, setAssignment] = useState(variant === "assignment" ? "unassigned" : ALL);
  const [search, setSearch] = useState("");
  const [vip, setVip] = useState(ALL);
  const [readiness, setReadiness] = useState(ALL);
  const [roomType, setRoomType] = useState(ALL);
  const [blocker, setBlocker] = useState(ALL);
  const [qvId, setQvId] = useState<string | null>(null);
  const [checkIn, setCheckIn] = useState<FoArrivalQuickView | null>(null);
  const [assignStay, setAssignStay] = useState<FoArrivalDeskRow["stay"] | null>(null);
  const [etaQv, setEtaQv] = useState<FoArrivalQuickView | null>(null);
  const [checkInStep, setCheckInStep] = useState<"stay" | "registration" | "deposit">("stay");

  const fetchAccess = useServerFn(getBookingsAccess);
  const fetchDesk = useServerFn(listFrontOfficeArrivalsDesk);

  const accessQuery = useQuery({
    queryKey: ["bookings-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const canManage = accessQuery.data?.canManage ?? false;

  const deskQuery = useQuery({
    queryKey: ["front-office", "arrivals-desk", restaurantId, date, status, assignment],
    queryFn: () =>
      fetchDesk({
        data: {
          restaurantId,
          date,
          ...(status !== ALL ? { status: status as "pending" | "confirmed" } : {}),
          ...(assignment !== ALL ? { assignment: assignment as "assigned" | "unassigned" } : {}),
        },
      }),
    enabled: canManage,
  });

  const rows = deskQuery.data?.rows ?? [];
  const roomTypes = useMemo(
    () => [...new Map(rows.map((row) => [row.stay.roomTypeId, row.stay.roomTypeName])).entries()],
    [rows],
  );

  const visible = rows.filter((row) => {
    const term = search.trim().toLowerCase();
    if (term) {
      const hay = [
        row.stay.guestName,
        row.stay.confirmationNumber,
        row.stay.roomNumber,
        row.stay.guestPhone,
        row.stay.guestEmail,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(term)) return false;
    }
    if (vip === "vip" && !row.stay.guestVip) return false;
    if (readiness === "ready" && !row.roomReady) return false;
    if (readiness === "not_ready" && (row.roomReady || !row.assigned)) return false;
    if (readiness === "unassigned" && row.assigned) return false;
    if (roomType !== ALL && row.stay.roomTypeId !== roomType) return false;
    if (blocker === "blocker" && !row.hints.hasBlockingException) return false;
    return true;
  });

  function refreshDesk() {
    void queryClient.invalidateQueries({ queryKey: ["front-office", "arrivals-desk", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["fo-arrival-qv", restaurantId] });
  }

  if (accessQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading arrivals…</p>;
  if (!canManage) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        {embedded ? null : (
          <h1 className="font-display text-2xl">
            <PageHeading fallback="Arrivals" />
          </h1>
        )}
        <p className="mt-2 text-sm text-muted-foreground">
          Only owners and managers can access Front Office for this property.
        </p>
      </div>
    );
  }

  const emptyText =
    variant === "checkin"
      ? "No arrivals are waiting to be checked in for this date."
      : variant === "assignment"
        ? "Every arrival for this date already has a room."
        : "No arrivals for this date.";

  return (
    <div className="space-y-6" data-testid="fo-arrivals-workspace">
      {embedded ? (
        <p className="text-sm text-muted-foreground">
          Reservations arriving on {formatStayDate(date)} at {membership.restaurant.name}.
        </p>
      ) : (
        <div>
          <h1 className="font-display text-2xl">
            <PageHeading fallback="Arrivals" />
          </h1>
          <p className="text-sm text-muted-foreground">
            Reservations arriving on {formatStayDate(date)} at {membership.restaurant.name}.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Input type="date" className="w-44" value={date} onChange={(e) => setDate(e.target.value)} />
        <Input
          className="w-56"
          placeholder="Search guest, confirmation, room"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search arrivals"
        />
        {variant === "checkin" ? null : (
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        )}
        {variant === "assignment" ? null : (
          <Select value={assignment} onValueChange={setAssignment}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Room assignment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any assignment</SelectItem>
              <SelectItem value="assigned">Room assigned</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Select value={readiness} onValueChange={setReadiness}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Readiness" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any readiness</SelectItem>
            <SelectItem value="ready">Ready</SelectItem>
            <SelectItem value="not_ready">Not ready</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
          </SelectContent>
        </Select>
        <Select value={vip} onValueChange={setVip}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="VIP" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any guest</SelectItem>
            <SelectItem value="vip">VIP</SelectItem>
          </SelectContent>
        </Select>
        {roomTypes.length > 0 ? (
          <Select value={roomType} onValueChange={setRoomType}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Room type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All room types</SelectItem>
              {roomTypes.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Select value={blocker} onValueChange={setBlocker}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Exceptions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any exception</SelectItem>
            <SelectItem value="blocker">Has blocker</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {deskQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading arrivals…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {rows.length === 0 ? emptyText : "No arrivals match these filters."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Guest</th>
                <th className="px-3 py-2 font-medium">Confirmation</th>
                <th className="px-3 py-2 font-medium">Stay</th>
                <th className="px-3 py-2 font-medium">Room</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">ETA</th>
                <th className="px-3 py-2 font-medium">Ready</th>
                <th className="px-3 py-2 font-medium">Deposit</th>
                <th className="px-3 py-2 font-medium">Flags</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={row.stay.id}
                  className={cn("cursor-pointer border-b border-border last:border-0 hover:bg-muted/40")}
                  onClick={() => setQvId(row.stay.id)}
                >
                  <td className="px-3 py-2">
                    <p className="font-medium">
                      {row.stay.guestName}
                      {row.stay.guestVip ? " · VIP" : ""}
                    </p>
                  </td>
                  <td className="px-3 py-2">{row.stay.confirmationNumber}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {formatStayDate(row.stay.arrivalDate)} → {formatStayDate(row.stay.departureDate)}
                  </td>
                  <td className="px-3 py-2">
                    {row.stay.roomTypeName}
                    <span className="block text-xs text-muted-foreground">
                      {row.stay.roomNumber ? `Room ${row.stay.roomNumber}` : "Unassigned"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <ReservationStatusBadge status={row.stay.status} />
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {row.etaLabel
                      ? `${row.etaLabel}${row.etaTiming ? ` · ${row.etaTiming.replace("_", " ")}` : ""}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">{readinessLabel(row)}</td>
                  <td className="px-3 py-2 text-xs">{depositLabel(row)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {row.exceptionKeys.slice(0, 3).map((key) => (
                        <span key={key} className="rounded-full bg-[#F4E9D0] px-2 py-0.5 text-[10px] text-[#251605]">
                          {FO_ARRIVAL_EXCEPTION_LABELS[key]}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ArrivalQuickViewSheet
        restaurantId={restaurantId}
        reservationId={qvId}
        open={Boolean(qvId) && !checkIn}
        onOpenChange={(open) => {
          if (!open) setQvId(null);
        }}
        onAssign={(qv) => {
          setQvId(null);
          setAssignStay(qv.stay);
        }}
        onEta={(qv) => {
          setQvId(null);
          setEtaQv(qv);
        }}
        onRegister={(qv) => {
          setQvId(null);
          setCheckInStep("registration");
          setCheckIn(qv);
        }}
        onCheckIn={(qv) => {
          setQvId(null);
          setCheckInStep(qv.hints.needsDeposit && qv.registration.complete ? "deposit" : "stay");
          setCheckIn(qv);
        }}
        onOpenFolio={() => {
          void navigate({ to: "/restaurant/pms/cashiering", search: { tab: "folios" } });
        }}
      />

      {assignStay ? (
        <AssignRoomDialog
          restaurantId={restaurantId}
          stay={assignStay}
          open
          onOpenChange={(v) => {
            if (!v) {
              setAssignStay(null);
              refreshDesk();
            }
          }}
        />
      ) : null}
      {checkIn ? (
        <CheckInDialog
          restaurantId={restaurantId}
          stay={checkIn.stay}
          open
          initialStep={checkInStep}
          onOpenChange={(v) => {
            if (!v) {
              setCheckIn(null);
              refreshDesk();
            }
          }}
        />
      ) : null}
      <ExpectedArrivalDialog
        restaurantId={restaurantId}
        timezone={timezone}
        row={etaQv ? etaRowFromQv(etaQv) : null}
        open={Boolean(etaQv)}
        onOpenChange={(open) => {
          if (!open) setEtaQv(null);
        }}
        onSaved={() => {
          setEtaQv(null);
          refreshDesk();
        }}
      />
    </div>
  );
}

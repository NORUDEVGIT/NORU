import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";

import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { DepartureQuickViewSheet, type DepartureQuickViewAction } from "@/packages/pms/components/frontoffice/departure-quick-view";
import { CheckOutDialog, StayDatesDialog } from "@/packages/pms/components/frontoffice/front-office-dialogs";
import { LateCheckoutDialog } from "@/packages/pms/components/workspaces/arrivals-departures-dialogs";
import { FO_DEPARTURE_EXCEPTION_LABELS } from "@/packages/pms/lib/fo-departure";
import {
  listFrontOfficeDeparturesDesk,
  type FoDepartureDeskRow,
  type FoDepartureQuickView,
} from "@/packages/pms/lib/fo-departure.functions";
import { getBookingsAccess } from "@/packages/pms/lib/reservations.functions";
import { GUEST_PROFILE_DETAIL_PATH } from "@/packages/pms/lib/guest-profile-wave1";
import type { DepartureRow } from "@/packages/pms/lib/reservation-workspace/shared-read-models";
import { usePropertyBusinessDate } from "@/packages/pms/lib/use-property-business-date";
import { useMoney, useRestaurantTimezone } from "@/packages/restaurant-management/state/restaurant-context";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { PageHeading } from "@/core/state/pms-context";
import { cn } from "@/shared/lib/utils";

const ALL = "all";

function lateRowFromQv(qv: FoDepartureQuickView): DepartureRow {
  return {
    reservationId: qv.stay.id,
    confirmationNumber: qv.stay.confirmationNumber,
    guest: { id: qv.stay.guestId, name: qv.guest.fullName, vip: qv.guest.vip },
    stay: {
      arrivalDate: qv.stay.arrivalDate,
      departureDate: qv.stay.departureDate,
      status: qv.stay.status,
      inHouse: qv.stay.status === "checked_in",
      overstay: qv.stay.overstay,
    },
    room: {
      roomTypeId: qv.stay.roomTypeId,
      roomTypeName: qv.stay.roomTypeName,
      roomId: qv.stay.roomId,
      roomNumber: qv.stay.roomNumber,
      housekeepingStatus: qv.room.housekeepingStatus,
      operationalStatus: qv.room.status,
    },
    financial: {
      state: qv.financial.lane === "live" ? "available" : qv.financial.lane === "permission_denied" ? "permission_denied" : "not_available",
      folioId: qv.financial.folioId,
      balance: qv.financial.balance,
      depositPosted: null,
      depositWaived: null,
    },
    operational: {
      specialRequests: qv.stay.specialRequests,
      lateCheckout: {
        granted: qv.lateCheckout.granted,
        until: qv.lateCheckout.until,
        note: qv.lateCheckout.note,
        policy: qv.lateCheckout.policy,
      },
      exceptionKeys: qv.stay.overstay ? ["overstay"] : [],
    },
    hints: {
      canOpen: true,
      canCheckOut: qv.hints.canCheckOut,
      canExtendStay: qv.hints.canAmendStay,
      canGrantLateCheckout: qv.hints.canSetLateCheckout,
      canOpenFolio: qv.hints.canOpenFolio,
    },
  };
}

function folioLabel(row: FoDepartureDeskRow, money: (n: number) => string): string {
  if (row.financialLane === "permission_denied") return "Permission denied";
  if (row.financialLane !== "live") return "—";
  if (row.folioNumber) {
    return row.balance == null ? row.folioNumber : `${row.folioNumber} · ${money(row.balance)}`;
  }
  return row.folioId ? "Open" : "Missing";
}

function readinessLabel(row: FoDepartureDeskRow): string {
  if (row.stay.status !== "checked_in") return "Not in-house";
  if (row.readiness.needsSettlement) return "Needs settlement";
  if (row.readiness.missingFolio) return "Folio required";
  if (row.readiness.hasBlockingException) return "Blocked";
  if (row.readiness.canCheckOut) return "Ready";
  return "Review";
}

function timingLabel(row: FoDepartureDeskRow): string {
  if (row.timing === "overdue") return "Overdue";
  if (row.timing === "late_checkout") return "Late CO";
  return "Due";
}

export function DeparturesWorkspace({
  membership,
  embedded = false,
}: {
  membership: RestaurantMembership;
  embedded?: boolean;
}) {
  const restaurantId = membership.restaurant.id;
  const timezone = useRestaurantTimezone();
  const today = usePropertyBusinessDate(restaurantId, timezone);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const money = useMoney();

  const [search, setSearch] = useState("");
  const [vip, setVip] = useState(ALL);
  const [roomType, setRoomType] = useState(ALL);
  const [late, setLate] = useState(ALL);
  const [blocker, setBlocker] = useState(ALL);
  const [overdue, setOverdue] = useState(ALL);
  const [qvId, setQvId] = useState<string | null>(null);
  const [datesStay, setDatesStay] = useState<FoDepartureDeskRow["stay"] | null>(null);
  const [checkOutStay, setCheckOutStay] = useState<FoDepartureDeskRow["stay"] | null>(null);
  const [lateQv, setLateQv] = useState<FoDepartureQuickView | null>(null);

  const fetchAccess = useServerFn(getBookingsAccess);
  const fetchDesk = useServerFn(listFrontOfficeDeparturesDesk);

  const accessQuery = useQuery({
    queryKey: ["bookings-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const canManage = accessQuery.data?.canManage ?? false;

  const deskQuery = useQuery({
    queryKey: ["front-office", "departures-desk", restaurantId, today],
    queryFn: () => fetchDesk({ data: { restaurantId, date: today } }),
    enabled: canManage,
    retry: false,
  });

  const rows = deskQuery.data?.rows ?? [];
  const roomTypes = useMemo(
    () => [...new Map(rows.map((row) => [row.stay.roomTypeId, row.stay.roomTypeName])).entries()],
    [rows],
  );

  const visible = rows.filter((row) => {
    const term = search.trim().toLowerCase();
    if (term) {
      const hay = [row.stay.guestName, row.stay.confirmationNumber, row.stay.roomNumber, row.stay.roomTypeName]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(term)) return false;
    }
    if (vip === "vip" && !row.stay.guestVip) return false;
    if (roomType !== ALL && row.stay.roomTypeId !== roomType) return false;
    if (late === "late" && !row.stay.lateCheckoutGranted) return false;
    if (blocker === "blocker" && !row.readiness.hasBlockingException) return false;
    if (overdue === "overdue" && row.timing !== "overdue") return false;
    return true;
  });

  function refreshDesk() {
    void queryClient.invalidateQueries({ queryKey: ["front-office"] });
    void queryClient.invalidateQueries({ queryKey: ["reservations"] });
    void queryClient.invalidateQueries({ queryKey: ["reservation"] });
    void queryClient.invalidateQueries({ queryKey: ["reservation-folio"] });
  }

  function closeOverlays() {
    setQvId(null);
  }

  function onAction(action: DepartureQuickViewAction, qv: FoDepartureQuickView) {
    if (action === "open_guest") {
      void navigate({ to: GUEST_PROFILE_DETAIL_PATH, params: { guestId: qv.stay.guestId } });
      return;
    }
    if (action === "open_folio") {
      closeOverlays();
      void navigate({ to: "/restaurant/pms/cashiering", search: { tab: "folios" } });
      return;
    }
    closeOverlays();
    if (action === "amend_stay") setDatesStay(qv.stay);
    if (action === "late_checkout") setLateQv(qv);
    if (action === "check_out") setCheckOutStay(qv.stay);
  }

  return (
    <div className="space-y-4">
      {embedded ? null : (
        <PageHeading
          kicker="Front Office"
          title="Departures"
          description={`Checked-in stays due to depart at ${membership.restaurant.name}.`}
        />
      )}
      {embedded ? (
        <p className="text-sm text-muted-foreground">
          {deskQuery.isSuccess
            ? `${rows.length} checked-in departure${rows.length === 1 ? "" : "s"} for ${formatStayDate(today)}.`
            : "Checked-in stays due to depart."}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Input
          className="w-56"
          placeholder="Search guest, confirmation, room"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search departures"
        />
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
        <Select value={vip} onValueChange={setVip}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="VIP" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any guest</SelectItem>
            <SelectItem value="vip">VIP</SelectItem>
          </SelectContent>
        </Select>
        <Select value={late} onValueChange={setLate}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Late checkout" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any checkout</SelectItem>
            <SelectItem value="late">Late checkout</SelectItem>
          </SelectContent>
        </Select>
        <Select value={blocker} onValueChange={setBlocker}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Exceptions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any exception</SelectItem>
            <SelectItem value="blocker">Has blocker</SelectItem>
          </SelectContent>
        </Select>
        <Select value={overdue} onValueChange={setOverdue}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Overdue" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any timing</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!canManage && accessQuery.isSuccess ? (
        <p className="text-sm text-muted-foreground">You do not have permission to manage departures.</p>
      ) : deskQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading departures…</p>
      ) : deskQuery.isError ? (
        <div className="space-y-2 text-sm">
          <p className="text-destructive">
            {deskQuery.error instanceof Error ? deskQuery.error.message : "Could not load departures."}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void deskQuery.refetch()}>
            Retry
          </Button>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {rows.length === 0 ? "No checked-in departures for this date." : "No departures match these filters."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Guest</th>
                <th className="px-3 py-2 font-medium">Confirmation</th>
                <th className="px-3 py-2 font-medium">Room</th>
                <th className="px-3 py-2 font-medium">Stay</th>
                <th className="px-3 py-2 font-medium">Late CO</th>
                <th className="px-3 py-2 font-medium">Folio</th>
                <th className="px-3 py-2 font-medium">Readiness</th>
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
                  <td className="px-3 py-2">
                    {row.stay.roomNumber ? `Room ${row.stay.roomNumber}` : "Unassigned"}
                    <span className="block text-xs text-muted-foreground">{row.stay.roomTypeName}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {formatStayDate(row.stay.arrivalDate)} → {formatStayDate(row.stay.departureDate)}
                    <span className="block">
                      {row.stay.nights} night{row.stay.nights === 1 ? "" : "s"} · {timingLabel(row)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">{row.stay.lateCheckoutGranted ? "Granted" : "—"}</td>
                  <td className="px-3 py-2 text-xs">{folioLabel(row, money)}</td>
                  <td className="px-3 py-2 text-xs">{readinessLabel(row)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {row.exceptionKeys.slice(0, 3).map((key) => (
                        <span key={key} className="rounded-full bg-[#F4E9D0] px-2 py-0.5 text-[10px] text-[#251605]">
                          {FO_DEPARTURE_EXCEPTION_LABELS[key]}
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

      <DepartureQuickViewSheet
        restaurantId={restaurantId}
        reservationId={qvId}
        open={Boolean(qvId) && !datesStay && !checkOutStay && !lateQv}
        onOpenChange={(open) => {
          if (!open) setQvId(null);
        }}
        onAction={onAction}
      />

      {datesStay ? (
        <StayDatesDialog
          restaurantId={restaurantId}
          stay={datesStay}
          open
          onOpenChange={(open) => {
            if (!open) {
              setDatesStay(null);
              refreshDesk();
            }
          }}
        />
      ) : null}
      {checkOutStay ? (
        <CheckOutDialog
          restaurantId={restaurantId}
          stay={checkOutStay}
          open
          onOpenChange={(open) => {
            if (!open) {
              setCheckOutStay(null);
              refreshDesk();
            }
          }}
        />
      ) : null}
      <LateCheckoutDialog
        restaurantId={restaurantId}
        timezone={timezone}
        row={lateQv ? lateRowFromQv(lateQv) : null}
        open={Boolean(lateQv)}
        onOpenChange={(open) => {
          if (!open) setLateQv(null);
        }}
        onSaved={() => {
          setLateQv(null);
          refreshDesk();
        }}
      />
    </div>
  );
}

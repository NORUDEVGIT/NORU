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
import { ReservationStatusBadge, formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { WalkInQuickViewSheet } from "@/packages/pms/components/frontoffice/walk-in-quick-view";
import {
  AssignRoomDialog,
  CheckInDialog,
  StayDatesDialog,
  WalkInDialog,
} from "@/packages/pms/components/frontoffice/front-office-dialogs";
import { FoCancelStepper } from "@/packages/pms/components/frontoffice/fo-cancel-stepper";
import { WalkInsHistoryFrame } from "@/packages/pms/components/frontoffice/walk-ins-history-frame";
import { FO_WALKIN_EXCEPTION_LABELS, type FoWalkInActionId } from "@/packages/pms/lib/fo-walkin";
import {
  listFrontOfficeWalkInsDesk,
  type FoWalkInDeskRow,
  type FoWalkInQuickView,
} from "@/packages/pms/lib/fo-walkin.functions";
import { getBookingsAccess } from "@/packages/pms/lib/reservations.functions";
import { GUEST_PROFILE_DETAIL_PATH } from "@/packages/pms/lib/guest-profile-wave1";
import { usePropertyBusinessDate } from "@/packages/pms/lib/use-property-business-date";
import { useMoney, useRestaurantTimezone } from "@/packages/restaurant-management/state/restaurant-context";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { PageHeading } from "@/core/state/pms-context";
import { cn } from "@/shared/lib/utils";

const ALL = "all";

function readinessLabel(row: FoWalkInDeskRow): string {
  if (row.stay.status === "checked_in") return "In-house";
  if (row.walkInIncomplete) return "Check-in incomplete";
  if (row.readiness.canComplete) return "Ready to check in";
  if (!row.assigned) return "Unassigned";
  if (!row.roomReady) return "Room not ready";
  return "Needs check-in";
}

export function WalkInsWorkspace({
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
  const [status, setStatus] = useState(ALL);
  const [openCreate, setOpenCreate] = useState(false);
  const [qvId, setQvId] = useState<string | null>(null);
  const [assignStay, setAssignStay] = useState<FoWalkInDeskRow["stay"] | null>(null);
  const [checkInStay, setCheckInStay] = useState<FoWalkInDeskRow["stay"] | null>(null);
  const [datesStay, setDatesStay] = useState<FoWalkInDeskRow["stay"] | null>(null);
  const [cancelStay, setCancelStay] = useState<FoWalkInDeskRow["stay"] | null>(null);

  const fetchAccess = useServerFn(getBookingsAccess);
  const fetchDesk = useServerFn(listFrontOfficeWalkInsDesk);

  const accessQuery = useQuery({
    queryKey: ["bookings-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const canManage = accessQuery.data?.canManage ?? false;

  const deskQuery = useQuery({
    queryKey: ["front-office", "walkins-desk", restaurantId, today],
    queryFn: () => fetchDesk({ data: { restaurantId, date: today } }),
    enabled: canManage,
    retry: false,
  });

  const rows = deskQuery.data?.rows ?? [];
  const visible = useMemo(() => {
    return rows.filter((row) => {
      const term = search.trim().toLowerCase();
      if (term) {
        const hay = [row.stay.guestName, row.stay.confirmationNumber, row.stay.roomNumber, row.stay.roomTypeName]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (status === "incomplete" && !row.walkInIncomplete) return false;
      if (status === "confirmed" && row.stay.status !== "confirmed") return false;
      if (status === "checked_in" && row.stay.status !== "checked_in") return false;
      return true;
    });
  }, [rows, search, status]);

  function refreshDesk() {
    void queryClient.invalidateQueries({ queryKey: ["front-office"] });
    void queryClient.invalidateQueries({ queryKey: ["fo-walk-ins"] });
    void queryClient.invalidateQueries({ queryKey: ["reservations"] });
  }

  function onAction(action: FoWalkInActionId, qv: FoWalkInQuickView) {
    if (action === "open_reservation") {
      void navigate({ to: "/restaurant/pms/reservations/$reservationId", params: { reservationId: qv.stay.id } });
      return;
    }
    if (action === "open_guest") {
      void navigate({ to: GUEST_PROFILE_DETAIL_PATH, params: { guestId: qv.stay.guestId } });
      return;
    }
    if (action === "open_folio") {
      setQvId(null);
      void navigate({ to: "/restaurant/pms/cashiering", search: { tab: "folios" } });
      return;
    }
    setQvId(null);
    if (action === "assign") setAssignStay(qv.stay);
    if (action === "check_in") setCheckInStay(qv.stay);
    if (action === "amend_stay") setDatesStay(qv.stay);
    if (action === "cancel") setCancelStay(qv.stay);
  }

  return (
    <div className="space-y-4">
      {embedded ? null : (
        <PageHeading
          kicker="Front Office"
          title="Walk-ins"
          description={`Walk-in stays created at ${membership.restaurant.name}.`}
        />
      )}
      {embedded ? (
        <p className="text-sm text-muted-foreground">
          Create today&apos;s stay, then finish registration, deposit and key.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => setOpenCreate(true)}>
          Walk-in
        </Button>
        <Input
          className="w-56"
          placeholder="Search guest, confirmation, room"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search walk-ins"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            <SelectItem value="incomplete">Check-in incomplete</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="checked_in">In-house</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!canManage && accessQuery.isSuccess ? (
        <p className="text-sm text-muted-foreground">You do not have permission to manage walk-ins.</p>
      ) : deskQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading walk-ins…</p>
      ) : deskQuery.isError ? (
        <div className="space-y-2 text-sm">
          <p className="text-destructive">
            {deskQuery.error instanceof Error ? deskQuery.error.message : "Could not load walk-ins."}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void deskQuery.refetch()}>
            Retry
          </Button>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {rows.length === 0 ? "No operational walk-ins for this date." : "No walk-ins match these filters."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Guest</th>
                <th className="px-3 py-2 font-medium">Confirmation</th>
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="px-3 py-2 font-medium">Stay</th>
                <th className="px-3 py-2 font-medium">Room</th>
                <th className="px-3 py-2 font-medium">Status</th>
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
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat("en-GB", {
                      timeZone: timezone,
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(row.createdAt))}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {formatStayDate(row.stay.arrivalDate)} → {formatStayDate(row.stay.departureDate)}
                    <span className="block">{row.stay.roomTypeName}</span>
                  </td>
                  <td className="px-3 py-2">
                    {row.stay.roomNumber ? `Room ${row.stay.roomNumber}` : "Unassigned"}
                    <span className="block text-xs text-muted-foreground">
                      {row.ratePlanName ? `${row.ratePlanName}${row.roomSubtotal != null ? ` · ${money(row.roomSubtotal)}` : ""}` : "walk_in"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <ReservationStatusBadge status={row.stay.status} />
                    <span className="mt-1 block text-[10px] uppercase tracking-wide text-muted-foreground">walk_in</span>
                  </td>
                  <td className="px-3 py-2 text-xs">{readinessLabel(row)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {row.exceptionKeys.slice(0, 3).map((key) => (
                        <span key={key} className="rounded-full bg-[#F4E9D0] px-2 py-0.5 text-[10px] text-[#251605]">
                          {FO_WALKIN_EXCEPTION_LABELS[key]}
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

      <WalkInsHistoryFrame restaurantId={restaurantId} today={today} />

      <WalkInQuickViewSheet
        restaurantId={restaurantId}
        reservationId={qvId}
        open={Boolean(qvId) && !assignStay && !checkInStay && !datesStay && !cancelStay}
        onOpenChange={(open) => {
          if (!open) setQvId(null);
        }}
        onAction={onAction}
      />

      <WalkInDialog
        restaurantId={restaurantId}
        today={today}
        open={openCreate}
        onOpenChange={setOpenCreate}
        onCreated={(stay) => {
          refreshDesk();
          setCheckInStay(stay);
        }}
      />
      {assignStay ? (
        <AssignRoomDialog
          restaurantId={restaurantId}
          stay={assignStay}
          open
          onOpenChange={(open) => {
            if (!open) {
              setAssignStay(null);
              refreshDesk();
            }
          }}
        />
      ) : null}
      {checkInStay ? (
        <CheckInDialog
          restaurantId={restaurantId}
          stay={checkInStay}
          open
          initialStep="registration"
          onOpenChange={(open) => {
            if (!open) {
              setCheckInStay(null);
              refreshDesk();
            }
          }}
        />
      ) : null}
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
      {cancelStay ? (
        <FoCancelStepper
          restaurantId={restaurantId}
          stay={cancelStay}
          open
          onOpenChange={(open) => {
            if (!open) {
              setCancelStay(null);
              refreshDesk();
            }
          }}
        />
      ) : null}
    </div>
  );
}

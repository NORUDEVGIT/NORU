import { useEffect, useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarPlus, Search } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { ReservationStatusBadge, formatStayDate } from "@/components/bookings/reservation-bits";
import { ReservationAmendmentsTab } from "@/components/bookings/reservation-amendments";
import { ReservationCancellationsTab } from "@/components/bookings/reservation-cancellations";
import { FoundationPanel } from "@/components/pms/foundation-panel";
import { getBookingsAccess, listReservations } from "@/lib/reservations.functions";
import type { ReservationStatus } from "@/lib/reservation-dates";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { PageHeading, NonPmsOnly } from "@/core/state/pms-context";

const ALL = "all";
const TABS = ["individual", "group", "corporate", "amendments", "cancellations"] as const;
type ReservationsTabKey = (typeof TABS)[number];
const PAGE_SIZE = 25;

export function ReservationsWorkspace({
  membership,
  initialTab,
}: {
  membership: RestaurantMembership;
  initialTab?: string | undefined;
}) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();

  const fetchAccess = useServerFn(getBookingsAccess);
  const fetchReservations = useServerFn(listReservations);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(ALL);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<ReservationsTabKey>("individual");

  useEffect(() => {
    // "list" is the pre-patch tab name; keep old links working.
    const normalised = initialTab === "list" ? "individual" : initialTab;
    if (normalised && (TABS as readonly string[]).includes(normalised)) {
      setTab(normalised as ReservationsTabKey);
    }
  }, [initialTab]);

  const accessQuery = useQuery({
    queryKey: ["bookings-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const canManage = accessQuery.data?.canManage ?? false;

  const listQuery = useQuery({
    queryKey: ["reservations", restaurantId, search, status, fromDate, toDate, page],
    queryFn: () =>
      fetchReservations({
        data: {
          restaurantId,
          page,
          pageSize: PAGE_SIZE,
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(status !== ALL ? { status: status as ReservationStatus } : {}),
          ...(fromDate ? { fromDate } : {}),
          ...(toDate ? { toDate } : {}),
        },
      }),
    enabled: canManage,
  });

  function open(id: string) {
    void navigate({ to: "/restaurant/pms/reservations/$reservationId", params: { reservationId: id } });
  }

  if (accessQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading reservations…</p>;
  if (!canManage) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl"><PageHeading fallback="Reservations" /></h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only owners and managers can access reservations for this property.
        </p>
      </div>
    );
  }

  const rows = listQuery.data?.rows ?? [];
  const total = listQuery.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl"><PageHeading fallback="Reservations" /></h1>
          <p className="text-sm text-muted-foreground">
            {total} reservation{total === 1 ? "" : "s"} for {membership.restaurant.name}.
          </p>
        </div>
        <Button asChild>
          <Link to="/restaurant/bookings/new">
            <CalendarPlus className="size-4 sm:mr-2" />
            <span className="hidden sm:inline">New reservation</span>
          </Link>
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ReservationsTabKey)}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="individual">Individual</TabsTrigger>
          <TabsTrigger value="group">Group</TabsTrigger>
          <TabsTrigger value="corporate">Corporate</TabsTrigger>
          <TabsTrigger value="amendments">Amendments</TabsTrigger>
          <TabsTrigger value="cancellations">Cancellations</TabsTrigger>
        </TabsList>

        <TabsContent value="individual" className="mt-4 space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-56 flex-1">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search confirmation number or guest"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                  />
                </div>
                <Select
                  value={status}
                  onValueChange={(v) => {
                    setStatus(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Staying from
                  <Input
                    type="date"
                    className="w-40"
                    value={fromDate}
                    onChange={(e) => {
                      setFromDate(e.target.value);
                      setPage(1);
                    }}
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  to
                  <Input
                    type="date"
                    className="w-40"
                    value={toDate}
                    onChange={(e) => {
                      setToDate(e.target.value);
                      setPage(1);
                    }}
                  />
                </label>
              </div>

              {listQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading reservations…</p>
              ) : rows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  No reservations match this view yet.
                </div>
              ) : (
                <>
                  <div className="hidden overflow-hidden rounded-2xl border border-border md:block">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3">Confirmation</th>
                          <th className="px-4 py-3">Guest</th>
                          <th className="px-4 py-3">Room type</th>
                          <th className="px-4 py-3">Room</th>
                          <th className="px-4 py-3">Stay</th>
                          <th className="px-4 py-3">Nights</th>
                          <th className="px-4 py-3">Guests</th>
                          <th className="px-4 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr
                            key={r.id}
                            tabIndex={0}
                            onClick={() => open(r.id)}
                            onKeyDown={(e) => e.key === "Enter" && open(r.id)}
                            className="cursor-pointer border-t border-border transition-colors hover:bg-accent/40"
                          >
                            <td className="px-4 py-3 font-medium">{r.confirmationNumber}</td>
                            <td className="px-4 py-3">{r.guestName}</td>
                            <td className="px-4 py-3 text-muted-foreground">{r.roomTypeName}</td>
                            <td className="px-4 py-3 text-muted-foreground">{r.roomNumber ?? "Unassigned"}</td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {formatStayDate(r.arrivalDate)} → {formatStayDate(r.departureDate)}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{r.nights}</td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {r.adults} adult{r.adults === 1 ? "" : "s"}
                              {r.children > 0 ? `, ${r.children} child${r.children === 1 ? "" : "ren"}` : ""}
                            </td>
                            <td className="px-4 py-3">
                              <ReservationStatusBadge status={r.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <ul className="space-y-3 md:hidden">
                    {rows.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => open(r.id)}
                          className="w-full rounded-2xl border border-border bg-card p-4 text-left"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{r.confirmationNumber}</span>
                            <ReservationStatusBadge status={r.status} />
                          </div>
                          <p className="mt-1 text-sm">{r.guestName}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.roomTypeName}
                            {r.roomNumber ? ` · Room ${r.roomNumber}` : " · Unassigned"}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatStayDate(r.arrivalDate)} → {formatStayDate(r.departureDate)} · {r.nights} night
                            {r.nights === 1 ? "" : "s"}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>

                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      Page {page} of {pages}
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                        Previous
                      </Button>
                      <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              )}
        </TabsContent>

        <TabsContent value="group" className="mt-4">
          <FoundationPanel
            title="Group bookings"
            description="Reservation records don't carry a group or block reference yet, so group blocks can't be listed here. This view stays empty until group blocks are added to the booking record."
          />
        </TabsContent>

        <TabsContent value="corporate" className="mt-4">
          <FoundationPanel
            title="Corporate bookings"
            description="Reservations and guest profiles have no company or corporate account link yet, so corporate stays can't be separated here. This view stays empty until company accounts are added."
          />
        </TabsContent>

        <TabsContent value="amendments" className="mt-4">
          <ReservationAmendmentsTab restaurantId={restaurantId} />
        </TabsContent>

        <TabsContent value="cancellations" className="mt-4">
          <ReservationCancellationsTab restaurantId={restaurantId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

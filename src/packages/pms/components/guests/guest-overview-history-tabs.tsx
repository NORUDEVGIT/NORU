import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  ReservationStatusBadge,
  formatStayDate,
} from "@/packages/pms/components/bookings/reservation-bits";
import { GuestStayActions } from "@/packages/pms/components/guests/guest-stay-actions";
import {
  OVERVIEW_BALANCE_PLACEHOLDER,
  OVERVIEW_FINANCIAL_COPY,
  OVERVIEW_RATE_PLAN_UNAVAILABLE,
  OVERVIEW_REVENUE_PLACEHOLDER,
  OVERVIEW_SERVICE_EMPTY,
  OVERVIEW_SERVICE_UNAVAILABLE,
  occupiedStayHistory,
} from "@/packages/pms/lib/guest-profile-overview";
import {
  stayRoomNumberLabel,
  wave3StayHistoryEmpty,
  type GuestStay,
  type GuestStayAccess,
} from "@/packages/pms/lib/guest-profile-wave3";
import {
  listGuestServiceHistory,
  listGuestStays,
  type GuestServiceHistoryItem,
} from "@/packages/pms/lib/guests.functions";
import { propertyToday } from "@/packages/pms/lib/reservation-dates";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";

export function GuestOverviewHistoryTabs({
  restaurantId,
  guestId,
  guestName,
  timezone,
}: {
  restaurantId: string;
  guestId: string;
  guestName: string;
  timezone: string;
}) {
  const [tab, setTab] = useState("stays");
  const today = propertyToday(timezone);
  const fetchStays = useServerFn(listGuestStays);
  const fetchServices = useServerFn(listGuestServiceHistory);
  const staysQuery = useQuery({
    queryKey: ["guest-stays", restaurantId, guestId],
    queryFn: () => fetchStays({ data: { restaurantId, guestId } }),
    retry: false,
  });
  const servicesQuery = useQuery({
    queryKey: ["guest-service-history", restaurantId, guestId, "overview"],
    queryFn: () => fetchServices({ data: { restaurantId, guestId, limit: 20 } }),
    retry: false,
  });

  const stays = staysQuery.data?.stays ?? [];
  const access = staysQuery.data?.access ?? {
    reservation: false,
    frontOffice: false,
    folio: false,
  };
  const occupied = occupiedStayHistory(stays);

  return (
    <section
      className="rounded-2xl border border-border bg-card p-5"
      data-testid="guest-overview-history"
    >
      <h3 className="font-display text-lg">History summary</h3>
      <Tabs value={tab} onValueChange={setTab} className="mt-3">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="stays">Stay History</TabsTrigger>
          <TabsTrigger value="reservations">Reservation History</TabsTrigger>
          <TabsTrigger value="services">Service History</TabsTrigger>
          <TabsTrigger value="financial">Financial Summary</TabsTrigger>
        </TabsList>
        <TabsContent value="stays">
          {staysQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading stays…</p>
          ) : staysQuery.isError ? (
            <p className="text-sm text-muted-foreground">Stay history could not be loaded.</p>
          ) : occupied.length === 0 ? (
            <p className="text-sm text-muted-foreground">{wave3StayHistoryEmpty(guestName)}</p>
          ) : (
            <StayMiniTable stays={occupied} access={access} today={today} />
          )}
        </TabsContent>
        <TabsContent value="reservations">
          {staysQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading reservations…</p>
          ) : stays.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No reservations recorded for this guest.
            </p>
          ) : (
            <StayMiniTable stays={stays} access={access} today={today} />
          )}
        </TabsContent>
        <TabsContent value="services">
          {servicesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading services…</p>
          ) : servicesQuery.data && !servicesQuery.data.available ? (
            <p className="text-sm text-muted-foreground">{OVERVIEW_SERVICE_UNAVAILABLE}</p>
          ) : (servicesQuery.data?.items.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">{OVERVIEW_SERVICE_EMPTY}</p>
          ) : (
            <ServiceMiniTable items={servicesQuery.data!.items} />
          )}
        </TabsContent>
        <TabsContent value="financial">
          <p className="text-sm text-muted-foreground" data-testid="guest-overview-revenue">
            {OVERVIEW_REVENUE_PLACEHOLDER}
          </p>
          <p className="text-sm text-muted-foreground" data-testid="guest-overview-balance">
            {OVERVIEW_BALANCE_PLACEHOLDER}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{OVERVIEW_FINANCIAL_COPY}</p>
        </TabsContent>
      </Tabs>
    </section>
  );
}

function StayMiniTable({
  stays,
  access,
  today,
}: {
  stays: GuestStay[];
  access: GuestStayAccess;
  today: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="py-2 pr-3">Stay no.</th>
            <th className="py-2 pr-3">Arrival</th>
            <th className="py-2 pr-3">Departure</th>
            <th className="py-2 pr-3">Nights</th>
            <th className="py-2 pr-3">Room</th>
            <th className="py-2 pr-3">Rate plan</th>
            <th className="py-2 pr-3">Total</th>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {stays.map((stay) => (
            <tr key={stay.id} className="border-t border-border">
              <td className="py-2 pr-3 font-medium">{stay.confirmationNumber}</td>
              <td className="py-2 pr-3 text-muted-foreground">
                {formatStayDate(stay.arrivalDate)}
              </td>
              <td className="py-2 pr-3 text-muted-foreground">
                {formatStayDate(stay.departureDate)}
              </td>
              <td className="py-2 pr-3 text-muted-foreground">{stay.nights}</td>
              <td className="py-2 pr-3 text-muted-foreground">
                {stay.roomTypeName} · {stayRoomNumberLabel(stay)}
              </td>
              <td className="py-2 pr-3 text-muted-foreground">{OVERVIEW_RATE_PLAN_UNAVAILABLE}</td>
              <td className="py-2 pr-3 text-muted-foreground">
                {stay.roomSubtotal == null ? "—" : stay.roomSubtotal}
              </td>
              <td className="py-2 pr-3">
                <ReservationStatusBadge status={stay.status} />
              </td>
              <td className="py-2">
                <GuestStayActions stay={stay} access={access} today={today} size="sm" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ServiceMiniTable({ items }: { items: GuestServiceHistoryItem[] }) {
  return (
    <ul className="space-y-2 text-sm">
      {items.map((item) => (
        <li key={item.id}>
          <p className="font-medium">{item.serviceName}</p>
          <p className="text-xs text-muted-foreground">
            {item.status} · {formatStayDate(item.requestedAt.slice(0, 10))}
            {item.amount == null ? "" : ` · ${item.amount}`}
          </p>
        </li>
      ))}
    </ul>
  );
}

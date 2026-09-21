import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { ReactNode } from "react";

import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { GuestStayActions } from "@/packages/pms/components/guests/guest-stay-actions";
import { GUEST_ACCOUNT_TYPE_LABELS } from "@/packages/pms/lib/guest-profile-wave4";
import { listGuestAccountLinks } from "@/packages/pms/lib/guest-accounts.functions";
import {
  OVERVIEW_BALANCE_PLACEHOLDER,
  OVERVIEW_LOYALTY_COPY,
  OVERVIEW_NOTES_EMPTY,
  OVERVIEW_PREFERENCES_EMPTY,
  OVERVIEW_REVENUE_PLACEHOLDER,
  OVERVIEW_SERVICE_EMPTY,
  OVERVIEW_SERVICE_UNAVAILABLE,
  OVERVIEW_UPCOMING_EMPTY,
  PREFERRED_CONTACT_METHOD_LABELS,
  PREFERRED_CONTACT_TIME_LABELS,
  formatGuestAddress,
  isPreferredContactMethod,
  isPreferredContactTime,
} from "@/packages/pms/lib/guest-profile-overview";
import { WAVE3_KPI_NOT_AVAILABLE } from "@/packages/pms/lib/guest-profile-wave3";
import {
  listGuestPreferenceSummary,
  listGuestServiceHistory,
  getGuestStayOverview,
  type GuestHistoryEntry,
  type GuestProfile,
} from "@/packages/pms/lib/guests.functions";
import { propertyToday } from "@/packages/pms/lib/reservation-dates";
import { Button } from "@/shared/components/ui/button";

function Panel({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5" data-testid={testId}>
      <h3 className="font-display text-lg">{title}</h3>
      <div className="mt-3 space-y-2 text-sm">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <p>
      <span className="text-muted-foreground">{label}: </span>
      {value?.trim() ? value : "—"}
    </p>
  );
}

export function GuestOverviewCard({
  restaurantId,
  guest,
  timezone,
  history,
}: {
  restaurantId: string;
  guest: GuestProfile;
  timezone: string;
  history: GuestHistoryEntry[];
}) {
  const today = propertyToday(timezone);
  const fetchOverview = useServerFn(getGuestStayOverview);
  const fetchLinks = useServerFn(listGuestAccountLinks);
  const fetchPrefs = useServerFn(listGuestPreferenceSummary);
  const fetchServices = useServerFn(listGuestServiceHistory);

  const overviewQuery = useQuery({
    queryKey: ["guest-stay-overview", restaurantId, guest.id],
    queryFn: () => fetchOverview({ data: { restaurantId, guestId: guest.id } }),
    retry: false,
  });
  const linksQuery = useQuery({
    queryKey: ["guest-account-links", restaurantId, guest.id],
    queryFn: () => fetchLinks({ data: { restaurantId, guestId: guest.id } }),
    retry: false,
  });
  const prefsQuery = useQuery({
    queryKey: ["guest-preference-summary", restaurantId, guest.id],
    queryFn: () => fetchPrefs({ data: { restaurantId, guestId: guest.id } }),
    retry: false,
  });
  const servicesQuery = useQuery({
    queryKey: ["guest-service-history", restaurantId, guest.id],
    queryFn: () => fetchServices({ data: { restaurantId, guestId: guest.id, limit: 5 } }),
    retry: false,
  });

  const overview = overviewQuery.data;
  const address = formatGuestAddress(guest);
  const notes = history.filter((entry) => entry.eventType === "note_added" && entry.notes?.trim());
  const company = (linksQuery.data ?? []).find(
    (link) => link.role === "employer" || link.role === "bill_to",
  );
  const method =
    guest.preferredContactMethod && isPreferredContactMethod(guest.preferredContactMethod)
      ? PREFERRED_CONTACT_METHOD_LABELS[guest.preferredContactMethod]
      : guest.preferredContactMethod;
  const time =
    guest.preferredContactTime && isPreferredContactTime(guest.preferredContactTime)
      ? PREFERRED_CONTACT_TIME_LABELS[guest.preferredContactTime]
      : guest.preferredContactTime;
  const mapHref =
    guest.geoLatitude != null && guest.geoLongitude != null
      ? `https://www.google.com/maps?q=${guest.geoLatitude},${guest.geoLongitude}`
      : null;
  const memberSince = guest.createdAt ? formatStayDate(guest.createdAt.slice(0, 10)) : "—";

  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="guest-overview">
      <Panel title="Guest information" testId="guest-overview-info">
        <Row label="Name" value={guest.fullName} />
        <Row
          label="Profile no."
          value={guest.profileNumber ?? "—"}
        />
        <Row
          label="Guest type"
          value={guest.profileType?.name ?? "Individual"}
        />
        <Row label="Status" value={guest.guestStatus === "active" ? "Active" : "Inactive"} />
        <Row label="VIP" value={guest.vipStatus ? "VIP" : "Standard"} />
        <Row label="Member since" value={memberSince} />
        <Row label="Tagline" value={guest.notes} />
        {guest.profileType && !guest.profileType.active ? (
          <p className="text-xs text-muted-foreground">
            This profile type is inactive in Settings. Existing guests stay visible.
          </p>
        ) : null}
      </Panel>

      <Panel title="Contact" testId="guest-overview-contact">
        <Row label="Mobile" value={guest.phone} />
        <Row label="Alternate phone" value={guest.phoneAlt} />
        <Row label="Email" value={guest.email} />
        <Row label="Alternate email" value={guest.emailAlt} />
        <Row label="Preferred contact" value={method} />
        <Row label="Preferred time" value={time} />
      </Panel>

      <Panel title="Address" testId="guest-overview-address">
        <p>{address ?? "No address recorded."}</p>
        {mapHref ? (
          <a
            className="text-sm text-primary underline"
            href={mapHref}
            target="_blank"
            rel="noreferrer"
            data-testid="guest-overview-map"
          >
            View on map
          </a>
        ) : (
          <p className="text-xs text-muted-foreground">Map is shown only when coordinates are stored.</p>
        )}
      </Panel>

      <Panel title="Preferences" testId="guest-overview-preferences">
        {prefsQuery.isLoading ? (
          <p className="text-muted-foreground">Loading preferences…</p>
        ) : (prefsQuery.data?.chips.length ?? 0) === 0 ? (
          <p className="text-muted-foreground">{OVERVIEW_PREFERENCES_EMPTY}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {prefsQuery.data!.chips.map((chip) => (
              <li
                key={`${chip.code}-${chip.value}`}
                className="rounded-full border border-border px-2.5 py-1 text-xs"
              >
                <span className="font-medium">{chip.label}</span>
                {": "}
                {chip.value}
                {chip.active ? null : (
                  <span className="ml-1 text-muted-foreground">(inactive type)</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Upcoming reservation" testId="guest-overview-upcoming">
        {overviewQuery.isLoading ? (
          <p className="text-muted-foreground">Loading stays…</p>
        ) : overview?.featuredStay ? (
          <>
            <p className="font-medium">{overview.featuredStay.confirmationNumber}</p>
            <p className="text-muted-foreground">
              {formatStayDate(overview.featuredStay.arrivalDate)} →{" "}
              {formatStayDate(overview.featuredStay.departureDate)}
            </p>
            <div className="pt-1">
              <GuestStayActions stay={overview.featuredStay} access={overview.access} today={today} />
            </div>
          </>
        ) : (
          <p className="text-muted-foreground">{OVERVIEW_UPCOMING_EMPTY}</p>
        )}
      </Panel>

      <Panel title="Loyalty" testId="guest-overview-loyalty">
        <p className="text-muted-foreground">{OVERVIEW_LOYALTY_COPY}</p>
        <Row
          label="Stays"
          value={overview ? String(overview.stayCount) : WAVE3_KPI_NOT_AVAILABLE}
        />
        <Row
          label="Nights"
          value={overview ? String(overview.nightCount) : WAVE3_KPI_NOT_AVAILABLE}
        />
        <p className="text-xs text-muted-foreground">{OVERVIEW_REVENUE_PLACEHOLDER}</p>
      </Panel>

      <Panel title="Business" testId="guest-overview-business">
        {company ? (
          <p>
            {company.masterName}{" "}
            <span className="text-muted-foreground">
              ({GUEST_ACCOUNT_TYPE_LABELS[company.masterType]} · {company.role.replace("_", " ")})
            </span>
          </p>
        ) : (
          <p className="text-muted-foreground">No company or bill-to relationship recorded.</p>
        )}
      </Panel>

      <Panel title="Notes" testId="guest-overview-notes">
        {notes.length === 0 ? (
          <p className="text-muted-foreground">{OVERVIEW_NOTES_EMPTY}</p>
        ) : (
          <ul className="space-y-2">
            {notes.slice(0, 5).map((entry) => (
              <li key={entry.id}>
                <p>{entry.notes}</p>
                <p className="text-xs text-muted-foreground">
                  {entry.actorName ?? "Staff"} · {formatStayDate(entry.createdAt.slice(0, 10))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Service history" testId="guest-overview-services">
        {servicesQuery.data && !servicesQuery.data.available ? (
          <p className="text-muted-foreground">{OVERVIEW_SERVICE_UNAVAILABLE}</p>
        ) : (servicesQuery.data?.items.length ?? 0) === 0 ? (
          <p className="text-muted-foreground">{OVERVIEW_SERVICE_EMPTY}</p>
        ) : (
          <ul className="space-y-2">
            {servicesQuery.data!.items.map((item) => (
              <li key={item.id}>
                <p className="font-medium">{item.serviceName}</p>
                <p className="text-xs text-muted-foreground">
                  {item.status} · {formatStayDate(item.requestedAt.slice(0, 10))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="lg:col-span-2 rounded-2xl border border-dashed border-border bg-card p-5">
        <p className="text-sm font-medium">Financial summary</p>
        <p className="mt-1 text-sm text-muted-foreground" data-testid="guest-overview-revenue">
          {OVERVIEW_REVENUE_PLACEHOLDER}
        </p>
        <p className="text-sm text-muted-foreground" data-testid="guest-overview-balance">
          {OVERVIEW_BALANCE_PLACEHOLDER}
        </p>
        <Button asChild variant="outline" size="sm" className="mt-3">
          <Link
            to="/restaurant/pms/guests/$guestId"
            params={{ guestId: guest.id }}
            search={{ card: "stay-history" }}
          >
            Stay history
          </Link>
        </Button>
      </div>
    </div>
  );
}

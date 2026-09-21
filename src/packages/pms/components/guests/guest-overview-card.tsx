import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { ReactNode } from "react";

import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { GuestDashboardCard } from "@/packages/pms/components/guests/guest-dashboard-card";
import { GuestOverviewHistoryTabs } from "@/packages/pms/components/guests/guest-overview-history-tabs";
import { GuestOverviewQuickActions } from "@/packages/pms/components/guests/guest-overview-quick-actions";
import { useOptionalGuestProfileActions } from "@/packages/pms/components/guests/guest-profile-actions";
import { GuestStayActions } from "@/packages/pms/components/guests/guest-stay-actions";
import { GUEST_ACCOUNT_TYPE_LABELS } from "@/packages/pms/lib/guest-profile-wave4";
import { GUEST_GENDER_LABELS } from "@/packages/pms/lib/guest-profile-individual";
import { listGuestAccountLinks } from "@/packages/pms/lib/guest-accounts.functions";
import {
  OVERVIEW_NOTES_EMPTY,
  OVERVIEW_PREFERENCES_EMPTY,
  OVERVIEW_UPCOMING_EMPTY,
  PREFERRED_CONTACT_METHOD_LABELS,
  PREFERRED_CONTACT_TIME_LABELS,
  isPreferredContactMethod,
  isPreferredContactTime,
} from "@/packages/pms/lib/guest-profile-overview";
import {
  listGuestPreferenceSummary,
  getGuestStayOverview,
  type GuestHistoryEntry,
  type GuestProfile,
} from "@/packages/pms/lib/guests.functions";
import { propertyToday } from "@/packages/pms/lib/reservation-dates";
import { Button } from "@/shared/components/ui/button";

function Panel({
  title,
  testId,
  actions,
  children,
}: {
  title: string;
  testId: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg">{title}</h3>
        {actions}
      </div>
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
  const actions = useOptionalGuestProfileActions();
  const today = propertyToday(timezone);
  const fetchOverview = useServerFn(getGuestStayOverview);
  const fetchLinks = useServerFn(listGuestAccountLinks);
  const fetchPrefs = useServerFn(listGuestPreferenceSummary);

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

  const overview = overviewQuery.data;
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
  const notes = history.filter((entry) => entry.eventType === "note_added" && entry.notes?.trim());
  const company = (linksQuery.data ?? []).find(
    (link) => link.role === "employer" || link.role === "bill_to",
  );

  return (
    <div className="space-y-4" data-testid="guest-overview">
      <GuestDashboardCard
        restaurantId={restaurantId}
        guestId={guest.id}
        guestName={guest.fullName}
        timezone={timezone}
        vipStatus={guest.vipStatus}
        showQuickActions={false}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Panel title="Guest information" testId="guest-overview-info">
            <Row label="Full name" value={guest.fullName} />
            <Row label="Profile no." value={guest.profileNumber} />
            <Row label="Guest type" value={guest.profileType?.name ?? "Individual"} />
            <Row label="Nationality" value={guest.nationality} />
            <Row
              label="Date of birth"
              value={guest.dateOfBirth ? formatStayDate(guest.dateOfBirth) : null}
            />
            <Row label="Gender" value={guest.gender ? GUEST_GENDER_LABELS[guest.gender] : null} />
            <Row label="Language" value={guest.language} />
            <Row label="Status" value={guest.guestStatus === "active" ? "Active" : "Inactive"} />
            <Row label="VIP status" value={guest.vipStatus ? "VIP" : "Standard"} />
            <Row label="Member since" value={memberSince} />
            {company ? (
              <Row
                label="Company"
                value={`${company.masterName} (${GUEST_ACCOUNT_TYPE_LABELS[company.masterType]})`}
              />
            ) : null}
            {guest.profileType && !guest.profileType.active ? (
              <p className="text-xs text-muted-foreground">
                This profile type is inactive in Settings. Existing guests stay visible.
              </p>
            ) : null}
          </Panel>

          <Panel title="Contact information" testId="guest-overview-contact">
            <Row label="Mobile phone" value={guest.phone} />
            <Row label="Alternate phone" value={guest.phoneAlt} />
            <Row label="Email" value={guest.email} />
            <Row label="Alternate email" value={guest.emailAlt} />
            <Row label="Preferred contact" value={method} />
            <Row label="Preferred time" value={time} />
          </Panel>

          <Panel title="Address" testId="guest-overview-address">
            <Row label="Address" value={guest.addressLine1} />
            <Row label="Address line 2" value={guest.addressLine2} />
            <Row label="City" value={guest.city} />
            <Row label="Region" value={guest.region} />
            <Row label="Country" value={guest.country} />
            <Row label="Postal" value={guest.postalCode} />
            {mapHref ? (
              <a
                className="text-sm text-primary underline"
                href={mapHref}
                target="_blank"
                rel="noreferrer"
                data-testid="guest-overview-map"
              >
                View on Map
              </a>
            ) : (
              <p className="text-xs text-muted-foreground">
                Map is shown only when coordinates are stored.
              </p>
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

          <GuestOverviewHistoryTabs
            restaurantId={restaurantId}
            guestId={guest.id}
            guestName={guest.fullName}
            timezone={timezone}
          />
        </div>

        <div className="space-y-4">
          <Panel
            title="Upcoming reservation"
            testId="guest-overview-upcoming"
            actions={
              actions ? (
                <Button variant="outline" size="sm" onClick={actions.openReservationsPage}>
                  View All
                </Button>
              ) : null
            }
          >
            {overviewQuery.isLoading ? (
              <p className="text-muted-foreground">Loading stays…</p>
            ) : overviewQuery.isError ? (
              <p className="text-muted-foreground">Upcoming reservation could not be loaded.</p>
            ) : overview?.featuredStay ? (
              <>
                <Row label="Reservation" value={overview.featuredStay.confirmationNumber} />
                <Row
                  label="Dates"
                  value={`${formatStayDate(overview.featuredStay.arrivalDate)} → ${formatStayDate(overview.featuredStay.departureDate)}`}
                />
                <Row
                  label="Room"
                  value={`${overview.featuredStay.roomTypeName}${overview.featuredStay.roomNumber ? ` · ${overview.featuredStay.roomNumber}` : ""}`}
                />
                <Row label="Nights" value={String(overview.featuredStay.nights)} />
                <Row label="Status" value={overview.featuredStay.status.replace("_", " ")} />
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button asChild size="sm">
                    <Link
                      to="/restaurant/pms/reservations/$reservationId"
                      params={{ reservationId: overview.featuredStay.id }}
                    >
                      Open Reservation
                    </Link>
                  </Button>
                  <GuestStayActions
                    stay={overview.featuredStay}
                    access={overview.access}
                    today={today}
                    size="sm"
                  />
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">{OVERVIEW_UPCOMING_EMPTY}</p>
            )}
          </Panel>

          <Panel
            title="Notes"
            testId="guest-overview-notes"
            actions={
              <div className="flex gap-2">
                {actions ? (
                  <>
                    <Button variant="outline" size="sm" onClick={actions.openNotesPage}>
                      View All
                    </Button>
                    <Button size="sm" onClick={actions.openNote} disabled={!actions.canManage}>
                      Add Note
                    </Button>
                  </>
                ) : null}
              </div>
            }
          >
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

          {actions ? <GuestOverviewQuickActions /> : null}
        </div>
      </div>

      <Link
        to="/restaurant/pms/guests/$guestId"
        params={{ guestId: guest.id }}
        search={{ card: "stay-history" }}
        className="sr-only"
      >
        Stay history
      </Link>
    </div>
  );
}

import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  ExternalLink,
  FileCheck,
  Heart,
  MapPin,
  Pencil,
  Plus,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";

import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
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
import type { GuestDetailViewId } from "@/packages/pms/lib/guest-detail-view";

function calculateAge(dob: string): number | null {
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age >= 0 && age < 130 ? age : null;
}

function SectionCard({
  title,
  icon: Icon,
  actions,
  testId,
  "data-testid": dataTestId,
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  actions?: ReactNode;
  testId?: string;
  "data-testid"?: string;
  children: ReactNode;
}) {
  return (
    <section
      className="flex flex-col rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid={dataTestId || testId}
    >
      <div className="flex items-center justify-between border-b border-[#DDD4C5]/60 pb-3 mb-3">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="size-4 text-[#8A641A]" />}
          <h2 className="font-display text-base font-semibold text-[#251605]">{title}</h2>
        </div>
        {actions}
      </div>
      <div className="flex-1 space-y-2 text-xs">{children}</div>
    </section>
  );
}

function InfoRow({
  label,
  value,
  truncate = false,
}: {
  label: string;
  value: ReactNode;
  truncate?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5 border-b border-[#EFE9DF]/50 last:border-b-0">
      <span className="shrink-0 text-[#756A5B]">{label}</span>
      <span
        className={`text-right font-medium text-[#251605] ${
          truncate ? "truncate max-w-[200px]" : ""
        }`}
      >
        {value != null && value !== "" ? value : "—"}
      </span>
    </div>
  );
}

export function GuestIndividualOverview({
  restaurantId,
  guest,
  timezone,
  history,
  onNavigateView,
}: {
  restaurantId: string;
  guest: GuestProfile;
  timezone: string;
  history: GuestHistoryEntry[];
  onNavigateView: (view: GuestDetailViewId) => void;
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
  const stayCount = overview?.stayCount ?? 0;
  const nightCount = overview?.nightCount ?? 0;

  const method =
    guest.preferredContactMethod && isPreferredContactMethod(guest.preferredContactMethod)
      ? PREFERRED_CONTACT_METHOD_LABELS[guest.preferredContactMethod]
      : guest.preferredContactMethod;
  const time =
    guest.preferredContactTime && isPreferredContactTime(guest.preferredContactTime)
      ? PREFERRED_CONTACT_TIME_LABELS[guest.preferredContactTime]
      : guest.preferredContactTime;

  // Caution 2: Real map check only
  const mapHref =
    guest.geoLatitude != null && guest.geoLongitude != null
      ? `https://www.google.com/maps?q=${guest.geoLatitude},${guest.geoLongitude}`
      : null;

  const memberSince = guest.createdAt ? formatStayDate(guest.createdAt.slice(0, 10)) : "—";
  const notes = history.filter((entry) => entry.eventType === "note_added" && entry.notes?.trim());
  const company = (linksQuery.data ?? []).find(
    (link) => link.role === "employer" || link.role === "bill_to",
  );

  const age = guest.dateOfBirth ? calculateAge(guest.dateOfBirth) : null;
  const dobFormatted = guest.dateOfBirth
    ? `${formatStayDate(guest.dateOfBirth)}${age !== null ? ` (${age} yrs)` : ""}`
    : "—";

  return (
    <div className="space-y-4" data-testid="guest-individual-overview">
      {/* ROW 1: Compact 6-KPI Summary Strip matching Reservation & Room Workspaces (Caution 1) */}
      <div
        className="grid grid-cols-2 divide-y divide-[#DDD4C5] rounded-xl border border-[#DDD4C5] bg-white p-2.5 sm:grid-cols-3 sm:divide-y-0 sm:divide-x lg:grid-cols-6 shadow-sm"
        data-testid="guest-overview-kpi-strip"
      >
        {/* KPI 1: Status */}
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Status
          </span>
          <div className="mt-1 flex items-center gap-1.5">
            <span
              className={`size-2 rounded-full ${
                guest.guestStatus === "active" ? "bg-emerald-600 ring-2 ring-emerald-500/20" : "bg-stone-400"
              }`}
            />
            <span className="text-xs font-semibold capitalize text-[#251605]">
              {guest.guestStatus === "active" ? "Active" : "Inactive"}
            </span>
          </div>
        </div>

        {/* KPI 2: VIP */}
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            VIP Status
          </span>
          <div className="mt-1 flex items-center gap-1.5">
            {guest.vipStatus ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#8A641A]">
                <Sparkles className="size-3 text-[#8A641A]" /> VIP
              </span>
            ) : (
              <span className="text-xs font-medium text-[#756A5B]">Standard</span>
            )}
          </div>
        </div>

        {/* KPI 3: Last Stay */}
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Last Stay
          </span>
          <span className="mt-1 text-xs font-semibold text-[#251605] truncate">
            {overviewQuery.isLoading ? (
              "…"
            ) : overview?.lastStay ? (
              formatStayDate(overview.lastStay.departureDate)
            ) : (
              "—"
            )}
          </span>
        </div>

        {/* KPI 4: Upcoming Stay */}
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Upcoming Stay
          </span>
          <span className="mt-1 text-xs font-semibold text-[#251605] truncate">
            {overviewQuery.isLoading ? (
              "…"
            ) : overview?.nextStay ? (
              formatStayDate(overview.nextStay.arrivalDate)
            ) : (
              "—"
            )}
          </span>
        </div>

        {/* KPI 5: Total Stays */}
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Total Stays
          </span>
          <span className="mt-1 font-mono text-sm font-bold text-[#251605]">
            {overviewQuery.isLoading ? "…" : stayCount}
          </span>
        </div>

        {/* KPI 6: Total Nights */}
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Total Nights
          </span>
          <span className="mt-1 font-mono text-sm font-bold text-[#251605]">
            {overviewQuery.isLoading ? "…" : nightCount}
          </span>
        </div>
      </div>

      {/* ROW 2: 3 Operational Cards (Guest Information | Contact & Address | Upcoming Reservation) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Card 1: Guest Information */}
        <SectionCard
          title="Guest Information"
          icon={Users}
          data-testid="guest-overview-info"
          actions={
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-[#756A5B] hover:text-[#251605] hover:bg-[#F7F4EE]"
              onClick={() => onNavigateView("personal-contact")}
            >
              <Pencil className="mr-1 size-3" /> Edit
            </Button>
          }
        >
          <InfoRow label="Profile No." value={guest.profileNumber} />
          <InfoRow label="Full Name" value={guest.fullName} />
          <InfoRow label="Guest Type" value={guest.profileType?.name ?? "Individual"} />
          <InfoRow label="Nationality" value={guest.nationality} />
          <InfoRow label="Date of Birth" value={dobFormatted} />
          <InfoRow label="Gender" value={guest.gender ? GUEST_GENDER_LABELS[guest.gender] : null} />
          <InfoRow label="Language" value={guest.language} />
          <InfoRow label="Status" value={guest.guestStatus === "active" ? "Active" : "Inactive"} />
          <InfoRow label="VIP Status" value={guest.vipStatus ? "VIP" : "Standard"} />
          <InfoRow label="Member Since" value={memberSince} />
          {company ? (
            <InfoRow
              label="Company"
              value={`${company.masterName} (${GUEST_ACCOUNT_TYPE_LABELS[company.masterType]})`}
              truncate
            />
          ) : null}
        </SectionCard>

        {/* Card 2: Contact & Address */}
        <SectionCard
          title="Contact & Address"
          icon={MapPin}
          data-testid="guest-overview-contact"
          actions={
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-[#756A5B] hover:text-[#251605] hover:bg-[#F7F4EE]"
              onClick={() => onNavigateView("personal-contact")}
            >
              <Pencil className="mr-1 size-3" /> Edit
            </Button>
          }
        >
          <InfoRow label="Mobile Phone" value={guest.phone} />
          <InfoRow label="Alternate Phone" value={guest.phoneAlt} />
          <InfoRow label="Email" value={guest.email} truncate />
          <InfoRow label="Alternate Email" value={guest.emailAlt} truncate />
          <InfoRow label="Preferred Contact" value={method} />
          <InfoRow label="Preferred Time" value={time} />
          <div className="border-t border-[#DDD4C5]/60 pt-2 mt-1">
            <InfoRow label="Address" value={guest.addressLine1} />
            {guest.addressLine2 && <InfoRow label="Address 2" value={guest.addressLine2} />}
            <InfoRow
              label="City / Country"
              value={[guest.city, guest.country].filter(Boolean).join(", ") || null}
            />
            <InfoRow label="Postal Code" value={guest.postalCode} />
            {/* Caution 2: Map only if real coords exist */}
            {mapHref ? (
              <div className="pt-2 text-right">
                <a
                  className="inline-flex items-center gap-1 text-xs text-[#8A641A] hover:text-[#725215] font-semibold underline"
                  href={mapHref}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="guest-overview-map"
                >
                  <ExternalLink className="size-3" /> View on Map
                </a>
              </div>
            ) : null}
          </div>
        </SectionCard>

        {/* Card 3: Upcoming Reservation (Caution 3: Only truthful fields) */}
        <SectionCard
          title="Upcoming Reservation"
          icon={Calendar}
          data-testid="guest-overview-upcoming"
          actions={
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-[#756A5B] hover:text-[#251605] hover:bg-[#F7F4EE]"
              onClick={() => onNavigateView("stays")}
            >
              View All
            </Button>
          }
        >
          {overviewQuery.isLoading ? (
            <p className="py-4 text-center text-xs text-[#756A5B]">Loading stays…</p>
          ) : overviewQuery.isError ? (
            <p className="py-4 text-center text-xs text-rose-700">
              Upcoming reservation could not be loaded.
            </p>
          ) : overview?.featuredStay ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-[#8A641A]">
                  {overview.featuredStay.confirmationNumber}
                </span>
                <span className="rounded-full bg-[#FAF8F5] border border-[#DDD4C5] px-2 py-0.5 text-[10px] font-semibold capitalize text-[#251605]">
                  {overview.featuredStay.status.replace("_", " ")}
                </span>
              </div>
              <InfoRow
                label="Dates"
                value={`${formatStayDate(overview.featuredStay.arrivalDate)} → ${formatStayDate(
                  overview.featuredStay.departureDate,
                )}`}
              />
              <InfoRow label="Nights" value={String(overview.featuredStay.nights)} />
              {/* Caution 3: Room, Rate Plan, Source only when present in read model */}
              <InfoRow
                label="Room"
                value={
                  overview.featuredStay.roomTypeName
                    ? overview.featuredStay.roomNumber
                      ? `${overview.featuredStay.roomTypeName} · ${overview.featuredStay.roomNumber}`
                      : overview.featuredStay.roomTypeName
                    : "—"
                }
              />
              <InfoRow
                label="Rate Plan"
                value={overview.featuredStay.ratePlanName ?? "—"}
              />
              <InfoRow
                label="Source"
                value={overview.featuredStay.sourceLabel ?? "—"}
              />
              <InfoRow
                label="Guests"
                value={`${overview.featuredStay.adults} adult${
                  overview.featuredStay.adults === 1 ? "" : "s"
                }${overview.featuredStay.children > 0 ? `, ${overview.featuredStay.children} child` : ""}`}
              />

              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#DDD4C5]/60">
                <Button
                  asChild
                  size="sm"
                  className="h-7 text-xs bg-[#8A641A] hover:bg-[#725215] text-white font-medium shadow-sm"
                >
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
            </div>
          ) : (
            <div className="py-6 text-center text-[#756A5B] space-y-2">
              <p>{OVERVIEW_UPCOMING_EMPTY}</p>
              {actions?.canCreateReservation ? (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE]"
                >
                  <Link to="/restaurant/pms/reservations" search={{ create: "new", guestId: guest.id }}>
                    <Plus className="mr-1 size-3" /> New Reservation
                  </Link>
                </Button>
              ) : null}
            </div>
          )}
        </SectionCard>
      </div>

      {/* ROW 3: 3 Secondary Cards (Key Preferences | Identity Status | Relationships) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Card 4: Key Preferences */}
        <SectionCard
          title="Key Preferences"
          icon={Heart}
          data-testid="guest-overview-preferences"
          actions={
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-[#756A5B] hover:text-[#251605] hover:bg-[#F7F4EE]"
              onClick={() => onNavigateView("preferences")}
            >
              <Pencil className="mr-1 size-3" /> Edit
            </Button>
          }
        >
          {prefsQuery.isLoading ? (
            <p className="py-4 text-center text-xs text-[#756A5B]">Loading preferences…</p>
          ) : (prefsQuery.data?.chips.length ?? 0) === 0 ? (
            <p className="py-4 text-center text-xs text-[#756A5B]">{OVERVIEW_PREFERENCES_EMPTY}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {prefsQuery.data!.chips.slice(0, 8).map((chip) => (
                <span
                  key={`${chip.code}-${chip.value}`}
                  className="inline-flex items-center rounded-md border border-[#DDD4C5] bg-[#FAF8F5] px-2 py-0.5 text-[11px] text-[#251605]"
                >
                  <span className="font-semibold text-[#8A641A] mr-1">{chip.label}:</span>
                  {chip.value}
                </span>
              ))}
              {(prefsQuery.data?.chips.length ?? 0) > 8 && (
                <button
                  type="button"
                  onClick={() => onNavigateView("preferences")}
                  className="text-[11px] text-[#8A641A] hover:underline self-center px-1 font-semibold"
                >
                  +{(prefsQuery.data?.chips.length ?? 0) - 8} more
                </button>
              )}
            </div>
          )}
        </SectionCard>

        {/* Card 5: Identity Status */}
        <SectionCard
          title="Identity Status"
          icon={FileCheck}
          data-testid="guest-overview-identity"
          actions={
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-[#756A5B] hover:text-[#251605] hover:bg-[#F7F4EE]"
              onClick={() => onNavigateView("identity")}
            >
              View All
            </Button>
          }
        >
          <InfoRow label="ID Document" value={guest.idType ? guest.idType.toUpperCase() : "Not recorded"} />
          <InfoRow
            label="ID Number"
            value={guest.idNumberMasked ?? (guest.idNumber ? `•••• ${guest.idNumber.slice(-4)}` : "—")}
          />
          <InfoRow label="Issuing Country" value={guest.idCountry} />
          <InfoRow
            label="Expiration Date"
            value={guest.idExpiry ? formatStayDate(guest.idExpiry) : "—"}
          />
          <div className="flex items-center justify-between pt-2 border-t border-[#DDD4C5]/60">
            <span className="text-[#756A5B]">Verification</span>
            {guest.idVerified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                <CheckCircle2 className="size-3" /> Verified
              </span>
            ) : (
              <span className="rounded-full bg-stone-100 border border-stone-200 px-2 py-0.5 text-[10px] font-medium text-stone-600">
                Unverified
              </span>
            )}
          </div>
        </SectionCard>

        {/* Card 6: Relationships */}
        <SectionCard
          title="Relationships"
          icon={Building2}
          data-testid="guest-overview-relationships"
          actions={
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-[#756A5B] hover:text-[#251605] hover:bg-[#F7F4EE]"
              onClick={() => onNavigateView("relationships")}
            >
              View All
            </Button>
          }
        >
          {linksQuery.isLoading ? (
            <p className="py-4 text-center text-xs text-[#756A5B]">Loading relationships…</p>
          ) : (linksQuery.data?.length ?? 0) === 0 ? (
            <p className="py-4 text-center text-xs text-[#756A5B]">
              No linked corporate or agency accounts
            </p>
          ) : (
            <div className="space-y-2">
              {linksQuery.data!.slice(0, 3).map((link) => (
                <div
                  key={link.id}
                  className="flex items-center justify-between rounded-lg border border-[#DDD4C5] bg-[#FAF8F5] p-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#251605] text-xs">{link.masterName}</p>
                    <p className="text-[10px] text-[#756A5B]">
                      {GUEST_ACCOUNT_TYPE_LABELS[link.masterType]} · Role: {link.role}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* ROW 4: Important Notes / Alerts / Restrictions */}
      <SectionCard
        title="Important Notes & Alerts"
        icon={ShieldAlert}
        data-testid="guest-overview-notes"
        actions={
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-[#756A5B] hover:text-[#251605] hover:bg-[#F7F4EE]"
              onClick={() => onNavigateView("communication-notes")}
            >
              View All
            </Button>
            {actions?.canManage && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE]"
                onClick={actions.openNote}
              >
                <Plus className="mr-1 size-3" /> Add Note
              </Button>
            )}
          </div>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Active Restrictions / Alerts */}
          <div className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#756A5B]">
              Active Alerts & Restrictions
            </h3>
            {guest.doNotRent ? (
              <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-rose-800">
                <AlertTriangle className="size-4 shrink-0 text-rose-600 mt-0.5" />
                <div>
                  <p className="font-semibold text-xs text-rose-900">DO NOT RENT</p>
                  <p className="text-[11px] text-rose-800">{guest.doNotRentReason || "Restricted guest."}</p>
                </div>
              </div>
            ) : null}
            {guest.notes?.trim() ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 text-[#251605]">
                <p className="text-[11px] font-semibold text-[#8A641A]">Profile Note:</p>
                <p className="text-xs italic text-[#756A5B] mt-0.5">{guest.notes}</p>
              </div>
            ) : null}
            {!guest.doNotRent && !guest.notes?.trim() && (
              <p className="text-[#8C827A] text-xs italic">No active profile restrictions or alerts.</p>
            )}
          </div>

          {/* Recent Operational Notes */}
          <div className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#756A5B]">
              Recent Notes
            </h3>
            {notes.length === 0 ? (
              <p className="text-[#8C827A] text-xs italic">{OVERVIEW_NOTES_EMPTY}</p>
            ) : (
              <div className="space-y-1.5">
                {notes.slice(0, 3).map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-lg border border-[#DDD4C5]/80 bg-[#FAF8F5] p-2 text-xs"
                  >
                    <p className="text-[#251605]">{entry.notes}</p>
                    <p className="mt-1 text-[10px] text-[#756A5B]">
                      {entry.actorName ?? "Staff"} · {formatStayDate(entry.createdAt.slice(0, 10))}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

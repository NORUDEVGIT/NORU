import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import {
  PREFERRED_CONTACT_METHOD_LABELS,
  PREFERRED_CONTACT_TIME_LABELS,
  formatGuestAddress,
  isPreferredContactMethod,
  isPreferredContactTime,
} from "@/packages/pms/lib/guest-profile-overview";
import { GUEST_GENDER_LABELS } from "@/packages/pms/lib/guest-profile-individual";
import type { GuestProfile } from "@/packages/pms/lib/guests.functions";

export function GuestPrintProfile({ guest }: { guest: GuestProfile }) {
  const address = formatGuestAddress(guest);
  const method =
    guest.preferredContactMethod && isPreferredContactMethod(guest.preferredContactMethod)
      ? PREFERRED_CONTACT_METHOD_LABELS[guest.preferredContactMethod]
      : guest.preferredContactMethod;
  const time =
    guest.preferredContactTime && isPreferredContactTime(guest.preferredContactTime)
      ? PREFERRED_CONTACT_TIME_LABELS[guest.preferredContactTime]
      : guest.preferredContactTime;

  return (
    <>
      <article className="guest-profile-print hidden print:block" data-testid="guest-profile-print">
        <h1>{guest.fullName}</h1>
        <p>
          Profile no. {guest.profileNumber ?? "—"} · {guest.profileType?.name ?? "Individual"} ·{" "}
          {guest.guestStatus === "active" ? "Active" : "Inactive"}
          {guest.vipStatus ? " · VIP" : ""}
        </p>
        <p>
          {guest.phone ?? "No phone"} · {guest.email ?? "No email"}
        </p>
        <dl>
          <dt>Nationality</dt>
          <dd>{guest.nationality ?? "—"}</dd>
          <dt>Date of birth</dt>
          <dd>{guest.dateOfBirth ? formatStayDate(guest.dateOfBirth) : "—"}</dd>
          <dt>Gender</dt>
          <dd>{guest.gender ? GUEST_GENDER_LABELS[guest.gender] : "—"}</dd>
          <dt>Language</dt>
          <dd>{guest.language ?? "—"}</dd>
          <dt>Member since</dt>
          <dd>{guest.createdAt ? formatStayDate(guest.createdAt.slice(0, 10)) : "—"}</dd>
          <dt>Preferred contact</dt>
          <dd>{[method, time].filter(Boolean).join(" · ") || "—"}</dd>
          <dt>Address</dt>
          <dd>{address ?? "—"}</dd>
          <dt>Notes</dt>
          <dd>{guest.notes ?? "—"}</dd>
        </dl>
      </article>
      <style>{`
        @media print {
          @page { margin: 12mm; }
          body * { visibility: hidden; }
          .guest-profile-print, .guest-profile-print * { visibility: visible; }
          .guest-profile-print {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .guest-profile-print h1 { font-size: 22px; margin-bottom: 8px; }
          .guest-profile-print dl { display: grid; grid-template-columns: 160px 1fr; gap: 4px 12px; }
          .guest-profile-print dt { font-weight: 600; }
        }
      `}</style>
    </>
  );
}

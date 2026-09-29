import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Briefcase,
  Building2,
  ExternalLink,
  MapPin,
  Pencil,
  Phone,
  ShieldAlert,
  User,
  Users,
} from "lucide-react";

import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { GUEST_GENDER_LABELS, GUEST_TITLE_LABELS } from "@/packages/pms/lib/guest-profile-individual";
import { GUEST_ACCOUNT_TYPE_LABELS } from "@/packages/pms/lib/guest-profile-wave4";
import {
  PREFERRED_CONTACT_METHOD_LABELS,
  PREFERRED_CONTACT_TIME_LABELS,
  isPreferredContactMethod,
  isPreferredContactTime,
} from "@/packages/pms/lib/guest-profile-overview";
import { listGuestAccountLinks } from "@/packages/pms/lib/guest-accounts.functions";
import { listGuestCustomFieldValues } from "@/packages/pms/lib/guest-custom-fields.functions";
import type { GuestProfile } from "@/packages/pms/lib/guests.functions";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";

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

function SectionPanel({
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
    <div
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
    </div>
  );
}

function DataRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-[#EFE9DF]/70 last:border-b-0">
      <span className="shrink-0 text-[#756A5B]">{label}</span>
      <span className="text-right font-medium text-[#251605]">
        {value != null && value !== "" ? value : "—"}
      </span>
    </div>
  );
}

export function GuestPersonalContactView({
  restaurantId,
  guest,
  onEdit,
}: {
  restaurantId: string;
  guest: GuestProfile;
  onEdit?: () => void;
}) {
  const fetchLinks = useServerFn(listGuestAccountLinks);
  const linksQuery = useQuery({
    queryKey: ["guest-account-links", restaurantId, guest.id],
    queryFn: () => fetchLinks({ data: { restaurantId, guestId: guest.id } }),
    retry: false,
  });

  const fetchCustomFields = useServerFn(listGuestCustomFieldValues);
  const customFieldsQuery = useQuery({
    queryKey: ["guest-custom-fields", restaurantId, guest.id],
    queryFn: () => fetchCustomFields({ data: { restaurantId, guestId: guest.id } }),
    retry: false,
  });
  const customFields = customFieldsQuery.data ?? [];

  const method =
    guest.preferredContactMethod && isPreferredContactMethod(guest.preferredContactMethod)
      ? PREFERRED_CONTACT_METHOD_LABELS[guest.preferredContactMethod]
      : guest.preferredContactMethod;
  const time =
    guest.preferredContactTime && isPreferredContactTime(guest.preferredContactTime)
      ? PREFERRED_CONTACT_TIME_LABELS[guest.preferredContactTime]
      : guest.preferredContactTime;

  // Caution 2: Map link only when coordinates are present
  const mapHref =
    guest.geoLatitude != null && guest.geoLongitude != null
      ? `https://www.google.com/maps?q=${guest.geoLatitude},${guest.geoLongitude}`
      : null;

  const age = guest.dateOfBirth ? calculateAge(guest.dateOfBirth) : null;
  const dobFormatted = guest.dateOfBirth
    ? `${formatStayDate(guest.dateOfBirth)}${age !== null ? ` (${age} yrs)` : ""}`
    : "—";

  const company = (linksQuery.data ?? []).find(
    (link) => link.role === "employer" || link.role === "bill_to",
  );

  return (
    <div className="space-y-4" data-testid="guest-personal-contact-view">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-[#251605]">Personal & Contact</h2>
          <p className="text-xs text-[#756A5B]">
            Consolidated demographic identity, direct communications, residential address, and emergency details.
          </p>
        </div>
        {onEdit && (
          <Button
            size="sm"
            onClick={onEdit}
            className="border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE] shadow-sm font-medium"
            variant="outline"
          >
            <Pencil className="mr-1.5 size-3.5" /> Edit Information
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Panel 1: Personal Information */}
        <SectionPanel
          title="Personal Information"
          icon={User}
          data-testid="personal-info-panel"
        >
          <DataRow
            label="Title"
            value={guest.title ? GUEST_TITLE_LABELS[guest.title] : null}
          />
          <DataRow label="Full Name" value={guest.fullName} />
          <DataRow label="Preferred Name" value={guest.preferredName} />
          <DataRow label="Middle Name" value={guest.middleName} />
          <DataRow
            label="Gender"
            value={guest.gender ? GUEST_GENDER_LABELS[guest.gender] : null}
          />
          <DataRow label="Date of Birth" value={dobFormatted} />
          <DataRow label="Nationality" value={guest.nationality} />
          <DataRow label="Language" value={guest.language} />
        </SectionPanel>

        {/* Panel 2: Contact Information */}
        <SectionPanel
          title="Contact Channels"
          icon={Phone}
          data-testid="contact-info-panel"
        >
          <DataRow label="Mobile Phone" value={guest.phone} />
          <DataRow label="Alternate Phone" value={guest.phoneAlt} />
          <DataRow label="Email Address" value={guest.email} />
          <DataRow label="Alternate Email" value={guest.emailAlt} />
          <DataRow label="Preferred Method" value={method} />
          <DataRow label="Preferred Contact Time" value={time} />
        </SectionPanel>

        {/* Panel 3: Address & Location */}
        <SectionPanel
          title="Residential Address"
          icon={MapPin}
          data-testid="address-info-panel"
        >
          <DataRow label="Address Line 1" value={guest.addressLine1} />
          <DataRow label="Address Line 2" value={guest.addressLine2} />
          <DataRow label="City" value={guest.city} />
          <DataRow label="State / Region" value={guest.region} />
          <DataRow label="Postal / ZIP Code" value={guest.postalCode} />
          <DataRow label="Country" value={guest.country} />
          {/* Caution 2: Truthful map check only */}
          {mapHref && (
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
          )}
        </SectionPanel>

        {/* Panel 4: Employment & Corporate Affiliation */}
        <SectionPanel
          title="Employment & Affiliations"
          icon={Briefcase}
          data-testid="employment-info-panel"
        >
          <DataRow label="Position / Title" value={guest.position} />
          <DataRow label="Department" value={guest.department} />
          {company ? (
            <DataRow
              label="Primary Company"
              value={`${company.masterName} (${GUEST_ACCOUNT_TYPE_LABELS[company.masterType]})`}
            />
          ) : (
            <DataRow label="Primary Company" value="No company linked" />
          )}
          {linksQuery.data && linksQuery.data.length > 1 && (
            <div className="pt-2 space-y-1">
              <span className="text-[#756A5B] text-[11px] font-semibold">Other Accounts:</span>
              <ul className="text-[#251605] text-xs list-disc list-inside space-y-0.5">
                {linksQuery.data.slice(1).map((l) => (
                  <li key={l.id}>
                    {l.masterName} ({l.role})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </SectionPanel>

        {/* Panel 5: Additional Information */}
        <SectionPanel
          title="Additional Information"
          icon={User}
          data-testid="additional-info-panel"
        >
          {customFields.length === 0 ? (
            <p className="text-[#8C827A] text-xs py-2">
              No additional property-specific information recorded.
            </p>
          ) : (
            customFields.map((field) => (
              <div
                key={field.fieldId}
                className="flex items-baseline justify-between gap-4 py-1.5 border-b border-[#EFE9DF]/70 last:border-b-0"
              >
                <div className="flex items-center gap-1.5 shrink-0 text-[#756A5B]">
                  <span>{field.name}</span>
                  {!field.active && (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-muted-foreground py-0 px-1 font-normal"
                    >
                      Inactive
                    </Badge>
                  )}
                </div>
                <span className="text-right font-medium text-[#251605]">
                  {field.formattedValue || "—"}
                </span>
              </div>
            ))
          )}
        </SectionPanel>
      </div>

      {/* Emergency Contacts Panel (Full Width) */}
      <SectionPanel
        title="Emergency Contacts"
        icon={ShieldAlert}
        data-testid="emergency-info-panel"
      >
        {guest.emergencyContacts.length === 0 ? (
          <p className="text-[#8C827A] text-xs py-2">No emergency contacts recorded for this guest.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
            {guest.emergencyContacts.map((contact) => (
              <div
                key={contact.id}
                className="rounded-lg border border-[#DDD4C5] bg-[#FAF8F5] p-3 space-y-1"
              >
                <p className="font-semibold text-[#251605] text-xs">{contact.name}</p>
                <p className="text-[11px] text-[#8A641A] font-semibold">
                  {contact.relationship || "Contact"}
                </p>
                {contact.phone && (
                  <p className="text-[11px] text-[#251605]">Tel: {contact.phone}</p>
                )}
                {contact.email && (
                  <p className="text-[11px] text-[#756A5B] truncate">Email: {contact.email}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionPanel>
    </div>
  );
}

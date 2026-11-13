import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Briefcase, ExternalLink, MapPin, Pencil, Phone, ShieldAlert, User } from "lucide-react";

import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { GuestTaxIdentitiesCard } from "@/packages/pms/components/guests/guest-tax-identities-card";
import { GUEST_GENDER_LABELS, GUEST_TITLE_LABELS } from "@/packages/pms/lib/guest-profile-individual";
import { GUEST_ACCOUNT_TYPE_LABELS, GUEST_RELATIONSHIP_ROLE_LABELS } from "@/packages/pms/lib/guest-profile-wave4";
import { nationalityValueForStored } from "@/packages/pms/lib/guest-nationalities";
import { formatGroupedPhone } from "@/packages/pms/lib/pms-property-setup-phone";
import {
  PREFERRED_CONTACT_METHOD_LABELS,
  PREFERRED_CONTACT_TIME_LABELS,
  isPreferredContactMethod,
  isPreferredContactTime,
} from "@/packages/pms/lib/guest-profile-overview";
import { listGuestAccountLinks } from "@/packages/pms/lib/guest-accounts.functions";
import { listGuestCustomFieldValues } from "@/packages/pms/lib/guest-custom-fields.functions";
import { CANONICAL_FIELD_CODE_MAP } from "@/packages/pms/lib/guest-field-rules";
import {
  isCompanyFieldCode,
  isTravelAgencyFieldCode,
  isGroupFieldCode,
} from "@/packages/pms/lib/guest-creation-field-definitions";
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
  testId,
  "data-testid": dataTestId,
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  testId?: string;
  "data-testid"?: string;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-lg border border-[#DDD4C5] bg-white px-3 py-2.5"
      data-testid={dataTestId || testId}
    >
      <div className="mb-2 flex items-center gap-1.5">
        {Icon ? <Icon className="size-3.5 text-[#8A641A]" /> : null}
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[#756A5B]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function relationshipRoleLabel(role: string): string {
  return role in GUEST_RELATIONSHIP_ROLE_LABELS
    ? GUEST_RELATIONSHIP_ROLE_LABELS[role as keyof typeof GUEST_RELATIONSHIP_ROLE_LABELS]
    : role;
}

function hasValue(value: ReactNode): boolean {
  return value != null && value !== "" && value !== false;
}

function FieldGrid({ fields }: { fields: Array<{ label: string; value: ReactNode }> }) {
  const filled = fields.filter((field) => hasValue(field.value));
  if (filled.length === 0) {
    return <p className="text-xs text-[#8C827A]">Nothing recorded.</p>;
  }
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
      {filled.map((field) => (
        <div key={field.label} className="min-w-0">
          <dt className="text-[10px] leading-none text-[#8C827A]">{field.label}</dt>
          <dd className="mt-0.5 break-words text-xs font-medium text-[#251605]">{field.value}</dd>
        </div>
      ))}
    </dl>
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
  const filteredCustomFields = useMemo(() => {
    return customFields.filter((field) => {
      const codeUpper = field.code.toUpperCase();
      return (
        !isCompanyFieldCode(codeUpper) &&
        !isTravelAgencyFieldCode(codeUpper) &&
        !isGroupFieldCode(codeUpper) &&
        !CANONICAL_FIELD_CODE_MAP[codeUpper]
      );
    });
  }, [customFields]);

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
    : null;

  const company = (linksQuery.data ?? []).find(
    (link) => link.role === "employer" || link.role === "bill_to",
  );
  const otherAccounts = (linksQuery.data ?? []).filter((link) => link.id !== company?.id);

  return (
    <div className="space-y-3" data-testid="guest-personal-contact-view">
      {onEdit ? (
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={onEdit}
            className="h-8 border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE] shadow-sm font-medium"
            variant="outline"
          >
            <Pencil className="mr-1.5 size-3.5" /> Edit Information
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <SectionPanel title="Personal Information" icon={User} data-testid="personal-info-panel">
          <FieldGrid
            fields={[
              { label: "Title", value: guest.title ? GUEST_TITLE_LABELS[guest.title] : null },
              { label: "Full Name", value: guest.fullName },
              { label: "Preferred Name", value: guest.preferredName },
              { label: "Middle Name", value: guest.middleName },
              { label: "Gender", value: guest.gender ? GUEST_GENDER_LABELS[guest.gender] : null },
              { label: "Date of Birth", value: dobFormatted },
              {
                label: "Nationality",
                value: guest.nationality ? nationalityValueForStored(guest.nationality) : null,
              },
              { label: "Language", value: guest.language },
            ]}
          />
        </SectionPanel>

        <SectionPanel title="Contact Channels" icon={Phone} data-testid="contact-info-panel">
          <FieldGrid
            fields={[
              { label: "Mobile Phone", value: formatGroupedPhone(guest.phone) || null },
              { label: "Alternate Phone", value: formatGroupedPhone(guest.phoneAlt) || null },
              { label: "Email Address", value: guest.email },
              { label: "Alternate Email", value: guest.emailAlt },
              { label: "Preferred Method", value: method },
              { label: "Preferred Contact Time", value: time },
            ]}
          />
        </SectionPanel>

        <SectionPanel title="Residential Address" icon={MapPin} data-testid="address-info-panel">
          <FieldGrid
            fields={[
              { label: "Address Line 1", value: guest.addressLine1 },
              { label: "Address Line 2", value: guest.addressLine2 },
              { label: "City", value: guest.city },
              { label: "State / Region", value: guest.region },
              { label: "Postal / ZIP Code", value: guest.postalCode },
              { label: "Country", value: guest.country },
            ]}
          />
          {mapHref ? (
            <a
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#8A641A] underline hover:text-[#725215]"
              href={mapHref}
              target="_blank"
              rel="noreferrer"
              data-testid="guest-overview-map"
            >
              <ExternalLink className="size-3" /> View on Map
            </a>
          ) : null}
        </SectionPanel>

        <SectionPanel
          title="Employment & Affiliations"
          icon={Briefcase}
          data-testid="employment-info-panel"
        >
          <FieldGrid
            fields={[
              { label: "Position / Title", value: guest.position },
              { label: "Department", value: guest.department },
              { label: "Source of Business", value: guest.sourceOfBusiness },
              {
                label: "Primary Company",
                value: company
                  ? `${company.masterName} (${GUEST_ACCOUNT_TYPE_LABELS[company.masterType]})`
                  : null,
              },
            ]}
          />
          {otherAccounts.length > 0 ? (
            <p className="mt-2 text-[11px] text-[#756A5B]">
              <span className="font-semibold">Other accounts: </span>
              {otherAccounts
                .map((link) => `${link.masterName} (${relationshipRoleLabel(link.role)})`)
                .join(" · ")}
            </p>
          ) : null}
        </SectionPanel>
      </div>

      {filteredCustomFields.length > 0 ? (
        <SectionPanel title="Other profile details" icon={User} data-testid="additional-info-panel">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
            {filteredCustomFields.map((field) => (
              <div key={field.fieldId} className="min-w-0">
                <dt className="flex items-center gap-1.5 text-[10px] leading-none text-[#8C827A]">
                  <span className="truncate">{field.name}</span>
                  {!field.active ? (
                    <Badge
                      variant="outline"
                      className="px-1 py-0 text-[10px] font-normal text-muted-foreground"
                    >
                      Inactive
                    </Badge>
                  ) : null}
                </dt>
                <dd className="mt-0.5 break-words text-xs font-medium text-[#251605]">
                  {field.formattedValue || "—"}
                </dd>
              </div>
            ))}
          </dl>
        </SectionPanel>
      ) : null}

      <SectionPanel title="Emergency Contacts" icon={ShieldAlert} data-testid="emergency-info-panel">
        {guest.emergencyContacts.length === 0 ? (
          <p className="text-xs text-[#8C827A]">No emergency contacts recorded for this guest.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {guest.emergencyContacts.map((contact) => (
              <div key={contact.id} className="min-w-0 text-xs">
                <p className="font-medium text-[#251605]">{contact.name}</p>
                <p className="break-words text-[11px] text-[#756A5B]">
                  {[
                    contact.relationship,
                    contact.phone ? formatGroupedPhone(contact.phone) : null,
                    contact.email,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Contact"}
                </p>
              </div>
            ))}
          </div>
        )}
      </SectionPanel>

      <GuestTaxIdentitiesCard restaurantId={restaurantId} guest={guest} />
    </div>
  );
}

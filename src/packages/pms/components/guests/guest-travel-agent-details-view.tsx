import { type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Building2,
  Calendar,
  FileText,
  Globe,
  MapPin,
  Pencil,
  Phone,
  ShieldCheck,
  Users,
} from "lucide-react";

import { getGuestAccount } from "@/packages/pms/lib/guest-accounts.functions";
import {
  AGENCY_TYPE_LABELS,
  type AgencyType,
} from "@/packages/pms/lib/guest-profile-travel-agency";
import { Button } from "@/shared/components/ui/button";

export function GuestTravelAgentDetailsView({
  restaurantId,
  agencyId,
  onEdit,
  onOpenEditDialog,
}: {
  restaurantId: string;
  agencyId: string;
  onEdit?: () => void;
  onOpenEditDialog?: () => void;
}) {
  const triggerEdit = onEdit ?? onOpenEditDialog;
  const fetchAccount = useServerFn(getGuestAccount);

  const accountQuery = useQuery({
    queryKey: ["guest-account", restaurantId, agencyId],
    queryFn: () => fetchAccount({ data: { restaurantId, accountId: agencyId } }),
    retry: false,
  });

  const agency = accountQuery.data;

  const typeLabel =
    agency?.agencyType && agency.agencyType in AGENCY_TYPE_LABELS
      ? AGENCY_TYPE_LABELS[agency.agencyType as AgencyType]
      : agency?.agencyType ?? "—";

  return (
    <div className="space-y-5" data-testid="travel-agent-details-view">
      {/* Top Banner with Edit Button */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#DDD4C5] bg-[#FAF8F5] p-3 shadow-sm">
        <div>
          <p className="font-display text-sm font-bold text-[#251605]">Master Agency Profile</p>
          <p className="text-xs text-[#756A5B]">
            Official corporate registration, licensing, contact identity and operational booking rules.
          </p>
        </div>
        {triggerEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={triggerEdit}
            className="border-[#DDD4C5] text-[#251605] hover:bg-white text-xs"
            data-testid="travel-agent-details-edit-btn"
          >
            <Pencil className="mr-1.5 size-3.5" />
            Edit Agency
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Section 1: Agency Identity */}
        <Section title="Agency Identity" icon={<Building2 className="size-4 text-[#8A641A]" />}>
          <div className="space-y-1 text-xs">
            <InfoRow label="Legal Agency Name" value={agency?.name} />
            <InfoRow label="Trade Name" value={agency?.tradeName} />
            <InfoRow label="Agency Code" value={agency?.code} />
            <InfoRow label="Agency Type" value={typeLabel} />
            <InfoRow
              label="Account Status"
              value={
                agency?.accountStatus ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={`size-2 rounded-full ${
                        agency.accountStatus === "active" ? "bg-emerald-600" : "bg-stone-400"
                      }`}
                    />
                    <span className="capitalize font-semibold">{agency.accountStatus}</span>
                  </span>
                ) : (
                  "—"
                )
              }
            />
            {agency?.logoStoragePath ? (
              <InfoRow label="Logo Storage" value={<span className="font-mono text-[10px]">{agency.logoStoragePath}</span>} truncate />
            ) : null}
          </div>
        </Section>

        {/* Section 2: Registration & License */}
        <Section title="Registration & License" icon={<ShieldCheck className="size-4 text-[#8A641A]" />}>
          <div className="space-y-1 text-xs">
            <InfoRow label="IATA / License Number" value={agency?.iataLicenseNumber} />
            <InfoRow label="License Expiry" value={agency?.licenseExpiryDate} />
            <InfoRow label="Tax ID" value={agency?.taxId} />
            <InfoRow label="Business Registration Number" value={agency?.businessRegistrationNumber} />
          </div>
        </Section>

        {/* Section 3: Contact Information */}
        <Section title="Contact Information" icon={<Phone className="size-4 text-[#8A641A]" />}>
          <div className="space-y-1 text-xs">
            <InfoRow label="Primary Contact" value={agency?.primaryContactName} />
            <InfoRow label="Phone" value={agency?.phone} />
            <InfoRow label="Alternate Phone" value={agency?.phoneAlt} />
            <InfoRow label="Business Email" value={agency?.email} />
            <InfoRow label="Alternate Email" value={agency?.emailAlt} />
            <InfoRow
              label="Website"
              value={
                agency?.website ? (
                  <a
                    href={agency.website.startsWith("http") ? agency.website : `https://${agency.website}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline text-[#8A641A]"
                  >
                    {agency.website}
                  </a>
                ) : (
                  "—"
                )
              }
            />
          </div>
        </Section>

        {/* Section 4: Address */}
        <Section title="Address" icon={<MapPin className="size-4 text-[#8A641A]" />}>
          <div className="space-y-1 text-xs">
            <InfoRow label="Address Line 1" value={agency?.addressLine1} />
            <InfoRow label="Address Line 2" value={agency?.addressLine2} />
            <InfoRow label="City" value={agency?.city} />
            <InfoRow label="Region" value={agency?.region} />
            <InfoRow label="Postal Code" value={agency?.postalCode} />
            <InfoRow label="Country" value={agency?.country} />
          </div>
        </Section>

        {/* Section 5: Commercial Identity */}
        <Section title="Commercial Identity" icon={<FileText className="size-4 text-[#8A641A]" />}>
          <div className="space-y-1 text-xs">
            <InfoRow label="Preferred Currency" value={agency?.preferredCurrency ?? "ETB"} />
            <InfoRow label="Market Segment" value={agency?.marketSegmentId ? "Configured" : "General"} />
            <InfoRow label="Billing Contact" value={agency?.billingContactName ?? agency?.primaryContactName} />
            <InfoRow label="Payment Terms" value={agency?.paymentTerms} />
            <InfoRow label="Credit Limit Note" value={agency?.creditLimitNote} />
            <InfoRow label="Billing Instruction" value={agency?.billingInstruction} />
          </div>
        </Section>

        {/* Section 6: Booking Relationship */}
        <Section title="Booking Relationship" icon={<Users className="size-4 text-[#8A641A]" />}>
          <div className="space-y-1 text-xs">
            <InfoRow
              label="Booking Access"
              value={<span className="capitalize">{agency?.bookingAccess ?? "Open"}</span>}
            />
            <InfoRow
              label="Group Bookings Allowed"
              value={agency?.groupBookingsAllowed ? "Allowed" : "Not Permitted"}
            />
            <InfoRow
              label="Advance Booking Limit"
              value={agency?.maxAdvanceBookingDays ? `${agency.maxAdvanceBookingDays} days` : "No limit"}
            />
            <InfoRow
              label="Min / Max Stay"
              value={
                agency?.minStayNights || agency?.maxStayNights
                  ? `${agency.minStayNights ?? 1} min / ${agency.maxStayNights ?? "—"} max nights`
                  : "Standard policy"
              }
            />
          </div>
        </Section>
      </div>

      {/* Section 7: Audit */}
      <Section title="Audit Metadata" icon={<Calendar className="size-4 text-[#8A641A]" />}>
        <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
          <InfoRow label="System ID" value={agencyId} truncate />
          <InfoRow
            label="Created"
            value={agency?.createdAt ? new Date(agency.createdAt).toLocaleString() : "—"}
          />
          <InfoRow
            label="Last Updated"
            value={agency?.updatedAt ? new Date(agency.updatedAt).toLocaleString() : "—"}
          />
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 border-b border-[#F0EAE1] pb-2">
        {icon}
        <h3 className="font-display text-sm font-bold text-[#251605]">{title}</h3>
      </div>
      {children}
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

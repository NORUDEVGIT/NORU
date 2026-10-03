import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Building2,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  DollarSign,
  ExternalLink,
  Mail,
  MapPin,
  Pencil,
  Percent,
  Plus,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  addTravelAgentNote,
  listTravelAgentContacts,
  listTravelAgentCommissionPlans,
  listTravelAgentCommissionEntries,
} from "@/packages/pms/lib/guest-travel-agent-detail.functions";
import { listGuestAccountHistory, listGuestAccountLinks } from "@/packages/pms/lib/guest-accounts.functions";
import { AGENCY_TYPE_LABELS, type AgencyType } from "@/packages/pms/lib/guest-profile-travel-agency";
import {
  formatMoneyOrDash,
  type CanonicalTravelAgentViewId,
} from "@/packages/pms/lib/guest-travel-agent-detail-workspace";
import {
  GUEST_PROFILE_DETAIL_PATH,
  guestProfileSearch,
} from "@/packages/pms/lib/guest-profile-wave1";

type OverviewData = Awaited<
  ReturnType<typeof import("@/packages/pms/lib/guest-travel-agent-detail.functions").getTravelAgentDetailWorkspace>
>;

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

export function GuestTravelAgentOverviewView({
  restaurantId,
  agencyId,
  data,
  onNavigate,
  onEdit,
}: {
  restaurantId: string;
  agencyId: string;
  data: OverviewData;
  onNavigate: (nav: CanonicalTravelAgentViewId) => void;
  onEdit: () => void;
}) {
  const queryClient = useQueryClient();
  const loadContacts = useServerFn(listTravelAgentContacts);
  const loadHistory = useServerFn(listGuestAccountHistory);
  const loadLinks = useServerFn(listGuestAccountLinks);
  const loadPlans = useServerFn(listTravelAgentCommissionPlans);
  const loadEntries = useServerFn(listTravelAgentCommissionEntries);
  const addNote = useServerFn(addTravelAgentNote);

  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");

  const contacts = useQuery({
    queryKey: ["travel-agent-contacts", restaurantId, agencyId, "overview"],
    queryFn: () => loadContacts({ data: { restaurantId, agencyId, limit: 5, offset: 0 } }),
  });
  const history = useQuery({
    queryKey: ["guest-account-history", restaurantId, agencyId],
    queryFn: () => loadHistory({ data: { restaurantId, accountId: agencyId } }),
  });
  const links = useQuery({
    queryKey: ["guest-account-links", restaurantId, agencyId],
    queryFn: () => loadLinks({ data: { restaurantId, accountId: agencyId } }),
  });
  const plans = useQuery({
    queryKey: ["travel-agent-commission-plans", restaurantId, agencyId],
    queryFn: () => loadPlans({ data: { restaurantId, agencyId } }),
  });
  const entries = useQuery({
    queryKey: ["travel-agent-commission-entries", restaurantId, agencyId],
    queryFn: () => loadEntries({ data: { restaurantId, agencyId } }),
  });

  const noteMutation = useMutation({
    mutationFn: () => addNote({ data: { restaurantId, agencyId, note: noteText } }),
    onSuccess: async () => {
      setNoteText("");
      setNoteOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["travel-agent-notes", restaurantId, agencyId] });
      await queryClient.invalidateQueries({ queryKey: ["guest-account-history", restaurantId, agencyId] });
      toast.success("Note added.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const typeLabel =
    data.agency.agencyType && data.agency.agencyType in AGENCY_TYPE_LABELS
      ? AGENCY_TYPE_LABELS[data.agency.agencyType as AgencyType]
      : data.agency.agencyType ?? "Travel Agency";

  const primaryContact = contacts.data?.items.find((c) => c.isPrimary) ?? contacts.data?.items[0];
  const primaryContactName = data.agency.primaryContactName || primaryContact?.name || "—";

  const activePlan = plans.data?.items.find((p) => p.active);
  const planSummaryLabel = activePlan
    ? `${activePlan.commissionType === "percent" ? `${activePlan.rateValue}%` : `${activePlan.rateValue} ${activePlan.currency}`}`
    : data.commission.configured
      ? data.commission.defaultRateLabel ?? "Configured"
      : "Not configured";

  const outstandingCommission = entries.data?.totals.outstanding ?? data.commission.totals.outstanding;
  const recentBooking = data.recentBookings[0];

  return (
    <div className="space-y-4" data-testid="travel-agent-overview">
      {/* ROW 1: Compact 6-KPI Summary Strip */}
      <div
        className="grid grid-cols-2 divide-y divide-[#DDD4C5] rounded-xl border border-[#DDD4C5] bg-white p-2.5 sm:grid-cols-3 sm:divide-y-0 sm:divide-x lg:grid-cols-6 shadow-sm"
        data-testid="travel-agent-overview-kpi-strip"
      >
        {/* KPI 1: Status */}
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Status
          </span>
          <div className="mt-1 flex items-center gap-1.5">
            <span
              className={`size-2 rounded-full ${
                data.agency.accountStatus === "active"
                  ? "bg-emerald-600 ring-2 ring-emerald-500/20"
                  : "bg-stone-400"
              }`}
            />
            <span className="text-xs font-semibold capitalize text-[#251605]">
              {data.agency.accountStatus === "active" ? "Active" : "Inactive"}
            </span>
          </div>
        </div>

        {/* KPI 2: Agency Type */}
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Agency Type
          </span>
          <span className="mt-1 text-xs font-semibold text-[#8A641A] truncate">
            {typeLabel}
          </span>
        </div>

        {/* KPI 3: Total Bookings */}
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Total Bookings
          </span>
          <span className="mt-1 font-mono text-sm font-bold text-[#251605]">
            {data.kpis.totalBookings}
          </span>
        </div>

        {/* KPI 4: Linked Travelers */}
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Linked Travelers
          </span>
          <span className="mt-1 font-mono text-sm font-bold text-[#251605]">
            {data.kpis.totalGuests}
          </span>
        </div>

        {/* KPI 5: Commission Plan */}
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Commission Plan
          </span>
          <span className="mt-1 text-xs font-semibold text-[#251605] truncate">
            {planSummaryLabel}
          </span>
        </div>

        {/* KPI 6: Outstanding Commission */}
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Outstanding
          </span>
          <span className="mt-1 font-mono text-sm font-bold text-[#251605] truncate">
            {activePlan || data.commission.configured
              ? outstandingCommission != null
                ? outstandingCommission.toLocaleString(undefined, { minimumFractionDigits: 2 })
                : "0.00"
              : "Not configured"}
          </span>
        </div>
      </div>

      {/* ROW 2: Primary Row (Three Compact Panels) */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Panel 1: Agency Information */}
        <SectionCard
          title="Agency Information"
          icon={Building2}
          actions={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onEdit}
              className="h-7 text-xs text-[#8A641A] hover:text-[#251605]"
              data-testid="travel-agent-overview-edit-agency"
            >
              <Pencil className="mr-1 size-3" />
              Edit
            </Button>
          }
          data-testid="travel-agent-overview-agency-info"
        >
          <InfoRow label="Agency Code" value={data.agency.code ?? "—"} />
          <InfoRow label="Agency Type" value={typeLabel} />
          <InfoRow label="IATA / License" value={data.agency.iataLicenseNumber ?? "—"} />
          <InfoRow label="Registration No." value={data.agency.businessRegistrationNumber ?? "—"} />
          <InfoRow label="Tax ID" value={data.agency.taxId ?? "—"} />
          <InfoRow label="Status" value={<span className="capitalize">{data.agency.accountStatus}</span>} />
        </SectionCard>

        {/* Panel 2: Primary Contact & Address */}
        <SectionCard
          title="Primary Contact & Address"
          icon={MapPin}
          actions={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onNavigate("contacts-travelers")}
              className="h-7 text-xs text-[#8A641A] hover:text-[#251605]"
            >
              Manage
            </Button>
          }
          data-testid="travel-agent-overview-primary-contact"
        >
          <InfoRow label="Primary Contact" value={primaryContactName} />
          <InfoRow label="Phone" value={data.agency.phone ?? primaryContact?.phone ?? "—"} />
          <InfoRow label="Email" value={data.agency.email ?? primaryContact?.email ?? "—"} truncate />
          <InfoRow
            label="Location"
            value={[data.agency.city, data.agency.country].filter(Boolean).join(", ") || "—"}
            truncate
          />
          <InfoRow
            label="Website"
            value={
              data.agency.website ? (
                <a
                  href={data.agency.website.startsWith("http") ? data.agency.website : `https://${data.agency.website}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline text-[#8A641A]"
                >
                  {data.agency.website}
                </a>
              ) : "—"
            }
            truncate
          />
        </SectionCard>

        {/* Panel 3: Upcoming / Recent Booking */}
        <SectionCard
          title="Upcoming / Recent Booking"
          icon={Calendar}
          actions={
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-[#8A641A] hover:text-[#251605]"
            >
              <Link to="/restaurant/pms/reservations" search={{ create: "new", travelAgentId: agencyId }}>
                <Plus className="mr-1 size-3" />
                New Booking
              </Link>
            </Button>
          }
          data-testid="travel-agent-overview-recent-booking"
        >
          {recentBooking ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-mono font-semibold text-[#8A641A]">
                  {recentBooking.confirmationNumber}
                </span>
                <span className="rounded-full bg-[#FAF8F5] border border-[#DDD4C5] px-2 py-0.5 text-[10px] capitalize text-[#756A5B]">
                  {recentBooking.status.replaceAll("_", " ")}
                </span>
              </div>
              <InfoRow label="Guest" value={recentBooking.guestName} />
              <InfoRow label="Arrival" value={recentBooking.arrivalDate} />
              <InfoRow label="Departure" value={recentBooking.departureDate} />
              <InfoRow label="Room Type" value={recentBooking.roomLabel} />
              <div className="pt-1">
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={() => onNavigate("bookings")}
                  className="p-0 text-xs text-[#8A641A] hover:underline"
                >
                  View all bookings →
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-[#8C827A] italic">
              No bookings on file.
            </div>
          )}
        </SectionCard>
      </div>

      {/* ROW 3: Secondary Row (Three Compact Panels) */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Panel 1: Commercial & Commission Snapshot */}
        <SectionCard
          title="Commercial & Commission Snapshot"
          icon={DollarSign}
          actions={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onNavigate("commercial-commission")}
              className="h-7 text-xs text-[#8A641A] hover:text-[#251605]"
            >
              Manage
            </Button>
          }
          data-testid="travel-agent-overview-commercial-snapshot"
        >
          <InfoRow
            label="Active Plan"
            value={activePlan ? `${activePlan.commissionType === "percent" ? `${activePlan.rateValue}%` : `${activePlan.rateValue} ${activePlan.currency}`}` : "Not configured"}
          />
          <InfoRow
            label="Outstanding"
            value={activePlan || data.commission.configured ? (outstandingCommission != null ? outstandingCommission.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "0.00") : "Not configured"}
          />
          <InfoRow label="Payment Terms" value={data.agency.paymentTerms ?? "—"} />
          <InfoRow label="Preferred Currency" value={data.agency.preferredCurrency ?? "ETB"} />
          <InfoRow label="Booking Access" value={<span className="capitalize">{data.agency.bookingAccess ?? "Open"}</span>} />
        </SectionCard>

        {/* Panel 2: Linked Travelers */}
        <SectionCard
          title="Linked Travelers"
          icon={Users}
          actions={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onNavigate("contacts-travelers")}
              className="h-7 text-xs text-[#8A641A] hover:text-[#251605]"
            >
              View All ({links.data?.length ?? 0})
            </Button>
          }
          data-testid="travel-agent-overview-linked-travelers"
        >
          {links.isLoading ? (
            <p className="text-[#756A5B] italic">Loading travelers…</p>
          ) : !links.data?.length ? (
            <p className="py-6 text-center text-[#8C827A] italic">No linked travelers.</p>
          ) : (
            <div className="space-y-1.5">
              {links.data.slice(0, 3).map((l) => (
                <div key={l.id} className="flex items-center justify-between py-1 border-b border-[#EFE9DF]/50 last:border-b-0">
                  <span className="font-medium text-[#251605]">{l.guestName}</span>
                  <span className="text-[11px] text-[#756A5B]">{l.role.replaceAll("_", " ")}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Panel 3: Recent Activity */}
        <SectionCard
          title="Recent Activity"
          icon={ShieldCheck}
          actions={
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setNoteOpen(true)}
                className="h-7 text-xs text-[#8A641A] hover:text-[#251605]"
                data-testid="travel-agent-overview-add-note-btn"
              >
                + Note
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onNavigate("activity")}
                className="h-7 text-xs text-[#8A641A] hover:text-[#251605]"
              >
                History →
              </Button>
            </div>
          }
          data-testid="travel-agent-overview-recent-activity"
        >
          {history.isLoading ? (
            <p className="text-[#756A5B] italic">Loading events…</p>
          ) : !history.data?.length ? (
            <p className="py-6 text-center text-[#8C827A] italic">No recent events recorded.</p>
          ) : (
            <div className="space-y-1.5">
              {history.data.slice(0, 3).map((event) => (
                <div key={event.id} className="py-1 border-b border-[#EFE9DF]/50 last:border-b-0">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold capitalize text-[#251605]">
                      {event.eventType.replaceAll("_", " ")}
                    </span>
                    <span className="text-[#8C827A]">
                      {new Date(event.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {event.notes && (
                    <p className="truncate text-[11px] text-[#756A5B] mt-0.5">{event.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Note Creation Dialog */}
      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">Add Note for {data.agency.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Enter structured operational note…"
              rows={4}
              className="border-[#DDD4C5] text-xs"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setNoteOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!noteText.trim() || noteMutation.isPending}
              onClick={() => noteMutation.mutate()}
              className="bg-[#C89933] text-[#251605] hover:bg-[#B88928]"
            >
              Save Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

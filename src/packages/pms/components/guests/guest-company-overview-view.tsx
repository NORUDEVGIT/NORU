import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Building2,
  Calendar,
  CheckCircle2,
  DollarSign,
  Download,
  ExternalLink,
  FileCheck,
  Mail,
  MapPin,
  Pencil,
  Plus,
  ShieldAlert,
  UserCheck,
} from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { addCompanyNote, listCompanyContacts } from "@/packages/pms/lib/guest-company-detail.functions";
import { listGuestAccountHistory, listGuestAccountLinks } from "@/packages/pms/lib/guest-accounts.functions";
import { sendGuestAccountMessage, exportGuestAccount } from "@/packages/pms/lib/guest-privacy.functions";
import {
  formatMoneyLabel,
  COMPANY_RATE_NO,
  COMPANY_RATE_YES,
  type CompanyDetailNavId,
} from "@/packages/pms/lib/guest-company-detail-workspace";
import {
  GUEST_PROFILE_DETAIL_PATH,
  guestProfileSearch,
} from "@/packages/pms/lib/guest-profile-wave1";

type OverviewData = Awaited<
  ReturnType<typeof import("@/packages/pms/lib/guest-company-detail.functions").getCompanyDetailWorkspace>
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

export function GuestCompanyOverviewView({
  restaurantId,
  companyId,
  data,
  onNavigate,
  onEdit,
}: {
  restaurantId: string;
  companyId: string;
  data: OverviewData;
  onNavigate: (nav: CompanyDetailNavId) => void;
  onEdit: () => void;
}) {
  const queryClient = useQueryClient();
  const loadContacts = useServerFn(listCompanyContacts);
  const loadHistory = useServerFn(listGuestAccountHistory);
  const loadLinks = useServerFn(listGuestAccountLinks);
  const addNote = useServerFn(addCompanyNote);
  const sendEmail = useServerFn(sendGuestAccountMessage);
  const exportAccount = useServerFn(exportGuestAccount);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailBody, setEmailBody] = useState("");

  const contacts = useQuery({
    queryKey: ["company-contacts", restaurantId, companyId, "overview"],
    queryFn: () => loadContacts({ data: { restaurantId, companyId, limit: 5, offset: 0 } }),
  });
  const history = useQuery({
    queryKey: ["guest-account-history", restaurantId, companyId],
    queryFn: () => loadHistory({ data: { restaurantId, accountId: companyId } }),
  });
  const links = useQuery({
    queryKey: ["guest-account-links", restaurantId, companyId],
    queryFn: () => loadLinks({ data: { restaurantId, accountId: companyId } }),
  });

  const noteMutation = useMutation({
    mutationFn: () => addNote({ data: { restaurantId, companyId, note: noteText } }),
    onSuccess: async () => {
      setNoteText("");
      setNoteOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["company-detail", restaurantId, companyId] });
      await queryClient.invalidateQueries({ queryKey: ["guest-account-history", restaurantId, companyId] });
      toast.success("Note added.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const emailMutation = useMutation({
    mutationFn: () => sendEmail({ data: { restaurantId, accountId: companyId, body: emailBody } }),
    onSuccess: () => {
      setEmailOpen(false);
      setEmailBody("");
      toast.success("Email sent.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reportMutation = useMutation({
    mutationFn: () => exportAccount({ data: { restaurantId, accountId: companyId } }),
    onSuccess: (result) => {
      const blob = new Blob([result.jsonText], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Company report downloaded.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const emailReady = Boolean(data.company.email?.trim());
  const primaryContact = contacts.data?.items.find((c) => c.isPrimary);
  const primaryContactName = data.company.primaryContactName || primaryContact?.name || "—";
  const primaryContactTitle = data.company.primaryContactTitle || primaryContact?.position || "—";

  return (
    <div className="space-y-4" data-testid="company-overview">
      {/* ROW 1: Compact 6-KPI Summary Strip */}
      <div
        className="grid grid-cols-2 divide-y divide-[#DDD4C5] rounded-xl border border-[#DDD4C5] bg-white p-2.5 sm:grid-cols-3 sm:divide-y-0 sm:divide-x lg:grid-cols-6 shadow-sm"
        data-testid="company-overview-kpi-strip"
      >
        {/* KPI 1: Status */}
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Status
          </span>
          <div className="mt-1 flex items-center gap-1.5">
            <span
              className={`size-2 rounded-full ${
                data.company.accountStatus === "active"
                  ? "bg-emerald-600 ring-2 ring-emerald-500/20"
                  : "bg-stone-400"
              }`}
            />
            <span className="text-xs font-semibold capitalize text-[#251605]">
              {data.company.accountStatus === "active" ? "Active" : "Inactive"}
            </span>
          </div>
        </div>

        {/* KPI 2: Business Type */}
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Business Type
          </span>
          <span className="mt-1 text-xs font-semibold text-[#8A641A] truncate">
            {data.businessType?.name ?? "Corporate"}
          </span>
        </div>

        {/* KPI 3: Billing Terms / Credit */}
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Billing Terms
          </span>
          <span className="mt-1 text-xs font-semibold text-[#251605] truncate">
            {data.company.creditAccountEnabled ? "Credit Eligible" : "Direct / Advance"}
          </span>
        </div>

        {/* KPI 4: Total Stays */}
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Total Stays ({data.periodYear})
          </span>
          <span className="mt-1 font-mono text-sm font-bold text-[#251605]">
            {data.kpis.totalReservations}
          </span>
        </div>

        {/* KPI 5: Linked Travelers */}
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Linked Travelers
          </span>
          <span className="mt-1 font-mono text-sm font-bold text-[#251605]">
            {data.kpis.totalGuests}
          </span>
        </div>

        {/* KPI 6: Folio Revenue */}
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Folio Value
          </span>
          <span className="mt-1 font-mono text-sm font-bold text-[#251605] truncate">
            {data.folioAccess ? formatMoneyLabel(data.kpis.totalRevenue) : "—"}
          </span>
        </div>
      </div>

      {/* ROW 2: Primary Summary Row (3 compact panels: Company Info, Contact & Address, Upcoming Stay) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Panel 1: Company Information */}
        <SectionCard
          title="Company Information"
          icon={Building2}
          data-testid="company-overview-info"
          actions={
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-[#756A5B] hover:text-[#251605] hover:bg-[#F7F4EE]"
              onClick={onEdit}
            >
              <Pencil className="mr-1 size-3" /> Edit
            </Button>
          }
        >
          <InfoRow label="Company Code" value={data.company.code} />
          <InfoRow label="Company Name" value={data.company.name} />
          <InfoRow label="Business Type" value={data.businessType?.name ?? "Corporate"} />
          <InfoRow
            label="Account Status"
            value={data.company.accountStatus === "active" ? "Active" : "Inactive"}
          />
          <InfoRow
            label="Negotiated Rate Reference"
            value={
              data.company.negotiatedRateReference ? (
                <span>
                  {data.company.negotiatedRateReference}{" "}
                  <span className="text-[10px] font-normal text-[#756A5B]">(Reference only)</span>
                </span>
              ) : (
                "—"
              )
            }
          />
          <InfoRow
            label="Credit Account"
            value={data.company.creditAccountEnabled ? "Enabled" : "Disabled"}
          />
          <InfoRow label="Total Travelers" value={String(data.kpis.totalGuests)} />
          <InfoRow
            label="Avg Stay Length"
            value={data.kpis.averageLengthOfStay != null ? `${data.kpis.averageLengthOfStay} nts` : "—"}
          />
        </SectionCard>

        {/* Panel 2: Primary Contact & Address */}
        <SectionCard
          title="Primary Contact & Address"
          icon={MapPin}
          data-testid="company-overview-contact"
          actions={
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-[#756A5B] hover:text-[#251605] hover:bg-[#F7F4EE]"
              onClick={() => onNavigate("contacts")}
            >
              <Pencil className="mr-1 size-3" /> Manage
            </Button>
          }
        >
          <InfoRow label="Primary Contact" value={primaryContactName} />
          <InfoRow label="Position / Title" value={primaryContactTitle} />
          <InfoRow label="Company Phone" value={data.company.phone} />
          <InfoRow label="Company Email" value={data.company.email} truncate />
          <InfoRow label="Website" value={data.company.website} truncate />
          <div className="border-t border-[#DDD4C5]/60 pt-2 mt-1">
            <InfoRow label="Address" value={data.company.addressLine1} />
            <InfoRow
              label="City / Country"
              value={[data.company.city, data.company.country].filter(Boolean).join(", ") || null}
            />
            {data.company.website ? (
              <div className="pt-2 text-right">
                <a
                  className="inline-flex items-center gap-1 text-xs text-[#8A641A] hover:text-[#725215] font-semibold underline"
                  href={
                    data.company.website.startsWith("http")
                      ? data.company.website
                      : `https://${data.company.website}`
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="size-3" /> Visit Website
                </a>
              </div>
            ) : null}
          </div>
        </SectionCard>

        {/* Panel 3: Upcoming Reservation */}
        <SectionCard
          title="Upcoming Reservation"
          icon={Calendar}
          data-testid="company-overview-upcoming"
          actions={
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-[#756A5B] hover:text-[#251605] hover:bg-[#F7F4EE]"
              onClick={() => onNavigate("reservations")}
            >
              View Reservations
            </Button>
          }
        >
          {(() => {
            const featuredStay = data.upcoming[0];
            return featuredStay ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-[#8A641A]">
                    {featuredStay.confirmationNumber}
                  </span>
                  <span className="rounded-full bg-[#FAF8F5] border border-[#DDD4C5] px-2 py-0.5 text-[10px] font-semibold capitalize text-[#251605]">
                    {featuredStay.status.replace("_", " ")}
                  </span>
                </div>
                <InfoRow
                  label="Dates"
                  value={`${featuredStay.arrivalDate} → ${featuredStay.departureDate}`}
                />
                <InfoRow label="Nights" value={String(featuredStay.nights)} />
                <InfoRow label="Room" value={featuredStay.roomLabel} />

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#DDD4C5]/60">
                  <Button
                    asChild
                    size="sm"
                    className="h-7 text-xs bg-[#8A641A] hover:bg-[#725215] text-white font-medium shadow-sm"
                  >
                    <Link
                      to="/restaurant/pms/reservations/$reservationId"
                      params={{ reservationId: featuredStay.id }}
                    >
                      Open Reservation
                    </Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-[#756A5B] space-y-2">
                <p>No upcoming reservations for this company.</p>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE]"
                >
                  <Link to="/restaurant/pms/reservations" search={{ create: "new", companyId }}>
                    <Plus className="mr-1 size-3" /> New Reservation
                  </Link>
                </Button>
              </div>
            );
          })()}
        </SectionCard>
      </div>

      {/* ROW 3: Secondary Summary Row (3 compact panels: Commercial Snapshot, Linked Travelers, Recent Activity) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Panel 1: Commercial Snapshot */}
        <SectionCard
          title="Commercial Snapshot"
          icon={DollarSign}
          data-testid="company-overview-commercial"
          actions={
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-[#756A5B] hover:text-[#251605] hover:bg-[#F7F4EE]"
              onClick={() => onNavigate("commercial-billing")}
            >
              View Terms
            </Button>
          }
        >
          <InfoRow
            label="Credit Account"
            value={data.company.creditAccountEnabled ? "Enabled" : "Disabled"}
          />
          <InfoRow
            label="Credit Permitted"
            value={data.businessType?.creditAccountAllowed ? "Allowed" : "Restricted"}
          />
          <InfoRow
            label="Negotiated Rate Reference"
            value={
              data.company.negotiatedRateReference ? (
                <span>
                  {data.company.negotiatedRateReference}{" "}
                  <span className="text-[10px] font-normal text-[#756A5B]">(Reference only)</span>
                </span>
              ) : (
                "—"
              )
            }
          />
          <InfoRow
            label="Active Agreements"
            value={
              data.agreements.length > 0 ? (
                <span className="font-semibold text-[#8A641A]">{data.agreements.length} Active</span>
              ) : (
                "None"
              )
            }
          />
          <InfoRow
            label="Contact Policy"
            value={data.businessType?.contactRequired ? "Mandatory" : "Optional"}
          />
          <div className="flex items-center justify-between pt-2 border-t border-[#DDD4C5]/60">
            <span className="text-[#756A5B]">Folio Billing Access</span>
            {data.folioAccess ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                <CheckCircle2 className="size-3" /> Authorized
              </span>
            ) : (
              <span className="rounded-full bg-stone-100 border border-stone-200 px-2 py-0.5 text-[10px] font-medium text-stone-600">
                Restricted
              </span>
            )}
          </div>
        </SectionCard>

        {/* Panel 2: Linked Travelers */}
        <SectionCard
          title="Linked Travelers"
          icon={UserCheck}
          data-testid="company-overview-travelers"
          actions={
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-[#756A5B] hover:text-[#251605] hover:bg-[#F7F4EE]"
              onClick={() => onNavigate("travelers")}
            >
              Manage
            </Button>
          }
        >
          {links.isLoading ? (
            <p className="py-6 text-center text-[#756A5B]">Loading travelers…</p>
          ) : (links.data?.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-[#756A5B]">No guests linked to this company.</p>
          ) : (
            <div className="space-y-2">
              {links.data!.slice(0, 3).map((link) => (
                <div
                  key={link.id}
                  className="flex items-center justify-between rounded-lg border border-[#DDD4C5] bg-[#FAF8F5] p-2"
                >
                  <div className="min-w-0">
                    <Link
                      to={GUEST_PROFILE_DETAIL_PATH}
                      params={{ guestId: link.guestId }}
                      search={guestProfileSearch({ type: "individual", nav: "overview" })}
                      className="truncate font-semibold text-[#251605] text-xs hover:text-[#8A641A] underline"
                    >
                      {link.guestName}
                    </Link>
                    <p className="text-[10px] text-[#756A5B]">
                      Role: {link.role}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Panel 3: Recent Activity */}
        <SectionCard
          title="Recent Activity"
          icon={ShieldAlert}
          data-testid="company-overview-activity"
          actions={
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE]"
                onClick={() => setNoteOpen(true)}
                data-testid="company-overview-add-note-btn"
              >
                <Plus className="mr-1 size-3" /> Add Note
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-[#756A5B] hover:text-[#251605] hover:bg-[#F7F4EE]"
                onClick={() => onNavigate("activity")}
              >
                View All
              </Button>
            </div>
          }
        >
          {history.isLoading ? (
            <p className="py-6 text-center text-[#756A5B]">Loading activity…</p>
          ) : (history.data?.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-[#756A5B]">No activity entries recorded yet.</p>
          ) : (
            <div className="space-y-1.5">
              {history.data!.slice(0, 3).map((row) => (
                <div
                  key={row.id}
                  className="rounded-lg border border-[#DDD4C5]/80 bg-[#FAF8F5] p-2 text-xs"
                >
                  <p className="font-semibold text-[#251605] capitalize">
                    {row.eventType.replaceAll("_", " ")}
                  </p>
                  {row.notes ? <p className="text-[#756A5B] mt-0.5 truncate">{row.notes}</p> : null}
                  <p className="mt-1 text-[10px] text-[#8C827A]">{row.createdAt}</p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Quick Add Note Dialog */}
      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Note for {data.company.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Textarea
              className="min-h-[90px] text-xs border-[#DDD4C5] bg-white"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Enter note details…"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setNoteOpen(false);
                setNoteText("");
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-[#8A641A] text-white hover:bg-[#725215]"
              disabled={!noteText.trim() || noteMutation.isPending}
              onClick={() => noteMutation.mutate()}
            >
              Save Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Modal Dialog */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Email to {data.company.name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Recipient: {data.company.email}</p>
          <Input
            value={emailBody}
            onChange={(event) => setEmailBody(event.target.value)}
            placeholder="Type message content…"
          />
          <DialogFooter>
            <Button
              type="button"
              disabled={!emailBody.trim() || emailMutation.isPending}
              onClick={() => emailMutation.mutate()}
            >
              Send Message
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const GuestCompanyOverview = GuestCompanyOverviewView;

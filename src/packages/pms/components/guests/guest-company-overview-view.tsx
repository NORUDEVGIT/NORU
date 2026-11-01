import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Building2,
  Calendar,
  DollarSign,
  ExternalLink,
  MapPin,
  Plus,
  ScrollText,
  UserCheck,
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
import { addCompanyNote } from "@/packages/pms/lib/guest-company-detail.functions";
import { listGuestAccountHistory, listGuestAccountLinks } from "@/packages/pms/lib/guest-accounts.functions";
import type { CompanyDetailNavId } from "@/packages/pms/lib/guest-company-detail-workspace";
import {
  GUEST_PROFILE_DETAIL_PATH,
  guestProfileSearch,
} from "@/packages/pms/lib/guest-profile-wave1";
import { cn } from "@/shared/lib/utils";

type OverviewData = Awaited<
  ReturnType<typeof import("@/packages/pms/lib/guest-company-detail.functions").getCompanyDetailWorkspace>
>;

function Card({
  title,
  icon: Icon,
  actions,
  testId,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  actions?: ReactNode;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <section
      className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
      data-testid={testId}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-accent/15 text-accent">
            <Icon className="size-4" />
          </span>
          <h2 className="font-display text-sm font-semibold">{title}</h2>
        </div>
        {actions}
      </header>
      <div className="flex-1 space-y-1 p-4 text-sm">{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  truncate = false,
}: {
  label: string;
  value: ReactNode;
  truncate?: boolean;
}) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/40 py-2 last:border-b-0">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-right text-sm",
          truncate && "max-w-[12rem] truncate",
          empty ? "text-muted-foreground/60" : "font-medium",
        )}
      >
        {empty ? "—" : value}
      </span>
    </div>
  );
}

function Pill({ tone, children }: { tone: "good" | "muted"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        tone === "good"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-border bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

export function GuestCompanyOverviewView({
  restaurantId,
  companyId,
  data,
}: {
  restaurantId: string;
  companyId: string;
  data: OverviewData;
  // Kept optional so existing callers still type-check; tabs were removed.
  onNavigate?: (nav: CompanyDetailNavId) => void;
  onEdit?: () => void;
}) {
  const queryClient = useQueryClient();
  const loadHistory = useServerFn(listGuestAccountHistory);
  const loadLinks = useServerFn(listGuestAccountLinks);
  const addNote = useServerFn(addCompanyNote);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");

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

  const c = data.company;
  const active = c.accountStatus === "active";
  const stay = data.upcoming[0];
  const website = c.website
    ? c.website.startsWith("http")
      ? c.website
      : `https://${c.website}`
    : null;

  return (
    <div className="space-y-4" data-testid="company-overview">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {/* Company */}
        <Card title="Company" icon={Building2} testId="company-overview-info">
          <Row label="Code" value={c.code} />
          <Row label="Name" value={c.name} />
          <Row label="Type" value={data.businessType?.name ?? "Corporate"} />
          <Row
            label="Status"
            value={<Pill tone={active ? "good" : "muted"}>{active ? "Active" : "Inactive"}</Pill>}
          />
          <Row
            label="Credit account"
            value={
              <Pill tone={c.creditAccountEnabled ? "good" : "muted"}>
                {c.creditAccountEnabled ? "Enabled" : "Disabled"}
              </Pill>
            }
          />
          <Row label="Travelers" value={String(data.kpis.totalGuests)} />
        </Card>

        {/* Contact & address */}
        <Card title="Contact & Address" icon={MapPin} testId="company-overview-contact">
          <Row label="Primary contact" value={c.primaryContactName} />
          <Row label="Title" value={c.primaryContactTitle} />
          <Row label="Phone" value={c.phone} />
          <Row label="Email" value={c.email} truncate />
          <Row label="Address" value={c.addressLine1} truncate />
          <Row label="City / Country" value={[c.city, c.country].filter(Boolean).join(", ") || null} />
          {website ? (
            <div className="pt-2 text-right">
              <a
                className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
                href={website}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="size-3" /> Visit website
              </a>
            </div>
          ) : null}
        </Card>

        {/* Upcoming reservation */}
        <Card title="Upcoming Reservation" icon={Calendar} testId="company-overview-upcoming">
          {stay ? (
            <>
              <div className="flex items-center justify-between pb-1">
                <span className="font-mono text-sm font-bold text-accent">{stay.confirmationNumber}</span>
                <Pill tone="muted">
                  <span className="capitalize">{stay.status.replace("_", " ")}</span>
                </Pill>
              </div>
              <Row label="Dates" value={`${stay.arrivalDate} → ${stay.departureDate}`} />
              <Row label="Nights" value={String(stay.nights)} />
              <Row label="Room" value={stay.roomLabel} />
              <div className="pt-3">
                <Button asChild size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">
                  <Link to="/restaurant/pms/reservations/$reservationId" params={{ reservationId: stay.id }}>
                    Open reservation
                  </Link>
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-3 py-4 text-center">
              <p className="text-sm text-muted-foreground">No upcoming reservations.</p>
              <Button asChild variant="outline" size="sm">
                <Link to="/restaurant/pms/reservations" search={{ create: "new", companyId }}>
                  <Plus className="mr-1 size-3" /> New reservation
                </Link>
              </Button>
            </div>
          )}
        </Card>

        {/* Commercial */}
        <Card title="Commercial" icon={DollarSign} testId="company-overview-commercial">
          <Row
            label="Credit permitted"
            value={data.businessType?.creditAccountAllowed ? "Allowed" : "Restricted"}
          />
          <Row label="Rate reference" value={c.negotiatedRateReference} truncate />
          <Row
            label="Active agreements"
            value={data.agreements.length > 0 ? `${data.agreements.length} active` : "None"}
          />
          <Row
            label="Folio billing access"
            value={
              <Pill tone={data.folioAccess ? "good" : "muted"}>
                {data.folioAccess ? "Authorized" : "Restricted"}
              </Pill>
            }
          />
        </Card>

        {/* Linked travelers */}
        <Card title="Linked Travelers" icon={UserCheck} testId="company-overview-travelers">
          {links.isLoading ? (
            <Empty>Loading travelers…</Empty>
          ) : (links.data?.length ?? 0) === 0 ? (
            <Empty>No guests linked to this company.</Empty>
          ) : (
            <ul className="space-y-2">
              {links.data!.slice(0, 4).map((link) => (
                <li
                  key={link.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2"
                >
                  <Link
                    to={GUEST_PROFILE_DETAIL_PATH}
                    params={{ guestId: link.guestId }}
                    search={guestProfileSearch({ type: "individual", nav: "overview" })}
                    className="truncate text-sm font-medium hover:text-accent hover:underline"
                  >
                    {link.guestName}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">{link.role}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Recent activity */}
        <Card
          title="Recent Activity"
          icon={ScrollText}
          testId="company-overview-activity"
          actions={
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setNoteOpen(true)}
              data-testid="company-overview-add-note-btn"
            >
              <Plus className="mr-1 size-3" /> Add note
            </Button>
          }
        >
          {history.isLoading ? (
            <Empty>Loading activity…</Empty>
          ) : (history.data?.length ?? 0) === 0 ? (
            <Empty>No activity recorded yet.</Empty>
          ) : (
            <ul className="space-y-2">
              {history.data!.slice(0, 4).map((row) => (
                <li key={row.id} className="rounded-xl border border-border bg-muted/30 px-3 py-2">
                  <p className="text-sm font-medium capitalize">{row.eventType.replaceAll("_", " ")}</p>
                  {row.notes ? <p className="truncate text-xs text-muted-foreground">{row.notes}</p> : null}
                  <p className="mt-0.5 text-[11px] text-muted-foreground/70">{row.createdAt}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add note for {c.name}</DialogTitle>
          </DialogHeader>
          <Textarea
            rows={4}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Enter note details…"
          />
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
              disabled={!noteText.trim() || noteMutation.isPending}
              onClick={() => noteMutation.mutate()}
            >
              Save note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const GuestCompanyOverview = GuestCompanyOverviewView;
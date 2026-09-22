import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import { Badge } from "@/shared/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
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
import { formatMoneyLabel } from "@/packages/pms/lib/guest-company-detail-workspace";
import { CARD3_HREF } from "@/packages/pms/lib/pms-property-setup-card3";
import { GUEST_PROFILE_DETAIL_PATH, guestProfileSearch, type CompanyDetailNavId } from "@/packages/pms/lib/guest-profile-wave1";
import { COMPANY_RATE_NO, COMPANY_RATE_YES } from "@/packages/pms/lib/guest-company-detail-workspace";

type OverviewData = Awaited<ReturnType<typeof import("@/packages/pms/lib/guest-company-detail.functions").getCompanyDetailWorkspace>>;

export function GuestCompanyOverview({
  restaurantId,
  companyId,
  data,
  onNavigate,
  onEdit,
  focus,
}: {
  restaurantId: string;
  companyId: string;
  data: OverviewData;
  onNavigate: (nav: CompanyDetailNavId) => void;
  onEdit: () => void;
  focus?: "contracts" | "reservations" | "notes";
}) {
  const queryClient = useQueryClient();
  const loadContacts = useServerFn(listCompanyContacts);
  const loadHistory = useServerFn(listGuestAccountHistory);
  const loadLinks = useServerFn(listGuestAccountLinks);
  const addNote = useServerFn(addCompanyNote);
  const sendEmail = useServerFn(sendGuestAccountMessage);
  const exportAccount = useServerFn(exportGuestAccount);
  const [note, setNote] = useState("");
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
    mutationFn: () => addNote({ data: { restaurantId, companyId, note } }),
    onSuccess: async () => {
      setNote("");
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

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(18rem,1fr)]" data-testid="company-overview">
      <div className="space-y-4">
        {(focus === undefined || focus === "contracts") && (
          <Card title="Contact Persons" action={<Button type="button" variant="outline" size="sm" onClick={() => onNavigate("contacts")}>View All</Button>}>
            {contacts.data?.items.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Primary</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.data.items.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.name}</TableCell>
                      <TableCell>{row.position ?? "—"}</TableCell>
                      <TableCell>{row.email ?? "—"}</TableCell>
                      <TableCell>{row.isPrimary ? "Yes" : "No"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Empty text="No contact persons yet." />
            )}
          </Card>
        )}

        <Card
          title="Contracts & Agreements"
          action={
            <a href={CARD3_HREF} className="text-sm font-medium underline">
              Open Contract Settings
            </a>
          }
        >
          {data.agreements.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contract No.</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.agreements.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.contractNumber}</TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.validFrom ?? "—"}</TableCell>
                    <TableCell>{row.validTo ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{row.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty text="No corporate agreements for this company. Create them in Financial & Commercial settings." />
          )}
        </Card>

        <Card title="Recent Activity" action={<Button type="button" variant="outline" size="sm" onClick={() => onNavigate("history")}>View All</Button>}>
          {history.data?.length ? (
            <ul className="space-y-2 text-sm">
              {history.data.slice(0, 6).map((row) => (
                <li key={row.id}>
                  <span className="font-medium">{row.eventType.replaceAll("_", " ")}</span>
                  {row.notes ? <span className="text-muted-foreground"> — {row.notes}</span> : null}
                  <div className="text-xs text-muted-foreground">{row.createdAt}</div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="No company activity yet." />
          )}
        </Card>

        <Card title="Linked Guests" action={<Button type="button" variant="outline" size="sm" onClick={() => onNavigate("travelers")}>View All</Button>}>
          {links.data?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Guest</TableHead>
                  <TableHead>Company Rate</TableHead>
                  <TableHead>Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.data.slice(0, 6).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link
                        to={GUEST_PROFILE_DETAIL_PATH}
                        params={{ guestId: row.guestId }}
                        search={guestProfileSearch({ type: "individual", nav: "overview" })}
                        className="underline"
                      >
                        {row.guestName}
                      </Link>
                    </TableCell>
                    <TableCell>{data.company.hasCompanyRate ? COMPANY_RATE_YES : COMPANY_RATE_NO}</TableCell>
                    <TableCell>{row.role}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty text="No guests linked to this company." />
          )}
        </Card>
      </div>

      <div className="space-y-4">
        <Card title={`Company Statistics · ${data.periodYear}`}>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Total Reservations" value={String(data.kpis.totalReservations)} />
            <Stat label="Total Guests" value={String(data.kpis.totalGuests)} />
            <Stat
              label="Total Revenue"
              value={data.folioAccess ? formatMoneyLabel(data.kpis.totalRevenue) : "—"}
            />
            <Stat
              label="Average Length of Stay"
              value={data.kpis.averageLengthOfStay == null ? "—" : String(data.kpis.averageLengthOfStay)}
            />
          </dl>
          {!data.folioAccess ? (
            <p className="mt-2 text-xs text-muted-foreground">Revenue is hidden without folio access.</p>
          ) : null}
        </Card>

        <Card title="Upcoming Reservations" action={<Button type="button" variant="outline" size="sm" onClick={() => onNavigate("reservations")}>View All</Button>}>
          {data.upcoming.length ? (
            <ul className="space-y-2 text-sm">
              {data.upcoming.map((row) => (
                <li key={row.id}>
                  <Link to="/restaurant/pms/reservations/$reservationId" params={{ reservationId: row.id }} className="font-medium underline">
                    {row.confirmationNumber}
                  </Link>
                  <div className="text-muted-foreground">
                    {row.arrivalDate} – {row.departureDate} · {row.roomLabel}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="No upcoming reservations for this company." />
          )}
        </Card>

        {(focus === undefined || focus === "notes") && (
          <Card title="Notes">
            <p className="whitespace-pre-wrap text-sm">{data.company.notes || "No company notes yet."}</p>
            <Textarea className="mt-3" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a note" />
            <Button className="mt-2" type="button" disabled={!note.trim() || noteMutation.isPending} onClick={() => noteMutation.mutate()}>
              Add Note
            </Button>
          </Card>
        )}

        <Card title="Quick Actions">
          <div className="grid gap-2">
            <Button asChild>
              <Link to="/restaurant/bookings/new">Create Reservation</Link>
            </Button>
            <Button asChild variant="outline">
              <a href={CARD3_HREF}>Create Contract</a>
            </Button>
            <Button type="button" variant="outline" disabled={!emailReady} onClick={() => setEmailOpen(true)}>
              Send Email
            </Button>
            {!emailReady ? <p className="text-xs text-muted-foreground">Add a company email before sending.</p> : null}
            <Button type="button" variant="outline" onClick={() => reportMutation.mutate()} disabled={reportMutation.isPending}>
              Generate Report
            </Button>
            <Button type="button" variant="ghost" onClick={onEdit}>Edit Company</Button>
          </div>
        </Card>
      </div>

      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send email</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Recipient: {data.company.email}</p>
          <Input value={emailBody} onChange={(event) => setEmailBody(event.target.value)} placeholder="Message" />
          <DialogFooter>
            <Button type="button" disabled={!emailBody.trim() || emailMutation.isPending} onClick={() => emailMutation.mutate()}>
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-lg">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold">{value}</dd>
    </div>
  );
}

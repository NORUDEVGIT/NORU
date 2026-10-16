import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import {
  addTravelAgentNote,
  listTravelAgentContacts,
  listTravelAgentDocuments,
  listTravelAgentNotes,
} from "@/packages/pms/lib/guest-travel-agent-detail.functions";
import { AGENCY_TYPE_LABELS, type AgencyType } from "@/packages/pms/lib/guest-profile-travel-agency";
import { TA_COMMISSION_EMPTY_COPY } from "@/packages/pms/lib/guest-travel-agent-detail-workspace";
import type { TravelAgentDetailNavId } from "@/packages/pms/lib/guest-travel-agent-detail-workspace";

type OverviewData = Awaited<
  ReturnType<typeof import("@/packages/pms/lib/guest-travel-agent-detail.functions").getTravelAgentDetailWorkspace>
>;

export function GuestTravelAgentOverview({
  restaurantId,
  agencyId,
  data,
  onNavigate,
  onEdit,
  canManageRes,
}: {
  restaurantId: string;
  agencyId: string;
  data: OverviewData;
  onNavigate: (nav: TravelAgentDetailNavId) => void;
  onEdit: () => void;
  canManageRes: boolean;
}) {
  const queryClient = useQueryClient();
  const loadContacts = useServerFn(listTravelAgentContacts);
  const loadNotes = useServerFn(listTravelAgentNotes);
  const loadDocs = useServerFn(listTravelAgentDocuments);
  const addNote = useServerFn(addTravelAgentNote);
  const [note, setNote] = useState("");
  const contacts = useQuery({
    queryKey: ["travel-agent-contacts", restaurantId, agencyId, "overview"],
    queryFn: () => loadContacts({ data: { restaurantId, agencyId, limit: 5, offset: 0 } }),
  });
  const notes = useQuery({
    queryKey: ["travel-agent-notes", restaurantId, agencyId, "overview"],
    queryFn: () => loadNotes({ data: { restaurantId, agencyId } }),
  });
  const docs = useQuery({
    queryKey: ["travel-agent-documents", restaurantId, agencyId, "overview"],
    queryFn: () => loadDocs({ data: { restaurantId, agencyId } }),
  });
  const noteMutation = useMutation({
    mutationFn: () => addNote({ data: { restaurantId, agencyId, note } }),
    onSuccess: async () => {
      setNote("");
      await queryClient.invalidateQueries({ queryKey: ["travel-agent-notes", restaurantId, agencyId] });
      toast.success("Note added.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const typeLabel =
    data.agency.agencyType && data.agency.agencyType in AGENCY_TYPE_LABELS
      ? AGENCY_TYPE_LABELS[data.agency.agencyType as AgencyType]
      : data.agency.agencyType;
  const primary = contacts.data?.items.find((row) => row.isPrimary) ?? contacts.data?.items[0];
  const others = (contacts.data?.items ?? []).filter((row) => row.id !== primary?.id);

  return (
    <div className="space-y-4" data-testid="travel-agent-overview">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Total Bookings" value={String(data.kpis.totalBookings)} />
        <Kpi label="Total Guests" value={String(data.kpis.totalGuests)} />
        <Kpi
          label="Total Commission"
          value={
            data.kpis.commissionConfigured && data.kpis.totalCommission != null
              ? data.kpis.totalCommission.toLocaleString(undefined, { minimumFractionDigits: 2 })
              : "Not configured"
          }
        />
        <Kpi label="Default Commission Rate" value={data.kpis.defaultRateLabel ?? "Not configured"} />
      </div>

      <Card title="Agency Information" action={<Button type="button" variant="outline" size="sm" onClick={onEdit}>Edit Agency</Button>}>
        <dl className="grid gap-2 sm:grid-cols-2 text-sm">
          <Info label="Agency Name" value={data.agency.name} />
          <Info label="Agency Type" value={typeLabel} />
          <Info label="Registration Number" value={data.agency.businessRegistrationNumber} />
          <Info label="Tax ID" value={data.agency.taxId} />
          <Info label="IATA / License" value={data.agency.iataLicenseNumber} />
          <Info label="Country" value={data.agency.country} />
          <Info label="City" value={data.agency.city} />
          <Info label="Address" value={data.agency.addressLine1} />
          <Info label="Phone" value={data.agency.phone} />
          <Info label="Email" value={data.agency.email} />
          <Info label="Website" value={data.agency.website} />
          <Info label="Status" value={data.agency.accountStatus} />
          <Info label="Partner Since" value={data.agency.partnerSince.slice(0, 10)} />
          <Info label="Notes" value={data.agency.notes} />
        </dl>
      </Card>

      <Card
        title="Recent Bookings"
        action={
          <Button type="button" variant="outline" size="sm" onClick={() => onNavigate("bookings")}>
            View All
          </Button>
        }
      >
        {data.recentBookings.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Confirmation</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>Check-out</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recentBookings.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link to="/restaurant/pms/reservations/$reservationId" params={{ reservationId: row.id }}>
                      {row.confirmationNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{row.guestName}</TableCell>
                  <TableCell>{row.arrivalDate}</TableCell>
                  <TableCell>{row.departureDate}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {row.total == null ? "—" : `${row.currency ?? ""} ${row.total.toFixed(2)}`.trim()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Empty text="No bookings for this travel agency yet." />
        )}
      </Card>

      <Card
        title="Commission Summary"
        action={
          <Button type="button" variant="outline" size="sm" onClick={() => onNavigate("commission")}>
            Open Commission
          </Button>
        }
      >
        {data.commission.configured ? (
          <dl className="grid gap-2 sm:grid-cols-2 text-sm">
            <Info label="Default Rate" value={data.commission.defaultRateLabel} />
            <Info label="Commission Earned" value={String(data.commission.totals.earned)} />
            <Info label="Approved" value={String(data.commission.totals.approved)} />
            <Info label="Settled" value={String(data.commission.totals.settled)} />
            <Info label="Outstanding" value={String(data.commission.totals.outstanding)} />
          </dl>
        ) : (
          <Empty text={TA_COMMISSION_EMPTY_COPY} />
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Primary Contact" action={<Button type="button" variant="outline" size="sm" onClick={() => onNavigate("contacts")}>View All</Button>}>
          {primary ? (
            <p className="text-sm">
              {primary.name}
              {primary.position ? ` · ${primary.position}` : ""}
              {primary.email ? ` · ${primary.email}` : ""}
            </p>
          ) : (
            <Empty text="No primary contact yet." />
          )}
        </Card>
        <Card title="Other Contacts">
          {others.length ? (
            <ul className="space-y-1 text-sm">
              {others.slice(0, 4).map((row) => (
                <li key={row.id}>{row.name}</li>
              ))}
            </ul>
          ) : (
            <Empty text="No additional contacts." />
          )}
        </Card>
      </div>

      <Card title="Agreements" action={<Button type="button" variant="outline" size="sm" onClick={() => onNavigate("agreements")}>View All</Button>}>
        {data.agreements.length ? (
          <ul className="space-y-1 text-sm">
            {data.agreements.slice(0, 4).map((row) => (
              <li key={row.id}>
                {row.name} <Badge variant="outline">{row.status}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <Empty text="No agency agreements yet." />
        )}
      </Card>

      <Card title="Documents" action={<Button type="button" variant="outline" size="sm" onClick={() => onNavigate("documents")}>View All</Button>}>
        {docs.data?.items.length ? (
          <ul className="space-y-1 text-sm">
            {docs.data.items.slice(0, 4).map((row) => (
              <li key={row.id}>
                {row.name} <Badge variant="outline">{row.status}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <Empty text="No agency documents yet." />
        )}
      </Card>

      <Card title="Notes" action={<Button type="button" variant="outline" size="sm" onClick={() => onNavigate("notes")}>View All</Button>}>
        {notes.data?.items.length ? (
          <ul className="space-y-2 text-sm">
            {notes.data.items.slice(0, 3).map((row) => (
              <li key={row.noteId}>{row.content}</li>
            ))}
          </ul>
        ) : (
          <Empty text="No notes yet." />
        )}
        <div className="mt-3 flex gap-2">
          <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a note" />
          <Button type="button" disabled={!note.trim() || noteMutation.isPending} onClick={() => noteMutation.mutate()}>
            Add Note
          </Button>
        </div>
      </Card>

      <Card title="Quick Actions">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onEdit}>Edit Agency</Button>
          <Button type="button" variant="outline" onClick={() => onNavigate("contacts")}>Add Contact</Button>
          {canManageRes ? (
            <Link to="/restaurant/bookings/new" search={{ travelAgentMasterId: agencyId }}>
              <Button type="button">New Booking</Button>
            </Link>
          ) : null}
          <Button type="button" variant="outline" onClick={() => onNavigate("agreements")}>Add Agreement</Button>
          <Button type="button" variant="outline" onClick={() => onNavigate("documents")}>Add Document</Button>
          <Button type="button" variant="outline" onClick={() => onNavigate("notes")}>Add Note</Button>
          <Button type="button" variant="outline" onClick={() => onNavigate("settings")}>Open Agency Settings</Button>
        </div>
      </Card>
    </div>
  );
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value?.trim() || "—"}</dd>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

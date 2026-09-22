import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { GuestFormDialog } from "@/packages/pms/components/guests/guest-form-dialog";
import { GuestCompanyGuestLinks } from "@/packages/pms/components/guests/guest-company-guest-links";
import { listCompanyTravelers } from "@/packages/pms/lib/guest-company-detail.functions";
import { linkGuestAccount } from "@/packages/pms/lib/guest-accounts.functions";
import { listGuestDocuments } from "@/packages/pms/lib/guests.functions";
import { COMPANY_RATE_NO, COMPANY_RATE_YES, COMPANY_TRAVELERS_COPY, COMPANY_TRAVELERS_TITLE } from "@/packages/pms/lib/guest-company-detail-workspace";
import { GUEST_PROFILE_DETAIL_PATH, guestProfileSearch } from "@/packages/pms/lib/guest-profile-wave1";

export function GuestCompanyTravelers({
  restaurantId,
  companyId,
}: {
  restaurantId: string;
  companyId: string;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(listCompanyTravelers);
  const link = useServerFn(linkGuestAccount);
  const loadDocs = useServerFn(listGuestDocuments);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [vip, setVip] = useState<"all" | "yes" | "no">("all");
  const [groupLeader, setGroupLeader] = useState<"all" | "yes" | "no">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [tab, setTab] = useState<"history" | "reservations" | "notes" | "documents">("history");

  const query = useQuery({
    queryKey: ["company-travelers", restaurantId, companyId, q, status, vip, groupLeader],
    queryFn: () => load({ data: { restaurantId, companyId, q, status, vip, groupLeader } }),
  });
  const items = query.data?.items ?? [];
  const selected = items.find((row) => row.id === selectedId) ?? items[0] ?? null;
  const docs = useQuery({
    queryKey: ["guest-documents", restaurantId, selected?.id],
    queryFn: () => loadDocs({ data: { restaurantId, guestId: selected!.id } }),
    enabled: Boolean(selected?.id) && tab === "documents",
  });

  const linkCreated = useMutation({
    mutationFn: (guestId: string) =>
      link({ data: { restaurantId, guestId, accountId: companyId, role: "employer" } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["company-travelers", restaurantId, companyId] });
      await queryClient.invalidateQueries({ queryKey: ["company-detail", restaurantId, companyId] });
      toast.success("Traveler linked to this company.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4" data-testid="company-travelers">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">{COMPANY_TRAVELERS_TITLE}</h2>
          <p className="text-sm text-muted-foreground">{COMPANY_TRAVELERS_COPY}</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setLinkOpen((open) => !open)}>
            Link Existing Guest
          </Button>
          <Button type="button" onClick={() => setCreateOpen(true)}>Register New Traveler</Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search name, email, phone, passport" />
        <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={vip} onValueChange={(value) => setVip(value as typeof vip)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All VIP</SelectItem>
            <SelectItem value="yes">VIP</SelectItem>
            <SelectItem value="no">Not VIP</SelectItem>
          </SelectContent>
        </Select>
        <Select value={groupLeader} onValueChange={(value) => setGroupLeader(value as typeof groupLeader)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All group leaders</SelectItem>
            <SelectItem value="yes">Group leaders</SelectItem>
            <SelectItem value="no">Not group leaders</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Kpi label="Total Travelers" value={String(query.data?.kpis.total ?? 0)} />
        <Kpi label="Active Travelers" value={String(query.data?.kpis.active ?? 0)} />
        <Kpi label="VIP Travelers" value={String(query.data?.kpis.vip ?? 0)} />
        <Kpi label="Group Leaders" value={String(query.data?.kpis.groupLeaders ?? 0)} />
        <Kpi label="Upcoming Trips" value={String(query.data?.kpis.upcomingTrips ?? 0)} />
      </div>

      {linkOpen ? <GuestCompanyGuestLinks restaurantId={restaurantId} accountId={companyId} /> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(18rem,1fr)]">
        <section className="rounded-2xl border border-border bg-card p-4">
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading travelers…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {q || status !== "all" || vip !== "all" || groupLeader !== "all"
                ? "No travelers match these filters."
                : "No guests are linked to this company yet."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Nationality</TableHead>
                  <TableHead>Passport</TableHead>
                  <TableHead>Traveler Type</TableHead>
                  <TableHead>Last Stay</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row, index) => (
                  <TableRow key={row.id} className="cursor-pointer" onClick={() => setSelectedId(row.id)}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.nationality ?? "—"}</TableCell>
                    <TableCell>{row.passportMasked ?? "—"}</TableCell>
                    <TableCell>{row.travelerType}</TableCell>
                    <TableCell>{row.lastStay ?? "—"}</TableCell>
                    <TableCell><Badge variant={row.guestStatus === "active" ? "default" : "secondary"}>{row.guestStatus}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        <aside className="rounded-2xl border border-border bg-card p-4 space-y-3">
          {selected ? (
            <>
              {selected.photoUrl ? <img src={selected.photoUrl} alt="" className="h-16 w-16 rounded-xl object-cover" /> : null}
              <p className="font-display text-lg">{selected.name}</p>
              <p className="text-sm">{selected.travelerType} · {selected.guestStatus}</p>
              <p className="text-sm">{selected.email ?? "No email"} · {selected.phone ?? "No phone"}</p>
              <p className="text-sm">Nationality: {selected.nationality ?? "—"}</p>
              <p className="text-sm">Passport: {selected.passportMasked ?? "—"}</p>
              <p className="text-sm">Date of birth: {selected.dateOfBirth ?? "—"}</p>
              <p className="text-sm">Gender: {selected.gender ?? "—"}</p>
              <p className="text-sm">Company rate: {selected.hasCompanyRate ? COMPANY_RATE_YES : COMPANY_RATE_NO}</p>
              <div className="flex flex-wrap gap-2 text-xs">
                {(["history", "reservations", "notes", "documents"] as const).map((id) => (
                  <Button key={id} type="button" size="sm" variant={tab === id ? "default" : "outline"} onClick={() => setTab(id)}>
                    {id === "history" ? "Travel History" : id[0]!.toUpperCase() + id.slice(1)}
                  </Button>
                ))}
              </div>
              {tab === "notes" ? (
                <p className="whitespace-pre-wrap text-sm">{selected.notes || "No guest notes."}</p>
              ) : tab === "documents" ? (
                <ul className="text-sm">
                  {(docs.data?.documents ?? []).length ? (
                    docs.data!.documents.map((doc) => (
                      <li key={doc.id}>{doc.typeName} {doc.documentNumberMasked}</li>
                    ))
                  ) : (
                    <p className="text-muted-foreground">Identity documents stay on the Guest Profile.</p>
                  )}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {selected.lastStay ? `Last stay ${selected.lastStay}.` : "No stays yet."} {selected.upcomingTrips} upcoming trip(s).
                </p>
              )}
              <Button asChild>
                <Link
                  to={GUEST_PROFILE_DETAIL_PATH}
                  params={{ guestId: selected.id }}
                  search={guestProfileSearch({ type: "individual", nav: "overview" })}
                >
                  View Full Guest Profile
                </Link>
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Select a traveler to see details.</p>
          )}
        </aside>
      </div>

      <GuestFormDialog
        restaurantId={restaurantId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={(guestId) => {
          setCreateOpen(false);
          linkCreated.mutate(guestId);
        }}
      />
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

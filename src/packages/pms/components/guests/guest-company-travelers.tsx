import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, MoreHorizontal, Plus, User, UserCheck } from "lucide-react";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { GuestFormDialog } from "@/packages/pms/components/guests/guest-form-dialog";
import { GuestCompanyGuestLinks } from "@/packages/pms/components/guests/guest-company-guest-links";
import { listCompanyTravelers } from "@/packages/pms/lib/guest-company-detail.functions";
import { linkGuestAccount, listGuestAccountLinks, unlinkGuestAccount } from "@/packages/pms/lib/guest-accounts.functions";
import { listGuestDocuments } from "@/packages/pms/lib/guests.functions";
import { clearGuestCreateHold } from "@/packages/pms/lib/guest-create-workspace";
import { cn } from "@/shared/lib/utils";
import {
  COMPANY_RATE_NO,
  COMPANY_RATE_YES,
  COMPANY_TRAVELERS_COPY,
  COMPANY_TRAVELERS_TITLE,
} from "@/packages/pms/lib/guest-company-detail-workspace";
import {
  GUEST_PROFILE_DETAIL_PATH,
  guestProfileSearch,
} from "@/packages/pms/lib/guest-profile-wave1";

export function GuestCompanyTravelers({
  restaurantId,
  companyId,
  initialLinkOpen,
}: {
  restaurantId: string;
  companyId: string;
  initialLinkOpen?: boolean;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(listCompanyTravelers);
  const link = useServerFn(linkGuestAccount);
  const unlink = useServerFn(unlinkGuestAccount);
  const fetchLinks = useServerFn(listGuestAccountLinks);
  const loadDocs = useServerFn(listGuestDocuments);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [vip, setVip] = useState<"all" | "yes" | "no">("all");
  const [groupLeader, setGroupLeader] = useState<"all" | "yes" | "no">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createKey, setCreateKey] = useState(0);
  const [linkOpen, setLinkOpen] = useState(() => Boolean(initialLinkOpen));
  const [tab, setTab] = useState<"history" | "reservations" | "notes" | "documents">("history");

  const query = useQuery({
    queryKey: ["company-travelers", restaurantId, companyId, q, status, vip, groupLeader],
    queryFn: () => load({ data: { restaurantId, companyId, q, status, vip, groupLeader } }),
  });
  const items = query.data?.items ?? [];
  const selected = items.find((row) => row.id === selectedId) ?? (items.length > 0 ? items[0] : null);

  const docs = useQuery({
    queryKey: ["guest-documents", restaurantId, selected?.id],
    queryFn: () => loadDocs({ data: { restaurantId, guestId: selected!.id } }),
    enabled: Boolean(selected?.id) && tab === "documents",
  });

  const linksQuery = useQuery({
    queryKey: ["guest-account-links", restaurantId, null, companyId],
    queryFn: () => fetchLinks({ data: { restaurantId, accountId: companyId } }),
  });

  const linkCreated = useMutation({
    mutationFn: (guestId: string) =>
      link({ data: { restaurantId, guestId, accountId: companyId, role: "employer" } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["company-travelers", restaurantId, companyId] });
      await queryClient.invalidateQueries({ queryKey: ["guest-account-links", restaurantId, null, companyId] });
      await queryClient.invalidateQueries({ queryKey: ["company-detail", restaurantId, companyId] });
      await queryClient.refetchQueries({ queryKey: ["company-travelers", restaurantId, companyId] });
      await queryClient.refetchQueries({ queryKey: ["guest-account-links", restaurantId, null, companyId] });
      toast.success("Traveler registered and linked to this company.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const unlinkMutation = useMutation({
    mutationFn: (linkId: string) => unlink({ data: { restaurantId, linkId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["company-travelers", restaurantId, companyId] });
      await queryClient.invalidateQueries({ queryKey: ["guest-account-links", restaurantId, null, companyId] });
      await queryClient.invalidateQueries({ queryKey: ["company-detail", restaurantId, companyId] });
      toast.success("Traveler unlinked from this company.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4" data-testid="company-travelers">
      {/* View Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DDD4C5] pb-3">
        <div>
          <h2 className="font-display text-lg font-bold text-[#251605]">{COMPANY_TRAVELERS_TITLE}</h2>
          <p className="text-xs text-[#756A5B]">{COMPANY_TRAVELERS_COPY}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={linkOpen ? "secondary" : "outline"}
            size="sm"
            className={cn(
              "border-[#DDD4C5] text-[#251605]",
              linkOpen ? "bg-[#FAF8F5] border-[#8A641A] font-semibold text-[#8A641A]" : "hover:bg-[#F7F4EE]",
            )}
            onClick={() => setLinkOpen((open) => !open)}
          >
            <UserCheck className="mr-1.5 size-3.5 text-[#8A641A]" />
            {linkOpen ? "Close Guest Directory" : "Link Existing Guest"}
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-[#C89933] text-[#251605] hover:bg-[#B88928] font-medium"
            onClick={() => {
              clearGuestCreateHold(restaurantId);
              setCreateKey((k) => k + 1);
              setCreateOpen(true);
            }}
          >
            <Plus className="mr-1.5 size-3.5" />
            Register New Traveler
          </Button>
        </div>
      </div>

      {/* Compact Summary Band */}
      <div
        className="grid grid-cols-2 divide-y divide-[#DDD4C5] rounded-xl border border-[#DDD4C5] bg-white p-2.5 sm:grid-cols-5 sm:divide-y-0 sm:divide-x shadow-sm"
        data-testid="company-travelers-kpis"
      >
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Total Travelers
          </span>
          <span className="mt-1 font-mono text-sm font-bold text-[#251605]">
            {query.data?.kpis.total ?? 0}
          </span>
        </div>
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Active Travelers
          </span>
          <span className="mt-1 font-mono text-sm font-bold text-emerald-700">
            {query.data?.kpis.active ?? 0}
          </span>
        </div>
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            VIP Travelers
          </span>
          <span className="mt-1 font-mono text-sm font-bold text-[#8A641A]">
            {query.data?.kpis.vip ?? 0}
          </span>
        </div>
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Group Leaders
          </span>
          <span className="mt-1 font-mono text-sm font-bold text-[#251605]">
            {query.data?.kpis.groupLeaders ?? 0}
          </span>
        </div>
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Upcoming Trips
          </span>
          <span className="mt-1 font-mono text-sm font-bold text-[#8A641A]">
            {query.data?.kpis.upcomingTrips ?? 0}
          </span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-8 text-xs border-[#DDD4C5] bg-white min-w-48 flex-1"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search traveler name, email, phone, passport…"
        />
        <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
          <SelectTrigger className="h-8 text-xs border-[#DDD4C5] bg-white w-32">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={vip} onValueChange={(value) => setVip(value as typeof vip)}>
          <SelectTrigger className="h-8 text-xs border-[#DDD4C5] bg-white w-28">
            <SelectValue placeholder="VIP" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All VIP</SelectItem>
            <SelectItem value="yes">VIP</SelectItem>
            <SelectItem value="no">Not VIP</SelectItem>
          </SelectContent>
        </Select>
        <Select value={groupLeader} onValueChange={(value) => setGroupLeader(value as typeof groupLeader)}>
          <SelectTrigger className="h-8 text-xs border-[#DDD4C5] bg-white w-36">
            <SelectValue placeholder="Group Leader" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All leaders</SelectItem>
            <SelectItem value="yes">Group leaders</SelectItem>
            <SelectItem value="no">Not group leaders</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {linkOpen ? (
        <div className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm" data-testid="company-travelers-link-wrapper">
          <GuestCompanyGuestLinks
            restaurantId={restaurantId}
            accountId={companyId}
            autoOpenPicker={true}
            onClose={() => setLinkOpen(false)}
            onLinked={() => {
              void queryClient.invalidateQueries({ queryKey: ["company-travelers", restaurantId, companyId] });
            }}
          />
        </div>
      ) : null}

      {/* Dense Full-Width Table */}
      <div className="rounded-xl border border-[#DDD4C5] bg-white overflow-hidden shadow-sm">
        {query.isLoading ? (
          <p className="p-6 text-center text-xs text-[#756A5B]">Loading linked travelers…</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-center text-xs text-[#756A5B]">
            {q || status !== "all" || vip !== "all" || groupLeader !== "all"
              ? "No travelers match these filters."
              : "No travelers linked to this company yet."}
          </p>
        ) : (
          <Table>
            <TableHeader className="bg-[#FAF8F5]">
              <TableRow className="border-b border-[#DDD4C5]">
                <TableHead className="w-12 text-xs font-semibold text-[#251605]">#</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Guest</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Nationality</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Passport</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Relationship / Role</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Upcoming</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Last Stay</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Status</TableHead>
                <TableHead className="text-right text-xs font-semibold text-[#251605]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-[#EFE9DF]/60 text-xs">
              {items.map((row, index) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-[#FAF8F5] transition-colors"
                  onClick={() => {
                    setSelectedId(row.id);
                    setDrawerOpen(true);
                  }}
                >
                  <TableCell className="py-2.5 text-[#756A5B] font-mono">{index + 1}</TableCell>
                  <TableCell className="py-2.5 font-medium text-[#251605]">
                    <div className="flex items-center gap-2">
                      {row.photoUrl ? (
                        <img src={row.photoUrl} alt="" className="size-7 rounded-full object-cover ring-1 ring-[#DDD4C5]" />
                      ) : (
                        <div className="flex size-7 items-center justify-center rounded-full bg-[#F4E9D0] text-[10px] font-bold text-[#8A641A]">
                          {row.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <span>{row.name}</span>
                        {row.isVip && (
                          <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0.2 text-[9px] font-bold text-amber-700 border border-amber-200">
                            VIP
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-2.5 text-[#756A5B]">{row.nationality ?? "—"}</TableCell>
                  <TableCell className="py-2.5 font-mono text-[#756A5B]">{row.passportMasked ?? "—"}</TableCell>
                  <TableCell className="py-2.5">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border",
                        (row as any).role === "bill_to"
                          ? "bg-blue-50 text-blue-800 border-blue-200"
                          : "bg-amber-50 text-amber-800 border-amber-200",
                      )}
                    >
                      {(row as any).roleLabel ?? ((row as any).role === "bill_to" ? "Bill To" : "Employer")}
                    </span>
                  </TableCell>
                  <TableCell className="py-2.5 font-mono text-[#8A641A] font-semibold">{row.upcomingTrips}</TableCell>
                  <TableCell className="py-2.5 text-[#756A5B]">{row.lastStay ?? "—"}</TableCell>
                  <TableCell className="py-2.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        row.guestStatus === "active"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-stone-100 text-stone-600 border border-stone-200"
                      }`}
                    >
                      {row.guestStatus}
                    </span>
                  </TableCell>
                  <TableCell className="py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="size-7 text-[#756A5B] hover:text-[#251605]" aria-label={`Actions for ${row.name}`}>
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => { setSelectedId(row.id); setDrawerOpen(true); }}>
                          Quick View
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link
                            to={GUEST_PROFILE_DETAIL_PATH}
                            params={{ guestId: row.id }}
                            search={guestProfileSearch({ type: "individual", nav: "overview" })}
                          >
                            Full Guest Profile
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            const linkId = linksQuery.data?.find((l) => l.guestId === row.id)?.id;
                            if (linkId) {
                              unlinkMutation.mutate(linkId);
                            } else {
                              toast.error("Relationship record not found.");
                            }
                          }}
                          className="cursor-pointer text-rose-700 focus:text-rose-800"
                        >
                          Unlink from Company
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Right-Side Traveler Quick View Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col bg-white">
          <SheetHeader className="border-b border-[#DDD4C5] p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                {selected?.photoUrl ? (
                  <img src={selected.photoUrl} alt="" className="size-12 rounded-xl object-cover ring-2 ring-[#E5DECE]" />
                ) : (
                  <div className="flex size-12 items-center justify-center rounded-xl bg-[#F4E9D0] text-lg font-bold text-[#8A641A] ring-2 ring-[#E5DECE]">
                    {selected?.name ? selected.name.slice(0, 2).toUpperCase() : <User className="size-6" />}
                  </div>
                )}
                <div>
                  <SheetTitle className="font-display text-lg font-bold text-[#251605]">
                    {selected?.name ?? "Traveler"}
                  </SheetTitle>
                  <p className="text-xs text-[#756A5B]">{selected?.travelerType} · {selected?.guestStatus}</p>
                </div>
              </div>
              {selected && (
                <Button asChild size="sm" className="bg-[#8A641A] text-white hover:bg-[#725215] text-xs h-7">
                  <Link
                    to={GUEST_PROFILE_DETAIL_PATH}
                    params={{ guestId: selected.id }}
                    search={guestProfileSearch({ type: "individual", nav: "overview" })}
                  >
                    <ExternalLink className="mr-1 size-3" /> Profile
                  </Link>
                </Button>
              )}
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
            {selected ? (
              <>
                <div className="space-y-2 rounded-xl border border-[#DDD4C5] bg-[#FAF8F5] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[#756A5B]">Company Role</span>
                    <span className="font-medium text-[#251605]">{selected.travelerType}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#756A5B]">Negotiated Rate</span>
                    <span className="font-medium text-[#251605]">
                      {selected.hasCompanyRate ? COMPANY_RATE_YES : COMPANY_RATE_NO}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#756A5B]">VIP Status</span>
                    <span className="font-medium text-[#251605]">{selected.isVip ? "VIP Guest" : "Standard"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#756A5B]">Nationality</span>
                    <span className="font-medium text-[#251605]">{selected.nationality ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#756A5B]">Passport (Masked)</span>
                    <span className="font-mono text-[#251605]">{selected.passportMasked ?? "—"}</span>
                  </div>
                </div>

                <div className="space-y-2 rounded-xl border border-[#DDD4C5] bg-white p-3">
                  <h4 className="font-display text-xs font-semibold text-[#251605]">Contact Information</h4>
                  <div className="flex items-center justify-between">
                    <span className="text-[#756A5B]">Phone</span>
                    <span className="font-medium text-[#251605]">{selected.phone || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#756A5B]">Email</span>
                    <span className="font-medium text-[#251605]">{selected.email || "—"}</span>
                  </div>
                </div>

                <div className="space-y-2 rounded-xl border border-[#DDD4C5] bg-white p-3">
                  <h4 className="font-display text-xs font-semibold text-[#251605]">Stay History & Trips</h4>
                  <div className="flex items-center justify-between">
                    <span className="text-[#756A5B]">Last Stay</span>
                    <span className="font-medium text-[#251605]">{selected.lastStay ?? "No previous stays"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#756A5B]">Upcoming Trips</span>
                    <span className="font-bold text-[#8A641A]">{selected.upcomingTrips}</span>
                  </div>
                  {selected.stays.length > 0 ? (
                    <ul className="mt-2 space-y-1 border-t border-[#EFE9DF]/60 pt-2 text-[11px]">
                      {selected.stays.slice(0, 4).map((stay, idx) => (
                        <li key={idx} className="flex justify-between text-[#756A5B]">
                          <span>{stay.arrival} → {stay.departure}</span>
                          <span className="capitalize">{stay.status}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="text-center text-[#756A5B] italic">No traveler selected.</p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <GuestFormDialog
        key={`create-traveler-${createKey}`}
        restaurantId={restaurantId}
        open={createOpen}
        ignoreDraft={true}
        onOpenChange={setCreateOpen}
        onSaved={async (guestId) => {
          setCreateOpen(false);
          await linkCreated.mutateAsync(guestId);
        }}
      />
    </div>
  );
}

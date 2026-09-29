import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Calendar,
  ExternalLink,
  Filter,
  Link2,
  Plus,
  Search,
  Unlink2,
  XCircle,
} from "lucide-react";

import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
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
  linkReservationToGroup,
  listGroupMembers,
  listGroupReservations,
  searchReservationsToLink,
  unlinkReservationFromGroup,
} from "@/packages/pms/lib/guest-group-detail.functions";
import { setReservationStatus } from "@/packages/pms/lib/reservations.functions";
import { GUEST_PROFILE_DETAIL_PATH } from "@/packages/pms/lib/guest-profile-wave1";

export function GuestGroupReservationsView({
  restaurantId,
  groupId,
  canManage,
}: {
  restaurantId: string;
  groupId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(listGroupReservations);
  const loadMembers = useServerFn(listGroupMembers);
  const search = useServerFn(searchReservationsToLink);
  const link = useServerFn(linkReservationToGroup);
  const unlink = useServerFn(unlinkReservationFromGroup);
  const cancel = useServerFn(setReservationStatus);

  const [searchFilter, setSearchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkQuery, setLinkQuery] = useState("");
  const [selectedResId, setSelectedResId] = useState("");
  const [selectedMemberLinkId, setSelectedMemberLinkId] = useState("");

  const reservationsQuery = useQuery({
    queryKey: ["group-reservations", restaurantId, groupId],
    queryFn: () => load({ data: { restaurantId, groupId } }),
  });

  const membersQuery = useQuery({
    queryKey: ["group-members", restaurantId, groupId],
    queryFn: () => loadMembers({ data: { restaurantId, groupId } }),
  });

  const searchQuery = useQuery({
    queryKey: ["group-reservation-search", restaurantId, linkQuery],
    queryFn: () => search({ data: { restaurantId, q: linkQuery } }),
    enabled: canManage && linkDialogOpen,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["group-reservations", restaurantId, groupId] });
    void queryClient.invalidateQueries({ queryKey: ["group-detail", restaurantId, groupId] });
    void queryClient.invalidateQueries({ queryKey: ["group-rooming", restaurantId, groupId] });
    void queryClient.invalidateQueries({ queryKey: ["group-financials", restaurantId, groupId] });
  }

  const linkMutation = useMutation({
    mutationFn: () =>
      link({
        data: {
          restaurantId,
          groupId,
          reservationId: selectedResId,
          memberLinkId: selectedMemberLinkId || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Reservation linked to group successfully.");
      setSelectedResId("");
      setSelectedMemberLinkId("");
      setLinkDialogOpen(false);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const unlinkMutation = useMutation({
    mutationFn: (reservationId: string) => unlink({ data: { restaurantId, groupId, reservationId } }),
    onSuccess: () => {
      toast.success("Reservation unlinked from group.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const cancelMutation = useMutation({
    mutationFn: (reservationId: string) =>
      cancel({ data: { restaurantId, reservationId, status: "cancelled" } }),
    onSuccess: () => {
      toast.success("Reservation cancelled.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const allReservations = reservationsQuery.data ?? [];

  const summary = useMemo(() => {
    const total = allReservations.length;
    const confirmed = allReservations.filter((r) => r.status === "confirmed" || r.status === "pending").length;
    const checkedIn = allReservations.filter((r) => r.status === "checked_in").length;
    const cancelled = allReservations.filter((r) => r.status === "cancelled").length;
    return { total, confirmed, checkedIn, cancelled };
  }, [allReservations]);

  const filteredReservations = useMemo(() => {
    return allReservations.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!searchFilter.trim()) return true;
      const term = searchFilter.toLowerCase();
      const matchConf = row.confirmationNumber?.toLowerCase().includes(term);
      const matchGuest = row.guestName?.toLowerCase().includes(term);
      const matchRoom = (row.roomNumber || row.roomTypeName || "")?.toLowerCase().includes(term);
      return matchConf || matchGuest || matchRoom;
    });
  }, [allReservations, searchFilter, statusFilter]);

  return (
    <div className="space-y-6" data-testid="group-reservations-view">
      {/* 4-Cell Summary Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Linked</p>
          <p className="mt-1 text-2xl font-bold font-display text-foreground">{summary.total}</p>
        </div>
        <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active / Confirmed</p>
          <p className="mt-1 text-2xl font-bold font-display text-emerald-600">{summary.confirmed}</p>
        </div>
        <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Checked In</p>
          <p className="mt-1 text-2xl font-bold font-display text-blue-600">{summary.checkedIn}</p>
        </div>
        <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cancelled</p>
          <p className="mt-1 text-2xl font-bold font-display text-muted-foreground">{summary.cancelled}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search confirmation, guest, room…"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="pl-9 text-sm"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] text-xs">
              <Filter className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="checked_in">Checked In</SelectItem>
              <SelectItem value="checked_out">Checked Out</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {canManage && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLinkDialogOpen(true)}
              className="gap-1.5"
            >
              <Link2 className="h-4 w-4" />
              Link Existing
            </Button>
            <Link
              to="/restaurant/pms/reservations"
              search={{ create: "new", groupId }}
            >
              <Button
                type="button"
                size="sm"
                className="gap-1.5 bg-[#251605] text-[#F7F4EE] hover:bg-[#3D260D]"
              >
                <Plus className="h-4 w-4" />
                Add Reservation
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Dense Modern Reservations Table */}
      <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="font-semibold text-xs">Confirmation</TableHead>
              <TableHead className="font-semibold text-xs">Guest</TableHead>
              <TableHead className="font-semibold text-xs">Stay Dates</TableHead>
              <TableHead className="font-semibold text-xs">Room / Type</TableHead>
              <TableHead className="font-semibold text-xs">Status</TableHead>
              <TableHead className="font-semibold text-xs text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredReservations.map((row) => (
              <TableRow key={row.id} className="hover:bg-muted/20">
                <TableCell className="font-medium">
                  <Link
                    to="/restaurant/pms/reservations/$reservationId"
                    params={{ reservationId: row.id }}
                    className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-primary hover:underline"
                  >
                    {row.confirmationNumber}
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </Link>
                </TableCell>
                <TableCell>
                  <p className="text-sm font-medium text-foreground">{row.guestName}</p>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground/70" />
                    <span>
                      {row.arrivalDate} → {row.departureDate}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-xs">
                    {row.roomNumber ? (
                      <span className="font-semibold text-foreground">Room {row.roomNumber}</span>
                    ) : (
                      <span className="italic text-amber-700 dark:text-amber-400">Unassigned</span>
                    )}
                    {row.roomTypeName && (
                      <span className="ml-1 text-muted-foreground">({row.roomTypeName})</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={`text-[11px] font-medium capitalize ${
                      row.status === "confirmed"
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : row.status === "checked_in"
                        ? "border-blue-300 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
                        : row.status === "cancelled"
                        ? "border-neutral-300 bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                        : "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                    }`}
                  >
                    {row.status.replace("_", " ")}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-1">
                    {canManage && row.status !== "cancelled" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm(`Are you sure you want to cancel reservation ${row.confirmationNumber}?`)) {
                            cancelMutation.mutate(row.id);
                          }
                        }}
                        className="h-8 px-2 text-xs text-destructive hover:bg-destructive/10"
                        disabled={cancelMutation.isPending}
                      >
                        Cancel
                      </Button>
                    )}
                    {canManage && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm(`Unlink reservation ${row.confirmationNumber} from this group?`)) {
                            unlinkMutation.mutate(row.id);
                          }
                        }}
                        className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                        disabled={unlinkMutation.isPending}
                      >
                        Unlink
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filteredReservations.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-1">
                    <p className="text-sm font-medium">No reservations found.</p>
                    <p className="text-xs text-muted-foreground">
                      {searchFilter || statusFilter !== "all"
                        ? "Try clearing filters to view all reservations."
                        : "Create a new reservation or link an existing one to this group."}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Link Existing Reservation Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Link Existing Reservation</DialogTitle>
            <DialogDescription>
              Select an existing reservation at this property to associate with this group.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Search Confirmation or Guest
              </label>
              <Input
                placeholder="Type confirmation or guest name…"
                value={linkQuery}
                onChange={(e) => setLinkQuery(e.target.value)}
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Select Reservation
              </label>
              <Select value={selectedResId} onValueChange={setSelectedResId}>
                <SelectTrigger className="w-full text-sm">
                  <SelectValue placeholder="Choose a reservation" />
                </SelectTrigger>
                <SelectContent>
                  {(searchQuery.data ?? []).map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.confirmationNumber} · {row.guestName} ({row.arrivalDate})
                    </SelectItem>
                  ))}
                  {(searchQuery.data ?? []).length === 0 && (
                    <div className="p-2 text-center text-xs text-muted-foreground">
                      {linkQuery ? "No matching unlinked reservations found." : "Type to search reservations."}
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Link to Member (Optional)
              </label>
              <Select
                value={selectedMemberLinkId || "none"}
                onValueChange={(val) => setSelectedMemberLinkId(val === "none" ? "" : val)}
              >
                <SelectTrigger className="w-full text-sm">
                  <SelectValue placeholder="No member link" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No member link (Group-level)</SelectItem>
                  {(membersQuery.data ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.guestName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setLinkDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!selectedResId || linkMutation.isPending}
              onClick={() => linkMutation.mutate()}
              className="bg-[#251605] text-[#F7F4EE] hover:bg-[#3D260D]"
            >
              {linkMutation.isPending ? "Linking…" : "Link Reservation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

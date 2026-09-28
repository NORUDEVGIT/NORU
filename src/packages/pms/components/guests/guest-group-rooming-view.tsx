import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  Bed,
  CheckCircle2,
  Download,
  ExternalLink,
  Filter,
  RefreshCw,
  Search,
  Sparkles,
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
  assignGroupRoom,
  autoAssignGroupRooms,
  listGroupAssignableRooms,
  listGroupRooming,
  swapGroupRooms,
} from "@/packages/pms/lib/guest-group-detail.functions";

type AutoAssignResult = {
  assigned: Array<{ reservationId: string; roomId?: string; roomNumber?: string; reason?: string }>;
  failed: Array<{ reservationId: string; reason?: string }>;
  skipped: Array<{ reservationId: string; reason?: string }>;
};

export function GuestGroupRoomingView({
  restaurantId,
  groupId,
  canAssign,
}: {
  restaurantId: string;
  groupId: string;
  canAssign: boolean;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(listGroupRooming);
  const assign = useServerFn(assignGroupRoom);
  const autoAssign = useServerFn(autoAssignGroupRooms);
  const listRooms = useServerFn(listGroupAssignableRooms);
  const swap = useServerFn(swapGroupRooms);

  const [searchFilter, setSearchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "assigned" | "unassigned">("all");

  // Single room assign modal state
  const [assigningReservationId, setAssigningReservationId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");

  // Swap rooms modal state
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [swapA, setSwapA] = useState("");
  const [swapB, setSwapB] = useState("");

  // Auto-assign detailed results modal
  const [autoAssignResults, setAutoAssignResults] = useState<AutoAssignResult | null>(null);
  const [autoAssignConfirmOpen, setAutoAssignConfirmOpen] = useState(false);

  const roomingQuery = useQuery({
    queryKey: ["group-rooming", restaurantId, groupId],
    queryFn: () => load({ data: { restaurantId, groupId } }),
  });

  const reservations = roomingQuery.data?.reservations ?? [];
  const cancelled = Boolean(roomingQuery.data?.cancelled);
  const writable = canAssign && !cancelled;

  const activeAssignReservation = useMemo(
    () => reservations.find((r) => r.id === assigningReservationId) ?? null,
    [reservations, assigningReservationId],
  );

  const assignableRoomsQuery = useQuery({
    queryKey: [
      "group-assignable-rooms",
      restaurantId,
      activeAssignReservation?.roomTypeId,
      activeAssignReservation?.arrivalDate,
      activeAssignReservation?.departureDate,
      activeAssignReservation?.id,
    ],
    queryFn: () =>
      listRooms({
        data: {
          restaurantId,
          roomTypeId: activeAssignReservation!.roomTypeId,
          arrival: activeAssignReservation!.arrivalDate,
          departure: activeAssignReservation!.departureDate,
          excludeReservationId: activeAssignReservation!.id,
        },
      }),
    enabled: Boolean(writable && activeAssignReservation),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["group-rooming", restaurantId, groupId] });
    void queryClient.invalidateQueries({ queryKey: ["group-reservations", restaurantId, groupId] });
    void queryClient.invalidateQueries({ queryKey: ["group-detail", restaurantId, groupId] });
  }

  const assignMutation = useMutation({
    mutationFn: (input: { reservationId: string; roomId: string | null }) =>
      assign({ data: { restaurantId, groupId, reservationId: input.reservationId, roomId: input.roomId } }),
    onSuccess: () => {
      toast.success("Room assignment updated.");
      setAssigningReservationId(null);
      setSelectedRoomId("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const autoMutation = useMutation({
    mutationFn: () => autoAssign({ data: { restaurantId, groupId } }),
    onSuccess: (result) => {
      setAutoAssignConfirmOpen(false);
      setAutoAssignResults(result as AutoAssignResult);
      if (result.assigned.length === 0 && result.failed.length > 0) {
        toast.error(`Auto-assignment completed with ${result.failed.length} failure(s). No rooms assigned.`);
      } else if (result.failed.length > 0) {
        toast.warning(`Assigned ${result.assigned.length} room(s), but ${result.failed.length} reservation(s) could not be assigned.`);
      } else {
        toast.success(`Successfully assigned ${result.assigned.length} room(s).`);
      }
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const swapMutation = useMutation({
    mutationFn: () =>
      swap({ data: { restaurantId, groupId, reservationIdA: swapA, reservationIdB: swapB } }),
    onSuccess: () => {
      toast.success("Rooms successfully swapped.");
      setSwapA("");
      setSwapB("");
      setSwapDialogOpen(false);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const assignedCount = reservations.filter((r) => Boolean(r.roomId)).length;
  const unassignedCount = reservations.filter((r) => !r.roomId).length;
  const totalCount = reservations.length;
  const percentage = totalCount > 0 ? Math.round((assignedCount / totalCount) * 100) : 0;

  const filteredReservations = useMemo(() => {
    return reservations.filter((row) => {
      if (statusFilter === "assigned" && !row.roomId) return false;
      if (statusFilter === "unassigned" && Boolean(row.roomId)) return false;
      if (!searchFilter.trim()) return true;
      const term = searchFilter.toLowerCase();
      const matchConf = row.confirmationNumber?.toLowerCase().includes(term);
      const matchGuest = row.guestName?.toLowerCase().includes(term);
      const matchRoom = (row.roomNumber || row.roomTypeName || "")?.toLowerCase().includes(term);
      return matchConf || matchGuest || matchRoom;
    });
  }, [reservations, searchFilter, statusFilter]);

  function exportRoomingCsv() {
    const headers = [
      "Confirmation",
      "Guest Name",
      "Arrival",
      "Departure",
      "Room Type",
      "Room Number",
      "Status",
      "Special Requests",
    ];
    const rows = filteredReservations.map((r) => [
      `"${r.confirmationNumber}"`,
      `"${r.guestName.replace(/"/g, '""')}"`,
      `"${r.arrivalDate}"`,
      `"${r.departureDate}"`,
      `"${r.roomTypeName || ""}"`,
      `"${r.roomNumber || "UNASSIGNED"}"`,
      `"${r.status}"`,
      `"${(r.specialRequests || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `group-rooming-${groupId.slice(0, 8)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6" data-testid="group-rooming-view">
      {/* 4-Cell Summary Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Rooms Needed</p>
          <p className="mt-1 text-2xl font-bold font-display text-foreground">{totalCount}</p>
        </div>
        <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Assigned Rooms</p>
          <p className="mt-1 text-2xl font-bold font-display text-emerald-600">{assignedCount}</p>
        </div>
        <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Unassigned</p>
          <p className="mt-1 text-2xl font-bold font-display text-amber-600">{unassignedCount}</p>
        </div>
        <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Completion</p>
          <div className="flex items-baseline gap-2">
            <p className="mt-1 text-2xl font-bold font-display text-foreground">{percentage}%</p>
            <span className="text-xs text-muted-foreground">assigned</span>
          </div>
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
          <Select
            value={statusFilter}
            onValueChange={(val) => setStatusFilter(val as "all" | "assigned" | "unassigned")}
          >
            <SelectTrigger className="w-[140px] text-xs">
              <Filter className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue placeholder="All Rooms" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Rooms ({totalCount})</SelectItem>
              <SelectItem value="unassigned">Unassigned ({unassignedCount})</SelectItem>
              <SelectItem value="assigned">Assigned ({assignedCount})</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={exportRoomingCsv}
            disabled={filteredReservations.length === 0}
            className="gap-1.5 text-xs"
          >
            <Download className="h-3.5 w-3.5" />
            Rooming CSV
          </Button>

          {writable && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSwapDialogOpen(true)}
                disabled={assignedCount < 2}
                className="gap-1.5 text-xs"
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
                Swap Rooms
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={() => setAutoAssignConfirmOpen(true)}
                disabled={unassignedCount === 0 || autoMutation.isPending}
                className="gap-1.5 bg-[#251605] text-[#F7F4EE] hover:bg-[#3D260D] text-xs"
              >
                <Sparkles className="h-3.5 w-3.5 text-[#C89933]" />
                Auto Assign ({unassignedCount})
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Dense Rooming List Table */}
      <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="font-semibold text-xs">Confirmation</TableHead>
              <TableHead className="font-semibold text-xs">Guest Name</TableHead>
              <TableHead className="font-semibold text-xs">Dates</TableHead>
              <TableHead className="font-semibold text-xs">Room Type</TableHead>
              <TableHead className="font-semibold text-xs">Assigned Room</TableHead>
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
                  {row.specialRequests && (
                    <p className="text-xs text-muted-foreground truncate max-w-xs">{row.specialRequests}</p>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {row.arrivalDate} → {row.departureDate}
                </TableCell>
                <TableCell className="text-xs text-foreground">
                  {row.roomTypeName || "Standard"}
                </TableCell>
                <TableCell>
                  {row.roomNumber ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                      <Bed className="h-3 w-3" />
                      Room {row.roomNumber}
                    </span>
                  ) : (
                    <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                      Unassigned
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {writable && (
                    <div className="inline-flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setAssigningReservationId(row.id);
                          setSelectedRoomId(row.roomId || "");
                        }}
                        className="h-8 px-2 text-xs text-primary hover:bg-primary/10"
                      >
                        {row.roomId ? "Change" : "Assign"}
                      </Button>
                      {row.roomId && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm(`Unassign Room ${row.roomNumber} from ${row.guestName}?`)) {
                              assignMutation.mutate({ reservationId: row.id, roomId: null });
                            }
                          }}
                          className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive"
                          disabled={assignMutation.isPending}
                        >
                          Unassign
                        </Button>
                      )}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {filteredReservations.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-1">
                    <p className="text-sm font-medium">No rooming records found.</p>
                    <p className="text-xs text-muted-foreground">
                      {searchFilter || statusFilter !== "all"
                        ? "Try clearing filters to see all rooms."
                        : "Link reservations to this group to manage their room assignments."}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Assign Room Dialog */}
      <Dialog
        open={Boolean(assigningReservationId)}
        onOpenChange={(open) => {
          if (!open) {
            setAssigningReservationId(null);
            setSelectedRoomId("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {activeAssignReservation?.roomId ? "Change Room Assignment" : "Assign Room"}
            </DialogTitle>
            <DialogDescription>
              Assign a room for {activeAssignReservation?.guestName} (Conf #{activeAssignReservation?.confirmationNumber}).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
              <p><span className="font-semibold">Room Type:</span> {activeAssignReservation?.roomTypeName}</p>
              <p><span className="font-semibold">Stay Dates:</span> {activeAssignReservation?.arrivalDate} → {activeAssignReservation?.departureDate}</p>
              {activeAssignReservation?.specialRequests && (
                <p><span className="font-semibold">Requests:</span> {activeAssignReservation.specialRequests}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Select Available Room
              </label>
              {assignableRoomsQuery.isLoading ? (
                <p className="text-xs text-muted-foreground">Checking room inventory…</p>
              ) : (
                <Select value={selectedRoomId} onValueChange={setSelectedRoomId}>
                  <SelectTrigger className="w-full text-sm">
                    <SelectValue placeholder="Choose a clean/available room" />
                  </SelectTrigger>
                  <SelectContent>
                    {(assignableRoomsQuery.data ?? []).map((room) => (
                      <SelectItem key={room.id} value={room.id}>
                        Room {room.roomNumber} ({room.floor ? `Floor ${room.floor} · ` : ""}{room.housekeepingStatus})
                      </SelectItem>
                    ))}
                    {(assignableRoomsQuery.data ?? []).length === 0 && (
                      <div className="p-2 text-center text-xs text-muted-foreground">
                        No available rooms found for this room type and date range.
                      </div>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAssigningReservationId(null);
                setSelectedRoomId("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!selectedRoomId || assignMutation.isPending}
              onClick={() => {
                if (activeAssignReservation) {
                  assignMutation.mutate({
                    reservationId: activeAssignReservation.id,
                    roomId: selectedRoomId,
                  });
                }
              }}
              className="bg-[#251605] text-[#F7F4EE] hover:bg-[#3D260D]"
            >
              {assignMutation.isPending ? "Assigning…" : "Save Assignment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auto-Assign Safety Confirmation Dialog */}
      <Dialog open={autoAssignConfirmOpen} onOpenChange={setAutoAssignConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Run Auto-Assignment</DialogTitle>
            <DialogDescription>
              Auto-assignment will check live room inventory and assign clean, unallocated rooms to {unassignedCount} unassigned reservation(s).
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 text-xs text-muted-foreground space-y-2">
            <p>• Only unassigned reservations will be processed.</p>
            <p>• Manually assigned rooms are protected and will NOT be overwritten.</p>
            <p>• Detailed per-reservation assignment results will be returned upon completion.</p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setAutoAssignConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={autoMutation.isPending}
              onClick={() => autoMutation.mutate()}
              className="bg-[#251605] text-[#F7F4EE] hover:bg-[#3D260D]"
            >
              {autoMutation.isPending ? "Assigning Rooms…" : "Execute Auto-Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detailed Auto-Assign Per-Row Results Dialog (Amendment 5) */}
      <Dialog open={Boolean(autoAssignResults)} onOpenChange={(open) => !open && setAutoAssignResults(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {autoAssignResults?.failed.length === 0 ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <XCircle className="h-5 w-5 text-amber-600" />
              )}
              Auto-Assignment Results
            </DialogTitle>
            <DialogDescription>
              Per-reservation room inventory assignment summary:
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[350px] overflow-y-auto space-y-3 py-2 text-xs">
            {/* Assigned section */}
            <div>
              <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                Assigned ({autoAssignResults?.assigned.length ?? 0}):
              </p>
              {autoAssignResults?.assigned.length === 0 ? (
                <p className="text-muted-foreground ml-3">None assigned.</p>
              ) : (
                <ul className="ml-3 mt-1 space-y-1 list-disc list-inside">
                  {autoAssignResults?.assigned.map((a, idx) => {
                    const res = reservations.find((r) => r.id === a.reservationId);
                    return (
                      <li key={idx} className="text-foreground">
                        <span className="font-mono">{res?.confirmationNumber ?? a.reservationId.slice(0, 8)}</span>
                        {res ? ` (${res.guestName})` : ""} → Assigned Room
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Failed / No availability section */}
            {autoAssignResults?.failed && autoAssignResults.failed.length > 0 && (
              <div>
                <p className="font-semibold text-destructive">
                  Failed / No Availability ({autoAssignResults.failed.length}):
                </p>
                <ul className="ml-3 mt-1 space-y-1 list-disc list-inside">
                  {autoAssignResults.failed.map((f, idx) => {
                    const res = reservations.find((r) => r.id === f.reservationId);
                    return (
                      <li key={idx} className="text-destructive">
                        <span className="font-mono">{res?.confirmationNumber ?? f.reservationId.slice(0, 8)}</span>
                        {res ? ` (${res.guestName})` : ""}: {f.reason || "No available room found"}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Skipped section */}
            {autoAssignResults?.skipped && autoAssignResults.skipped.length > 0 && (
              <div>
                <p className="font-semibold text-muted-foreground">
                  Skipped ({autoAssignResults.skipped.length}):
                </p>
                <ul className="ml-3 mt-1 space-y-1 list-disc list-inside text-muted-foreground">
                  {autoAssignResults.skipped.map((s, idx) => (
                    <li key={idx}>Reservation {s.reservationId.slice(0, 8)}: Already assigned</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              onClick={() => setAutoAssignResults(null)}
              className="bg-[#251605] text-[#F7F4EE] hover:bg-[#3D260D]"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Swap Rooms Dialog */}
      <Dialog open={swapDialogOpen} onOpenChange={setSwapDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Swap Room Assignments</DialogTitle>
            <DialogDescription>
              Select two assigned reservations to swap their allocated rooms.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                First Reservation
              </label>
              <Select value={swapA} onValueChange={setSwapA}>
                <SelectTrigger className="w-full text-sm">
                  <SelectValue placeholder="Select first reservation" />
                </SelectTrigger>
                <SelectContent>
                  {reservations
                    .filter((r) => Boolean(r.roomId) && r.id !== swapB)
                    .map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        Room {r.roomNumber} · {r.guestName} ({r.confirmationNumber})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Second Reservation
              </label>
              <Select value={swapB} onValueChange={setSwapB}>
                <SelectTrigger className="w-full text-sm">
                  <SelectValue placeholder="Select second reservation" />
                </SelectTrigger>
                <SelectContent>
                  {reservations
                    .filter((r) => Boolean(r.roomId) && r.id !== swapA)
                    .map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        Room {r.roomNumber} · {r.guestName} ({r.confirmationNumber})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setSwapDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!swapA || !swapB || swapMutation.isPending}
              onClick={() => swapMutation.mutate()}
              className="bg-[#251605] text-[#F7F4EE] hover:bg-[#3D260D]"
            >
              {swapMutation.isPending ? "Swapping…" : "Swap Rooms"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

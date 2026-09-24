import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
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
  bulkAssignGroupRooms,
  listGroupAssignableRooms,
  listGroupRooming,
  moveGroupCheckedInRoom,
  swapGroupRooms,
} from "@/packages/pms/lib/guest-group-detail.functions";
import { GROUP_AUTO_ASSIGN_COPY, GROUP_ROOMING_COPY } from "@/packages/pms/lib/guest-group-detail-workspace";

export function GuestGroupRooming({
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
  const bulk = useServerFn(bulkAssignGroupRooms);
  const move = useServerFn(moveGroupCheckedInRoom);
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null);
  const [swapA, setSwapA] = useState("");
  const [swapB, setSwapB] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [moveReason, setMoveReason] = useState("");

  const query = useQuery({
    queryKey: ["group-rooming", restaurantId, groupId],
    queryFn: () => load({ data: { restaurantId, groupId } }),
  });

  const selected = useMemo(
    () => query.data?.reservations.find((row) => row.id === selectedReservationId) ?? null,
    [query.data, selectedReservationId],
  );
  const writable = canAssign && !query.data?.cancelled;
  const roomsQuery = useQuery({
    queryKey: [
      "group-assignable-rooms",
      restaurantId,
      selected?.roomTypeId,
      selected?.arrivalDate,
      selected?.departureDate,
      selected?.id,
    ],
    queryFn: () =>
      listRooms({
        data: {
          restaurantId,
          roomTypeId: selected!.roomTypeId,
          arrival: selected!.arrivalDate,
          departure: selected!.departureDate,
          excludeReservationId: selected!.id,
        },
      }),
    enabled: Boolean(writable && selected),
  });

  const unassigned = (query.data?.reservations ?? []).filter((row) => !row.roomId);
  const assigned = (query.data?.reservations ?? []).filter((row) => row.roomId);
  const bulkTypeId = unassigned.find((row) => selectedIds.includes(row.id))?.roomTypeId ?? unassigned[0]?.roomTypeId;
  const bulkSample = unassigned.find((row) => selectedIds.includes(row.id) && row.roomTypeId === bulkTypeId) ?? null;
  const bulkRooms = useQuery({
    queryKey: [
      "group-bulk-rooms",
      restaurantId,
      bulkSample?.roomTypeId,
      bulkSample?.arrivalDate,
      bulkSample?.departureDate,
    ],
    queryFn: () =>
      listRooms({
        data: {
          restaurantId,
          roomTypeId: bulkSample!.roomTypeId,
          arrival: bulkSample!.arrivalDate,
          departure: bulkSample!.departureDate,
          excludeReservationId: bulkSample!.id,
        },
      }),
    enabled: Boolean(writable && bulkSample && selectedIds.length > 0),
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
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const autoMutation = useMutation({
    mutationFn: () => autoAssign({ data: { restaurantId, groupId } }),
    onSuccess: (result) => {
      if (result.assigned.length === 0 && result.failed.length > 0) {
        toast.error(`${result.failed.length} reservation(s) could not be assigned.`);
      } else {
        toast.success(`Assigned ${result.assigned.length}. Failed ${result.failed.length}.`);
      }
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const swapMutation = useMutation({
    mutationFn: () =>
      swap({ data: { restaurantId, groupId, reservationIdA: swapA, reservationIdB: swapB } }),
    onSuccess: () => {
      toast.success("Rooms swapped.");
      setSwapA("");
      setSwapB("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const bulkMutation = useMutation({
    mutationFn: (assignments: Array<{ reservationId: string; roomId: string }>) =>
      bulk({ data: { restaurantId, groupId, assignments } }),
    onSuccess: (result) => {
      toast.success(`Assigned ${result.assigned.length}. Failed ${result.failed.length}.`);
      if (result.failed[0]) toast.error(result.failed[0].reason);
      setSelectedIds([]);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const moveMutation = useMutation({
    mutationFn: (input: { reservationId: string; roomId: string }) =>
      move({ data: { restaurantId, groupId, reservationId: input.reservationId, roomId: input.roomId, reason: moveReason } }),
    onSuccess: () => {
      toast.success("In-house room moved.");
      setSelectedReservationId(null);
      setMoveReason("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = query.data?.rows ?? [];

  function exportCsv() {
    const lines = [
      ["Guest", "Reservation", "Room", "Room type", "Arrival", "Departure", "Assignment"].join(","),
      ...rows.map((row) =>
        [
          row.guestName,
          row.reservation?.confirmationNumber ?? "",
          row.reservation?.roomNumber ?? "",
          row.reservation?.roomTypeName ?? "",
          row.reservation?.arrivalDate ?? "",
          row.reservation?.departureDate ?? "",
          row.reservation?.assignment ?? "unassigned",
        ]
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `group-rooming-${groupId.slice(0, 8)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function runBulk() {
    const rooms = bulkRooms.data ?? [];
    const targets = unassigned.filter((row) => selectedIds.includes(row.id) && row.roomTypeId === bulkTypeId);
    const assignments = targets
      .map((row, index) => (rooms[index] ? { reservationId: row.id, roomId: rooms[index]!.id } : null))
      .filter((row): row is { reservationId: string; roomId: string } => Boolean(row));
    if (assignments.length === 0) {
      toast.error("No available rooms of this type for the selected reservations.");
      return;
    }
    bulkMutation.mutate(assignments);
  }

  return (
    <div className="space-y-4" data-testid="group-rooming">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">Rooming list</h2>
          <p className="text-sm text-muted-foreground">{GROUP_ROOMING_COPY}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={exportCsv}>
            Export
          </Button>
          <Button type="button" variant="outline" onClick={() => window.print()}>
            Print
          </Button>
          {writable ? (
            <Button type="button" disabled={autoMutation.isPending} onClick={() => autoMutation.mutate()}>
              Auto assign
            </Button>
          ) : null}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{GROUP_AUTO_ASSIGN_COPY}</p>
      {query.data?.cancelled ? (
        <p className="text-sm text-muted-foreground">Cancelled groups can export and print only.</p>
      ) : null}
      <div className="rounded-2xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {writable ? <TableHead /> : null}
              <TableHead>Guest</TableHead>
              <TableHead>Reservation</TableHead>
              <TableHead>Room type</TableHead>
              <TableHead>Room</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.memberId}>
                {writable ? (
                  <TableCell>
                    {row.reservation && !row.reservation.roomId ? (
                      <Checkbox
                        checked={selectedIds.includes(row.reservation.id)}
                        onCheckedChange={(checked) =>
                          setSelectedIds((current) =>
                            checked
                              ? [...current, row.reservation!.id]
                              : current.filter((id) => id !== row.reservation!.id),
                          )
                        }
                      />
                    ) : null}
                  </TableCell>
                ) : null}
                <TableCell>{row.guestName}</TableCell>
                <TableCell>{row.reservation?.confirmationNumber ?? "—"}</TableCell>
                <TableCell>{row.reservation?.roomTypeName ?? "—"}</TableCell>
                <TableCell>{row.reservation?.roomNumber ?? "—"}</TableCell>
                <TableCell>
                  {row.reservation ? `${row.reservation.arrivalDate} → ${row.reservation.departureDate}` : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={row.reservation?.assignment === "assigned" ? "default" : "secondary"}>
                    {row.reservation?.assignment ?? "unassigned"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {writable && row.reservation ? (
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => setSelectedReservationId(row.reservation!.id)}>
                        {row.reservation.status === "checked_in" ? "Move" : "Assign"}
                      </Button>
                      {row.reservation.roomId && row.reservation.status !== "checked_in" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => assignMutation.mutate({ reservationId: row.reservation!.id, roomId: null })}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={writable ? 8 : 7} className="text-muted-foreground">
                  Rooming list is empty until members and reservations exist.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
      {writable && selectedIds.length > 0 ? (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
          <p className="font-medium">Bulk assign {selectedIds.length} unassigned reservation(s)</p>
          <p className="text-sm text-muted-foreground">
            Uses available rooms of one room type sequentially. Failures stay failures.
          </p>
          <Button type="button" disabled={bulkMutation.isPending || bulkRooms.isLoading} onClick={runBulk}>
            Assign selected
          </Button>
        </div>
      ) : null}
      {writable && assigned.length >= 2 ? (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <h3 className="font-medium">Swap rooms</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select value={swapA} onValueChange={setSwapA}>
              <SelectTrigger>
                <SelectValue placeholder="First reservation" />
              </SelectTrigger>
              <SelectContent>
                {assigned.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.confirmationNumber} · {row.roomNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={swapB} onValueChange={setSwapB}>
              <SelectTrigger>
                <SelectValue placeholder="Second reservation" />
              </SelectTrigger>
              <SelectContent>
                {assigned
                  .filter((row) => row.id !== swapA)
                  .map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.confirmationNumber} · {row.roomNumber}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" disabled={!swapA || !swapB || swapMutation.isPending} onClick={() => swapMutation.mutate()}>
            Swap
          </Button>
        </div>
      ) : null}
      {selected ? (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <h3 className="font-medium">
            {selected.status === "checked_in" ? "Move" : "Assign"} room for {selected.confirmationNumber}
          </h3>
          {selected.status === "checked_in" ? (
            <div>
              <Label>Reason</Label>
              <Input value={moveReason} onChange={(event) => setMoveReason(event.target.value)} />
            </div>
          ) : null}
          <Select
            onValueChange={(value) => {
              if (selected.status === "checked_in") {
                if (!moveReason.trim()) {
                  toast.error("Enter a move reason.");
                  return;
                }
                moveMutation.mutate({ reservationId: selected.id, roomId: value });
                return;
              }
              assignMutation.mutate({ reservationId: selected.id, roomId: value });
              setSelectedReservationId(null);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={roomsQuery.isLoading ? "Loading rooms…" : "Select available room"} />
            </SelectTrigger>
            <SelectContent>
              {(roomsQuery.data ?? []).map((room) => (
                <SelectItem key={room.id} value={room.id}>
                  {room.roomNumber}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(roomsQuery.data ?? []).length === 0 && !roomsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">No available rooms of this type for the stay dates.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

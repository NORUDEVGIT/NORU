import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
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
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["group-rooming", restaurantId, groupId],
    queryFn: () => load({ data: { restaurantId, groupId } }),
  });

  const selected = useMemo(
    () => query.data?.reservations.find((row) => row.id === selectedReservationId) ?? null,
    [query.data, selectedReservationId],
  );
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
    enabled: Boolean(canAssign && selected),
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
          {canAssign ? (
            <Button type="button" disabled={autoMutation.isPending} onClick={() => autoMutation.mutate()}>
              Auto assign
            </Button>
          ) : null}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{GROUP_AUTO_ASSIGN_COPY}</p>
      <div className="rounded-2xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
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
                  {canAssign && row.reservation ? (
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => setSelectedReservationId(row.reservation!.id)}>
                        Assign
                      </Button>
                      {row.reservation.roomId ? (
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
                <TableCell colSpan={7} className="text-muted-foreground">
                  Rooming list is empty until members and reservations exist.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
      {selected ? (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <h3 className="font-medium">Assign room for {selected.confirmationNumber}</h3>
          <Select
            onValueChange={(value) => {
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

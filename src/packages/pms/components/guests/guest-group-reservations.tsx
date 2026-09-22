import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
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

export function GuestGroupReservations({
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
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [memberLinkId, setMemberLinkId] = useState("");

  const query = useQuery({
    queryKey: ["group-reservations", restaurantId, groupId],
    queryFn: () => load({ data: { restaurantId, groupId } }),
  });
  const membersQuery = useQuery({
    queryKey: ["group-members", restaurantId, groupId],
    queryFn: () => loadMembers({ data: { restaurantId, groupId } }),
  });
  const searchQuery = useQuery({
    queryKey: ["group-reservation-search", restaurantId, q],
    queryFn: () => search({ data: { restaurantId, q } }),
    enabled: canManage,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["group-reservations", restaurantId, groupId] });
    void queryClient.invalidateQueries({ queryKey: ["group-detail", restaurantId, groupId] });
    void queryClient.invalidateQueries({ queryKey: ["group-rooming", restaurantId, groupId] });
  }

  const linkMutation = useMutation({
    mutationFn: () =>
      link({
        data: {
          restaurantId,
          groupId,
          reservationId: selectedId,
          memberLinkId: memberLinkId || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Reservation linked.");
      setSelectedId("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const unlinkMutation = useMutation({
    mutationFn: (reservationId: string) => unlink({ data: { restaurantId, groupId, reservationId } }),
    onSuccess: () => {
      toast.success("Reservation unlinked.");
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

  const items = query.data ?? [];

  return (
    <div className="space-y-4" data-testid="group-reservations">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">Reservations</h2>
          <p className="text-sm text-muted-foreground">
            Reservations belong to the existing reservation engine and carry this Group ID.
          </p>
        </div>
        {canManage ? (
          <Link to="/restaurant/bookings/new" search={{ groupAccountMasterId: groupId }}>
            <Button type="button">Add reservation</Button>
          </Link>
        ) : null}
      </div>
      {canManage ? (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <h3 className="font-medium">Link existing reservation</h3>
          <Input placeholder="Search confirmation" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="grid gap-2 sm:grid-cols-2">
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger>
                <SelectValue placeholder="Select reservation" />
              </SelectTrigger>
              <SelectContent>
                {(searchQuery.data ?? []).map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.confirmationNumber} · {row.guestName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={memberLinkId || "none"} onValueChange={(value) => setMemberLinkId(value === "none" ? "" : value)}>
              <SelectTrigger>
                <SelectValue placeholder="Optional member" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No member link</SelectItem>
                {(membersQuery.data ?? []).map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.guestName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" disabled={!selectedId || linkMutation.isPending} onClick={() => linkMutation.mutate()}>
            Link reservation
          </Button>
        </div>
      ) : null}
      <div className="rounded-2xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Confirmation</TableHead>
              <TableHead>Guest</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Room</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Link to="/restaurant/pms/reservations/$reservationId" params={{ reservationId: row.id }}>
                    {row.confirmationNumber}
                  </Link>
                </TableCell>
                <TableCell>{row.guestName}</TableCell>
                <TableCell>
                  {row.arrivalDate} → {row.departureDate}
                </TableCell>
                <TableCell>{row.roomNumber || row.roomTypeName || "Unassigned"}</TableCell>
                <TableCell>
                  <Badge variant="outline">{row.status}</Badge>
                </TableCell>
                <TableCell className="text-right space-x-2">
                  {canManage && row.status !== "cancelled" ? (
                    <Button type="button" variant="ghost" onClick={() => cancelMutation.mutate(row.id)}>
                      Cancel
                    </Button>
                  ) : null}
                  {canManage ? (
                    <Button type="button" variant="ghost" onClick={() => unlinkMutation.mutate(row.id)}>
                      Unlink
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  No group reservations yet.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  createGroupItineraryItem,
  listGroupItinerary,
  listGroupMembers,
  listGroupReservations,
  updateGroupItineraryItem,
} from "@/packages/pms/lib/guest-group-detail.functions";
import {
  GROUP_EVENTS_UNAVAILABLE,
  GROUP_ITINERARY_COPY,
  GROUP_TRANSPORT_UNAVAILABLE,
} from "@/packages/pms/lib/guest-group-detail-workspace";

export function GuestGroupItinerary({
  restaurantId,
  groupId,
  cancelled,
}: {
  restaurantId: string;
  groupId: string;
  cancelled: boolean;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(listGroupItinerary);
  const loadMembers = useServerFn(listGroupMembers);
  const loadReservations = useServerFn(listGroupReservations);
  const createItem = useServerFn(createGroupItineraryItem);
  const updateItem = useServerFn(updateGroupItineraryItem);
  const [guestId, setGuestId] = useState("");
  const [serviceTypeId, setServiceTypeId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [reservationId, setReservationId] = useState("");

  const query = useQuery({
    queryKey: ["group-itinerary", restaurantId, groupId],
    queryFn: () => load({ data: { restaurantId, groupId } }),
  });
  const members = useQuery({
    queryKey: ["group-members", restaurantId, groupId],
    queryFn: () => loadMembers({ data: { restaurantId, groupId } }),
  });
  const reservations = useQuery({
    queryKey: ["group-reservations", restaurantId, groupId],
    queryFn: () => loadReservations({ data: { restaurantId, groupId } }),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, NonNullable<typeof query.data>["items"]>();
    for (const item of query.data?.items ?? []) {
      const list = map.get(item.date) ?? [];
      list.push(item);
      map.set(item.date, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [query.data]);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["group-itinerary", restaurantId, groupId] });
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createItem({
        data: {
          restaurantId,
          groupId,
          guestId,
          serviceTypeId,
          notes,
          date,
          time: time || null,
          reservationId: reservationId || null,
        },
      }),
    onSuccess: () => {
      toast.success("Service request added to the itinerary.");
      setNotes("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const cancelMutation = useMutation({
    mutationFn: (input: { guestId: string; requestId: string }) =>
      updateItem({
        data: {
          restaurantId,
          groupId,
          guestId: input.guestId,
          requestId: input.requestId,
          status: "cancelled",
        },
      }),
    onSuccess: () => {
      toast.success("Service request cancelled.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4" data-testid="group-itinerary">
      <div>
        <h2 className="font-display text-xl">Itinerary</h2>
        <p className="text-sm text-muted-foreground">{GROUP_ITINERARY_COPY}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-dashed border-border p-4">
          <p className="font-medium">Events</p>
          <p className="text-sm text-muted-foreground">{GROUP_EVENTS_UNAVAILABLE}</p>
        </div>
        <div className="rounded-2xl border border-dashed border-border p-4">
          <p className="font-medium">Transportation</p>
          <p className="text-sm text-muted-foreground">{GROUP_TRANSPORT_UNAVAILABLE}</p>
        </div>
      </div>

      {!cancelled ? (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <h3 className="font-medium">Add guest service</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Member</Label>
              <Select value={guestId} onValueChange={setGuestId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select member" />
                </SelectTrigger>
                <SelectContent>
                  {(members.data ?? []).map((row) => (
                    <SelectItem key={row.guestId} value={row.guestId}>
                      {row.guestName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Service type</Label>
              <Select value={serviceTypeId} onValueChange={setServiceTypeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select service" />
                </SelectTrigger>
                <SelectContent>
                  {(query.data?.serviceTypes ?? [])
                    .filter((row) => row.active)
                    .map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </div>
            <div>
              <Label>Time</Label>
              <Input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label>Reservation (optional)</Label>
              <Select value={reservationId || "none"} onValueChange={(value) => setReservationId(value === "none" ? "" : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {(reservations.data ?? []).map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.confirmationNumber} · {row.guestName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
            </div>
          </div>
          <Button
            type="button"
            disabled={!guestId || !serviceTypeId || !date || !notes.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Add service request
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Cancelled groups are view only.</p>
      )}

      {grouped.length === 0 ? (
        <p className="text-sm text-muted-foreground">No guest service requests for this group yet.</p>
      ) : (
        grouped.map(([day, items]) => (
          <section key={day} className="rounded-2xl border border-border bg-card p-4 space-y-2">
            <h3 className="font-medium">{day}</h3>
            {items.map((item) => (
              <div key={item.id} className="flex flex-wrap items-start justify-between gap-2 border-t border-border pt-2">
                <div>
                  <p className="font-medium">
                    {item.time ? `${item.time} · ` : ""}
                    {item.serviceTypeName}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {item.guestName}
                    {item.notes ? ` · ${item.notes}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{item.status}</Badge>
                  {!cancelled && item.status !== "cancelled" && item.status !== "completed" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => cancelMutation.mutate({ guestId: item.guestId, requestId: item.id })}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}

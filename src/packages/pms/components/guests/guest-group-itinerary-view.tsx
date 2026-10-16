import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  Plus,
  User,
  Wrench,
  XCircle,
} from "lucide-react";

import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
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
  createGroupItineraryItem,
  listGroupItinerary,
  listGroupMembers,
  listGroupReservations,
  updateGroupItineraryItem,
} from "@/packages/pms/lib/guest-group-detail.functions";

export function GuestGroupItineraryView({
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

  const [addDialogOpen, setAddDialogOpen] = useState(false);
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
    void queryClient.invalidateQueries({ queryKey: ["group-detail", restaurantId, groupId] });
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
      toast.success("Guest service request added to itinerary.");
      setAddDialogOpen(false);
      setGuestId("");
      setServiceTypeId("");
      setDate("");
      setTime("");
      setNotes("");
      setReservationId("");
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
    <div className="space-y-6" data-testid="group-itinerary-view">
      {/* Header Info & Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-display text-xl font-semibold text-foreground">Group Itinerary</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Chronological itinerary aggregating member guest service requests across the group stay.
          </p>
        </div>

        {!cancelled && (
          <Button
            type="button"
            size="sm"
            onClick={() => setAddDialogOpen(true)}
            className="gap-1.5 bg-[#251605] text-[#F7F4EE] hover:bg-[#3D260D]"
          >
            <Plus className="h-4 w-4" />
            Add Service Request
          </Button>
        )}
      </div>

      {/* Date-Grouped Timeline */}
      {grouped.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
          <CalendarIcon className="mx-auto h-8 w-8 text-muted-foreground/60 mb-2" />
          <p className="text-sm font-medium">No service requests scheduled</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Schedule service requests for group members to coordinate itinerary items.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([dateKey, items]) => (
            <div key={dateKey} className="space-y-3">
              <div className="flex items-center gap-2 border-b border-border pb-1.5">
                <CalendarIcon className="h-4 w-4 text-primary" />
                <span className="font-display font-semibold text-sm text-foreground">
                  {new Date(dateKey + "T00:00:00").toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
                <span className="text-xs text-muted-foreground">({items.length} requests)</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 shadow-sm space-y-3"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                          <Wrench className="h-3.5 w-3.5 text-primary" />
                          <span>{item.serviceTypeName || "Guest Service"}</span>
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[10px] capitalize ${
                            item.status === "completed"
                              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                              : item.status === "cancelled"
                              ? "border-neutral-300 bg-neutral-100 text-neutral-600"
                              : "border-blue-300 bg-blue-50 text-blue-800"
                          }`}
                        >
                          {item.status}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          <span>{item.guestName}</span>
                        </div>
                        {item.time && (
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>{item.time}</span>
                          </div>
                        )}
                      </div>

                      {item.notes && (
                        <p className="text-xs text-foreground bg-muted/30 rounded p-2">
                          {item.notes}
                        </p>
                      )}
                    </div>

                    {!cancelled && item.status !== "cancelled" && item.status !== "completed" && (
                      <div className="flex justify-end pt-1 border-t border-border/40">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm("Cancel this service request?")) {
                              cancelMutation.mutate({
                                guestId: item.guestId,
                                requestId: item.id,
                              });
                            }
                          }}
                          className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                          disabled={cancelMutation.isPending}
                        >
                          Cancel Request
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Service Request Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Guest Service Request</DialogTitle>
            <DialogDescription>
              Schedule a guest service request for a group member.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Select Member
              </label>
              <Select value={guestId} onValueChange={setGuestId}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Choose a member" />
                </SelectTrigger>
                <SelectContent>
                  {(members.data ?? []).map((m) => (
                    <SelectItem key={m.guestId} value={m.guestId}>
                      {m.guestName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Linked Reservation (Optional)
              </label>
              <Select
                value={reservationId || "none"}
                onValueChange={(val) => setReservationId(val === "none" ? "" : val)}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Select linked reservation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {(reservations.data ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.confirmationNumber} · {r.guestName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Date
                </label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Time (Optional)
                </label>
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Service Type
              </label>
              <Input
                placeholder="e.g. Extra Towels, Airport Shuttle, Late Checkout…"
                value={serviceTypeId}
                onChange={(e) => setServiceTypeId(e.target.value)}
                className="text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Notes
              </label>
              <Textarea
                rows={3}
                placeholder="Specific instructions or requirements…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!guestId || !date || !serviceTypeId.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
              className="bg-[#251605] text-[#F7F4EE] hover:bg-[#3D260D]"
            >
              {createMutation.isPending ? "Adding…" : "Add Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

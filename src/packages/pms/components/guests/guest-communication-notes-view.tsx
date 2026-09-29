import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  FileText,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  Send,
  Users,
} from "lucide-react";

import {
  GUEST_COMMS_CHANNELS,
  GUEST_COMMS_CHANNEL_LABELS,
  WAVE5_MIGRATION_UNAVAILABLE,
  type GuestCommsChannel,
} from "@/packages/pms/lib/guest-profile-wave5";
import { addGuestNote } from "@/packages/pms/lib/guests.functions";
import {
  getGuestAccountActivityHub,
  getGuestActivityHub,
  recordGuestAccountCommunication,
  recordGuestCommunication,
  sendGuestAccountMessage,
  sendGuestMessage,
} from "@/packages/pms/lib/guest-privacy.functions";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/utils";

type CommsFilter = "all" | "notes" | "phone" | "in_person" | "email" | "other";

function formatAuditDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const dt = new Date(iso);
    if (isNaN(dt.getTime())) return iso;
    return dt.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function GuestCommunicationNotesView({
  restaurantId,
  guestId,
  accountId,
  partyName,
}: {
  restaurantId: string;
  guestId?: string | undefined;
  accountId?: string | undefined;
  partyName: string;
}) {
  const queryClient = useQueryClient();
  const fetchGuestHub = useServerFn(getGuestActivityHub);
  const fetchAccountHub = useServerFn(getGuestAccountActivityHub);
  const addNote = useServerFn(addGuestNote);
  const recordGuest = useServerFn(recordGuestCommunication);
  const recordAccount = useServerFn(recordGuestAccountCommunication);
  const sendGuest = useServerFn(sendGuestMessage);
  const sendAccount = useServerFn(sendGuestAccountMessage);

  const [activeFilter, setActiveFilter] = useState<CommsFilter>("all");
  const [noteOpen, setNoteOpen] = useState(false);
  const [commsOpen, setCommsOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  const [noteText, setNoteText] = useState("");
  const [recordChannel, setRecordChannel] = useState<GuestCommsChannel>("phone");
  const [recordNotes, setRecordNotes] = useState("");
  const [sendBody, setSendBody] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const hubQuery = useQuery({
    queryKey: ["guest-activity-hub", restaurantId, guestId, accountId],
    queryFn: () =>
      guestId
        ? fetchGuestHub({ data: { restaurantId, guestId } })
        : fetchAccountHub({ data: { restaurantId, accountId: accountId! } }),
    enabled: Boolean(guestId || accountId),
    retry: false,
  });

  function refresh() {
    void queryClient.invalidateQueries({
      queryKey: ["guest-activity-hub", restaurantId, guestId, accountId],
    });
    if (guestId) void queryClient.invalidateQueries({ queryKey: ["guest", restaurantId, guestId] });
  }

  const noteMutation = useMutation({
    mutationFn: () => addNote({ data: { restaurantId, guestId: guestId!, note: noteText } }),
    onSuccess: () => {
      toast.success("Note added successfully.");
      setNoteText("");
      setNoteOpen(false);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const recordMutation = useMutation({
    mutationFn: () =>
      guestId
        ? recordGuest({
            data: {
              restaurantId,
              guestId: guestId!,
              channel: recordChannel,
              notes: recordNotes,
            },
          })
        : recordAccount({
            data: {
              restaurantId,
              accountId: accountId!,
              channel: recordChannel,
              notes: recordNotes,
            },
          }),
    onSuccess: () => {
      toast.success("Communication recorded.");
      setRecordNotes("");
      setCommsOpen(false);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      guestId
        ? sendGuest({ data: { restaurantId, guestId, body: sendBody } })
        : sendAccount({ data: { restaurantId, accountId: accountId!, body: sendBody } }),
    onSuccess: (result) => {
      if (!result.sent) {
        toast.error(result.message);
        return;
      }
      toast.success("Message sent.");
      setSendBody("");
      setSendOpen(false);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const data = hubQuery.data;
  const rawEntries = data?.entries ?? [];
  const frozen = data?.anonymised ?? false;
  const sendAvailable = Boolean(data?.sendChannel);

  // Filter entries down to communications and notes
  const commsEvents = useMemo(() => {
    return rawEntries.filter((e) => {
      const isNote = e.source === "note" || e.eventType === "note_added";
      const isComms = e.source === "comms" || e.eventType.startsWith("comms_");
      if (!isNote && !isComms) return false;

      if (activeFilter === "notes") return isNote;
      if (activeFilter === "email") {
        return e.eventType.includes("email") || (e.notes && e.notes.toLowerCase().includes("email"));
      }
      if (activeFilter === "phone") {
        return e.eventType.includes("phone") || (e.notes && e.notes.toLowerCase().includes("phone"));
      }
      if (activeFilter === "in_person") {
        return e.eventType.includes("in_person");
      }
      if (activeFilter === "other") {
        return !e.eventType.includes("phone") && !e.eventType.includes("email") && !e.eventType.includes("in_person") && !isNote;
      }
      return true;
    });
  }, [rawEntries, activeFilter]);

  if (hubQuery.isLoading) {
    return (
      <div className="space-y-4" data-testid="guest-comms-loading">
        <div className="h-14 rounded-xl border border-[#DDD4C5] bg-white animate-pulse" />
        <div className="h-64 rounded-xl border border-[#DDD4C5] bg-white animate-pulse" />
      </div>
    );
  }

  if (hubQuery.isError) {
    const message = hubQuery.error instanceof Error ? hubQuery.error.message : "Communication history could not be loaded.";
    return (
      <div
        className="rounded-xl border border-[#DDD4C5] bg-white p-6 text-center text-xs text-[#756A5B]"
        data-testid="guest-comms-notes"
      >
        <h2 className="font-display text-base font-semibold text-[#251605]">Communication & Notes</h2>
        <p className="mt-1 font-medium text-[#251605]">{partyName}</p>
        <p className="mt-2 text-[#756A5B]">
          {message.includes("0054") ? WAVE5_MIGRATION_UNAVAILABLE : message}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3 border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE]"
          onClick={() => void hubQuery.refetch()}
        >
          <RefreshCw className="mr-1.5 size-3.5" /> Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="guest-comms-notes">
      {/* Top Operational Bar: Actions & Summary */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#DDD4C5] bg-white px-4 py-3 shadow-sm">
        <div>
          <h2 className="font-display text-base font-semibold text-[#251605]">
            Communication & Notes
          </h2>
          <p className="text-[11px] text-[#756A5B]">
            Operational guest logs, internal staff notes, and recorded conversations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={frozen}
            onClick={() => setNoteOpen(true)}
            className="h-8 text-xs bg-white border border-[#DDD4C5] text-[#251605] hover:bg-[#F7F4EE] shadow-sm font-medium"
          >
            <Plus className="mr-1.5 size-3.5" /> Add Note
          </Button>

          <Button
            size="sm"
            disabled={frozen}
            onClick={() => setCommsOpen(true)}
            className="h-8 text-xs bg-[#8A641A] hover:bg-[#725215] text-white shadow-sm font-medium transition-colors"
          >
            <Phone className="mr-1.5 size-3.5" /> Record Communication
          </Button>

          {sendAvailable ? (
            <Button
              size="sm"
              disabled={frozen}
              onClick={() => setSendOpen(true)}
              className="h-8 text-xs bg-white border border-[#DDD4C5] text-[#251605] hover:bg-[#F7F4EE]"
            >
              <Send className="mr-1.5 size-3.5" /> Send Message
            </Button>
          ) : null}
        </div>
      </div>

      {/* Filter Strip */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[#DDD4C5] pb-2 text-xs">
        {(
          [
            { id: "all", label: "All Logs" },
            { id: "notes", label: "Notes" },
            { id: "phone", label: "Calls" },
            { id: "in_person", label: "In-Person" },
            { id: "email", label: "Email" },
            { id: "other", label: "Other" },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setActiveFilter(f.id)}
            className={cn(
              "rounded-lg px-2.5 py-1 font-medium transition-colors",
              activeFilter === f.id
                ? "bg-[#C89933]/15 text-[#8A641A] font-semibold"
                : "text-[#756A5B] hover:bg-[#F7F4EE] hover:text-[#251605]",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Timeline / Dense Table of Communications & Notes */}
      <div className="rounded-xl border border-[#DDD4C5] bg-white shadow-sm overflow-hidden">
        {commsEvents.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <p className="text-xs font-medium text-[#251605]">No communications or notes found.</p>
            <p className="text-[11px] text-[#756A5B]">
              Add staff notes or record phone calls and in-person discussions with {partyName}.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#DDD4C5]">
            {commsEvents.map((evt) => {
              const isNote = evt.source === "note" || evt.eventType === "note_added";
              const isExpanded = expandedId === evt.id;
              const isCall = evt.eventType.includes("phone");
              const isInPerson = evt.eventType.includes("in_person");
              return (
                <div
                  key={evt.id}
                  className="p-3.5 transition-colors hover:bg-[#F7F4EE]/50 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : evt.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#FAF8F5] border border-[#DDD4C5] text-[#8A641A] mt-0.5">
                        {isNote ? (
                          <FileText className="size-3.5" />
                        ) : isCall ? (
                          <Phone className="size-3.5" />
                        ) : isInPerson ? (
                          <Users className="size-3.5" />
                        ) : (
                          <Mail className="size-3.5" />
                        )}
                      </span>
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-[#251605]">
                            {isNote ? "Staff Note" : "Recorded Communication"}
                          </span>
                          <span className="text-[10px] text-[#756A5B]">
                            by {evt.actorName || "Staff"}
                          </span>
                        </div>
                        <p className={cn("text-xs text-[#251605]", !isExpanded && "line-clamp-2")}>
                          {evt.notes || "—"}
                        </p>
                      </div>
                    </div>

                    <span className="shrink-0 text-[11px] text-[#756A5B] whitespace-nowrap">
                      {formatAuditDateTime(evt.createdAt)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Note Modal */}
      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent className="border-[#DDD4C5] bg-white text-[#251605] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-base font-semibold text-[#251605]">
              Add Staff Note
            </DialogTitle>
            <DialogDescription className="text-xs text-[#756A5B]">
              Add an operational note to {partyName}’s profile history. Visible to internal staff.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <Label className="text-xs font-medium text-[#756A5B]">Note Content</Label>
            <Textarea
              rows={4}
              placeholder="Enter note details…"
              className="text-xs border-[#DDD4C5] bg-white text-[#251605]"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNoteOpen(false)}
              className="h-8 text-xs border-[#DDD4C5] bg-white text-[#756A5B]"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!noteText.trim() || noteMutation.isPending}
              onClick={() => noteMutation.mutate()}
              className="h-8 text-xs bg-[#8A641A] hover:bg-[#725215] text-white font-medium"
            >
              {noteMutation.isPending ? "Saving…" : "Save Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Communication Modal */}
      <Dialog open={commsOpen} onOpenChange={setCommsOpen}>
        <DialogContent className="border-[#DDD4C5] bg-white text-[#251605] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-base font-semibold text-[#251605]">
              Record Communication
            </DialogTitle>
            <DialogDescription className="text-xs text-[#756A5B]">
              Log a phone call, in-person conversation, or other operational interaction.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#756A5B]">Communication Channel</Label>
              <Select
                value={recordChannel}
                onValueChange={(val) => setRecordChannel(val as GuestCommsChannel)}
              >
                <SelectTrigger className="h-8 text-xs border-[#DDD4C5] bg-white text-[#251605]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-[#DDD4C5] bg-white text-xs">
                  {GUEST_COMMS_CHANNELS.map((ch) => (
                    <SelectItem key={ch} value={ch}>
                      {GUEST_COMMS_CHANNEL_LABELS[ch]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#756A5B]">Interaction Notes</Label>
              <Textarea
                rows={3}
                placeholder="Summary of the conversation or topic discussed…"
                className="text-xs border-[#DDD4C5] bg-white text-[#251605]"
                value={recordNotes}
                onChange={(e) => setRecordNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCommsOpen(false)}
              className="h-8 text-xs border-[#DDD4C5] bg-white text-[#756A5B]"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!recordNotes.trim() || recordMutation.isPending}
              onClick={() => recordMutation.mutate()}
              className="h-8 text-xs bg-[#8A641A] hover:bg-[#725215] text-white font-medium"
            >
              {recordMutation.isPending ? "Recording…" : "Record Interaction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

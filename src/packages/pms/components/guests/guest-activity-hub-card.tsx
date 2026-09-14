import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
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
  GUEST_COMMS_CHANNEL_LABELS,
  GUEST_COMMS_CHANNELS,
  WAVE5_HUB_COPY,
  WAVE5_HUB_EMPTY,
  WAVE5_MIGRATION_UNAVAILABLE,
  WAVE5_NO_SEND_COPY,
  WAVE5_SEND_COPY,
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
import { useRestaurantTime } from "@/packages/restaurant-management/state/restaurant-context";

const EVENT_LABEL: Record<string, string> = {
  created: "Created",
  profile_updated: "Profile updated",
  vip_changed: "VIP changed",
  status_changed: "Status changed",
  preference_updated: "Preferences updated",
  note_added: "Note",
  document_uploaded: "Document uploaded",
  document_verified: "Document staff-verified",
  document_rejected: "Document rejected",
  merged_from: "Merged from",
  merged_into: "Merged into",
  consent_updated: "Consent updated",
  relationship_linked: "Relationship linked",
  relationship_unlinked: "Relationship unlinked",
  comms_logged: "Communication recorded",
  comms_sent: "Email sent",
  exported: "Exported",
  anonymised: "Anonymised",
  unmerged: "Unmerged",
  unmerge_blocked: "Unmerge not available",
};

export function GuestActivityHubCard({
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
  const { dateTime } = useRestaurantTime();
  const fetchGuestHub = useServerFn(getGuestActivityHub);
  const fetchAccountHub = useServerFn(getGuestAccountActivityHub);
  const addNote = useServerFn(addGuestNote);
  const recordGuest = useServerFn(recordGuestCommunication);
  const recordAccount = useServerFn(recordGuestAccountCommunication);
  const sendGuest = useServerFn(sendGuestMessage);
  const sendAccount = useServerFn(sendGuestAccountMessage);

  const [note, setNote] = useState("");
  const [recordChannel, setRecordChannel] = useState<GuestCommsChannel>("phone");
  const [recordNotes, setRecordNotes] = useState("");
  const [sendBody, setSendBody] = useState("");

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
    void queryClient.invalidateQueries({ queryKey: ["guest-activity-hub", restaurantId, guestId, accountId] });
    if (guestId) void queryClient.invalidateQueries({ queryKey: ["guest", restaurantId, guestId] });
    if (accountId) {
      void queryClient.invalidateQueries({ queryKey: ["guest-account", restaurantId, accountId] });
      void queryClient.invalidateQueries({ queryKey: ["guest-account-history", restaurantId, accountId] });
    }
  }

  const noteMutation = useMutation({
    mutationFn: () => addNote({ data: { restaurantId, guestId: guestId!, note } }),
    onSuccess: () => {
      toast.success("Note added to history.");
      setNote("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const recordMutation = useMutation({
    mutationFn: () =>
      guestId
        ? recordGuest({ data: { restaurantId, guestId, channel: recordChannel, notes: recordNotes } })
        : recordAccount({
            data: { restaurantId, accountId: accountId!, channel: recordChannel, notes: recordNotes },
          }),
    onSuccess: () => {
      toast.success("Communication recorded.");
      setRecordNotes("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      guestId
        ? sendGuest({ data: { restaurantId, guestId, body: sendBody } })
        : sendAccount({ data: { restaurantId, accountId: accountId!, body: sendBody } }),
    onSuccess: () => {
      toast.success("Email delivered through the configured channel.");
      setSendBody("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (hubQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading activity…</p>;
  if (hubQuery.isError) {
    const message = hubQuery.error instanceof Error ? hubQuery.error.message : "Activity could not be loaded.";
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-6" data-testid="guest-activity-hub">
        <h2 className="font-display text-xl">Notes / Comms / Activity</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {message.includes("0054") ? WAVE5_MIGRATION_UNAVAILABLE : message}
        </p>
      </div>
    );
  }

  const hub = hubQuery.data;
  if (!hub) return null;
  const sendChannel = hub.sendChannel;
  const frozen = hub.anonymised;

  return (
    <div className="space-y-4" data-testid="guest-activity-hub">
      <div>
        <h2 className="font-display text-xl">{partyName}</h2>
        <p className="mt-1 text-sm font-medium">Notes / Comms / Activity</p>
        <p className="mt-1 text-sm text-muted-foreground" data-testid="guest-activity-hub-copy">
          {WAVE5_HUB_COPY}
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="font-display text-lg">Profile notes</p>
        <p className="mt-2 text-sm text-muted-foreground">{hub.notes ?? "No profile notes yet."}</p>
        {guestId && !frozen ? (
          <div className="mt-4 space-y-2">
            <Label htmlFor="guest-activity-note">Add a note</Label>
            <Textarea
              id="guest-activity-note"
              data-testid="guest-activity-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button
              data-testid="guest-activity-note-save"
              disabled={noteMutation.isPending || note.trim() === ""}
              onClick={() => noteMutation.mutate()}
            >
              Save note
            </Button>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="font-display text-lg">Record communication</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Log a phone call, in-person conversation or other operational contact. This is not a marketing send.
        </p>
        {frozen ? (
          <p className="mt-2 text-sm text-muted-foreground">This profile has been anonymised.</p>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="space-y-2">
              <Label>Channel</Label>
              <Select value={recordChannel} onValueChange={(value) => setRecordChannel(value as GuestCommsChannel)}>
                <SelectTrigger data-testid="guest-activity-record-channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GUEST_COMMS_CHANNELS.map((channel) => (
                    <SelectItem key={channel} value={channel}>
                      {GUEST_COMMS_CHANNEL_LABELS[channel]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Textarea
              data-testid="guest-activity-record-notes"
              rows={3}
              value={recordNotes}
              onChange={(e) => setRecordNotes(e.target.value)}
            />
            <Button
              data-testid="guest-activity-record"
              disabled={recordMutation.isPending || recordNotes.trim() === ""}
              onClick={() => recordMutation.mutate()}
            >
              Record communication
            </Button>
          </div>
        )}
      </div>

      {sendChannel ? (
        <div className="rounded-2xl border border-border bg-card p-5" data-testid="guest-activity-send-panel">
          <p className="font-display text-lg">Send email</p>
          <p className="mt-1 text-sm text-muted-foreground">{WAVE5_SEND_COPY}</p>
          {frozen ? (
            <p className="mt-2 text-sm text-muted-foreground">This profile has been anonymised.</p>
          ) : (
            <div className="mt-4 space-y-2">
              <Textarea
                data-testid="guest-activity-send-body"
                rows={4}
                value={sendBody}
                onChange={(e) => setSendBody(e.target.value)}
              />
              <Button
                data-testid="guest-activity-send"
                disabled={sendMutation.isPending || sendBody.trim() === ""}
                onClick={() => sendMutation.mutate()}
              >
                Send email
              </Button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="guest-activity-no-send">
          {WAVE5_NO_SEND_COPY}
        </p>
      )}

      <div>
        <p className="font-display text-lg">Activity</p>
        {hub.entries.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground" data-testid="guest-activity-empty">
            {WAVE5_HUB_EMPTY}
          </p>
        ) : (
          <ol className="mt-3 space-y-3" data-testid="guest-activity-list">
            {hub.entries.map((entry) => (
              <li key={entry.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{EVENT_LABEL[entry.eventType] ?? entry.eventType}</p>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{entry.source}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{dateTime(entry.createdAt)}</p>
                {entry.actorName ? (
                  <p className="mt-1 text-xs text-muted-foreground">by {entry.actorName}</p>
                ) : null}
                {entry.notes ? <p className="mt-2 text-sm">{entry.notes}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

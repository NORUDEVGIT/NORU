import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Clock, Info, Mail, Send, User } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  listGroupCommunications,
  listGroupMembers,
  sendGroupCommunication,
} from "@/packages/pms/lib/guest-group-detail.functions";
import { GROUP_COMMS_TEMPLATES_UNAVAILABLE } from "@/packages/pms/lib/guest-group-detail-workspace";

export function GuestGroupCommunicationView({
  restaurantId,
  groupId,
  cancelled,
}: {
  restaurantId: string;
  groupId: string;
  cancelled: boolean;
}) {
  const queryClient = useQueryClient();
  const send = useServerFn(sendGroupCommunication);
  const loadHistory = useServerFn(listGroupCommunications);
  const loadMembers = useServerFn(listGroupMembers);

  const [body, setBody] = useState("");
  const [recipient, setRecipient] = useState("contact");

  const historyQuery = useQuery({
    queryKey: ["group-comms", restaurantId, groupId],
    queryFn: () => loadHistory({ data: { restaurantId, groupId } }),
  });

  const membersQuery = useQuery({
    queryKey: ["group-members", restaurantId, groupId],
    queryFn: () => loadMembers({ data: { restaurantId, groupId } }),
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      send({
        data: {
          restaurantId,
          groupId,
          body,
          guestId: recipient !== "contact" ? recipient : undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Email communication sent successfully.");
      setBody("");
      void queryClient.invalidateQueries({ queryKey: ["group-comms", restaurantId, groupId] });
      void queryClient.invalidateQueries({ queryKey: ["guest-account-history", restaurantId, groupId] });
      void queryClient.invalidateQueries({ queryKey: ["group-detail", restaurantId, groupId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const historyItems = historyQuery.data ?? [];
  const members = membersQuery.data ?? [];

  return (
    <div className="space-y-6" data-testid="group-communication-view">
      {/* Header Info */}
      <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Communication</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Direct email-backed communication with the group primary contact or individual linked members.
              All sent communications are logged to the group activity audit trail.
            </p>
          </div>
        </div>
      </div>

      {/* Compose Section */}
      {!cancelled ? (
        <div className="rounded-xl border border-border/80 bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <h4 className="text-sm font-semibold text-foreground">New Email Message</h4>
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Channel: Email
            </span>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Recipient
              </label>
              <Select value={recipient} onValueChange={setRecipient}>
                <SelectTrigger className="w-full text-sm">
                  <SelectValue placeholder="Choose recipient" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contact">Group Primary Contact</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.guestId} value={m.guestId}>
                      {m.guestName} {m.email ? `· ${m.email}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Message Body
              </label>
              <Textarea
                rows={5}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Compose message text for group contact or member…"
                className="text-sm resize-y"
              />
            </div>

            {/* Template status note (Amendment 8 & 10) */}
            <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 shrink-0" />
              <span>{GROUP_COMMS_TEMPLATES_UNAVAILABLE}</span>
            </div>

            <div className="flex justify-end pt-1">
              <Button
                type="button"
                disabled={!body.trim() || sendMutation.isPending}
                onClick={() => sendMutation.mutate()}
                className="gap-2 bg-[#251605] text-[#F7F4EE] hover:bg-[#3D260D]"
              >
                <Send className="h-4 w-4" />
                {sendMutation.isPending ? "Sending…" : "Send Email"}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-4 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            This group is cancelled. New communications cannot be dispatched.
          </p>
        </div>
      )}

      {/* Communication History Feed */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground">Communication Log</h4>

        {historyItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground">
            <p className="text-sm font-medium">No messages recorded yet.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Dispatched messages will appear in this timeline.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {historyItems.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-border/70 bg-card p-4 shadow-sm space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <User className="h-3.5 w-3.5 text-primary" />
                    <span>Recipient: {item.memberId ? "Member" : "Group Primary Contact"}</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>{item.createdAt.slice(0, 16).replace("T", " ")}</span>
                    <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase font-semibold">
                      Email
                    </span>
                  </div>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap">{item.notes}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

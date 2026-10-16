import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

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
import { groupCommunicationTemplateService } from "@/packages/pms/lib/guest-group-financials";

export function GuestGroupCommunication({
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
  const templates = groupCommunicationTemplateService.list();

  const history = useQuery({
    queryKey: ["group-comms", restaurantId, groupId],
    queryFn: () => loadHistory({ data: { restaurantId, groupId } }),
  });
  const members = useQuery({
    queryKey: ["group-members", restaurantId, groupId],
    queryFn: () => loadMembers({ data: { restaurantId, groupId } }),
  });

  const mutation = useMutation({
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
      toast.success("Message sent.");
      setBody("");
      void queryClient.invalidateQueries({ queryKey: ["group-comms", restaurantId, groupId] });
      void queryClient.invalidateQueries({ queryKey: ["guest-account-history", restaurantId, groupId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4" data-testid="group-communication">
      <div>
        <h2 className="font-display text-xl">Communication</h2>
        <p className="text-sm text-muted-foreground">
          Sends email through the existing guest-account or member channel and records comms_sent on group activity.
        </p>
      </div>
      <div className="rounded-2xl border border-dashed border-border p-4">
        <p className="font-medium">Templates</p>
        <p className="text-sm text-muted-foreground">{templates.reason || GROUP_COMMS_TEMPLATES_UNAVAILABLE}</p>
        <Select disabled>
          <SelectTrigger className="mt-2">
            <SelectValue placeholder="No templates configured" />
          </SelectTrigger>
        </Select>
      </div>
      {!cancelled ? (
        <>
          <Select value={recipient} onValueChange={setRecipient}>
            <SelectTrigger>
              <SelectValue placeholder="Recipient" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="contact">Group contact</SelectItem>
              {(members.data ?? []).map((row) => (
                <SelectItem key={row.guestId} value={row.guestId}>
                  {row.guestName}
                  {row.email ? ` · ${row.email}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="Message" />
          <Button type="button" disabled={!body.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
            Send email
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Cancelled groups are view only.</p>
      )}
      <section className="rounded-2xl border border-border bg-card p-4 space-y-2">
        <h3 className="font-medium">Communication history</h3>
        {(history.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No messages recorded on this group yet.</p>
        ) : (
          (history.data ?? []).map((row) => (
            <div key={row.id} className="border-t border-border pt-2">
              <p className="text-xs text-muted-foreground">
                {row.createdAt.slice(0, 16).replace("T", " ")} · {row.type}
                {row.memberId ? " · member" : " · group contact"}
              </p>
              <p className="text-sm">{row.notes}</p>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

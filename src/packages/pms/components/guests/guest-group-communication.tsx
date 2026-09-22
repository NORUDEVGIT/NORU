import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { sendGuestAccountMessage } from "@/packages/pms/lib/guest-privacy.functions";

export function GuestGroupCommunication({
  restaurantId,
  groupId,
}: {
  restaurantId: string;
  groupId: string;
}) {
  const send = useServerFn(sendGuestAccountMessage);
  const [body, setBody] = useState("");
  const mutation = useMutation({
    mutationFn: () => send({ data: { restaurantId, accountId: groupId, body } }),
    onSuccess: () => {
      toast.success("Message sent.");
      setBody("");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4" data-testid="group-communication">
      <div>
        <h2 className="font-display text-xl">Communication</h2>
        <p className="text-sm text-muted-foreground">
          Sends email through the existing guest-account channel and records comms_sent on group activity.
        </p>
      </div>
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="Message to the group contact email" />
      <Button type="button" disabled={!body.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
        Send email
      </Button>
    </div>
  );
}

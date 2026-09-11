import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { canSubmitReceiptEmail, validateReceiptEmail } from "@/packages/restaurant-management/lib/rm-receipts";
import { sendOrderReceiptEmail } from "@/packages/restaurant-management/lib/rm-receipts.functions";

export function EmailReceiptDialog({
  restaurantId,
  orderId,
  open,
  onClose,
  prefillEmail = "",
}: {
  restaurantId: string;
  orderId: string;
  open: boolean;
  onClose: () => void;
  prefillEmail?: string;
}) {
  const [email, setEmail] = useState(prefillEmail);
  const send = useServerFn(sendOrderReceiptEmail);

  const mutation = useMutation({
    mutationFn: () => send({ data: { restaurantId, orderId, toEmail: email } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Receipt emailed");
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const parsed = validateReceiptEmail(email);
  const canSend = canSubmitReceiptEmail({ email, submitting: mutation.isPending });

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="rm-no-print max-w-md">
        <DialogHeader>
          <DialogTitle>Email receipt</DialogTitle>
          <DialogDescription>
            Sends the frozen guest bill. This does not change the sale totals.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="rm-receipt-email">Guest email</Label>
          <Input
            id="rm-receipt-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="guest@email.com"
            className="h-12 rounded-2xl"
          />
          {email.trim() && !parsed.ok ? (
            <p className="text-sm text-destructive">{parsed.message}</p>
          ) : null}
        </div>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            className="h-11 rounded-xl font-bold"
            disabled={!canSend}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Sending…" : mutation.isError || (mutation.data && !mutation.data.ok) ? "Retry" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { adjustBusinessDate } from "@/packages/pms/lib/business-date-recovery.functions";
import {
  BUSINESS_DATE_ADJUST_WARNING,
  BUSINESS_DATE_CONFIRM_WORD,
  BUSINESS_DATE_REASON_MAX,
  businessDateAdjustmentProblem,
  canAdjustBusinessDate,
} from "@/packages/pms/lib/business-date-recovery";
import { PROPERTY_BUSINESS_DATE_KEY } from "@/packages/pms/lib/use-property-business-date";

/** Owner-only. Renders nothing for every other role. */
export function BusinessDateRecoveryControl({
  restaurantId,
  role,
  currentBusinessDate,
}: {
  restaurantId: string;
  role: string;
  /** Stored restaurants.business_date. Null before initialization. */
  currentBusinessDate: string | null;
}) {
  const [open, setOpen] = useState(false);
  if (!canAdjustBusinessDate(role)) return null;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-1 h-8 gap-1.5 text-xs"
        onClick={() => setOpen(true)}
        data-testid="card1-adjust-business-date"
      >
        <CalendarClock className="size-3.5" />
        Adjust Business Date
      </Button>
      {open ? (
        <BusinessDateRecoveryDialog
          restaurantId={restaurantId}
          currentBusinessDate={currentBusinessDate}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function BusinessDateRecoveryDialog({
  restaurantId,
  currentBusinessDate,
  onClose,
}: {
  restaurantId: string;
  currentBusinessDate: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const adjust = useServerFn(adjustBusinessDate);
  const [newBusinessDate, setNewBusinessDate] = useState("");
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const problem = businessDateAdjustmentProblem({
    currentBusinessDate,
    newBusinessDate,
    reason,
    confirmation,
  });

  const mutation = useMutation({
    mutationFn: () =>
      adjust({
        data: {
          restaurantId,
          expectedBusinessDate: currentBusinessDate,
          newBusinessDate,
          reason: reason.trim(),
          confirmation,
        },
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success(`Business date set to ${result.newBusinessDate}.`);
      // Canonical date consumers re-read restaurants.business_date.
      for (const key of [
        ["pms-card1", restaurantId],
        ["pms-set1-foundation", restaurantId],
        ["pms-set1-audit", restaurantId],
        [PROPERTY_BUSINESS_DATE_KEY, restaurantId],
        ["night-audit", restaurantId],
        ["night-audit-financial", restaurantId],
        ["night-audit-operations", restaurantId],
        ["night-audit-history", restaurantId],
        ["front-office"],
      ]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Dialog open onOpenChange={(next) => !next && !mutation.isPending && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="card1-adjust-business-date-dialog">
        <DialogHeader>
          <DialogTitle>Adjust Business Date</DialogTitle>
          <DialogDescription>
            Owner setup and recovery only. Night Audit normally advances the date.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" />
          <p data-testid="card1-adjust-business-date-warning">{BUSINESS_DATE_ADJUST_WARNING}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="bd-adjust-current">Current Business Date</Label>
            <Input
              id="bd-adjust-current"
              value={currentBusinessDate ?? "Not initialized"}
              readOnly
              disabled
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bd-adjust-new">New Business Date</Label>
            <Input
              id="bd-adjust-new"
              type="date"
              value={newBusinessDate}
              onChange={(event) => setNewBusinessDate(event.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="bd-adjust-reason">Reason</Label>
            <span className="font-mono text-[10px] text-muted-foreground">
              {reason.trim().length}/{BUSINESS_DATE_REASON_MAX}
            </span>
          </div>
          <Textarea
            id="bd-adjust-reason"
            rows={3}
            maxLength={BUSINESS_DATE_REASON_MAX}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why the business date must be changed manually"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bd-adjust-confirm">Type {BUSINESS_DATE_CONFIRM_WORD} to continue</Label>
          <Input
            id="bd-adjust-confirm"
            value={confirmation}
            autoComplete="off"
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </div>

        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={Boolean(problem) || mutation.isPending}
            title={problem ?? undefined}
            onClick={() => {
              setError(null);
              mutation.mutate();
            }}
            data-testid="card1-adjust-business-date-submit"
          >
            {mutation.isPending ? "Adjusting…" : "Adjust Business Date"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

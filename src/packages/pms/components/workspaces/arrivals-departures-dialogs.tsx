import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { shiftMoment } from "@/core/lib/workforce-rules";
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { FoAuthorizationCard } from "@/packages/pms/components/frontoffice/fo-authorization-card";
import { getFrontOfficeApprovalRequirement } from "@/packages/pms/lib/fo-approvals.functions";
import {
  bulkSetExpectedArrivalTime,
  setExpectedArrivalTime,
  setLateCheckout,
} from "@/packages/pms/lib/arrivals-departures.functions";
import type {
  ArrivalRow,
  BulkEtaResult,
  DepartureRow,
} from "@/packages/pms/lib/reservation-workspace/shared-read-models";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { formatClockInZone } from "@/shared/lib/property-time";

function clockForInput(iso: string | null, timezone: string): string {
  if (!iso) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(iso));
    const hour = parts.find((part) => part.type === "hour")?.value ?? "12";
    const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
    return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  } catch {
    return "";
  }
}

function instantFromClock(date: string, clock: string, timezone: string): string {
  return shiftMoment(date, clock, timezone).toISOString();
}

export function ExpectedArrivalDialog({
  restaurantId,
  timezone,
  row,
  open,
  onOpenChange,
  onSaved,
}: {
  restaurantId: string;
  timezone: string;
  row: ArrivalRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const submit = useServerFn(setExpectedArrivalTime);
  const [clock, setClock] = useState("");

  useEffect(() => {
    setClock(clockForInput(row?.operational.expectedArrivalTime ?? null, timezone));
  }, [row?.reservationId, row?.operational.expectedArrivalTime, timezone]);

  const mutation = useMutation({
    mutationFn: (expectedArrivalAt: string | null) =>
      submit({
        data: {
          restaurantId,
          reservationId: row!.reservationId,
          expectedArrivalAt,
        },
      }),
    onSuccess: () => {
      toast.success("Expected arrival updated.");
      onOpenChange(false);
      onSaved();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update expected arrival."),
  });

  if (!row) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Update expected arrival</DialogTitle>
        <DialogDescription>
          {row.guest.name} · {row.confirmationNumber}. Arrival date stays {formatStayDate(row.stay.arrivalDate)}.
        </DialogDescription>
        <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
          Expected arrival time
          <Input
            type="time"
            value={clock}
            onChange={(event) => setClock(event.target.value)}
            aria-label="Expected arrival time"
          />
        </label>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(null)}
          >
            Clear
          </Button>
          <Button
            className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
            disabled={!clock || mutation.isPending}
            onClick={() => mutation.mutate(instantFromClock(row.stay.arrivalDate, clock, timezone))}
          >
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BulkExpectedArrivalDialog({
  restaurantId,
  timezone,
  arrivalDate,
  reservationIds,
  open,
  onOpenChange,
  onSaved,
}: {
  restaurantId: string;
  timezone: string;
  arrivalDate: string;
  reservationIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const submit = useServerFn(bulkSetExpectedArrivalTime);
  const [clock, setClock] = useState("");
  const [failed, setFailed] = useState<BulkEtaResult["failed"]>([]);

  useEffect(() => {
    if (open) {
      setClock("");
      setFailed([]);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: (expectedArrivalAt: string) =>
      submit({
        data: {
          restaurantId,
          items: reservationIds.map((reservationId) => ({ reservationId, expectedArrivalAt })),
        },
      }) as Promise<BulkEtaResult>,
    onSuccess: (result) => {
      setFailed(result.failed);
      if (result.ok.length > 0) {
        toast.success(`Updated expected arrival for ${result.ok.length} stay${result.ok.length === 1 ? "" : "s"}.`);
      }
      if (result.failed.length === 0) {
        onOpenChange(false);
        onSaved();
        return;
      }
      toast.error(`${result.failed.length} stay${result.failed.length === 1 ? "" : "s"} could not be updated.`);
      onSaved();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update expected arrival."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Bulk expected arrival</DialogTitle>
        <DialogDescription>
          Apply one expected arrival time to {reservationIds.length} selected arrival
          {reservationIds.length === 1 ? "" : "s"} on {formatStayDate(arrivalDate)}.
        </DialogDescription>
        <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
          Expected arrival time
          <Input
            type="time"
            value={clock}
            onChange={(event) => setClock(event.target.value)}
            aria-label="Bulk expected arrival time"
          />
        </label>
        {failed.length > 0 ? (
          <ul className="max-h-32 space-y-1 overflow-y-auto text-sm text-destructive">
            {failed.map((item) => (
              <li key={item.reservationId}>{item.message ?? "Could not update this stay."}</li>
            ))}
          </ul>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
            disabled={!clock || reservationIds.length === 0 || mutation.isPending}
            onClick={() => mutation.mutate(instantFromClock(arrivalDate, clock, timezone))}
          >
            {mutation.isPending ? "Updating…" : "Update selected"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LateCheckoutDialog({
  restaurantId,
  timezone,
  row,
  open,
  onOpenChange,
  onSaved,
}: {
  restaurantId: string;
  timezone: string;
  row: DepartureRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const submit = useServerFn(setLateCheckout);
  const fetchApproval = useServerFn(getFrontOfficeApprovalRequirement);
  const policy = row?.operational.lateCheckout.policy;
  const [clock, setClock] = useState("");
  const [note, setNote] = useState("");
  const needsApproval = policy?.needsApproval === true;
  const approvalQuery = useQuery({
    queryKey: ["front-office", "approval", restaurantId, "late_checkout.authorize"],
    queryFn: () =>
      fetchApproval({ data: { restaurantId, actionKey: "late_checkout.authorize" } }),
    enabled: open && needsApproval,
    retry: false,
  });
  const lateAuth = approvalQuery.data;
  const canAuthorize = !needsApproval || lateAuth?.canCurrentUserAuthorize === true;

  useEffect(() => {
    if (!row) return;
    setClock(
      clockForInput(row.operational.lateCheckout.until, timezone) ||
        policy?.checkOutTime ||
        "",
    );
    setNote(row.operational.lateCheckout.note ?? "");
  }, [row, timezone, policy?.checkOutTime]);

  const mutation = useMutation({
    mutationFn: (input: { granted: boolean; until: string | null; note: string | null }) =>
      submit({
        data: {
          restaurantId,
          reservationId: row!.reservationId,
          granted: input.granted,
          until: input.until,
          note: input.note,
        },
      }),
    onSuccess: () => {
      toast.success("Late checkout updated.");
      onOpenChange(false);
      onSaved();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update late checkout."),
  });

  if (!row) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Late checkout</DialogTitle>
        <DialogDescription>
          {row.guest.name} · {row.confirmationNumber}. Departure date stays{" "}
          {formatStayDate(row.stay.departureDate)}. This is same-day only and does not add a night.
        </DialogDescription>
        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Normal checkout</dt>
            <dd>{policy?.checkOutTime ?? "Not set"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Allowed</dt>
            <dd>{policy?.allowed ? "Yes" : "No"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Fee context</dt>
            <dd>{policy?.fee == null ? "None posted here" : String(policy.fee)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Approval</dt>
            <dd>{policy?.needsApproval ? "Owner or manager" : "Not required"}</dd>
          </div>
          {row.operational.lateCheckout.granted && row.operational.lateCheckout.until ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Current grant</dt>
              <dd>{formatClockInZone(row.operational.lateCheckout.until, timezone)}</dd>
            </div>
          ) : null}
        </dl>
        <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
          Approved checkout time
          <Input
            type="time"
            value={clock}
            onChange={(event) => setClock(event.target.value)}
            aria-label="Late checkout time"
          />
        </label>
        {needsApproval ? (
          <FoAuthorizationCard
            requirement={lateAuth}
            guestLine={`${row.guest.name} · ${row.confirmationNumber}`}
            reason={note}
            onReasonChange={setNote}
            pending={mutation.isPending}
            confirmDisabled={!clock || policy?.allowed === false}
            confirmLabel={row.operational.lateCheckout.granted ? "Update" : "Grant"}
            onAuthorize={() =>
              mutation.mutate({
                granted: true,
                until: instantFromClock(row.stay.departureDate, clock, timezone),
                note: note.trim() || null,
              })
            }
            reasonId="late-checkout-auth"
          />
        ) : (
          <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
            Note
            <Input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              aria-label="Late checkout note"
            />
          </label>
        )}
        <p className="text-xs text-muted-foreground">Cashiering remains the owner of any fee posting.</p>
        <DialogFooter className="gap-2">
          {row.operational.lateCheckout.granted && canAuthorize ? (
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ granted: false, until: null, note: null })}
            >
              Revoke
            </Button>
          ) : null}
          {!needsApproval ? (
            <Button
              className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
              disabled={!clock || mutation.isPending || policy?.allowed === false}
              onClick={() =>
                mutation.mutate({
                  granted: true,
                  until: instantFromClock(row.stay.departureDate, clock, timezone),
                  note: note.trim() || null,
                })
              }
            >
              {mutation.isPending ? "Saving…" : row.operational.lateCheckout.granted ? "Update" : "Grant"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

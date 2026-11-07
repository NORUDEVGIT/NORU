import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { shiftMoment } from "@/core/lib/workforce-rules";
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { FoAuthorizationCard } from "@/packages/pms/components/frontoffice/fo-authorization-card";
import {
  FoActionModal,
  FO_ACTION_CONTROL,
  foActionRoomChip,
} from "@/packages/pms/components/frontoffice/fo-action-modal";
import { useMoney } from "@/core/state/property-format";
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

export function ArrivalEtaEditor({
  restaurantId,
  timezone,
  row,
  canUpdate,
  onSaved,
}: {
  restaurantId: string;
  timezone: string;
  row: ArrivalRow;
  canUpdate: boolean;
  onSaved: () => void;
}) {
  const submit = useServerFn(setExpectedArrivalTime);
  const [clock, setClock] = useState("");

  useEffect(() => {
    setClock(clockForInput(row.operational.expectedArrivalTime, timezone));
  }, [row.reservationId, row.operational.expectedArrivalTime, timezone]);

  const mutation = useMutation({
    mutationFn: (expectedArrivalAt: string | null) =>
      submit({
        data: {
          restaurantId,
          reservationId: row.reservationId,
          expectedArrivalAt,
        },
      }),
    onSuccess: () => {
      toast.success("Expected arrival updated.");
      onSaved();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update expected arrival."),
  });

  const current = formatClockInZone(row.operational.expectedArrivalTime, timezone);

  return (
    <div className="space-y-3 rounded-lg border border-[#DDD4C5] bg-white p-3 shadow-sm">
      <div className="flex justify-between gap-3 text-sm">
        <span className="text-[#7A6B58]">Current ETA</span>
        <span className="font-medium text-[#251605]">{current === "—" || !current ? "—" : current}</span>
      </div>
      {canUpdate ? (
        <>
          <label className="grid gap-1 text-[11px] font-medium text-[#7A6B58]">
            Expected arrival time
            <Input
              type="time"
              value={clock}
              onChange={(event) => setClock(event.target.value)}
              aria-label="Expected arrival time"
              className="h-9"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-[#DDD4C5]"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(null)}
            >
              Clear
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
              disabled={!clock || mutation.isPending}
              onClick={() =>
                mutation.mutate(instantFromClock(row.stay.arrivalDate, clock, timezone))
              }
            >
              {mutation.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </>
      ) : (
        <p className="text-xs text-[#7A6B58]">ETA can be updated before check-in.</p>
      )}
    </div>
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

  const money = useMoney();
  if (!row) return null;
  const fee = policy?.fee;
  const feeLabel =
    fee == null || fee === 0 ? null : typeof fee === "number" ? money(fee) : String(fee);

  return (
    <FoActionModal
      open={open}
      onOpenChange={onOpenChange}
      action="Late Checkout"
      guestName={row.guest.name}
      confirmation={row.confirmationNumber}
      roomLabel={foActionRoomChip(row.room.roomNumber)}
      size="small"
      confirmLabel="Grant Late Checkout"
      confirmDisabled={!clock || policy?.allowed === false}
      pending={mutation.isPending}
      hideConfirm={needsApproval}
      onConfirm={() =>
        mutation.mutate({
          granted: true,
          until: instantFromClock(row.stay.departureDate, clock, timezone),
          note: note.trim() || null,
        })
      }
      footerLeft={
        row.operational.lateCheckout.granted && canAuthorize ? (
          <Button
            type="button"
            variant="outline"
            className="h-9 border-[#DDD4C5] bg-white text-[#4a2c1a] hover:bg-[#F7F4EE]"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ granted: false, until: null, note: null })}
          >
            Revoke
          </Button>
        ) : null
      }
    >
      <div className="space-y-3">
        <section className="rounded-lg border border-[#E8DFD0] bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6B5E4E]">Current Checkout</p>
          <p className="mt-1 text-sm font-medium text-[#251605]">{policy?.checkOutTime ?? "Not set"}</p>
        </section>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-[#251605]" htmlFor="late-checkout-time">
            Approved Checkout Time
          </label>
          <Input
            id="late-checkout-time"
            type="time"
            className={FO_ACTION_CONTROL}
            value={clock}
            onChange={(event) => setClock(event.target.value)}
            aria-label="Late checkout time"
          />
        </div>
        <section className="rounded-lg border border-[#E8DFD0] bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6B5E4E]">Policy</p>
          <dl className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-[#6B5E4E]">Allowed</dt>
              <dd className="font-medium text-[#251605]">{policy?.allowed ? "Yes" : "No"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[#6B5E4E]">Fee</dt>
              <dd className="font-medium text-[#251605]">{feeLabel ?? "None"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[#6B5E4E]">Approval</dt>
              <dd className="font-medium text-[#251605]">
                {policy?.needsApproval ? "Required" : "Not required"}
              </dd>
            </div>
            {row.operational.lateCheckout.granted && row.operational.lateCheckout.until ? (
              <div className="flex justify-between gap-3">
                <dt className="text-[#6B5E4E]">Current grant</dt>
                <dd className="font-medium text-[#251605]">
                  {formatClockInZone(row.operational.lateCheckout.until, timezone)}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
        {feeLabel ? (
          <p className="text-sm font-medium text-[#251605]">Late checkout fee: {feeLabel}</p>
        ) : null}
        {needsApproval ? (
          <FoAuthorizationCard
            requirement={lateAuth}
            guestLine={`${row.guest.name} · ${row.confirmationNumber}`}
            reason={note}
            onReasonChange={setNote}
            pending={mutation.isPending}
            confirmDisabled={!clock || policy?.allowed === false}
            confirmLabel="Grant Late Checkout"
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
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#251605]" htmlFor="late-checkout-note">
              Note
            </label>
            <Input
              id="late-checkout-note"
              className={FO_ACTION_CONTROL}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              aria-label="Late checkout note"
            />
          </div>
        )}
      </div>
    </FoActionModal>
  );
}

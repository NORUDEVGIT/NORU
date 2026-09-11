import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Delete } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { cn } from "@/shared/lib/utils";
import {
  canSubmitCloseShift,
  cashVariance,
  whoseDrawerLabel,
  type CashVarianceKind,
} from "@/packages/restaurant-management/lib/rm-cash-up";
import {
  closePosShift,
  getPosShiftCashUpSummary,
  listOpenCashierShifts,
  listRecentClosedCashierShifts,
  type ClosedCashierShiftRow,
  type OpenCashierShiftRow,
  type PosCashUpSummary,
  type PosShiftCloseResult,
} from "@/packages/restaurant-management/lib/rm-pos.functions";

type Step = "summary" | "count" | "review" | "confirm" | "done";

const STEPS: Step[] = ["summary", "count", "review", "confirm", "done"];

export function RmUnpaidDraftBlock({
  open,
  onBack,
}: {
  open: boolean;
  onBack: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onBack() : undefined)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-2xl">Finish the sale first</DialogTitle>
          <DialogDescription>Cash-up cannot start while a till draft is unpaid.</DialogDescription>
        </DialogHeader>
        <Alert>
          <AlertTitle>Finish or clear the current sale</AlertTitle>
          <AlertDescription>
            Pay or clear the sale on the till, then close the shift. The draft is never discarded
            from here.
          </AlertDescription>
        </Alert>
        <Button type="button" className="h-14 w-full rounded-2xl text-base font-bold" onClick={onBack}>
          Back to sale
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function RmCashUpFlow({
  restaurantId,
  shiftId,
  open,
  onClose,
  onClosed,
  money,
  dateTime,
}: {
  restaurantId: string;
  shiftId: string;
  open: boolean;
  onClose: () => void;
  onClosed: () => void;
  money: (value: number) => string;
  dateTime: (value: string) => string;
}) {
  const queryClient = useQueryClient();
  const loadSummary = useServerFn(getPosShiftCashUpSummary);
  const closeShift = useServerFn(closePosShift);

  const summary = useQuery({
    queryKey: ["rm-cash-up", restaurantId, shiftId],
    queryFn: () => loadSummary({ data: { restaurantId, shiftId } }),
    enabled: open && Boolean(shiftId),
    retry: false,
  });

  const [step, setStep] = useState<Step>("summary");
  const [entry, setEntry] = useState("");
  const [notes, setNotes] = useState("");
  const [closed, setClosed] = useState<PosShiftCloseResult | null>(null);

  useEffect(() => {
    if (open) {
      setStep("summary");
      setEntry("");
      setNotes("");
      setClosed(null);
    }
  }, [open, shiftId]);

  const view = summary.data ?? null;
  const counted = entry === "" ? 0 : Number(entry) / 100;
  const expected = view?.expectedCash ?? 0;
  const variance = cashVariance({ counted, expected });

  const mutation = useMutation({
    mutationFn: () =>
      closeShift({
        data: {
          restaurantId,
          shiftId,
          closingCash: counted,
          notes: notes.trim() || null,
        },
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setClosed(result.result);
      setStep("done");
      void queryClient.invalidateQueries({ queryKey: ["pos-context", restaurantId] });
      void queryClient.invalidateQueries({ queryKey: ["rm-open-shifts", restaurantId] });
      void queryClient.invalidateQueries({ queryKey: ["rm-closed-shifts", restaurantId] });
      void queryClient.invalidateQueries({ queryKey: ["rm-cash-up", restaurantId, shiftId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const busy = mutation.isPending;
  const confirmReady = canSubmitCloseShift({ closingCash: counted, submitting: busy });

  function press(key: string) {
    if (busy) return;
    if (key === "back") {
      setEntry((prev) => prev.slice(0, -1));
      return;
    }
    setEntry((prev) => (prev + key).replace(/^0+(?=\d)/, "").slice(0, 9));
  }

  function dismiss() {
    if (busy) return;
    if (step === "done") {
      onClosed();
      onClose();
      return;
    }
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? dismiss() : undefined)}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Close shift</DialogTitle>
          <DialogDescription>
            {view
              ? `${whoseDrawerLabel({ isOwn: view.isOwn, cashierName: view.cashierName })} · opened ${dateTime(view.openedAt)}`
              : "Count the drawer, review the variance, then confirm."}
          </DialogDescription>
        </DialogHeader>

        {summary.isLoading ? <p className="text-sm text-muted-foreground">Loading shift…</p> : null}
        {summary.isError ? (
          <p className="text-sm text-destructive">{(summary.error as Error).message}</p>
        ) : null}

        {view ? (
          <div className="space-y-4">
            <ol className="grid grid-cols-5 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {STEPS.map((value) => (
                <li
                  key={value}
                  className={cn(
                    "rounded-full px-1 py-1",
                    step === value ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  {value === "summary"
                    ? "Summary"
                    : value === "count"
                      ? "Count"
                      : value === "review"
                        ? "Review"
                        : value === "confirm"
                          ? "Confirm"
                          : "Done"}
                </li>
              ))}
            </ol>

            {step === "summary" ? (
              <div className="space-y-3">
                <SummaryCard view={view} money={money} />
                {view.status === "closed" ? (
                  <p className="rounded-2xl border border-border bg-muted/40 p-4 text-sm">
                    That cashier shift is already closed. Open a new one to continue.
                  </p>
                ) : (
                  <Button
                    type="button"
                    className="h-14 w-full rounded-2xl text-base font-bold"
                    onClick={() => setStep("count")}
                  >
                    Next
                  </Button>
                )}
              </div>
            ) : null}

            {step === "count" ? (
              <div className="space-y-3">
                <div className="rounded-2xl border border-border bg-muted/40 p-4">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Counted cash</span>
                    <span className="text-2xl font-bold tabular-nums text-foreground">
                      {money(counted)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-sm text-muted-foreground">
                    <span>Expected</span>
                    <span className="text-lg font-semibold tabular-nums text-foreground">
                      {money(expected)}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setEntry(String(Math.round(expected * 100)))}
                    className="h-12 rounded-2xl border border-primary bg-primary/10 text-sm font-bold"
                    disabled={busy}
                  >
                    Exact
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "back"].map((key) => (
                    <button
                      key={key}
                      type="button"
                      aria-label={key === "back" ? "Delete last digit" : key}
                      onClick={() => press(key)}
                      disabled={busy}
                      className={cn(
                        "grid h-14 place-items-center rounded-2xl border border-border bg-card text-xl font-bold active:scale-[0.97]",
                        key === "back" && "text-muted-foreground",
                      )}
                    >
                      {key === "back" ? <Delete className="size-6" /> : key}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-14 rounded-2xl"
                    onClick={() => setStep("summary")}
                    disabled={busy}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    className="h-14 rounded-2xl text-base font-bold"
                    disabled={busy || counted < 0}
                    onClick={() => setStep("review")}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}

            {step === "review" ? (
              <div className="space-y-3">
                <div className="space-y-1 rounded-2xl border border-border bg-muted/40 p-4 text-sm">
                  <Row label="Expected" value={money(expected)} />
                  <Row label="Counted" value={money(counted)} />
                  <Row
                    label="Variance"
                    value={`${variance.label}${variance.amount === 0 ? "" : ` ${money(Math.abs(variance.amount))}`}`}
                  />
                </div>
                {variance.kind !== "exact" ? (
                  <p className="text-sm text-muted-foreground">
                    A note helps explain the over or short. It is not required.
                  </p>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="rm-cash-up-note">Note (optional)</Label>
                  <Textarea
                    id="rm-cash-up-note"
                    value={notes}
                    maxLength={300}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Optional drawer note"
                    className="min-h-24 rounded-2xl text-base"
                    disabled={busy}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-14 rounded-2xl"
                    onClick={() => setStep("count")}
                    disabled={busy}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    className="h-14 rounded-2xl text-base font-bold"
                    onClick={() => setStep("confirm")}
                    disabled={busy}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}

            {step === "confirm" ? (
              <div className="space-y-3">
                <div className="space-y-1 rounded-2xl border border-border bg-muted/40 p-4 text-sm">
                  <Row
                    label="Drawer"
                    value={whoseDrawerLabel({ isOwn: view.isOwn, cashierName: view.cashierName })}
                  />
                  <Row label="Expected" value={money(expected)} />
                  <Row label="Counted" value={money(counted)} />
                  <Row
                    label="Variance"
                    value={`${variance.label}${variance.amount === 0 ? "" : ` ${money(Math.abs(variance.amount))}`}`}
                  />
                  {notes.trim() ? <Row label="Note" value={notes.trim()} /> : null}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-14 rounded-2xl"
                    onClick={() => setStep("review")}
                    disabled={busy}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    className="h-14 rounded-2xl text-base font-bold"
                    disabled={!confirmReady}
                    onClick={() => mutation.mutate()}
                  >
                    {busy ? "Closing…" : "Close shift"}
                  </Button>
                </div>
              </div>
            ) : null}

            {step === "done" && closed ? (
              <DonePanel result={closed} money={money} onOpenNew={dismiss} />
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DonePanel({
  result,
  money,
  onOpenNew,
}: {
  result: PosShiftCloseResult;
  money: (value: number) => string;
  onOpenNew: () => void;
}) {
  const label =
    result.varianceKind === "exact"
      ? "Exact"
      : result.varianceKind === "over"
        ? `Over ${money(result.variance)}`
        : `Short ${money(Math.abs(result.variance))}`;
  return (
    <div className="space-y-4 text-center">
      <p className="text-sm uppercase tracking-widest text-muted-foreground">Shift closed</p>
      <p className="text-3xl font-bold tabular-nums">{money(result.closingCash)}</p>
      <p className="text-sm text-muted-foreground">
        Expected {money(result.expectedCash)} · {label}
      </p>
      <Button type="button" className="h-14 w-full rounded-2xl text-base font-bold" onClick={onOpenNew}>
        Open new shift
      </Button>
    </div>
  );
}

function SummaryCard({
  view,
  money,
}: {
  view: PosCashUpSummary;
  money: (value: number) => string;
}) {
  return (
    <div className="space-y-1 rounded-2xl border border-border bg-muted/40 p-4 text-sm">
      <Row label="Opening" value={money(view.openingCash)} />
      <Row label="Cash in" value={money(view.cashPayments)} />
      <Row label="Cash refunds" value={`−${money(view.cashRefunds)}`} />
      <Row label="Expected cash" value={money(view.expectedCash)} />
      <Row label="Card" value={money(view.cardPayments)} />
      <Row
        label="Room"
        value={
          view.roomChargeCount === 0
            ? money(0)
            : `${money(view.roomChargeTotal)} · ${view.roomChargeCount}`
        }
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium tabular-nums">{value}</span>
    </div>
  );
}

export function RmShiftListsSheet({
  restaurantId,
  open,
  onClose,
  onCloseShift,
  money,
  dateTime,
}: {
  restaurantId: string;
  open: boolean;
  onClose: () => void;
  onCloseShift: (shiftId: string) => void;
  money: (value: number) => string;
  dateTime: (value: string) => string;
}) {
  const [tab, setTab] = useState<"open" | "closed">("open");
  const listOpen = useServerFn(listOpenCashierShifts);
  const listClosed = useServerFn(listRecentClosedCashierShifts);

  const openShifts = useQuery({
    queryKey: ["rm-open-shifts", restaurantId],
    queryFn: () => listOpen({ data: { restaurantId } }),
    enabled: open,
    retry: false,
  });
  const closedShifts = useQuery({
    queryKey: ["rm-closed-shifts", restaurantId],
    queryFn: () => listClosed({ data: { restaurantId } }),
    enabled: open,
    retry: false,
  });

  return (
    <Sheet open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <SheetContent
        side="right"
        className="flex h-dvh w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[480px]"
      >
        <SheetHeader className="space-y-1 border-b border-border px-5 py-4 text-left">
          <SheetTitle>Shifts</SheetTitle>
          <SheetDescription>Open drawers and recent closed cash-ups for this till.</SheetDescription>
        </SheetHeader>
        <div className="grid grid-cols-2 gap-2 px-5 pt-4">
          <Button
            type="button"
            variant={tab === "open" ? "default" : "outline"}
            className="h-12 rounded-2xl"
            onClick={() => setTab("open")}
          >
            Open shifts
          </Button>
          <Button
            type="button"
            variant={tab === "closed" ? "default" : "outline"}
            className="h-12 rounded-2xl"
            onClick={() => setTab("closed")}
          >
            Recent closed
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {tab === "open" ? (
            <OpenShiftList
              loading={openShifts.isLoading}
              error={openShifts.error as Error | null}
              rows={openShifts.data ?? []}
              money={money}
              dateTime={dateTime}
              onCloseShift={(id) => {
                onClose();
                onCloseShift(id);
              }}
            />
          ) : (
            <ClosedShiftList
              loading={closedShifts.isLoading}
              error={closedShifts.error as Error | null}
              rows={closedShifts.data ?? []}
              money={money}
              dateTime={dateTime}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function OpenShiftList({
  loading,
  error,
  rows,
  money,
  dateTime,
  onCloseShift,
}: {
  loading: boolean;
  error: Error | null;
  rows: OpenCashierShiftRow[];
  money: (value: number) => string;
  dateTime: (value: string) => string;
  onCloseShift: (shiftId: string) => void;
}) {
  if (loading) return <p className="py-10 text-center text-sm text-muted-foreground">Loading open shifts…</p>;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-4 py-12 text-center">
        <p className="font-medium">No open shifts</p>
        <p className="mt-1 text-sm text-muted-foreground">Every cashier drawer is closed.</p>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.shiftId} className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{row.isOwn ? "Your shift" : row.cashierName}</p>
              <p className="text-xs text-muted-foreground">
                Opened {dateTime(row.openedAt)} · float {money(row.openingCash)}
              </p>
            </div>
          </div>
          <Button
            type="button"
            className="mt-3 h-12 w-full rounded-2xl font-bold"
            onClick={() => onCloseShift(row.shiftId)}
          >
            Close shift
          </Button>
        </li>
      ))}
    </ul>
  );
}

function ClosedShiftList({
  loading,
  error,
  rows,
  money,
  dateTime,
}: {
  loading: boolean;
  error: Error | null;
  rows: ClosedCashierShiftRow[];
  money: (value: number) => string;
  dateTime: (value: string) => string;
}) {
  if (loading) return <p className="py-10 text-center text-sm text-muted-foreground">Loading closed shifts…</p>;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-4 py-12 text-center">
        <p className="font-medium">No recent closed shifts</p>
        <p className="mt-1 text-sm text-muted-foreground">Closed till cash-ups from this property appear here.</p>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.shiftId} className="rounded-2xl border border-border bg-card p-4 text-sm">
          <p className="font-semibold">{row.cashierName}</p>
          <p className="text-xs text-muted-foreground">Closed {dateTime(row.closedAt)}</p>
          <div className="mt-2 space-y-1">
            <Row label="Expected" value={money(row.expectedCash)} />
            <Row label="Counted" value={row.closingCash === null ? "—" : money(row.closingCash)} />
            <Row label="Variance" value={varianceText(row.variance, row.varianceKind, money)} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function varianceText(
  amount: number | null,
  kind: CashVarianceKind | null,
  money: (value: number) => string,
): string {
  if (amount === null || kind === null) return "—";
  if (kind === "exact") return "Exact";
  if (kind === "over") return `Over ${money(amount)}`;
  return `Short ${money(Math.abs(amount))}`;
}

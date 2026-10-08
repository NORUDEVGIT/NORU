import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BedDouble, CalendarCheck, CircleDollarSign, Percent, Receipt } from "lucide-react";
import { toast } from "sonner";

import { useMoney, useRestaurantTime } from "@/core/state/property-format";
import { FolioSearchFolioStatusBadge } from "@/packages/pms/components/cashiering/folio-bits";
import { CARD } from "@/packages/pms/components/cashiering/folio-workspace-panels";
import {
  postFolioEntry,
  previewFolioCharge,
  type FolioChargePreview,
  type FolioChargePreviewLine,
} from "@/packages/pms/lib/cashiering.functions";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { cn } from "@/shared/lib/utils";

export interface PostChargeFolio {
  id: string;
  folioNumber: string;
  guestName: string;
  status: "open" | "closed";
  currency: string;
  roomNumber: string | null;
  roomTypeName: string | null;
  confirmationNumber: string | null;
  reservationId: string | null;
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function parseAmount(raw: string): number | null {
  const value = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

function lineLabel(line: FolioChargePreviewLine): string {
  if (line.chargeType !== "percentage") return line.name || line.code;
  const rate = Number.isInteger(line.rate) ? String(line.rate) : String(line.rate);
  return `${line.name || line.code} ${rate}%`;
}

function roomLine(folio: PostChargeFolio): string {
  const parts = [
    folio.roomNumber,
    folio.roomTypeName,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export function PostChargeDialog({
  restaurantId,
  folio,
  open,
  onClose,
  onDone,
}: {
  restaurantId: string;
  folio: PostChargeFolio;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const money = useMoney();
  const { dateTime } = useRestaurantTime();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [postingAt, setPostingAt] = useState(() => new Date().toISOString());
  const [attempted, setAttempted] = useState(false);
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [amountTouched, setAmountTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const parsed = parseAmount(amount);
  const debouncedAmount = useDebounced(parsed, 300);
  const closed = folio.status !== "open";
  const descriptionError =
    description.trim() === ""
      ? "Description is required."
      : description.trim().length > 200
        ? "Description must be 200 characters or fewer."
        : null;
  const amountError = parsed == null ? (amount.trim() === "" ? "Amount is required." : "Amount must be greater than zero.") : null;
  const showDescriptionError = (attempted || descriptionTouched) && descriptionError;
  const showAmountError = (attempted || amountTouched) && amountError;

  useEffect(() => {
    if (!open) return;
    setDescription("");
    setAmount("");
    setIdempotencyKey(crypto.randomUUID());
    setPostingAt(new Date().toISOString());
    setAttempted(false);
    setDescriptionTouched(false);
    setAmountTouched(false);
    setFormError(null);
  }, [open]);

  const fetchPreview = useServerFn(previewFolioCharge);
  const previewQuery = useQuery({
    queryKey: ["folio-charge-preview", restaurantId, folio.id, debouncedAmount],
    queryFn: () =>
      fetchPreview({
        data: { restaurantId, folioId: folio.id, amount: debouncedAmount ?? 0 },
      }),
    enabled: open && !closed && debouncedAmount != null,
    retry: false,
  });
  const preview = previewQuery.data as FolioChargePreview | undefined;
  const previewReady =
    parsed != null &&
    parsed === debouncedAmount &&
    preview != null &&
    !previewQuery.isFetching &&
    !previewQuery.isError;

  const post = useServerFn(postFolioEntry);
  const mutation = useMutation({
    mutationFn: () =>
      post({
        data: {
          restaurantId,
          folioId: folio.id,
          type: "charge",
          amount: parsed ?? 0,
          description: description.trim(),
          idempotencyKey,
        },
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        setFormError(result.message);
        return;
      }
      toast.success(`Charge posted to ${folio.folioNumber}.`);
      onDone();
      onClose();
    },
    onError: (error: Error) => setFormError(error.message),
  });

  function clearFields() {
    setDescription("");
    setAmount("");
    setIdempotencyKey(crypto.randomUUID());
    setAttempted(false);
    setDescriptionTouched(false);
    setAmountTouched(false);
    setFormError(null);
  }

  function submit() {
    setAttempted(true);
    setFormError(null);
    if (closed || descriptionError || amountError || !previewReady || mutation.isPending) return;
    mutation.mutate();
  }

  const headerStay = [
    folio.roomNumber ? `Room ${folio.roomNumber}` : null,
    folio.confirmationNumber,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent
        className="flex max-h-[88vh] w-[calc(100%-1.5rem)] max-w-[1000px] flex-col gap-0 overflow-hidden border-[#E8E1D7] bg-[#F7F4EE] p-0 sm:max-w-[1000px] sm:rounded-xl"
        data-testid="post-charge-dialog"
      >
        <header className="flex items-start gap-3 border-b border-[#E8E1D7] bg-card px-4 py-3 pr-12">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#C89933]/12 text-[#8a6a1f]">
            <Receipt className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="text-base font-semibold leading-tight">Post Charge</DialogTitle>
              <FolioSearchFolioStatusBadge status={folio.status} />
            </div>
            <DialogDescription className="mt-0.5 truncate text-xs text-muted-foreground">
              {folio.folioNumber} · {folio.guestName}
              {headerStay ? ` · ${headerStay}` : ""}
            </DialogDescription>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <section className={cn(CARD, "space-y-4 bg-card p-4")}>
              <h3 className="text-sm font-semibold">Charge Details</h3>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Charge Type
                </p>
                <p className="mt-1 text-sm font-medium">Manual Charge</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="post-charge-description">Description</Label>
                <Input
                  id="post-charge-description"
                  value={description}
                  maxLength={200}
                  placeholder="Laundry service"
                  onBlur={() => setDescriptionTouched(true)}
                  onChange={(event) => setDescription(event.target.value)}
                  aria-invalid={showDescriptionError ? true : undefined}
                />
                <p className="text-[11px] text-muted-foreground">Describe the charge for the folio.</p>
                {showDescriptionError ? (
                  <p className="text-xs text-destructive">{descriptionError}</p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="post-charge-amount">Charge Amount</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                    {folio.currency}
                  </span>
                  <Input
                    id="post-charge-amount"
                    inputMode="decimal"
                    className="pl-14"
                    value={amount}
                    placeholder="0.00"
                    onBlur={() => setAmountTouched(true)}
                    onChange={(event) => setAmount(event.target.value)}
                    aria-invalid={showAmountError ? true : undefined}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Amount entered. Inclusive taxes are split out of this amount when Settings say so.
                </p>
                {showAmountError ? <p className="text-xs text-destructive">{amountError}</p> : null}
              </div>
              <dl className="grid gap-3 border-t border-[#E8E1D7] pt-3 sm:grid-cols-2">
                <ContextField icon={Receipt} label="Folio" value={`${folio.folioNumber} · ${folio.guestName}`} />
                <ContextField icon={BedDouble} label="Room" value={roomLine(folio)} />
                <div className="min-w-0">
                  <dt className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    <CalendarCheck className="size-3.5" />
                    Reservation
                  </dt>
                  <dd className="mt-0.5 truncate text-sm font-medium">
                    {folio.reservationId && folio.confirmationNumber ? (
                      <Link
                        to="/restaurant/pms/reservations/$reservationId"
                        params={{ reservationId: folio.reservationId }}
                        className="text-[#8a6a1f] hover:text-[#251605]"
                      >
                        {folio.confirmationNumber}
                      </Link>
                    ) : (
                      folio.confirmationNumber ?? "—"
                    )}
                  </dd>
                </div>
                <ContextField icon={CircleDollarSign} label="Posting now" value={dateTime(postingAt)} />
              </dl>
            </section>

            <aside className={cn(CARD, "bg-card p-4")} data-testid="post-charge-summary">
              <h3 className="text-sm font-semibold">Charge Summary</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <SummaryLine label="Folio" value={folio.folioNumber} />
                <SummaryLine label="Guest" value={folio.guestName} />
                <SummaryLine label="Room" value={folio.roomNumber ?? "—"} />
              </dl>
              <div className="mt-4 border-t border-[#E8E1D7] pt-3">
                <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Percent className="size-3.5" />
                  Tax & Service
                </p>
                <div className="mt-2 space-y-1.5 text-sm">
                  {closed ? (
                    <p className="text-xs text-destructive">
                      This folio is closed. Nothing more can be posted to it.
                    </p>
                  ) : parsed == null ? (
                    <p className="text-xs text-muted-foreground">Enter an amount to preview tax and service.</p>
                  ) : previewQuery.isError ? (
                    <p className="text-xs text-destructive">{(previewQuery.error as Error).message}</p>
                  ) : !previewReady ? (
                    <p className="text-xs text-muted-foreground">Updating preview…</p>
                  ) : preview.taxLines.length === 0 && preview.serviceLines.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No tax or service charge applies.</p>
                  ) : (
                    <>
                      {preview.taxLines.map((line) => (
                        <SummaryLine
                          key={`tax-${line.code}-${line.calculation}`}
                          label={lineLabel(line)}
                          value={money(line.amount)}
                          tone="tax"
                        />
                      ))}
                      {preview.serviceLines.map((line) => (
                        <SummaryLine
                          key={`svc-${line.code}`}
                          label={lineLabel(line)}
                          value={money(line.amount)}
                          tone="service"
                        />
                      ))}
                    </>
                  )}
                </div>
              </div>
              <dl className="mt-4 space-y-2 border-t border-[#E8E1D7] pt-3 text-sm">
                <SummaryLine label="Net Charge" value={previewReady ? money(preview.netAmount) : "—"} />
                <SummaryLine
                  label="Tax"
                  value={previewReady ? money(preview.taxLines.reduce((sum, line) => sum + line.amount, 0)) : "—"}
                  tone="tax"
                />
                <SummaryLine
                  label="Service Charge"
                  value={
                    previewReady
                      ? money(preview.serviceLines.reduce((sum, line) => sum + line.amount, 0))
                      : "—"
                  }
                  tone="service"
                />
              </dl>
              <div className="mt-3 flex items-baseline justify-between border-t border-[#E8E1D7] pt-3">
                <span className="text-xs font-semibold uppercase tracking-wide">Total</span>
                <span className="font-display text-lg font-semibold tabular-nums">
                  {previewReady ? money(preview.total) : "—"}
                </span>
              </div>
            </aside>
          </div>
          {formError ? <p className="mt-3 text-sm text-destructive">{formError}</p> : null}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-[#E8E1D7] bg-card px-4 py-3">
          <Button type="button" variant="ghost" size="sm" className="h-8" onClick={clearFields}>
            Clear
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-8" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 bg-[#C89933] text-[#251605] hover:bg-[#B5882D]"
            disabled={closed || Boolean(descriptionError || amountError) || !previewReady || mutation.isPending}
            onClick={submit}
            data-testid="post-charge-submit"
          >
            Post Charge
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function ContextField({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Receipt;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm font-medium" title={value}>
        {value}
      </dd>
    </div>
  );
}

function SummaryLine({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "tax" | "service";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="truncate text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "shrink-0 tabular-nums",
          tone === "tax" && "text-blue-700",
          tone === "service" && "text-violet-700",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

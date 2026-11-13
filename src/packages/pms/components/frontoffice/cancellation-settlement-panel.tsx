import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { useMoney } from "@/core/state/property-format";
import { cashieringRefundHref } from "@/packages/pms/lib/fo-cancel-noshow";
import {
  getCancellationSettlementPreview,
  rerunCancellationSettlement,
} from "@/packages/pms/lib/fo-cancel-noshow.functions";
import {
  SETTLEMENT_OUTCOME_LABEL,
  SETTLEMENT_PENDING_LABEL,
  settlementOutcome,
  settlementOutcomeMessage,
  type CancellationSettlement,
  type SettlementKind,
} from "@/packages/pms/lib/reservation-cancellation-settlement";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

const OUTCOME_TONE: Record<ReturnType<typeof settlementOutcome>, string> = {
  no_folio: "bg-[#F7F4EE] text-muted-foreground",
  settled: "bg-emerald-50 text-emerald-800",
  refund_due: "bg-sky-50 text-sky-900",
  amount_due: "bg-amber-50 text-amber-900",
  credit_note_required: "bg-amber-50 text-amber-900",
  pending: "bg-amber-50 text-amber-900",
};

/**
 * Folio impact of a cancel, no-show, or room removal.
 * Preview runs settlement as a dry run. Result shows what was posted.
 */
export function CancellationSettlementPanel({
  restaurantId,
  reservationId,
  reservationRoomId,
  kind,
  mode,
  settlement: initial,
  settlementError: initialError,
  className,
}: {
  restaurantId: string;
  reservationId: string;
  reservationRoomId?: string | null;
  kind: SettlementKind;
  mode: "preview" | "result";
  settlement?: CancellationSettlement | null;
  settlementError?: string | null;
  className?: string;
}) {
  const money = useMoney();
  const fetchPreview = useServerFn(getCancellationSettlementPreview);
  const rerun = useServerFn(rerunCancellationSettlement);
  const [result, setResult] = useState<CancellationSettlement | null>(initial ?? null);
  const [error, setError] = useState<string | null>(initialError ?? null);

  const previewQuery = useQuery({
    queryKey: ["cancellation-settlement-preview", restaurantId, reservationId, reservationRoomId ?? null, kind],
    queryFn: () =>
      fetchPreview({
        data: {
          restaurantId,
          reservationId,
          kind,
          ...(reservationRoomId ? { reservationRoomId } : {}),
        },
      }),
    enabled: mode === "preview",
    retry: false,
  });

  const rerunMut = useMutation({
    mutationFn: () =>
      rerun({
        data: {
          restaurantId,
          reservationId,
          kind,
          ...(reservationRoomId ? { reservationRoomId } : {}),
        },
      }),
    onSuccess: (next) => {
      setResult(next.settlement);
      setError(next.settlementError);
      if (next.settlementError) toast.error(next.settlementError);
      else toast.success("Settlement ran again.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const data = mode === "preview" ? (previewQuery.data ?? null) : result;
  const fmt = (value: number) => money(value);

  if (mode === "preview" && previewQuery.isLoading) {
    return <p className={cn("text-sm text-muted-foreground", className)}>Checking folio impact…</p>;
  }
  if (mode === "preview" && previewQuery.isError) {
    return (
      <p className={cn("text-sm text-destructive", className)}>
        {(previewQuery.error as Error).message}
      </p>
    );
  }

  if (mode === "result" && error) {
    return (
      <div
        className={cn("rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900", className)}
        data-testid="cancellation-settlement-error"
      >
        <p className="font-semibold">Folio settlement did not complete</p>
        <p className="mt-1">{error}</p>
        <p className="mt-1 text-xs">The status change stands. Run settlement again, or correct the folio in Cashiering.</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-2"
          disabled={rerunMut.isPending}
          onClick={() => rerunMut.mutate()}
        >
          {rerunMut.isPending ? "Running…" : "Run settlement again"}
        </Button>
      </div>
    );
  }
  if (!data) return null;

  const outcome = settlementOutcome(data);
  const preview = mode === "preview";
  const href = cashieringRefundHref(data.folioNumber);

  return (
    <div className={cn("space-y-3 text-sm", className)} data-testid="cancellation-settlement-panel">
      <div className={cn("rounded-lg px-3 py-2", OUTCOME_TONE[outcome])}>
        <p className="font-semibold">
          {preview ? "After this change: " : ""}
          {SETTLEMENT_OUTCOME_LABEL[outcome]}
        </p>
        <p className="text-xs">{settlementOutcomeMessage(data)}</p>
      </div>

      {data.folioId ? (
        <table className="w-full" data-testid="cancellation-settlement-table">
          <tbody>
            <tr className="border-t border-[#EEE7DC]">
              <td className="py-1.5">
                {preview ? "Room and package charges to reverse" : "Room and package charges reversed"}
              </td>
              <td className="text-right tabular-nums">{fmt(-data.reversalTotal)}</td>
            </tr>
            {data.reversed.map((line) => (
              <tr key={`r-${line.chargeId}`} className="text-xs text-muted-foreground">
                <td className="py-0.5 pl-3">{line.description ?? "Charge"}</td>
                <td className="text-right tabular-nums">{fmt(-line.amount)}</td>
              </tr>
            ))}
            <tr className="border-t border-[#EEE7DC]">
              <td className="py-1.5">Cancellation and no-show fees on folio</td>
              <td className="text-right tabular-nums">{fmt(data.feesPosted)}</td>
            </tr>
            <tr className="border-t border-[#EEE7DC]">
              <td className="py-1.5">Payments and deposits kept on folio</td>
              <td className="text-right tabular-nums">{fmt(-data.credits)}</td>
            </tr>
            {data.released.length > 0 ? (
              <tr className="border-t border-[#EEE7DC]">
                <td className="py-1.5">
                  Deposit allocations {preview ? "to release" : "released"}
                </td>
                <td className="text-right tabular-nums">
                  {fmt(data.released.reduce((sum, r) => sum + r.amount, 0))}
                </td>
              </tr>
            ) : null}
            <tr className="border-t border-[#DDD4C5] font-semibold">
              <td className="py-1.5">{preview ? "Folio balance after" : "Folio balance"}</td>
              <td className="text-right tabular-nums">{fmt(data.balance)}</td>
            </tr>
          </tbody>
        </table>
      ) : null}

      {data.pending.length > 0 ? (
        <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          {data.pending.map((line) => (
            <li key={`p-${line.chargeId}`}>
              <span className="font-medium">{line.description ?? "Charge"}</span> · {fmt(line.amount)} ·{" "}
              {SETTLEMENT_PENDING_LABEL[line.reason]}
            </li>
          ))}
        </ul>
      ) : null}

      {!preview && data.folioId ? (
        <div className="flex flex-wrap gap-2">
          {outcome === "refund_due" ? (
            <Button asChild size="sm" variant="outline">
              <a href={href}>Refund in Cashiering</a>
            </Button>
          ) : null}
          {outcome === "amount_due" ? (
            <Button asChild size="sm" variant="outline">
              <a href={href}>Take payment in Cashiering</a>
            </Button>
          ) : null}
          {outcome === "credit_note_required" || outcome === "pending" ? (
            <>
              <Button asChild size="sm" variant="outline">
                <a href={href}>Open folio in Cashiering</a>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={rerunMut.isPending}
                onClick={() => rerunMut.mutate()}
              >
                {rerunMut.isPending ? "Running…" : "Run settlement again"}
              </Button>
            </>
          ) : null}
          {outcome === "settled" && data.closable ? (
            <Button asChild size="sm" variant="outline">
              <a href={href}>Close folio in Cashiering</a>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

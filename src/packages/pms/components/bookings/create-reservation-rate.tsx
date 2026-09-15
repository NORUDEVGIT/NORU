import { Check } from "lucide-react";

import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import {
  CREATE_RESERVATION_QUOTE_SERVER_COPY,
  CREATE_RESERVATION_SECTION5_SCOPE,
  CREATE_RESERVATION_UNPRICED_BADGE,
  fromNightlyRate,
  rateCatalogueCopy,
  type CreateRateQuoteRow,
} from "@/packages/pms/lib/create-reservation-phase1-section5";
import { cn } from "@/shared/lib/utils";

export function CreateReservationRate({
  datesValid,
  roomTypeId,
  loading,
  error,
  quotes,
  ratePlanId,
  canCreateUnpriced,
  money,
  onSelect,
}: {
  datesValid: boolean;
  roomTypeId: string;
  loading: boolean;
  error: boolean;
  quotes: CreateRateQuoteRow[];
  ratePlanId: string;
  canCreateUnpriced: boolean;
  money: (value: number) => string;
  onSelect: (ratePlanId: string) => void;
}) {
  const catalogue = rateCatalogueCopy({
    datesValid,
    roomTypeId,
    loading,
    error,
    quoteCount: quotes.length,
    canCreateUnpriced,
  });
  const selected = quotes.find((row) => row.plan.id === ratePlanId) ?? null;

  return (
    <section className="rounded-2xl border border-border bg-card p-4" data-testid="create-reservation-rate">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-lg">Rate plan</h2>
        {!selected?.quote ? (
          <span
            data-testid="rate-unpriced-badge"
            className="inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800"
          >
            {CREATE_RESERVATION_UNPRICED_BADGE}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{CREATE_RESERVATION_SECTION5_SCOPE}</p>

      {catalogue ? (
        <p className="mt-3 text-sm text-muted-foreground" data-testid="rate-catalogue-copy">
          {catalogue}
        </p>
      ) : (
        <ul className="mt-3 grid gap-3 md:grid-cols-2" data-testid="rate-plan-list">
          {quotes.map((row) => {
            const isSelected = row.plan.id === ratePlanId;
            const disabled = !row.quote;
            const fromRate = row.quote ? fromNightlyRate(row.quote) : null;
            return (
              <li key={row.plan.id}>
                <button
                  type="button"
                  disabled={disabled}
                  data-testid={`rate-plan-${row.plan.code}`}
                  data-rate-available={row.quote ? "priced" : "unavailable"}
                  onClick={() => onSelect(isSelected ? "" : row.plan.id)}
                  className={cn(
                    "w-full rounded-xl border p-3 text-left transition-colors",
                    isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40",
                    disabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{row.plan.name}</span>
                    <span className="text-xs text-muted-foreground">{row.plan.code}</span>
                    {isSelected ? <Check className="ml-auto size-4 text-primary" /> : null}
                  </div>
                  {row.quote ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {fromRate != null ? (
                        <>
                          From {money(fromRate)} / night · total{" "}
                          <span className="font-medium text-foreground">{money(row.quote.subtotal)}</span> for{" "}
                          {row.quote.nights} night{row.quote.nights === 1 ? "" : "s"}
                        </>
                      ) : (
                        <>
                          Stay total{" "}
                          <span className="font-medium text-foreground">{money(row.quote.subtotal)}</span>
                        </>
                      )}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-destructive">{row.unavailableReason}</p>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected?.quote ? (
        <div className="mt-4 overflow-x-auto rounded-xl border border-border" data-testid="rate-nightly-table">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Night</th>
                <th className="px-3 py-2 text-right">Rate</th>
              </tr>
            </thead>
            <tbody>
              {selected.quote.nightly.map((night) => (
                <tr key={night.date} className="border-t border-border">
                  <td className="px-3 py-2">{formatStayDate(night.date)}</td>
                  <td className="px-3 py-2 text-right">{money(night.rate)}</td>
                </tr>
              ))}
              <tr className="border-t border-border bg-muted/30 font-medium">
                <td className="px-3 py-2">Stay total</td>
                <td className="px-3 py-2 text-right">{money(selected.quote.subtotal)}</td>
              </tr>
            </tbody>
          </table>
          <p className="px-3 py-2 text-xs text-muted-foreground">{CREATE_RESERVATION_QUOTE_SERVER_COPY}</p>
        </div>
      ) : null}
    </section>
  );
}

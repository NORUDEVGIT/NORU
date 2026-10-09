import { createContext, useContext, type ReactNode } from "react";

import {
  CREATE_RESERVATION_UNPRICED_BADGE,
  fromNightlyRate,
  rateCatalogueCopy,
  type CreateRateQuoteRow,
} from "@/packages/pms/lib/create-reservation-phase1-section5";
import { cn } from "@/shared/lib/utils";

const ExcludedRatePlanContext = createContext<string[]>([]);

export function AvailabilityRateFilterProvider({
  excludedRatePlanIds,
  children,
}: {
  excludedRatePlanIds: string[];
  children: ReactNode;
}) {
  return (
    <ExcludedRatePlanContext.Provider value={excludedRatePlanIds}>
      {children}
    </ExcludedRatePlanContext.Provider>
  );
}

function useExcludedRatePlanIds(): string[] {
  return useContext(ExcludedRatePlanContext);
}

export function CreateReservationRate({
  datesValid,
  roomTypeId,
  loading,
  error,
  quotes,
  ratePlanId,
  canCreateUnpriced,
  money,
  nights,
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
  nights: number;
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
  const excludedRatePlanIds = useExcludedRatePlanIds();
  const visibleQuotes =
    excludedRatePlanIds.length === 0
      ? quotes
      : quotes.filter((row) => !excludedRatePlanIds.includes(row.plan.id));
  const selected = quotes.find((row) => row.plan.id === ratePlanId) ?? null;
  const selectedVisible = visibleQuotes.some((row) => row.plan.id === ratePlanId);

  return (
    <div className="min-w-0" data-testid="create-reservation-rate">
      {/* CREATE_RESERVATION_SECTION5_SCOPE */}
      {!selected?.quote && selected && selectedVisible ? (
        <span
          data-testid="rate-unpriced-badge"
          className="mb-2 inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800"
        >
          {CREATE_RESERVATION_UNPRICED_BADGE}
        </span>
      ) : null}

      {catalogue ? (
        <p className="px-3 py-4 text-sm text-muted-foreground" data-testid="rate-catalogue-copy">
          {catalogue}
        </p>
      ) : visibleQuotes.length === 0 ? (
        <p className="px-3 py-4 text-sm text-muted-foreground" data-testid="rate-filter-empty">
          No rates match the selected filters.
        </p>
      ) : (
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <thead className="bg-[#FAF8F4] text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              <tr>
                <th className="w-8 px-2 py-2">
                  <span className="sr-only">Select</span>
                </th>
                <th className="px-2 py-2">Rate Plan</th>
                <th className="w-36 px-2 py-2 text-right whitespace-nowrap">Rate / Night</th>
                <th className="w-36 px-2 py-2 text-right whitespace-nowrap">
                  Total{nights > 0 ? ` (${nights})` : ""}
                </th>
              </tr>
            </thead>
            <tbody data-testid="rate-plan-list">
              {visibleQuotes.map((row) => {
                const isSelected = row.plan.id === ratePlanId;
                const disabled = !row.quote;
                const fromRate = row.quote ? fromNightlyRate(row.quote) : null;
                return (
                  <tr
                    key={row.plan.id}
                    className={cn("border-t border-[#E7E0D4]", isSelected && "bg-[#F4E9D0]/80")}
                  >
                    <td className="px-2 py-1.5 align-middle">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        aria-label={`Select ${row.plan.name}`}
                        disabled={disabled}
                        data-testid={`rate-plan-${row.plan.code}`}
                        data-rate-available={row.quote ? "priced" : "unavailable"}
                        onClick={() => onSelect(isSelected ? "" : row.plan.id)}
                        className={cn(
                          "flex size-4 items-center justify-center rounded-full border border-[#C89933] bg-white",
                          disabled && "cursor-not-allowed opacity-60",
                          isSelected && "bg-[#C89933]",
                        )}
                      >
                        {isSelected ? (
                          <span className="size-1.5 rounded-full bg-[#251605]" />
                        ) : null}
                      </button>
                    </td>
                    <td className="px-2 py-1.5 align-middle">
                      <p className="font-medium leading-tight text-[#251605]">
                        {row.plan.name || row.plan.code}
                      </p>
                      {row.quote ? null : (
                        <p className="text-xs leading-tight text-muted-foreground">
                          {row.unavailableReason ?? "—"}
                        </p>
                      )}
                    </td>
                    <td className="w-36 px-2 py-1.5 text-right align-middle whitespace-nowrap tabular-nums">
                      {row.quote && fromRate != null ? (
                        money(fromRate)
                      ) : row.quote ? (
                        "—"
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {/* TODO: obtain authoritative stay quote from Rate & Revenue */}
                          Price unavailable
                        </span>
                      )}
                    </td>
                    <td className="w-36 px-2 py-1.5 text-right align-middle font-medium whitespace-nowrap tabular-nums text-[#251605]">
                      {row.quote ? money(row.quote.subtotal) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { Check } from "lucide-react";

import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import {
  CREATE_RESERVATION_QUOTE_SERVER_COPY,
  CREATE_RESERVATION_UNPRICED_BADGE,
  formatRatePlanValidity,
  fromNightlyRate,
  rateCatalogueCopy,
  ratePlanMerchandisingLines,
  ratePlanPackageMerchandising,
  type CreateRateQuoteRow,
} from "@/packages/pms/lib/create-reservation-phase1-section5";
import { Button } from "@/shared/components/ui/button";
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
  const selected = quotes.find((row) => row.plan.id === ratePlanId) ?? null;

  return (
    <div className="min-w-0" data-testid="create-reservation-rate">
      {/* CREATE_RESERVATION_SECTION5_SCOPE */}
      {!selected?.quote && selected ? (
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
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-[#FAF8F4] text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Rate Plan</th>
                <th className="px-3 py-2">Cancellation Policy</th>
                <th className="px-3 py-2">Breakfast</th>
                <th className="px-3 py-2 text-right">Rate Per Night</th>
                <th className="px-3 py-2 text-right">
                  Total{nights > 0 ? ` (${nights} night${nights === 1 ? "" : "s"})` : ""}
                </th>
                <th className="px-3 py-2 text-right">Select</th>
              </tr>
            </thead>
            <tbody data-testid="rate-plan-list">
              {quotes.map((row) => {
                const isSelected = row.plan.id === ratePlanId;
                const disabled = !row.quote;
                const fromRate = row.quote ? fromNightlyRate(row.quote) : null;
                const packages = ratePlanPackageMerchandising(row.plan);
                return (
                  <tr
                    key={row.plan.id}
                    className={cn("border-t border-[#E7E0D4]", isSelected && "bg-[#F4E9D0]/80")}
                  >
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-[#251605]">{row.plan.name}</p>
                      <p className="text-[11px] text-muted-foreground">{row.plan.code}</p>
                      {row.plan.description ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {row.plan.description}
                        </p>
                      ) : null}
                      {ratePlanMerchandisingLines(row.plan)
                        .filter((line) => line !== row.plan.description?.trim())
                        .map((line) => (
                          <p key={line} className="text-[11px] text-muted-foreground">
                            {line}
                          </p>
                        ))}
                      {formatRatePlanValidity(row.plan) ? (
                        <p className="text-[11px] text-muted-foreground">
                          {formatRatePlanValidity(row.plan)}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {row.quote
                        ? `${row.cancellationLabel}${row.refundabilityLabel !== "—" ? ` · ${row.refundabilityLabel}` : ""}`
                        : (row.unavailableReason ?? "—")}
                      {row.restrictionSummary ? (
                        <p className="mt-1 text-[11px]">{row.restrictionSummary}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      <p>{row.breakfastLabel}</p>
                      {packages.includedServices.length > 0 ? (
                        <div
                          className="mt-1"
                          data-testid={`rate-included-services-${row.plan.code}`}
                        >
                          <p className="text-[10px] font-medium uppercase tracking-wide">
                            Included Services
                          </p>
                          <ul>
                            {packages.includedServices.map((item) => (
                              <li key={item.packageId}>{item.packageName}</li>
                            ))}
                          </ul>
                        </div>
                      ) : row.includedServicesLabel !== "—" ? (
                        <p className="mt-1 text-[11px]">{row.includedServicesLabel}</p>
                      ) : null}
                      {packages.optionalAddOns.length > 0 ? (
                        <div className="mt-1" data-testid={`rate-optional-addons-${row.plan.code}`}>
                          <p className="text-[10px] font-medium uppercase tracking-wide">
                            Optional Add-ons
                          </p>
                          <ul>
                            {packages.optionalAddOns.map((item) => (
                              <li key={item.packageId}>{item.packageName} · Available add-on</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
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
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums text-[#251605]">
                      {row.quote ? money(row.quote.subtotal) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Button
                        type="button"
                        size="sm"
                        disabled={disabled}
                        data-testid={`rate-plan-${row.plan.code}`}
                        data-rate-available={row.quote ? "priced" : "unavailable"}
                        onClick={() => onSelect(isSelected ? "" : row.plan.id)}
                        className={cn(
                          "h-8 min-w-20 bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]",
                          disabled && "cursor-not-allowed opacity-60",
                          isSelected && "ring-1 ring-[#C89933]",
                        )}
                      >
                        {isSelected ? <Check className="size-4" /> : null}
                        {isSelected ? "Selected" : "Select"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected?.quote ? (
        <div
          className="mt-3 overflow-x-auto border-t border-[#E7E0D4]"
          data-testid="rate-nightly-table"
        >
          <table className="w-full text-sm">
            <thead className="bg-[#FAF8F4] text-left text-xs uppercase tracking-wide text-muted-foreground">
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
          <p className="px-3 py-2 text-xs text-muted-foreground">
            {CREATE_RESERVATION_QUOTE_SERVER_COPY}
          </p>
        </div>
      ) : null}
    </div>
  );
}

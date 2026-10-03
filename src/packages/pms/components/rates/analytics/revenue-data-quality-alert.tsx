import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import type { RevenuePerformanceOverview } from "@/packages/pms/lib/revenue/revenue-analytics";

export function RevenueDataQualityAlert({ overview }: { overview: RevenuePerformanceOverview }) {
  const { warnings, summary } = overview;
  const { inventoryMetricSupport } = summary;
  const domainWarnings: string[] = [];
  if (warnings.legacyDimensionCoverage) {
    domainWarnings.push(
      "Some reservations in this period predate rate plan, market segment, or commercial booking source attribution.",
    );
  }
  if (warnings.mixedCurrencyDetected) {
    domainWarnings.push("Mixed currency reservations were detected in the selected stay period.");
  }

  return (
    <div className="space-y-2">
      {/* 1. Non-inventory dimension filter explanation */}
      {inventoryMetricSupport === "NOT_MEANINGFUL" && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50/60 px-3.5 py-2.5 text-xs text-amber-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div>
            <span className="font-medium">Inventory metrics are not meaningful:</span> Available
            Room Nights, Occupancy %, and RevPAR are set to N/A because filtering by rate plan,
            market segment, commercial source, or technical origin subsets sold nights without
            subsetting physical property inventory. ADR remains valid.
          </div>
        </div>
      )}

      {/* 2. Unpriced sold nights warning */}
      {warnings.unpricedSoldNights > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50/40 px-3.5 py-2.5 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <span className="font-medium">Unpriced room nights:</span> {warnings.unpricedSoldNights}{" "}
            sold room night{warnings.unpricedSoldNights > 1 ? "s are" : " is"} missing an
            authoritative pricing snapshot. ADR and Booked Room Revenue reflect priced stays only (
            {summary.pricedShare}% priced share).
          </div>
        </div>
      )}

      {/* 3. General domain warnings (e.g. legacy segment/source presence) */}
      {domainWarnings.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/30 px-3.5 py-2 text-xs text-muted-foreground">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="space-y-0.5">
            {domainWarnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

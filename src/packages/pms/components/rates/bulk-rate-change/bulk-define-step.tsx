import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  BULK_RATE_CHANGE_PERCENT_COPY,
  BULK_RATE_CHANGE_RESET_COPY,
  uniquePlanCurrencies,
} from "@/packages/pms/lib/revenue/bulk-rate-change";
import type { RateChangeRule } from "@/packages/pms/lib/revenue/rate-change";
import type { RevenueRatePlan } from "@/packages/pms/lib/revenue/revenue-config.types";

export function BulkDefineStep({
  action,
  value,
  sourceDate,
  reason,
  selectedPlans,
  onChange,
}: {
  action: RateChangeRule["type"];
  value: string;
  sourceDate: string;
  reason: string;
  selectedPlans: RevenueRatePlan[];
  onChange: (patch: { action?: RateChangeRule["type"]; value?: string; sourceDate?: string; reason?: string }) => void;
}) {
  const currencies = uniquePlanCurrencies(selectedPlans);
  const mixedCurrency = currencies.length > 1;
  const setRateBlocked = action === "SET_RATE" && mixedCurrency;

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="bulk-action">Change</Label>
        <select
          id="bulk-action"
          className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          value={action}
          onChange={(event) => onChange({ action: event.target.value as RateChangeRule["type"] })}
        >
          <option value="SET_RATE">Set Rate</option>
          <option value="PERCENT_INCREASE">Percent increase</option>
          <option value="PERCENT_DECREASE">Percent decrease</option>
          <option value="COPY_FROM_DATE">Copy from date</option>
          <option value="RESET_OVERRIDE">Reset to Base Rate</option>
        </select>
      </div>

      {action === "SET_RATE" ? (
        <div>
          <Label htmlFor="bulk-value">New Rate{currencies.length === 1 ? ` (${currencies[0]})` : ""}</Label>
          <Input
            id="bulk-value"
            type="number"
            min={0}
            value={value}
            disabled={setRateBlocked}
            onChange={(event) => onChange({ value: event.target.value })}
          />
          {setRateBlocked ? (
            <p className="mt-1 text-[10px] text-[#6B4A0A]">
              Selected plans use more than one currency. Choose plans that share a currency before setting a rate.
            </p>
          ) : null}
        </div>
      ) : null}

      {action === "PERCENT_INCREASE" || action === "PERCENT_DECREASE" ? (
        <div>
          <Label htmlFor="bulk-percent">Percent</Label>
          <Input
            id="bulk-percent"
            type="number"
            min={0}
            value={value}
            onChange={(event) => onChange({ value: event.target.value })}
          />
          <p className="mt-1 text-[10px] text-muted-foreground">{BULK_RATE_CHANGE_PERCENT_COPY}</p>
        </div>
      ) : null}

      {action === "COPY_FROM_DATE" ? (
        <div>
          <Label htmlFor="bulk-source">Source date</Label>
          <Input
            id="bulk-source"
            type="date"
            value={sourceDate}
            onChange={(event) => onChange({ sourceDate: event.target.value })}
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            The server copies each plan&apos;s effective rate from that date. Do not enter a copied amount.
          </p>
        </div>
      ) : null}

      {action === "RESET_OVERRIDE" ? (
        <p className="text-[10px] text-muted-foreground">{BULK_RATE_CHANGE_RESET_COPY}</p>
      ) : null}

      <div>
        <Label htmlFor="bulk-reason">Reason for Change</Label>
        <Input
          id="bulk-reason"
          value={reason}
          onChange={(event) => onChange({ reason: event.target.value })}
          placeholder="Optional"
        />
      </div>
    </div>
  );
}

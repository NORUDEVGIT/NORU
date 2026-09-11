import { Minus, Plus, Trash2, PauseCircle } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { BillTotals } from "@/packages/restaurant-management/components/bill-totals";
import {
  DEFAULT_RM_TAX_SETTINGS,
  computeRmBill,
  merchandiseFromLines,
  type RmTaxSettings,
} from "@/packages/restaurant-management/lib/rm-tax";

export interface PosLine {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
}

export type PosOrderType = "counter" | "takeaway";

/** The live sale: lines, totals and the till actions. */
export function PosSalePanel({
  lines,
  orderType,
  onOrderType,
  onQuantity,
  onRemove,
  onHold,
  onClear,
  onPay,
  onAdjust,
  busy,
  money,
  taxSettings = DEFAULT_RM_TAX_SETTINGS,
  payable,
}: {
  lines: PosLine[];
  orderType: PosOrderType;
  onOrderType: (value: PosOrderType) => void;
  onQuantity: (menuItemId: string, quantity: number) => void;
  onRemove: (menuItemId: string) => void;
  onHold: () => void;
  onClear: () => void;
  onPay: () => void;
  onAdjust?: () => void;
  busy: boolean;
  money: (value: number) => string;
  taxSettings?: RmTaxSettings;
  payable?: number;
}) {
  const bill = computeRmBill(merchandiseFromLines(lines), taxSettings);
  const empty = lines.length === 0;
  const shownPayable = payable ?? bill.payable;

  return (
    <aside className="flex min-h-0 w-full shrink-0 flex-col border-t border-border bg-card lg:w-[380px] lg:border-l lg:border-t-0 xl:w-[420px]">
      <div className="grid shrink-0 grid-cols-2 gap-2 p-3">
        {(["counter", "takeaway"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onOrderType(value)}
            className={cn(
              "h-12 rounded-2xl border text-sm font-bold uppercase tracking-wide transition-colors active:scale-[0.98]",
              orderType === value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground",
            )}
          >
            {value === "counter" ? "Counter" : "Takeaway"}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3">
        {empty ? (
          <p className="px-2 py-10 text-center text-sm text-muted-foreground">
            Tap items on the left to start a sale.
          </p>
        ) : (
          <ul className="space-y-2 pb-2">
            {lines.map((line) => (
              <li key={line.menuItemId} className="rounded-2xl border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{line.name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{money(line.price)} each</p>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums">
                    {money(line.price * line.quantity)}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-11 rounded-xl"
                      aria-label={`Decrease ${line.name}`}
                      onClick={() => onQuantity(line.menuItemId, line.quantity - 1)}
                    >
                      <Minus className="size-5" />
                    </Button>
                    <span className="min-w-8 text-center text-base font-bold tabular-nums">
                      {line.quantity}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-11 rounded-xl"
                      aria-label={`Increase ${line.name}`}
                      onClick={() => onQuantity(line.menuItemId, line.quantity + 1)}
                    >
                      <Plus className="size-5" />
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11 rounded-xl text-muted-foreground"
                    aria-label={`Remove ${line.name}`}
                    onClick={() => onRemove(line.menuItemId)}
                  >
                    <Trash2 className="size-5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 space-y-3 border-t border-border p-3">
        <BillTotals bill={bill} money={money} density="till" />
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-2xl text-sm font-semibold"
            onClick={onHold}
            disabled={empty || busy}
          >
            <PauseCircle className="mr-1 size-5" /> Park here
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-2xl text-sm font-semibold text-destructive"
            onClick={onClear}
            disabled={empty || busy}
          >
            Clear
          </Button>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Parking keeps a sale on this screen only — it is lost if the till is closed or
          refreshed. Clear empties a sale that hasn&apos;t been sent yet.
        </p>
        {onAdjust ? (
          <Button
            type="button"
            variant="outline"
            className="h-12 w-full rounded-2xl text-sm font-semibold"
            onClick={onAdjust}
            disabled={busy}
          >
            Adjust
          </Button>
        ) : null}
        <Button
          type="button"
          className="h-16 w-full rounded-2xl text-lg font-bold"
          onClick={onPay}
          disabled={empty || busy}
        >
          {shownPayable <= 0.001 ? "Complete" : `PAY ${money(shownPayable)}`}
        </Button>
      </div>
    </aside>
  );
}

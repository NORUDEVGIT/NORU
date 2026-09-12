import { cashieringRefundHref } from "@/packages/pms/lib/fo-check-out";
import {
  folioUnavailableLabel,
  keyCellLabel,
  stayMoneyCellsVisible,
  type FolioSignalLane,
  type StayMoneySignal,
} from "@/packages/pms/lib/fo-exceptions";
import { useMoney } from "@/packages/restaurant-management/state/restaurant-context";

export function StayMoneyStrip({
  folioLane,
  signal,
  signals,
}: {
  folioLane: FolioSignalLane;
  signal: StayMoneySignal | undefined;
  signals: StayMoneySignal[];
}) {
  const money = useMoney();
  const visible = stayMoneyCellsVisible({ folioLane, signals });
  if (!visible.balance && !visible.deposit && !visible.key && !visible.folio) return null;

  const folioDenied = folioUnavailableLabel(folioLane);
  const key = keyCellLabel(signal);

  return (
    <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" data-testid="fo-stay-money">
      {visible.balance ? (
        <div>
          <dt className="inline">Balance </dt>
          <dd className="inline text-foreground">
            {signal?.balance == null ? "" : money(signal.balance)}
          </dd>
        </div>
      ) : null}
      {visible.deposit ? (
        <div>
          <dt className="inline">Deposit </dt>
          <dd className="inline text-foreground">
            {signal?.depositPosted == null ? "" : money(signal.depositPosted)}
          </dd>
        </div>
      ) : null}
      {visible.key ? (
        <div>
          <dt className="inline">Key </dt>
          <dd className="inline text-foreground">{key ?? ""}</dd>
        </div>
      ) : null}
      {visible.folio ? (
        <div>
          <dt className="inline">Folio </dt>
          <dd className="inline">
            {folioDenied ? (
              <span>{folioDenied}</span>
            ) : signal?.folioNumber ? (
              <a
                href={cashieringRefundHref(signal.folioNumber)}
                className="text-foreground underline-offset-4 hover:underline"
              >
                {signal.folioNumber}
              </a>
            ) : (
              ""
            )}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

export function folioHref(folioNumber: string | null | undefined): string {
  return cashieringRefundHref(folioNumber);
}

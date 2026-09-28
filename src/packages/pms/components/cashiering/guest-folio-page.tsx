import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Printer } from "lucide-react";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { CashieringChrome } from "@/packages/pms/components/cashiering/cashiering-chrome";
import {
  FolioStatusBadge,
  labelTransactionType,
  splitLedger,
} from "@/packages/pms/components/cashiering/folio-bits";
import {
  CloseFolioDialog,
  FolioEntryDialog,
} from "@/packages/pms/components/cashiering/folio-dialogs";
import {
  getCashieringAccess,
  getCashieringCorrectionNotice,
  getDefaultDepositPolicy,
  getFolio,
  type FolioDetail,
} from "@/packages/pms/lib/cashiering.functions";
import {
  cashieringTabSearch,
  isFolioAction,
  type CashieringTabId,
} from "@/packages/pms/lib/cashiering-shell";
import type { TransactionType } from "@/packages/pms/lib/cashiering.server";
import {
  useMoney,
  useRestaurantTime,
} from "@/core/state/property-format";
import { Button } from "@/shared/components/ui/button";

export function GuestFolioPage({
  membership,
  folioId,
  initialAction,
}: {
  membership: RestaurantMembership;
  folioId: string;
  initialAction?: string;
}) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const money = useMoney();
  const { dateTime } = useRestaurantTime();
  const queryClient = useQueryClient();
  const [entryType, setEntryType] = useState<TransactionType | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);

  const fetchAccess = useServerFn(getCashieringAccess);
  const fetchFolio = useServerFn(getFolio);
  const fetchDepositPolicy = useServerFn(getDefaultDepositPolicy);
  const fetchCorrectionNotice = useServerFn(getCashieringCorrectionNotice);
  const accessQuery = useQuery({
    queryKey: ["cashiering-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const query = useQuery({
    queryKey: ["folio", restaurantId, folioId],
    queryFn: () => fetchFolio({ data: { restaurantId, folioId } }),
    retry: false,
  });
  const correctionNoticeQuery = useQuery({
    queryKey: ["cashiering-correction-notice", restaurantId],
    queryFn: () => fetchCorrectionNotice({ data: { restaurantId } }),
    retry: false,
  });
  const depositPolicyQuery = useQuery({
    queryKey: ["cashiering-deposit-policy", restaurantId],
    queryFn: () => fetchDepositPolicy({ data: { restaurantId } }),
    retry: false,
  });

  const folio = query.data;
  const canOperate = accessQuery.data?.canOperate ?? false;
  const canManage = accessQuery.data?.canManage ?? false;

  useEffect(() => {
    if (!folio || folio.status !== "open" || !isFolioAction(initialAction)) return;
    const managerAction =
      initialAction === "charge" ||
      initialAction === "refund" ||
      initialAction === "discount" ||
      initialAction === "adjustment" ||
      initialAction === "close";
    if (managerAction && !canManage) return;
    if (!managerAction && !canOperate) return;
    if (initialAction === "close") setCloseOpen(true);
    else setEntryType(initialAction);
  }, [canManage, canOperate, folio, initialAction]);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["folio", restaurantId, folioId] });
    void queryClient.invalidateQueries({ queryKey: ["cashiering-folios", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["cashiering-ledger", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["cashiering-dashboard", restaurantId] });
  }

  function go(tab: CashieringTabId) {
    void navigate({ to: "/restaurant/pms/cashiering", search: cashieringTabSearch(tab, folioId) });
  }

  return (
    <CashieringChrome
      membership={membership}
      active="folios"
      onNavigate={go}
      onSearch={() => go("folios")}
      onPostPayment={() => go("payments")}
    >
      {query.isLoading ? <p className="text-sm text-muted-foreground">Loading folio…</p> : null}
      {query.isError ? (
        <p className="text-sm text-destructive">{(query.error as Error).message}</p>
      ) : null}
      {!query.isLoading && !query.isError && !folio ? (
        <p className="text-sm text-muted-foreground">Folio not found for this property.</p>
      ) : null}
      {folio ? (
        <FolioBody
          folio={folio}
          money={money}
          dateTime={dateTime}
          canOperate={canOperate}
          canManage={canManage}
          onAction={setEntryType}
          onClose={() => setCloseOpen(true)}
        />
      ) : null}
      {folio ? (
        <>
          <FolioEntryDialog
            restaurantId={restaurantId}
            folioId={folio.id}
            type={entryType}
            open={entryType !== null}
            sources={folio.transactions}
            depositPolicySummary={depositPolicyQuery.data?.summary ?? null}
            authorizerNote={correctionNoticeQuery.data?.authorizer ?? null}
            thresholdNote={
              entryType === "adjustment"
                ? correctionNoticeQuery.data?.adjustmentThreshold
                : entryType === "discount"
                  ? correctionNoticeQuery.data?.discountThreshold
                  : null
            }
            onClose={() => setEntryType(null)}
            onDone={refresh}
          />
          <CloseFolioDialog
            restaurantId={restaurantId}
            folioId={folio.id}
            balance={folio.balance}
            open={closeOpen}
            onClose={() => setCloseOpen(false)}
            onDone={refresh}
          />
        </>
      ) : null}
    </CashieringChrome>
  );
}

function FolioBody({
  folio,
  money,
  dateTime,
  canOperate,
  canManage,
  onAction,
  onClose,
}: {
  folio: FolioDetail;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  canOperate: boolean;
  canManage: boolean;
  onAction: (type: TransactionType) => void;
  onClose: () => void;
}) {
  const { charges, credits } = splitLedger(folio.transactions);
  const open = folio.status === "open";
  const settled = Math.abs(folio.balance) < 0.01;
  return (
    <div className="space-y-4" data-testid="guest-folio-page">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 min-h-11">
            <Link to="/restaurant/pms/cashiering" search={{ tab: "folios", folio: folio.id }}>
              <ArrowLeft className="size-4" /> Back to folios
            </Link>
          </Button>
          <h2 className="mt-1 font-display text-xl">
            {folio.folioNumber} · {folio.guestName}
          </h2>
          <p className="text-sm text-muted-foreground">
            {folio.confirmationNumber ? `Reservation ${folio.confirmationNumber} · ` : ""}
            {folio.roomNumber ? `Room ${folio.roomNumber} · ` : ""}
            {folio.currency}
          </p>
          {folio.unsettledCheckout ? (
            <p className="mt-2 text-sm text-destructive">
              Unsettled checkout exception. This folio is still open.
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <FolioStatusBadge status={folio.status} />
          <Button variant="outline" size="sm" className="min-h-11" onClick={() => window.print()}>
            <Printer className="size-4" /> Print statement
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground print:hidden">
        Print statement prints this screen. It is not an issued invoice. Each posting records a
        ledger line. A deposit is a folio credit. Close is available only when the balance is zero.
      </p>
      {open ? (
        <div className="flex flex-wrap gap-2 print:hidden">
          {canManage ? (
            <Button size="sm" className="min-h-11" onClick={() => onAction("charge")}>
              Post charge
            </Button>
          ) : null}
          {canOperate ? (
            <>
              <Button
                size="sm"
                variant="outline"
                className="min-h-11"
                onClick={() => onAction("payment")}
              >
                Receive payment
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="min-h-11"
                onClick={() => onAction("deposit")}
              >
                Add deposit credit
              </Button>
            </>
          ) : null}
          {canManage ? (
            <>
              <Button
                size="sm"
                variant="outline"
                className="min-h-11"
                onClick={() => onAction("refund")}
              >
                Refund
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="min-h-11"
                onClick={() => onAction("discount")}
              >
                Discount
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="min-h-11"
                onClick={() => onAction("adjustment")}
              >
                Adjustment
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="min-h-11"
                disabled={!settled}
                onClick={onClose}
              >
                Close folio
              </Button>
            </>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          This folio is closed{folio.closedAt ? ` ${dateTime(folio.closedAt)}` : ""}. New lines
          cannot be posted.
        </p>
      )}
      <section className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(240px,0.8fr)]">
        <div className="space-y-4">
          <LedgerTable title="Charges" rows={charges} money={money} dateTime={dateTime} />
          <LedgerTable
            title="Payments and credits"
            rows={credits}
            money={money}
            dateTime={dateTime}
          />
        </div>
        <aside className="h-fit space-y-2 rounded-xl border border-border bg-card p-4 shadow-sm">
          <h3 className="text-sm font-semibold">Balance</h3>
          <Row label="Charges" value={money(folio.charges)} />
          <Row label="Credits" value={money(folio.credits)} />
          <div className="border-t border-border pt-2">
            <Row label="Balance" value={money(folio.balance)} strong={!settled} />
          </div>
          <p className="pt-2 text-xs text-muted-foreground">
            Balance is the sum of ledger lines. {folio.currency}
          </p>
        </aside>
      </section>
      <HistoryList rows={folio.transactions} money={money} dateTime={dateTime} />
    </div>
  );
}

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank transfer",
  mobile_money: "Mobile money",
  other: "Other",
};

function HistoryList({
  rows,
  money,
  dateTime,
}: {
  rows: FolioDetail["transactions"];
  money: (value: number) => string;
  dateTime: (iso: string) => string;
}) {
  return (
    <section
      className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
      data-testid="folio-history"
    >
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">History</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Each posted line, who posted it, and the source line when a correction names one.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No posted lines yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Posted</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="px-3 py-2 font-medium">Method</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
              <th className="px-3 py-2 font-medium">Posted by</th>
              <th className="px-3 py-2 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="px-3 py-2 text-muted-foreground">{dateTime(row.postedAt)}</td>
                <td className="px-3 py-2">{labelTransactionType(row.type)}</td>
                <td className="px-3 py-2">{row.description}</td>
                <td className="px-3 py-2">
                  {row.paymentMethod ? (METHOD_LABEL[row.paymentMethod] ?? "—") : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{money(row.amount)}</td>
                <td className="px-3 py-2">{row.postedBy ?? "—"}</td>
                <td className="px-3 py-2">{row.sourceDescription ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-medium text-destructive" : "font-medium tabular-nums"}>
        {value}
      </span>
    </div>
  );
}

function LedgerTable({
  title,
  rows,
  money,
  dateTime,
}: {
  title: string;
  rows: { id: string; type: string; description: string; amount: number; postedAt: string }[];
  money: (value: number) => string;
  dateTime: (iso: string) => string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Nothing posted yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Posted</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="px-3 py-2 text-muted-foreground">{dateTime(row.postedAt)}</td>
                <td className="px-3 py-2">{labelTransactionType(row.type)}</td>
                <td className="px-3 py-2">{row.description}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

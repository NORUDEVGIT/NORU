import { useState } from "react";
import { ReservationDetailSummary } from "@/packages/pms/components/workspaces/reservation-detail-summary";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  formatStayDate,
  ReservationStatusBadge,
} from "@/packages/pms/components/bookings/reservation-bits";
import { labelTransactionType } from "@/packages/pms/components/cashiering/folio-bits";
import {
  CloseFolioDialog,
  FolioEntryDialog,
} from "@/packages/pms/components/cashiering/folio-dialogs";
import { guestInitials, reviewDash } from "@/packages/pms/lib/create-reservation-review";
import { nightsBetween } from "@/packages/pms/lib/reservation-dates";
import {
  DETAIL_DASH,
  depositStatusLabel,
  parseDepositRequirementSnapshot,
  snapshotDisplayName,
  snapshotField,
} from "@/packages/pms/lib/reservation-detail-overview";
import { earlyDepartureReservationLabel } from "@/packages/pms/lib/early-departure-policy";
import {
  depositPaidFromLedger,
  depositRemainder,
  folioActorLabel,
  folioLineQuantity,
  folioRunningBalances,
  guestDepositCreditFromLedger,
  FOLIO_MISSING_COPY,
  folioDepositStatus,
  folioKpiCards,
  folioLedgerSummary,
  ledgerReference,
  paymentMethodLabel,
  paymentRows,
  paymentTenderStatus,
  snapshotDueDate,
} from "@/packages/pms/lib/reservation-detail-folio";
import type { ReservationDetail } from "@/packages/pms/lib/reservations.functions";
import {
  getCashieringAccess,
  getCashieringCorrectionNotice,
  getDefaultDepositPolicy,
  getFolio,
  getReservationDepositRemainder,
  getReservationFolio,
  type FolioDetail,
} from "@/packages/pms/lib/cashiering.functions";
import { issueGuestFolioInvoice } from "@/packages/pms/lib/cashiering-invoices.functions";
import type { TransactionType } from "@/packages/pms/lib/cashiering.server";
import { useRestaurantTime } from "@/core/state/property-format";

export function ReservationDetailFolioTab({
  restaurantId,
  reservation,
  money,
  paymentReceived = null,
  paymentRefunded = null,
  guestDeposit = null,
  totalAmount = null,
  packagesTotal = 0,
  servicesTotal = 0,
  roomGuestTotal = null,
  coverUrl,
}: {
  restaurantId: string;
  reservation: ReservationDetail;
  money: (value: number) => string;
  paymentReceived?: number | null;
  paymentRefunded?: number | null;
  guestDeposit?: number | null;
  totalAmount?: number | null;
  packagesTotal?: number;
  servicesTotal?: number;
  roomGuestTotal?: number | null;
  coverUrl: string | null;
}) {
  const queryClient = useQueryClient();
  const { dateTime } = useRestaurantTime();
  const fetchAccess = useServerFn(getCashieringAccess);
  const fetchReservationFolio = useServerFn(getReservationFolio);
  const fetchFolio = useServerFn(getFolio);
  const fetchRemainder = useServerFn(getReservationDepositRemainder);
  const fetchDepositPolicy = useServerFn(getDefaultDepositPolicy);
  const fetchCorrectionNotice = useServerFn(getCashieringCorrectionNotice);
  const issueInvoice = useServerFn(issueGuestFolioInvoice);
  const [issuingInvoice, setIssuingInvoice] = useState(false);
  const [entryType, setEntryType] = useState<TransactionType | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const currency = reservation.currency?.trim() || "ETB";
  const nights = nightsBetween(reservation.arrivalDate, reservation.departureDate);

  const accessQuery = useQuery({
    queryKey: ["cashiering-access", restaurantId, "reservation-detail-folio"],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const previewQuery = useQuery({
    queryKey: ["reservation-folio", restaurantId, reservation.id],
    queryFn: () => fetchReservationFolio({ data: { restaurantId, reservationId: reservation.id } }),
    retry: false,
  });
  const remainderQuery = useQuery({
    queryKey: ["reservation-deposit-remainder", restaurantId, reservation.id],
    queryFn: () => fetchRemainder({ data: { restaurantId, reservationId: reservation.id } }),
    retry: false,
  });
  const folioQuery = useQuery({
    queryKey: ["folio", restaurantId, previewQuery.data?.id],
    queryFn: () => fetchFolio({ data: { restaurantId, folioId: previewQuery.data!.id } }),
    enabled: Boolean(previewQuery.data?.id),
    retry: false,
  });
  const correctionNoticeQuery = useQuery({
    queryKey: ["cashiering-correction-notice", restaurantId],
    queryFn: () => fetchCorrectionNotice({ data: { restaurantId } }),
    enabled: Boolean(accessQuery.data),
    retry: false,
  });
  const depositPolicyQuery = useQuery({
    queryKey: ["cashiering-deposit-policy", restaurantId],
    queryFn: () => fetchDepositPolicy({ data: { restaurantId } }),
    enabled: Boolean(accessQuery.data),
    retry: false,
  });

  const folio = folioQuery.data ?? null;
  const summary = folioLedgerSummary(folio);
  const cards = folioKpiCards(folio, totalAmount);
  const issuedInvoice = folio?.issuedInvoice ?? folio?.issuedInvoices[0] ?? null;
  const cashierCanOperate = accessQuery.data?.canOperate ?? false;
  const cashierCanManage = accessQuery.data?.canManage ?? false;
  const open = folio?.status === "open";

  function refresh() {
    void queryClient.invalidateQueries({
      queryKey: ["reservation-folio", restaurantId, reservation.id],
    });
    void queryClient.invalidateQueries({ queryKey: ["folio", restaurantId, folio?.id] });
    void queryClient.invalidateQueries({ queryKey: ["cashiering-folios", restaurantId] });
  }

  function refuseMissingFolio() {
    toast.message(FOLIO_MISSING_COPY);
  }

  async function createInvoice() {
    if (!folio) {
      refuseMissingFolio();
      return;
    }
    if (issuedInvoice) {
      toast.message(`Invoice ${issuedInvoice.issuedNumber} is already issued.`);
      return;
    }
    setIssuingInvoice(true);
    try {
      const result = await issueInvoice({
        data: {
          restaurantId,
          folioId: folio.id,
          idempotencyKey: crypto.randomUUID(),
        },
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(`Invoice ${result.invoice.issuedNumber} issued.`);
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invoice could not be issued.");
    } finally {
      setIssuingInvoice(false);
    }
  }

  function startEntry(type: TransactionType) {
    if (!folio || !open) {
      refuseMissingFolio();
      return;
    }
    setEntryType(type);
  }

  const accessError =
    accessQuery.error instanceof Error
      ? accessQuery.error.message
      : previewQuery.error instanceof Error
        ? previewQuery.error.message
        : folioQuery.error instanceof Error
          ? folioQuery.error.message
          : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="reservation-detail-folio">
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h2 className="font-display text-base text-[#251605]">Folio & Payments</h2>
                <p className="text-xs text-muted-foreground">
                  Charges, payments, deposits, refunds, and balance for this reservation.
                </p>
              </div>
            </div>
            {accessError ? <p className="mb-3 text-sm text-destructive">{accessError}</p> : null}
            <div className="grid gap-2 sm:grid-cols-2 xl:max-w-sm">
              {cards.map((card) => (
                <article
                  key={card.id}
                  className="rounded-lg border border-[#EEE6D8] bg-[#FFFcf7] p-3"
                  data-testid={`folio-kpi-${card.id}`}
                >
                  <p className="text-sm font-medium text-[#251605]">{card.name}</p>
                  <p
                    className={`mt-1 text-[11px] font-semibold ${
                      card.status === "Open" ? "text-emerald-700" : "text-muted-foreground"
                    }`}
                  >
                    {card.status}
                  </p>
                  <p className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                    {card.amountLabel}
                  </p>
                  <p className="font-display text-lg text-[#251605]">
                    {card.amount == null ? DETAIL_DASH : money(card.amount)}
                  </p>
                </article>
              ))}
            </div>
          </section>
          <RoomFolioCard
            folio={folio}
            money={money}
            currency={currency}
            dateTime={dateTime}
            canPostCharge={Boolean(open && cashierCanManage)}
            canPostPayment={Boolean(open && cashierCanOperate)}
            canIssueInvoice={Boolean(folio && cashierCanManage && !issuedInvoice)}
            issuingInvoice={issuingInvoice}
            issuedNumber={issuedInvoice?.issuedNumber ?? null}
            onCharge={() => startEntry("charge")}
            onPayment={() => startEntry("payment")}
            onInvoice={() => void createInvoice()}
            onOverflow={(type) => startEntry(type)}
            onClose={() => {
              if (!folio || !open) return refuseMissingFolio();
              setCloseOpen(true);
            }}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <FolioSummaryCard summary={summary} money={money} />
            <PaymentMethodsCard
              folio={folio}
              money={money}
              currency={currency}
              dateTime={dateTime}
              canAdd={Boolean(open && cashierCanOperate)}
              onAdd={() => startEntry("payment")}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <DepositInfoCard
              reservation={reservation}
              summary={summary}
              money={money}
              applied={remainderQuery.data?.applied ?? null}
            />
            <BillingRoutingCard reservation={reservation} />
          </div>
        </div>
        <FolioSummaryRail
          reservation={reservation}
          paymentReceived={paymentReceived}
          paymentRefunded={paymentRefunded ?? summary?.refunds ?? null}
          guestDeposit={guestDeposit}
          money={money}
          coverUrl={coverUrl}
          nights={nights}
          packagesTotal={packagesTotal}
          servicesTotal={servicesTotal}
          totalAmount={totalAmount}
          roomGuestTotal={roomGuestTotal}
          folioBalance={summary?.balance ?? folio?.balance ?? null}
        />
      </div>
      {folio ? (
        <>
          <FolioEntryDialog
            restaurantId={restaurantId}
            folioId={folio.id}
            type={entryType}
            open={entryType !== null}
            sources={folio.transactions}
            depositPolicySummary={depositPolicyQuery.data?.summary ?? null}
            currentBalance={folio.balance}
            currencyCode={folio.currency}
            guestName={reservation.guestName}
            folioNumber={folio.folioNumber}
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
    </div>
  );
}

function RoomFolioCard({
  folio,
  money,
  currency,
  dateTime,
  canPostCharge,
  canPostPayment,
  canIssueInvoice,
  issuingInvoice,
  issuedNumber,
  onCharge,
  onPayment,
  onInvoice,
  onOverflow,
  onClose,
}: {
  folio: FolioDetail | null;
  money: (value: number) => string;
  currency: string;
  dateTime: (iso: string | null | undefined) => string;
  canPostCharge: boolean;
  canPostPayment: boolean;
  canIssueInvoice: boolean;
  issuingInvoice: boolean;
  issuedNumber: string | null;
  onCharge: () => void;
  onPayment: () => void;
  onInvoice: () => void;
  onOverflow: (type: TransactionType) => void;
  onClose: () => void;
}) {
  const rows = folio?.transactions ?? [];
  const balances = folioRunningBalances(rows);
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="room-folio"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-base text-[#251605]">
            Guest Folio{" "}
            {folio ? (
              <span
                className={`ml-2 text-xs font-semibold ${
                  folio.status === "open" ? "text-emerald-700" : "text-muted-foreground"
                }`}
              >
                {folio.status === "open" ? "Open" : "Closed"}
              </span>
            ) : (
              <span className="ml-2 text-xs font-semibold text-muted-foreground">Inactive</span>
            )}
          </h2>
          <p className="text-xs text-muted-foreground">
            Room charges, packages and related transactions.
            {folio ? ` ${folio.folioNumber}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button type="button" size="sm" disabled={!canPostCharge} onClick={onCharge}>
            Post Charge
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canPostPayment}
            onClick={onPayment}
          >
            Post Payment
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={issuingInvoice || !canIssueInvoice}
            onClick={onInvoice}
          >
            {issuedNumber
              ? `Invoice ${issuedNumber}`
              : issuingInvoice
                ? "Issuing…"
                : "Create Invoice"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="icon" variant="outline" aria-label="More folio actions">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onOverflow("deposit")}>
                Add deposit credit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onOverflow("refund")}>Refund</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onOverflow("discount")}>Discount</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onOverflow("adjustment")}>
                Adjustment
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onClose}>Close folio</DropdownMenuItem>
              {folio ? (
                <DropdownMenuItem asChild>
                  <Link
                    to="/restaurant/pms/cashiering/folios/$folioId"
                    params={{ folioId: folio.id }}
                  >
                    Open in Cashiering
                  </Link>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#E4D6B8] px-4 py-8 text-center text-sm text-muted-foreground">
          {folio ? "No posted lines yet." : FOLIO_MISSING_COPY}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-[#EEE6D8] text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2 pr-2">Date</th>
                <th className="py-2 pr-2">Type</th>
                <th className="py-2 pr-2">Description</th>
                <th className="py-2 pr-2">Reference</th>
                <th className="py-2 pr-2 text-right">Qty</th>
                <th className="py-2 pr-2 text-right">Amount ({currency})</th>
                <th className="py-2 pr-2 text-right">Balance ({currency})</th>
                <th className="py-2 pr-2">User</th>
                <th className="py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-[#F4EEE4]">
                  <td className="py-2 pr-2 text-muted-foreground">{dateTime(row.postedAt)}</td>
                  <td className="py-2 pr-2">{labelTransactionType(row.type)}</td>
                  <td className="py-2 pr-2">
                    {reviewDash(row.description)}
                    {row.roomUnitLabel ? (
                      <span className="ml-1 text-[11px] text-muted-foreground">
                        {row.roomUnitLabel}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-2">{reviewDash(ledgerReference(row))}</td>
                  <td className="py-2 pr-2 text-right">{folioLineQuantity(row.quantity)}</td>
                  <td
                    className={`py-2 pr-2 text-right ${row.amount < 0 ? "text-emerald-700" : ""}`}
                  >
                    {money(row.amount)}
                  </td>
                  <td className="py-2 pr-2 text-right">
                    {balances.has(row.id) ? money(balances.get(row.id) ?? 0) : DETAIL_DASH}
                  </td>
                  <td className="py-2 pr-2">{folioActorLabel(row)}</td>
                  <td className="py-2">
                    {folio ? (
                      <Button
                        asChild
                        size="icon"
                        variant="ghost"
                        aria-label="Open folio line in Cashiering"
                      >
                        <Link
                          to="/restaurant/pms/cashiering/folios/$folioId"
                          params={{ folioId: folio.id }}
                        >
                          <MoreHorizontal className="size-3.5" />
                        </Link>
                      </Button>
                    ) : (
                      DETAIL_DASH
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FolioSummaryCard({
  summary,
  money,
}: {
  summary: ReturnType<typeof folioLedgerSummary>;
  money: (value: number) => string;
}) {
  function value(amount: number | null | undefined) {
    return amount == null ? DETAIL_DASH : money(amount);
  }
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="folio-summary"
    >
      <h2 className="mb-3 font-display text-base text-[#251605]">Folio Summary</h2>
      {summary ? (
        <div className="grid gap-y-1 text-sm sm:grid-cols-2 sm:gap-x-6">
          <SummaryLine label="Room Charges" value={value(summary.roomCharges)} />
          <SummaryLine label="Payments" value={value(summary.payments)} />
          <SummaryLine label="Package Charges" value={value(summary.packageCharges)} />
          <SummaryLine label="Refunds" value={value(summary.refunds)} />
          <SummaryLine label="Other Charges" value={value(summary.otherCharges)} />
          <SummaryLine label="Adjustments" value={value(summary.adjustments)} />
          <SummaryLine label="Discounts" value={value(summary.discounts)} />
          <SummaryLine label="Deposits" value={value(summary.depositCredits)} />
          <SummaryLine label="Tax" value={value(summary.tax)} />
          <span />
          <SummaryLine label="Service Charge" value={value(summary.serviceCharge)} />
          <span />
          <SummaryLine label="Total Charges" value={value(summary.totalCharges)} />
          <SummaryLine label="Balance" value={value(summary.balance)} emphasize />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{FOLIO_MISSING_COPY}</p>
      )}
    </section>
  );
}

function SummaryLine({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <p className={`flex justify-between gap-3 ${emphasize ? "font-medium text-[#251605]" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </p>
  );
}

function PaymentMethodsCard({
  folio,
  money,
  currency,
  dateTime,
  canAdd,
  onAdd,
}: {
  folio: FolioDetail | null;
  money: (value: number) => string;
  currency: string;
  dateTime: (iso: string | null | undefined) => string;
  canAdd: boolean;
  onAdd: () => void;
}) {
  const rows = paymentRows(folio);
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="payment-methods"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-base text-[#251605]">Payment Methods</h2>
        <Button type="button" size="sm" variant="outline" disabled={!canAdd} onClick={onAdd}>
          Add Payment
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No payments posted on this folio.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#EEE6D8] text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2 pr-2">Date</th>
                <th className="py-2 pr-2">Method</th>
                <th className="py-2 pr-2">Reference</th>
                <th className="py-2 pr-2 text-right">Amount ({currency})</th>
                <th className="py-2 pr-2">Status</th>
                <th className="py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-[#F4EEE4]">
                  <td className="py-2 pr-2">{dateTime(row.postedAt)}</td>
                  <td className="py-2 pr-2">{reviewDash(paymentMethodLabel(row.paymentMethod))}</td>
                  <td className="py-2 pr-2">{reviewDash(row.referenceType)}</td>
                  <td className="py-2 pr-2 text-right">{money(Math.abs(row.amount))}</td>
                  <td className="py-2 pr-2">
                    {folio ? paymentTenderStatus(row, folio.transactions) : "Posted"}
                  </td>
                  <td className="py-2">
                    {folio ? (
                      <Button
                        asChild
                        size="icon"
                        variant="ghost"
                        aria-label="Open payment in Cashiering"
                      >
                        <Link
                          to="/restaurant/pms/cashiering/folios/$folioId"
                          params={{ folioId: folio.id }}
                        >
                          <MoreHorizontal className="size-3.5" />
                        </Link>
                      </Button>
                    ) : (
                      DETAIL_DASH
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DepositInfoCard({
  reservation,
  summary,
  money,
  applied,
}: {
  reservation: ReservationDetail;
  summary: ReturnType<typeof folioLedgerSummary>;
  money: (value: number) => string;
  applied: number | null;
}) {
  const deposit = parseDepositRequirementSnapshot(reservation.depositRequirementSnapshot);
  const paid = depositPaidFromLedger(summary);
  const guestDepositCredit = guestDepositCreditFromLedger(summary);
  const remainder = depositRemainder({ credit: guestDepositCredit, applied });
  const due = snapshotDueDate(reservation.depositRequirementSnapshot);
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="deposit-information"
    >
      <h2 className="mb-3 font-display text-base text-[#251605]">Deposit Information</h2>
      <dl className="space-y-1 text-sm">
        <InfoRow
          label="Required Deposit"
          value={
            deposit?.amount == null
              ? DETAIL_DASH
              : `${money(deposit.amount)}${deposit.name ? ` (${deposit.name})` : ""}`
          }
        />
        <InfoRow label="Paid Amount" value={paid == null ? DETAIL_DASH : money(paid)} />
        <InfoRow
          label="Guest deposit credit"
          value={guestDepositCredit == null ? DETAIL_DASH : money(guestDepositCredit)}
        />
        <InfoRow
          label="Applied"
          value={remainder.applied == null ? DETAIL_DASH : money(remainder.applied)}
        />
        <InfoRow
          label="Refundable"
          value={remainder.refundable == null ? DETAIL_DASH : money(remainder.refundable)}
        />
        <InfoRow label="Due Date" value={due ? formatStayDate(due) : DETAIL_DASH} />
        <InfoRow label="Status" value={folioDepositStatus(deposit, paid)} />
      </dl>
    </section>
  );
}

function BillingRoutingCard({ reservation }: { reservation: ReservationDetail }) {
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="billing-routing"
    >
      <div className="mb-3">
        <h2 className="font-display text-base text-[#251605]">Billing & Routing</h2>
        <p className="text-[11px] text-muted-foreground">
          Company and travel agent stay on the reservation. Routing is not a posting rule.
        </p>
      </div>
      <dl className="space-y-1 text-sm">
        <InfoRow label="Bill To" value={reservation.guestName} />
        <InfoRow label="Routing" value={DETAIL_DASH} />
        <InfoRow label="Company" value={reviewDash(reservation.companyName)} />
        <InfoRow label="Travel Agent" value={reviewDash(reservation.travelAgentName)} />
        <InfoRow label="Special Instructions" value={reviewDash(reservation.specialRequests)} />
      </dl>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right text-[#251605]">{value}</dd>
    </div>
  );
}

function FolioSummaryRail({
  reservation,
  money,
  coverUrl,
  nights,
  packagesTotal,
  servicesTotal,
  totalAmount,
  roomGuestTotal = null,
  folioBalance,
  paymentReceived,
  paymentRefunded,
  guestDeposit,
}: {
  reservation: ReservationDetail;
  money: (value: number) => string;
  coverUrl: string | null;
  nights: number;
  packagesTotal: number;
  servicesTotal: number;
  totalAmount: number | null;
  roomGuestTotal?: number | null;
  folioBalance: number | null;
  paymentReceived: number | null;
  paymentRefunded: number | null;
  guestDeposit: number | null;
}) {
  return (
    <ReservationDetailSummary
      testId="reservation-folio-summary"
      reservation={reservation}
      money={money}
      coverUrl={coverUrl}
      nights={nights}
      packagesTotal={packagesTotal > 0 ? packagesTotal : undefined}
      servicesTotal={servicesTotal > 0 ? servicesTotal : undefined}
      folioBalance={folioBalance}
      paymentReceived={paymentReceived}
      paymentRefunded={paymentRefunded}
      guestDeposit={guestDeposit}
      totalAmount={totalAmount}
      roomGuestTotal={roomGuestTotal}
      roomTotalLabel="Total Amount"
      showFolioBalance
    />
  );
}

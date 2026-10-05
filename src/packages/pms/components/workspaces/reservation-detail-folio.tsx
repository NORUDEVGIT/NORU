import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  BedDouble,
  CalendarDays,
  CreditCard,
  FileText,
  MoreHorizontal,
  Plus,
  Shield,
  UserRound,
  Wallet,
} from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
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
import {
  depositPaidFromLedger,
  FOLIO_BILLING_EDIT_GAP_COPY,
  FOLIO_ADD_FOLIO_GAP_COPY,
  FOLIO_INVOICE_GAP_COPY,
  FOLIO_LINE_BALANCE_GAP,
  FOLIO_LINE_QTY_GAP,
  FOLIO_MISSING_COPY,
  FOLIO_NOTES_GAP_COPY,
  FOLIO_NOTES_MAX,
  folioDepositStatus,
  folioKpiCards,
  folioLedgerSummary,
  ledgerReference,
  paymentMethodLabel,
  paymentRows,
  snapshotDueDate,
} from "@/packages/pms/lib/reservation-detail-folio";
import type { ReservationDetail } from "@/packages/pms/lib/reservations.functions";
import {
  getCashieringAccess,
  getCashieringCorrectionNotice,
  getDefaultDepositPolicy,
  getFolio,
  getReservationFolio,
  type FolioDetail,
} from "@/packages/pms/lib/cashiering.functions";
import type { TransactionType } from "@/packages/pms/lib/cashiering.server";
import { useRestaurantTime } from "@/core/state/property-format";

export function ReservationDetailFolioTab({
  restaurantId,
  reservation,
  canManage,
  money,
  coverUrl,
  onBackToPackages,
}: {
  restaurantId: string;
  reservation: ReservationDetail;
  canManage: boolean;
  money: (value: number) => string;
  coverUrl: string | null;
  onBackToPackages: () => void;
}) {
  const queryClient = useQueryClient();
  const { dateTime } = useRestaurantTime();
  const fetchAccess = useServerFn(getCashieringAccess);
  const fetchReservationFolio = useServerFn(getReservationFolio);
  const fetchFolio = useServerFn(getFolio);
  const fetchDepositPolicy = useServerFn(getDefaultDepositPolicy);
  const fetchCorrectionNotice = useServerFn(getCashieringCorrectionNotice);
  const [notes, setNotes] = useState("");
  const [entryType, setEntryType] = useState<TransactionType | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const cancelled = reservation.status === "cancelled";
  const editable = canManage && !cancelled;
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
  const cards = folioKpiCards(folio, summary);
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
                  View folio(s), charges, payments and balance for this reservation.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!editable}
                onClick={() => toast.message(FOLIO_ADD_FOLIO_GAP_COPY)}
              >
                <Plus className="mr-1 size-3.5" />
                Add Folio
              </Button>
            </div>
            {accessError ? <p className="mb-3 text-sm text-destructive">{accessError}</p> : null}
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {cards.map((card) => (
                <article
                  key={card.id}
                  className="rounded-lg border border-[#EEE6D8] bg-[#FFFcf7] p-3"
                  data-testid={`folio-kpi-${card.id}`}
                >
                  <p className="text-sm font-medium text-[#251605]">{card.name}</p>
                  <p
                    className={`mt-1 text-[11px] font-semibold ${
                      card.status === "Active" ? "text-emerald-700" : "text-muted-foreground"
                    }`}
                  >
                    {card.status}
                  </p>
                  <p className="mt-2 font-display text-lg text-[#251605]">
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
            onCharge={() => startEntry("charge")}
            onPayment={() => startEntry("payment")}
            onInvoice={() => toast.message(FOLIO_INVOICE_GAP_COPY)}
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
          <div className="grid gap-4 lg:grid-cols-3">
            <DepositInfoCard reservation={reservation} summary={summary} money={money} />
            <BillingRoutingCard reservation={reservation} editable={editable} />
            <FolioNotesCard value={notes} editable={editable} onChange={setNotes} />
          </div>
        </div>
        <FolioSummaryRail
          reservation={reservation}
          money={money}
          coverUrl={coverUrl}
          nights={nights}
          packagesTotal={summary?.packageCharges ?? 0}
          folioBalance={folio?.balance ?? null}
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#DDD4C5] bg-white py-3">
        <Button type="button" variant="outline" size="sm" onClick={onBackToPackages}>
          Back to Packages
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!editable}
            onClick={() => toast.message(FOLIO_NOTES_GAP_COPY)}
          >
            Save Changes
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setNotes("")}>
            Cancel
          </Button>
        </div>
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
  onCharge: () => void;
  onPayment: () => void;
  onInvoice: () => void;
  onOverflow: (type: TransactionType) => void;
  onClose: () => void;
}) {
  const rows = folio?.transactions ?? [];
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="room-folio"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-base text-[#251605]">
            Room Folio{" "}
            {folio ? (
              <span className="ml-2 text-xs font-semibold text-emerald-700">
                {folio.status === "open" ? "Active" : "Inactive"}
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
          <Button type="button" size="sm" variant="outline" onClick={onInvoice}>
            Create Invoice
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
                  <td className="py-2 pr-2">{reviewDash(row.description)}</td>
                  <td className="py-2 pr-2">{reviewDash(ledgerReference(row))}</td>
                  <td className="py-2 pr-2 text-right">{FOLIO_LINE_QTY_GAP}</td>
                  <td
                    className={`py-2 pr-2 text-right ${row.amount < 0 ? "text-emerald-700" : ""}`}
                  >
                    {money(row.amount)}
                  </td>
                  <td className="py-2 pr-2 text-right">{FOLIO_LINE_BALANCE_GAP}</td>
                  <td className="py-2 pr-2">{reviewDash(row.postedBy)}</td>
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
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <SummaryLine label="Room Charges" value={value(summary.roomCharges)} />
          <SummaryLine label="Payments" value={value(summary.payments)} />
          <SummaryLine label="Package Charges" value={value(summary.packageCharges)} />
          <SummaryLine label="Adjustments" value={value(summary.adjustments)} />
          <SummaryLine label="Other Charges" value={value(summary.otherCharges)} />
          <SummaryLine label="Total Payments" value={value(summary.totalPayments)} />
          <SummaryLine label="Discounts" value={value(summary.discounts)} />
          <SummaryLine label="Balance" value={value(summary.balance)} emphasize />
          <SummaryLine label="Taxes & Fees" value={value(summary.taxes)} />
          <span />
          <SummaryLine label="Total Charges" value={value(summary.totalCharges)} />
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
                  <td className="py-2 pr-2">Posted</td>
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
}: {
  reservation: ReservationDetail;
  summary: ReturnType<typeof folioLedgerSummary>;
  money: (value: number) => string;
}) {
  const deposit = parseDepositRequirementSnapshot(reservation.depositRequirementSnapshot);
  const paid = depositPaidFromLedger(summary);
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
        <InfoRow label="Due Date" value={due ? formatStayDate(due) : DETAIL_DASH} />
        <InfoRow label="Status" value={folioDepositStatus(deposit, paid)} />
      </dl>
    </section>
  );
}

function BillingRoutingCard({
  reservation,
  editable,
}: {
  reservation: ReservationDetail;
  editable: boolean;
}) {
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="billing-routing"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-base text-[#251605]">Billing & Routing</h2>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!editable}
          onClick={() => toast.message(FOLIO_BILLING_EDIT_GAP_COPY)}
        >
          Edit
        </Button>
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

function FolioNotesCard({
  value,
  editable,
  onChange,
}: {
  value: string;
  editable: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="folio-notes"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-base text-[#251605]">Notes</h2>
        <Button type="button" size="sm" variant="ghost" disabled={!editable}>
          Edit
        </Button>
      </div>
      <Label htmlFor="folio-tab-notes" className="sr-only">
        Folio or payment notes
      </Label>
      <Textarea
        id="folio-tab-notes"
        maxLength={FOLIO_NOTES_MAX}
        disabled={!editable}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, FOLIO_NOTES_MAX))}
        placeholder="Add folio or payment notes…"
        className="min-h-24"
      />
      <p className="mt-1 text-right text-[11px] text-muted-foreground">
        {value.length}/{FOLIO_NOTES_MAX}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">{FOLIO_NOTES_GAP_COPY}</p>
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
  folioBalance,
}: {
  reservation: ReservationDetail;
  money: (value: number) => string;
  coverUrl: string | null;
  nights: number;
  packagesTotal: number;
  folioBalance: number | null;
}) {
  const deposit = parseDepositRequirementSnapshot(reservation.depositRequirementSnapshot);
  const assigned = Boolean(reservation.roomId && reservation.roomNumber);
  const cancellation = snapshotDisplayName(reservation.cancellationPolicySnapshot);
  const noShow = snapshotField(reservation.refundabilitySnapshot, ["no_show", "no_show_policy"]);
  const earlyDeparture = snapshotField(reservation.refundabilitySnapshot, [
    "early_departure",
    "early_departure_policy",
  ]);
  const stayNightsLabel =
    nights || nightsBetween(reservation.arrivalDate, reservation.departureDate);
  return (
    <aside
      className="h-fit space-y-3 rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="reservation-folio-summary"
    >
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Reservation Summary
        </p>
        <div className="mt-1 flex items-center gap-2">
          <p className="font-display text-lg text-[#251605]">{reservation.confirmationNumber}</p>
          <ReservationStatusBadge status={reservation.status} />
        </div>
      </div>
      <div className="flex items-start gap-3 border-t border-[#EEE6D8] pt-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F4E9D0] text-xs font-semibold text-[#765719]">
          {guestInitials(reservation.guestName)}
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-1 font-medium text-[#251605]">
            <UserRound className="size-3.5 text-[#B8954F]" />
            {reservation.guestName}
            {reservation.guestVip ? (
              <span className="rounded-full bg-[#F4E9D0] px-1.5 py-0.5 text-[10px] font-semibold text-[#765719]">
                VIP
              </span>
            ) : null}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {reviewDash(reservation.guestPhone)}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {reviewDash(reservation.guestEmail)}
          </p>
        </div>
      </div>
      <SummaryBlock
        icon={<CalendarDays className="size-3.5 text-[#B8954F]" />}
        title="Stay Information"
      >
        <p>
          {formatStayDate(reservation.arrivalDate)} → {formatStayDate(reservation.departureDate)} (
          {stayNightsLabel} night{stayNightsLabel === 1 ? "" : "s"})
        </p>
        <p>
          {reservation.adults} Adults · {reservation.children} Children ·{" "}
          {reservation.infants == null ? DETAIL_DASH : reservation.infants} Infants
        </p>
        <p>Purpose: {reviewDash(reservation.purposeOfStay)}</p>
      </SummaryBlock>
      <SummaryBlock
        icon={<BedDouble className="size-3.5 text-[#B8954F]" />}
        title="Room Information"
      >
        <div className="flex gap-2">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="h-12 w-16 rounded-md object-cover" />
          ) : (
            <div className="flex h-12 w-16 items-center justify-center rounded-md bg-[#EFE8DC] text-[#8A7B68]">
              <BedDouble className="size-5" />
            </div>
          )}
          <div>
            <p className="font-medium">{reviewDash(reservation.roomTypeName)}</p>
            <p>{assigned ? `Room ${reservation.roomNumber}` : "Not Assigned"}</p>
            <p>{reviewDash(reservation.ratePlanName)}</p>
          </div>
        </div>
      </SummaryBlock>
      <SummaryBlock icon={<FileText className="size-3.5 text-[#B8954F]" />} title="Rate & Total">
        <p>
          Room Rate{" "}
          {reservation.roomSubtotal == null ? DETAIL_DASH : money(reservation.roomSubtotal)}
        </p>
        <p>Packages {money(packagesTotal)}</p>
        <p className="font-medium text-[#251605]">
          Total Amount{" "}
          {reservation.roomSubtotal == null ? DETAIL_DASH : money(reservation.roomSubtotal)}
        </p>
      </SummaryBlock>
      <SummaryBlock icon={<Wallet className="size-3.5 text-[#B8954F]" />} title="Folio balance">
        <p>{folioBalance == null ? DETAIL_DASH : money(folioBalance)}</p>
      </SummaryBlock>
      <SummaryBlock
        icon={<CreditCard className="size-3.5 text-[#B8954F]" />}
        title="Guarantee & Deposit"
      >
        <p>{reviewDash(reservation.guaranteeMethod)}</p>
        <p>
          Deposit {deposit?.amount == null ? DETAIL_DASH : money(deposit.amount)} ·{" "}
          {depositStatusLabel(deposit)}
        </p>
      </SummaryBlock>
      <SummaryBlock icon={<Shield className="size-3.5 text-[#B8954F]" />} title="Policies">
        <p>Cancellation: {reviewDash(cancellation)}</p>
        <p>No-show: {reviewDash(noShow)}</p>
        <p>Early departure: {reviewDash(earlyDeparture)}</p>
      </SummaryBlock>
    </aside>
  );
}

function SummaryBlock({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-[#EEE6D8] pt-3 text-xs text-muted-foreground">
      <p className="mb-1 flex items-center gap-1 font-medium text-[#251605]">
        {icon}
        {title}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

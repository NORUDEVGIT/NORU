import { useState } from "react";
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
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { labelTransactionType } from "@/packages/pms/components/cashiering/folio-bits";
import {
  CloseFolioDialog,
  FolioEntryDialog,
} from "@/packages/pms/components/cashiering/folio-dialogs";
import { reviewDash } from "@/packages/pms/lib/create-reservation-review";
import { parseDepositRequirementSnapshot } from "@/packages/pms/lib/reservation-detail-overview";
import {
  depositPaidFromLedger,
  FOLIO_MISSING_COPY,
  folioDepositStatus,
  folioKpiCards,
  folioLedgerSummary,
  ledgerReference,
  snapshotDueDate,
} from "@/packages/pms/lib/reservation-detail-folio";
import type { ReservationDetail } from "@/packages/pms/lib/reservations.functions";
import {
  getCashieringAccess,
  getCashieringCorrectionNotice,
  getDefaultDepositPolicy,
  getFolio,
  getReservationFolio,
} from "@/packages/pms/lib/cashiering.functions";
import type { TransactionType } from "@/packages/pms/lib/cashiering.server";
import { useRestaurantTime } from "@/core/state/property-format";
import { cn } from "@/shared/lib/utils";

const CARD = "rounded-xl border border-gray-200 bg-white p-4";
const BTN_PRIMARY = "bg-[#4A2C0F] text-white hover:bg-[#3a2209]";
const BTN_OUTLINE = "border-gray-200 bg-white text-[#4A2C0F] hover:bg-gray-50";
const MUTED = "text-muted-foreground";
const TH = "border-b border-gray-200 text-[11px] uppercase tracking-wide";
const ROW = "border-b border-gray-100";
const MENU_ITEM = "text-[#251605] focus:bg-gray-100";

export function ReservationDetailFolioTab({
  restaurantId,
  reservation,
  money,
  onBackToPackages,
}: {
  restaurantId: string;
  reservation: ReservationDetail;
  money: (value: number) => string;
  onBackToPackages?: () => void;
  // Kept optional so existing callers don't break; this page doesn't use them.
  canManage?: boolean;
  coverUrl?: string | null;
}) {
  const queryClient = useQueryClient();
  const { dateTime } = useRestaurantTime();
  const fetchAccess = useServerFn(getCashieringAccess);
  const fetchReservationFolio = useServerFn(getReservationFolio);
  const fetchFolio = useServerFn(getFolio);
  const fetchDepositPolicy = useServerFn(getDefaultDepositPolicy);
  const fetchCorrectionNotice = useServerFn(getCashieringCorrectionNotice);
  const [entryType, setEntryType] = useState<TransactionType | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const currency = reservation.currency?.trim() || "ETB";

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
  const canOperate = accessQuery.data?.canOperate ?? false;
  const canManageCashier = accessQuery.data?.canManage ?? false;
  const open = folio?.status === "open";
  const rows = folio?.transactions ?? [];

  // Missing amounts show as 0, never a dash.
  const amount = (value: number | null | undefined) => money(value ?? 0);

  const deposit = parseDepositRequirementSnapshot(reservation.depositRequirementSnapshot);
  const depositPaid = depositPaidFromLedger(summary) ?? 0;
  const dueDate = snapshotDueDate(reservation.depositRequirementSnapshot);

  function refresh() {
    void queryClient.invalidateQueries({
      queryKey: ["reservation-folio", restaurantId, reservation.id],
    });
    void queryClient.invalidateQueries({ queryKey: ["folio", restaurantId, folio?.id] });
    void queryClient.invalidateQueries({ queryKey: ["cashiering-folios", restaurantId] });
  }

  function startEntry(type: TransactionType) {
    if (!folio || !open) {
      toast.message(FOLIO_MISSING_COPY);
      return;
    }
    setEntryType(type);
  }

  const error =
    accessQuery.error instanceof Error
      ? accessQuery.error.message
      : previewQuery.error instanceof Error
        ? previewQuery.error.message
        : folioQuery.error instanceof Error
          ? folioQuery.error.message
          : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="reservation-detail-folio">
      <div className="min-h-0 flex-1 space-y-4">
        {/* Header: title, actions and balances */}
        <section className={CARD} data-testid="room-folio">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-display text-base text-[#251605]">
                Folio & Payments
                {folio ? (
                  <span
                    className={cn(
                      "ml-2 text-xs font-semibold",
                      open ? "text-emerald-700" : MUTED,
                    )}
                  >
                    {open ? "Active" : "Closed"}
                  </span>
                ) : null}
              </h2>
              <p className={cn("text-xs", MUTED)}>
                {folio ? folio.folioNumber : FOLIO_MISSING_COPY}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                className={BTN_PRIMARY}
                disabled={!open || !canManageCashier}
                onClick={() => startEntry("charge")}
              >
                Post Charge
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={BTN_OUTLINE}
                disabled={!open || !canOperate}
                onClick={() => startEntry("payment")}
              >
                Post Payment
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className={BTN_OUTLINE}
                    disabled={!folio}
                    aria-label="More folio actions"
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-white">
                  <DropdownMenuItem className={MENU_ITEM} onClick={() => startEntry("deposit")}>
                    Add deposit credit
                  </DropdownMenuItem>
                  <DropdownMenuItem className={MENU_ITEM} onClick={() => startEntry("refund")}>
                    Refund
                  </DropdownMenuItem>
                  <DropdownMenuItem className={MENU_ITEM} onClick={() => startEntry("discount")}>
                    Discount
                  </DropdownMenuItem>
                  <DropdownMenuItem className={MENU_ITEM} onClick={() => startEntry("adjustment")}>
                    Adjustment
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={MENU_ITEM}
                    onClick={() => (open ? setCloseOpen(true) : toast.message(FOLIO_MISSING_COPY))}
                  >
                    Close folio
                  </DropdownMenuItem>
                  {folio ? (
                    <DropdownMenuItem asChild className={MENU_ITEM}>
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

          {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => (
              <article
                key={card.id}
                className="rounded-lg border border-gray-200 bg-gray-50 p-3"
                data-testid={`folio-kpi-${card.id}`}
              >
                <p className="text-sm font-medium text-[#251605]">{card.name}</p>
                <p
                  className={cn(
                    "mt-1 text-[11px] font-semibold",
                    card.status === "Active" ? "text-emerald-700" : MUTED,
                  )}
                >
                  {card.status}
                </p>
                <p className="mt-2 font-display text-lg text-[#251605]">{amount(card.amount)}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Folio lines */}
        <section className={CARD}>
          <h2 className="mb-3 font-display text-base text-[#251605]">Folio Lines</h2>
          {rows.length === 0 ? (
            <p className={cn("py-6 text-center text-sm", MUTED)}>
              {folio ? "No posted lines yet." : FOLIO_MISSING_COPY}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm text-[#251605]">
                <thead className={cn(TH, MUTED)}>
                  <tr>
                    <th className="px-2 py-2">Date</th>
                    <th className="py-2 pr-2">Type</th>
                    <th className="py-2 pr-2">Description</th>
                    <th className="py-2 pr-2">Reference</th>
                    <th className="py-2 pr-2 text-right">Amount ({currency})</th>
                    <th className="py-2">User</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className={ROW}>
                      <td className={cn("px-2 py-2", MUTED)}>{dateTime(row.postedAt)}</td>
                      <td className="py-2 pr-2">{labelTransactionType(row.type)}</td>
                      <td className="py-2 pr-2">
                        {reviewDash(row.description)}
                        {row.roomUnitLabel ? (
                          <span className={cn("ml-1 text-[11px]", MUTED)}>{row.roomUnitLabel}</span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-2">{reviewDash(ledgerReference(row))}</td>
                      <td
                        className={cn(
                          "py-2 pr-2 text-right",
                          row.amount < 0 && "text-emerald-700",
                        )}
                      >
                        {money(row.amount)}
                      </td>
                      <td className="py-2">{reviewDash(row.postedBy)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Summary and deposit */}
        <div className="grid gap-4 lg:grid-cols-2">
          <section className={CARD} data-testid="folio-summary">
            <h2 className="mb-3 font-display text-base text-[#251605]">Summary</h2>
            <dl className="space-y-1 text-sm">
              <Line label="Room Charges" value={amount(summary?.roomCharges)} />
              <Line label="Package Charges" value={amount(summary?.packageCharges)} />
              <Line label="Other Charges" value={amount(summary?.otherCharges)} />
              <Line label="Taxes & Fees" value={amount(summary?.taxes)} />
              <Line label="Discounts" value={amount(summary?.discounts)} />
              <Line label="Adjustments" value={amount(summary?.adjustments)} />
              <Line label="Total Charges" value={amount(summary?.totalCharges)} />
              <Line label="Total Payments" value={amount(summary?.totalPayments)} />
              <Line label="Balance" value={amount(summary?.balance)} emphasize />
            </dl>
          </section>

          <section className={CARD} data-testid="deposit-information">
            <h2 className="mb-3 font-display text-base text-[#251605]">Deposit</h2>
            <dl className="space-y-1 text-sm">
              <Line
                label="Required"
                value={`${amount(deposit?.amount)}${deposit?.name ? ` (${deposit.name})` : ""}`}
              />
              <Line label="Paid" value={amount(depositPaid)} />
              <Line label="Due Date" value={dueDate ? formatStayDate(dueDate) : "Not set"} />
              <Line label="Status" value={folioDepositStatus(deposit, depositPaid)} />
            </dl>
          </section>
        </div>
      </div>

      {onBackToPackages ? (
        <div className="mt-4 border-t border-gray-200 bg-white py-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={BTN_OUTLINE}
            onClick={onBackToPackages}
          >
            Back
          </Button>
        </div>
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

function Line({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex justify-between gap-3 text-[#251605]",
        emphasize && "rounded bg-gray-100 px-1 font-semibold",
      )}
    >
      <dt className={emphasize ? "text-[#4A2C0F]" : MUTED}>{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
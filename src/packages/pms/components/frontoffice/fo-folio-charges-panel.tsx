import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, Landmark, Menu, Receipt, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { labelTransactionType } from "@/packages/pms/components/cashiering/folio-bits";
import {
  CloseFolioDialog,
  FolioEntryDialog,
} from "@/packages/pms/components/cashiering/folio-dialogs";
import { SHELL_ICON_BUTTON } from "@/packages/pms/components/reservations/reservation-shell-slots";
import {
  ROOM_TABLE_HEAD,
  ROOM_TABLE_ROW,
  ROOM_TABLE_TD,
  ROOM_TABLE_TH,
  ROOM_TABLE_WRAP,
} from "@/packages/pms/components/rooms/room-inventory-shell";
import { useMoney } from "@/core/state/property-format";
import {
  getCashieringCorrectionNotice,
  getDefaultDepositPolicy,
  getFolioWorkspace,
  getReservationFolio,
  type FolioTransactionRow,
} from "@/packages/pms/lib/cashiering.functions";
import { issueGuestFolioChargeInvoice } from "@/packages/pms/lib/cashiering-invoices.functions";
import type { TransactionType } from "@/packages/pms/lib/cashiering.server";
import {
  FO_FOLIO_SECTIONS,
  foFolioActionState,
  foFolioEntryType,
  foFolioMatchesReservation,
  foFolioSectionRows,
  foFolioSummaryCards,
  type FoFolioActionId,
  type FoFolioActionState,
  type FoFolioSectionId,
} from "@/packages/pms/lib/fo-folio-tab";
import {
  FOLIO_MISSING_COPY,
  paymentMethodLabel,
} from "@/packages/pms/lib/reservation-detail-folio";
import { cn } from "@/shared/lib/utils";

const FOLIO_BURGER_ACTIONS: Array<{ id: FoFolioActionId; label: string }> = [
  { id: "post_charge", label: "Post Charge" },
  { id: "record_payment", label: "Record Payment" },
  { id: "post_deposit", label: "Post Deposit" },
  { id: "adjustment", label: "Post Adjustment" },
  { id: "discount", label: "Post Discount" },
  { id: "refund", label: "Post Refund" },
  { id: "print_folio", label: "Print Folio" },
  { id: "issue_invoice", label: "Issue Invoice" },
  { id: "close_folio", label: "Close Folio" },
];

const HIDDEN_REFERENCE_TYPES = new Set(["reservation_package_charge", "reservation_room_charge"]);

function isTechnicalSourceLabel(value: string | null | undefined): boolean {
  if (!value) return false;
  if (HIDDEN_REFERENCE_TYPES.has(value)) return true;
  return /^[a-z]+(_[a-z0-9]+)+$/.test(value);
}

function folioLineMeta(row: FolioTransactionRow): string | null {
  const method = paymentMethodLabel(row.paymentMethod);
  if (method) return method;
  if (isTechnicalSourceLabel(row.referenceType)) return null;
  return row.referenceType;
}

function folioLineDescription(row: FolioTransactionRow): string {
  if (row.referenceType === "reservation_room_charge" && isTechnicalSourceLabel(row.description)) {
    return "Room Charge";
  }
  if (isTechnicalSourceLabel(row.description)) return row.description.replaceAll("_", " ");
  return row.description;
}

/**
 * Folio for the selected reservation, read and posted through Cashiering.
 * `reservationRoomId` only marks the stay unit that opened the workspace.
 */
export function FoFolioChargesPanel({
  restaurantId,
  reservationId,
  reservationRoomId = null,
  guestName,
  confirmationNumber,
  roomNumber,
  roomTypeName: _roomTypeName,
}: {
  restaurantId: string;
  reservationId: string;
  reservationRoomId?: string | null;
  guestName: string;
  confirmationNumber: string;
  roomNumber: string | null;
  roomTypeName: string | null;
}) {
  const money = useMoney();
  const queryClient = useQueryClient();
  const fetchReservationFolio = useServerFn(getReservationFolio);
  const fetchWorkspace = useServerFn(getFolioWorkspace);
  const fetchDepositPolicy = useServerFn(getDefaultDepositPolicy);
  const fetchCorrectionNotice = useServerFn(getCashieringCorrectionNotice);
  const issueInvoice = useServerFn(issueGuestFolioChargeInvoice);
  const [section, setSection] = useState<FoFolioSectionId>("charges");
  const [entryType, setEntryType] = useState<TransactionType | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [issuing, setIssuing] = useState(false);

  const previewQuery = useQuery({
    queryKey: ["fo-folio-tab", restaurantId, reservationId],
    queryFn: () => fetchReservationFolio({ data: { restaurantId, reservationId } }),
    retry: false,
  });
  const workspaceQuery = useQuery({
    queryKey: ["folio-workspace", restaurantId, previewQuery.data?.id, reservationId],
    queryFn: () => fetchWorkspace({ data: { restaurantId, folioId: previewQuery.data!.id } }),
    enabled: Boolean(previewQuery.data?.id),
    retry: false,
  });
  const depositPolicyQuery = useQuery({
    queryKey: ["cashiering-deposit-policy", restaurantId],
    queryFn: () => fetchDepositPolicy({ data: { restaurantId } }),
    enabled: Boolean(workspaceQuery.data),
    retry: false,
  });
  const correctionQuery = useQuery({
    queryKey: ["cashiering-correction-notice", restaurantId],
    queryFn: () => fetchCorrectionNotice({ data: { restaurantId } }),
    enabled: entryType === "adjustment" || entryType === "discount",
    retry: false,
  });

  const workspace = workspaceQuery.data ?? null;
  const folio = workspace?.folio ?? null;
  const matches = folio ? foFolioMatchesReservation(folio.reservationId, reservationId) : false;
  const issued = folio?.issuedInvoice ?? folio?.issuedInvoices[0] ?? null;
  const cards = folio
    ? foFolioSummaryCards({
        charges: folio.charges,
        payments: workspace!.financialSummary.payments,
        balance: workspace!.financialSummary.currentBalance,
        deposits: workspace!.financialSummary.deposits,
      })
    : [];

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["fo-folio-tab", restaurantId, reservationId] });
    void queryClient.invalidateQueries({
      queryKey: ["folio-workspace", restaurantId, folio?.id],
    });
    void queryClient.invalidateQueries({
      queryKey: ["reservation-folio", restaurantId, reservationId],
    });
  }

  function stateFor(action: FoFolioActionId): FoFolioActionState {
    if (!workspace || !matches) return "hidden";
    return foFolioActionState({
      action,
      canManage: workspace.canManage,
      canOperate: workspace.canOperate,
      capabilities: workspace.capabilities,
      hasFolio: true,
      grants: workspace.grants,
    });
  }

  function openEntry(action: FoFolioActionId) {
    const type = foFolioEntryType(action);
    if (!type || stateFor(action) !== "enabled") return;
    setEntryType(type);
  }

  async function createInvoice() {
    if (!folio || stateFor("issue_invoice") !== "enabled" || issuing) return;
    setIssuing(true);
    try {
      const result = await issueInvoice({
        data: { restaurantId, folioId: folio.id, idempotencyKey: crypto.randomUUID() },
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
      setIssuing(false);
    }
  }

  const error =
    previewQuery.error instanceof Error
      ? previewQuery.error.message
      : workspaceQuery.error instanceof Error
        ? workspaceQuery.error.message
        : null;

  return (
    <div
      className="space-y-3"
      data-testid="fo-folio-charges"
      data-reservation-id={reservationId}
      data-reservation-room-id={reservationRoomId ?? ""}
    >
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {previewQuery.isLoading || workspaceQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading folio…</p>
      ) : null}
      {!previewQuery.isLoading && !previewQuery.data && !error ? (
        <p className="text-sm text-muted-foreground" data-testid="fo-folio-missing">
          {FOLIO_MISSING_COPY}
        </p>
      ) : null}
      {folio && !matches ? (
        <p className="text-sm text-destructive" data-testid="fo-folio-mismatch">
          This folio does not belong to the selected reservation.
        </p>
      ) : null}
      {folio && matches && workspace ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="font-display text-base font-semibold text-[#251605]">
                Folio {folio.folioNumber}
              </h3>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  folio.status === "open"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-[#EFE8DC] text-[#6B5C45]",
                )}
                data-testid="fo-folio-status"
              >
                {folio.status === "open" ? "Open" : "Closed"}
              </span>
              {issued ? (
                <span
                  className="rounded-full bg-[#EFE8DC] px-2 py-0.5 text-[11px] font-semibold text-[#6B5C45]"
                  data-testid="fo-folio-invoice"
                >
                  Invoice {issued.issuedNumber}
                </span>
              ) : folio.legacyFolioInvoice ? (
                <span className="text-[11px] font-semibold text-[#6B5C45]">Invoiced</span>
              ) : null}
            </div>
            <FolioActionsMenu
              actions={FOLIO_BURGER_ACTIONS.map((item) => ({ ...item, state: stateFor(item.id) }))}
              onSelect={(id) => {
                if (id === "print_folio") {
                  window.print();
                  return;
                }
                if (id === "close_folio") {
                  if (stateFor("close_folio") === "enabled") setCloseOpen(true);
                  return;
                }
                if (id === "issue_invoice") {
                  void createInvoice();
                  return;
                }
                openEntry(id);
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 xl:grid-cols-4" data-testid="fo-folio-summary">
            {cards.map((card) => (
              <article
                key={card.id}
                className="flex h-[4.25rem] min-w-0 items-center gap-2.5 rounded-lg border border-[#DDD4C5] bg-white px-2.5 py-2 shadow-sm"
                data-testid={`fo-folio-card-${card.id}`}
              >
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", kpiTone(card.id, card.amount))}>
                  <CardIcon id={card.id} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-medium text-[#756A5B]">{card.label}</p>
                  <p className="font-display text-lg font-semibold leading-tight tracking-tight text-[#251605]">
                    {money(card.amount)}
                  </p>
                </div>
              </article>
            ))}
          </div>

          <div className={ROOM_TABLE_WRAP}>
            <div
              className="flex gap-1 overflow-x-auto border-b border-[#DDD4C5] px-2"
              role="tablist"
            >
              {FO_FOLIO_SECTIONS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={section === item.id}
                  data-testid={`fo-folio-section-${item.id}`}
                  className={cn(
                    "shrink-0 border-b-2 px-3 py-2 text-xs font-medium",
                    section === item.id
                      ? "border-[#C89933] text-[#251605]"
                      : "border-transparent text-muted-foreground",
                  )}
                  onClick={() => setSection(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {section === "invoices" ? (
              <InvoiceList invoices={folio.issuedInvoices} legacy={folio.legacyFolioInvoice} />
            ) : (
              <TransactionTable
                rows={foFolioSectionRows(folio.transactions, section)}
                money={money}
              />
            )}
          </div>

          <FolioEntryDialog
            restaurantId={restaurantId}
            folioId={folio.id}
            type={entryType}
            open={entryType !== null}
            sources={folio.transactions}
            depositPolicySummary={depositPolicyQuery.data?.summary ?? null}
            currentBalance={workspace.financialSummary.currentBalance}
            currencyCode={folio.currency}
            guestName={guestName}
            folioNumber={folio.folioNumber}
            confirmationNumber={confirmationNumber}
            roomNumber={roomNumber}
            authorizerNote={correctionQuery.data?.authorizer ?? null}
            thresholdNote={
              entryType === "adjustment"
                ? (correctionQuery.data?.adjustmentThreshold ?? null)
                : entryType === "discount"
                  ? (correctionQuery.data?.discountThreshold ?? null)
                  : null
            }
            onClose={() => setEntryType(null)}
            onDone={refresh}
          />
          <CloseFolioDialog
            restaurantId={restaurantId}
            folioId={folio.id}
            balance={workspace.financialSummary.currentBalance}
            open={closeOpen}
            onClose={() => setCloseOpen(false)}
            onDone={refresh}
          />
        </>
      ) : null}
    </div>
  );
}

type FoFolioSummaryCardId = "charges" | "payments" | "balance" | "deposits";

function kpiTone(id: FoFolioSummaryCardId, amount: number): string {
  if (id === "charges") return "bg-amber-100 text-amber-800";
  if (id === "payments") return "bg-emerald-100 text-emerald-800";
  if (id === "deposits") return "bg-teal-100 text-teal-800";
  return amount > 0 ? "bg-red-100 text-red-700" : "bg-[#EFE8DC] text-[#6B5C45]";
}

function CardIcon({ id }: { id: FoFolioSummaryCardId }) {
  const className = "size-3.5";
  if (id === "charges") return <Receipt className={className} />;
  if (id === "payments") return <CreditCard className={className} />;
  if (id === "deposits") return <Landmark className={className} />;
  return <Wallet className={className} />;
}

function FolioActionsMenu({
  actions,
  onSelect,
}: {
  actions: Array<{ id: FoFolioActionId; label: string; state: FoFolioActionState }>;
  onSelect: (id: FoFolioActionId) => void;
}) {
  const visible = actions.filter((item) => item.state !== "hidden");
  if (visible.length === 0) return null;
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={SHELL_ICON_BUTTON}
              aria-label="Folio actions"
              data-testid="fo-folio-more"
            >
              <Menu className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Folio actions</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        {visible.map((item) => (
          <DropdownMenuItem
            key={item.id}
            disabled={item.state === "disabled"}
            data-testid={`fo-folio-more-${item.id}`}
            onSelect={() => onSelect(item.id)}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TransactionTable({
  rows,
  money,
}: {
  rows: FolioTransactionRow[];
  money: (value: number) => string;
}) {
  if (rows.length === 0) {
    return <p className="px-3 py-4 text-sm text-muted-foreground">No lines in this section.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className={ROOM_TABLE_HEAD}>
          <tr>
            <th className={ROOM_TABLE_TH}>Date</th>
            <th className={ROOM_TABLE_TH}>Type</th>
            <th className={ROOM_TABLE_TH}>Description</th>
            <th className={ROOM_TABLE_TH}>Qty</th>
            <th className={`${ROOM_TABLE_TH} text-right`}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const meta = folioLineMeta(row);
            return (
              <tr key={row.id} className={ROOM_TABLE_ROW}>
                <td className={`${ROOM_TABLE_TD} whitespace-nowrap`}>
                  {formatStayDate(row.postedAt.slice(0, 10))}
                </td>
                <td className={ROOM_TABLE_TD}>{labelTransactionType(row.type)}</td>
                <td className={ROOM_TABLE_TD}>
                  <span>{folioLineDescription(row)}</span>
                  {meta ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">{meta}</span>
                  ) : null}
                </td>
                <td className={ROOM_TABLE_TD}>{row.quantity ?? "—"}</td>
                <td className={`${ROOM_TABLE_TD} text-right`}>{money(row.amount)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function InvoiceList({
  invoices,
  legacy,
}: {
  invoices: Array<{ id: string; issuedNumber: string; issuedAt: string }>;
  legacy: boolean;
}) {
  if (invoices.length === 0) {
    return (
      <p className="px-3 py-4 text-sm text-muted-foreground">
        {legacy ? "This folio has a legacy invoice." : "No invoice has been issued."}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-[#E8E1D7]">
      {invoices.map((invoice) => (
        <li key={invoice.id} className="flex items-center justify-between px-3 py-2 text-sm">
          <span className="font-medium">{invoice.issuedNumber}</span>
          <span className="text-xs text-muted-foreground">
            {formatStayDate(invoice.issuedAt.slice(0, 10))}
          </span>
        </li>
      ))}
    </ul>
  );
}

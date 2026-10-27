import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, Landmark, MoreHorizontal, Printer, Receipt, Wallet } from "lucide-react";
import { toast } from "sonner";

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
import { useMoney } from "@/core/state/property-format";
import {
  getCashieringCorrectionNotice,
  getDefaultDepositPolicy,
  getFolioWorkspace,
  getReservationFolio,
  type FolioTransactionRow,
} from "@/packages/pms/lib/cashiering.functions";
import { issueGuestFolioInvoice } from "@/packages/pms/lib/cashiering-invoices.functions";
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

const GOLD = "bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]";

const MORE_ACTIONS: Array<{ id: FoFolioActionId; label: string }> = [
  { id: "adjustment", label: "Post Adjustment" },
  { id: "discount", label: "Post Discount" },
  { id: "refund", label: "Post Refund" },
  { id: "issue_invoice", label: "Issue Invoice" },
  { id: "close_folio", label: "Close Folio" },
];

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
  roomTypeName,
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchReservationFolio = useServerFn(getReservationFolio);
  const fetchWorkspace = useServerFn(getFolioWorkspace);
  const fetchDepositPolicy = useServerFn(getDefaultDepositPolicy);
  const fetchCorrectionNotice = useServerFn(getCashieringCorrectionNotice);
  const issueInvoice = useServerFn(issueGuestFolioInvoice);
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

  function openCashiering(tab?: "history") {
    if (!folio) return;
    void navigate({
      to: "/restaurant/pms/cashiering/folios/$folioId",
      params: { folioId: folio.id },
      ...(tab ? { search: { tab } } : {}),
    });
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
          <section className="rounded-xl border border-[#E8E1D7] bg-[#FBF7F0] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Receipt className="size-4 text-[#765719]" />
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
                <p className="mt-1 text-xs text-muted-foreground">
                  {[roomNumber ? `Room ${roomNumber}` : null, guestName, confirmationNumber]
                    .filter(Boolean)
                    .join(" · ")}
                  {roomTypeName ? ` · ${roomTypeName}` : ""}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="fo-folio-open-cashiering"
                onClick={() => openCashiering()}
              >
                Open in Cashiering
              </Button>
            </div>
          </section>

          <div className="grid grid-cols-2 gap-2 xl:grid-cols-4" data-testid="fo-folio-summary">
            {cards.map((card) => (
              <article
                key={card.id}
                className="rounded-xl border border-[#E8E1D7] bg-white p-3"
                data-testid={`fo-folio-card-${card.id}`}
              >
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  <CardIcon id={card.id} />
                  {card.label}
                </p>
                <p className="mt-1 font-display text-lg text-[#251605]">{money(card.amount)}</p>
              </article>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <FolioActionButton
              state={stateFor("post_charge")}
              label="Post Charge"
              testId="fo-folio-post-charge"
              className={GOLD}
              onClick={() => openEntry("post_charge")}
            />
            <FolioActionButton
              state={stateFor("record_payment")}
              label="Record Payment"
              testId="fo-folio-record-payment"
              onClick={() => openEntry("record_payment")}
            />
            <FolioActionButton
              state={stateFor("post_deposit")}
              label="Post Deposit"
              testId="fo-folio-post-deposit"
              onClick={() => openEntry("post_deposit")}
            />
            <FolioActionButton
              state={stateFor("print_folio")}
              label="Print Folio"
              testId="fo-folio-print"
              onClick={() => window.print()}
            />
            <MoreMenu
              actions={MORE_ACTIONS.map((item) => ({ ...item, state: stateFor(item.id) }))}
              onSelect={(id) => {
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

          <div className="rounded-xl border border-[#E8E1D7] bg-white">
            <div
              className="flex gap-1 overflow-x-auto border-b border-[#E8E1D7] px-2"
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
            <div className="border-t border-[#E8E1D7] px-3 py-2">
              <button
                type="button"
                className="text-xs font-medium text-[#765719]"
                data-testid="fo-folio-history"
                onClick={() => openCashiering("history")}
              >
                View Full Folio History
              </button>
            </div>
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

function CardIcon({ id }: { id: FoFolioSummaryCardId }) {
  const className = "size-3.5";
  if (id === "charges") return <Receipt className={className} />;
  if (id === "payments") return <CreditCard className={className} />;
  if (id === "deposits") return <Landmark className={className} />;
  return <Wallet className={className} />;
}

function FolioActionButton({
  state,
  label,
  testId,
  className,
  onClick,
}: {
  state: FoFolioActionState;
  label: string;
  testId: string;
  className?: string;
  onClick: () => void;
}) {
  if (state === "hidden") return null;
  return (
    <Button
      type="button"
      size="sm"
      variant={className ? "default" : "outline"}
      className={className}
      disabled={state === "disabled"}
      data-testid={testId}
      onClick={onClick}
    >
      {label === "Print Folio" ? <Printer className="mr-1 size-3.5" /> : null}
      {label}
    </Button>
  );
}

function MoreMenu({
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
      <DropdownMenuTrigger asChild>
        <Button type="button" size="sm" variant="outline" data-testid="fo-folio-more">
          <MoreHorizontal className="mr-1 size-3.5" />
          More
        </Button>
      </DropdownMenuTrigger>
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
        <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Description</th>
            <th className="px-3 py-2 font-medium">Qty</th>
            <th className="px-3 py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-[#E8E1D7]">
              <td className="px-3 py-2 whitespace-nowrap">
                {formatStayDate(row.postedAt.slice(0, 10))}
              </td>
              <td className="px-3 py-2">{labelTransactionType(row.type)}</td>
              <td className="px-3 py-2">
                <span>{row.description}</span>
                {row.paymentMethod || row.referenceType ? (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {paymentMethodLabel(row.paymentMethod) || row.referenceType}
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2">{row.quantity ?? "—"}</td>
              <td className="px-3 py-2 text-right">{money(row.amount)}</td>
            </tr>
          ))}
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

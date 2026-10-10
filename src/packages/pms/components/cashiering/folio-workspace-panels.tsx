import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Coins,
  CreditCard,
  Eye,
  FileText,
  Globe,
  Info,
  Printer,
  Landmark,
  Mail,
  MoreVertical,
  PanelRightClose,
  Percent,
  Phone,
  Receipt,
  ShieldAlert,
  SlidersHorizontal,
  Tag,
  TriangleAlert,
  Undo2,
  Wallet,
  WalletCards,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  InventoryState,
  InventoryStatusBadge,
} from "@/packages/pms/components/rooms/room-inventory-shared";
import {
  chargeDepartment,
  chargeItemTitle,
  chargeQuantity,
  chargeSourceLabel,
  chargeUnitAmount,
} from "@/packages/pms/components/cashiering/charge-details-sheet";
import {
  labelTransactionCategory,
  labelTransactionType,
} from "@/packages/pms/components/cashiering/folio-bits";
import {
  listCashierShifts,
  listFolioTenderHistory,
  postFolioEntry,
  type FolioTransactionRow,
  type FolioWorkspace,
} from "@/packages/pms/lib/cashiering.functions";
import {
  cashieringTenderOptions,
  emptyPolish1Snapshot,
} from "@/packages/pms/lib/pms-polish1-payment-admin";
import { usePmsSet1Foundation } from "@/packages/pms/lib/use-pms-set1";
import {
  allocateFolioDeposit,
  postSettlementWriteOff,
} from "@/packages/pms/lib/cashiering-phases.functions";
import { correctableGroupRemainder } from "@/packages/pms/lib/cashiering-transfer-allocate";
import { remainingOnPaymentSource } from "@/packages/pms/lib/cashiering.server";
import {
  balanceTone,
  chargeGroupRemainder,
  filterTenderRows,
  guestInitials,
  isParentTransferCharge,
  isTaxOrServiceCategory,
  projectedFolioBalance,
  roundFolioMoney,
  settlementCloseBlock,
  settlementPaymentDefault,
  stayNights,
  tenderDisplayState,
  type FolioChargeGroup,
  type FolioDepositLine,
  type FolioFinancialSummary,
  type FolioWorkspaceTabId,
  type TenderTypeFilter,
} from "@/packages/pms/lib/folio-workspace";
import { formatStayDate } from "@/packages/pms/lib/reservation-dates";
import { useMoney } from "@/core/state/property-format";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { cn } from "@/shared/lib/utils";

export type Money = (value: number) => string;
export type DateTimeFormat = (iso: string | null | undefined) => string;
export type CorrectionType = "adjustment" | "discount" | "refund";

export const CARD = "rounded-xl border border-[#E8E1D7] bg-card shadow-sm";
const TABLE_HEAD =
  "border-b border-[#E8E1D7] bg-[#F7F4EE] text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";
const TABLE_ROW = "border-b border-[#E8E1D7]/70 last:border-0 transition-colors hover:bg-[#F7F4EE]/60";
const LINK_ACTION =
  "inline-flex items-center gap-1 text-xs font-medium text-[#8a6a1f] hover:text-[#251605]";

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank transfer",
  mobile_money: "Mobile money",
  mobile_banking: "Mobile banking",
  other: "Other",
};

export function methodLabel(method: string | null | undefined): string {
  if (!method) return "—";
  const key = method.toLowerCase();
  return METHOD_LABEL[key] ?? titleCase(key);
}

function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function idempotencyKey(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

/** Credit balances read "− ETB 3,000.00" so the sign is never lost in a small font. */
export function formatBalance(money: Money, value: number): string {
  if (value < -0.009) return `− ${money(Math.abs(value))}`;
  return money(Math.abs(value) < 0.01 ? 0 : value);
}

export const BALANCE_META = {
  due: {
    label: "Outstanding",
    tone: "danger" as const,
    text: "text-destructive",
    tint: "bg-destructive/10 text-destructive",
    border: "border-destructive/25",
  },
  settled: {
    label: "Settled",
    tone: "success" as const,
    text: "text-emerald-700 dark:text-emerald-400",
    tint: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    border: "border-emerald-500/25",
  },
  credit: {
    label: "Credit Balance",
    tone: "info" as const,
    text: "text-blue-700 dark:text-blue-400",
    tint: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    border: "border-blue-500/25",
  },
};

/* ------------------------------------------------------------------ KPIs */

const KPI_TINT = {
  neutral: "bg-muted text-foreground/80",
  tax: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  payment: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  deposit: "bg-teal-500/10 text-teal-700 dark:text-teal-400",
  adjustment: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

function KpiCard({
  label,
  value,
  detail,
  icon: Icon,
  tint,
  className,
  valueClassName,
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tint: string;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn(CARD, "px-3 py-3", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", tint)}>
          <Icon className="size-3.5" />
        </span>
      </div>
      <p
        className={cn(
          "mt-1 truncate text-lg font-semibold tabular-nums tracking-tight",
          valueClassName,
        )}
      >
        {value}
      </p>
      <p className="truncate text-[10px] text-muted-foreground">{detail}</p>
    </div>
  );
}

export function FolioKpiRow({
  summary,
  money,
}: {
  summary: FolioFinancialSummary;
  money: Money;
}) {
  const balance = BALANCE_META[balanceTone(summary.currentBalance)];
  const netAdjustments = roundFolioMoney(
    summary.adjustments - summary.discounts + summary.refunds,
  );
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6" data-testid="folio-kpis">
      <KpiCard
        label="Net Charges"
        value={money(summary.netCharges)}
        detail="Before tax & service"
        icon={Coins}
        tint={KPI_TINT.neutral}
      />
      <KpiCard
        label="Tax & Service"
        value={money(roundFolioMoney(summary.tax + summary.serviceCharge))}
        detail={`Tax ${money(summary.tax)} · Service ${money(summary.serviceCharge)}`}
        icon={Percent}
        tint={KPI_TINT.tax}
      />
      <KpiCard
        label="Payments"
        value={money(summary.payments)}
        detail="Received on folio"
        icon={CreditCard}
        tint={KPI_TINT.payment}
      />
      <KpiCard
        label="Deposits"
        value={money(summary.deposits)}
        detail="Deposit credits"
        icon={Landmark}
        tint={KPI_TINT.deposit}
      />
      <KpiCard
        label="Adjustments"
        value={money(netAdjustments)}
        detail="Adjustments, discounts, refunds"
        icon={SlidersHorizontal}
        tint={KPI_TINT.adjustment}
      />
      <KpiCard
        label="Current Balance"
        value={formatBalance(money, summary.currentBalance)}
        detail={balance.label}
        icon={Wallet}
        tint={balance.tint}
        className={cn("border-l-[3px]", balance.border)}
        valueClassName={cn("text-xl", balance.text)}
      />
    </div>
  );
}

/* --------------------------------------------------------------- shared */

function SectionCard({
  title,
  description,
  action,
  children,
  testId,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section className={cn(CARD, "overflow-hidden")} data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E8E1D7] px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Th({ children, right }: { children?: ReactNode; right?: boolean }) {
  return (
    <th className={cn("whitespace-nowrap px-3 py-2.5 font-medium", right ? "text-right" : "text-left")}>
      {children}
    </th>
  );
}

function TableScroll({ children, minWidth = "min-w-[760px]" }: { children: ReactNode; minWidth?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full text-sm", minWidth)}>{children}</table>
    </div>
  );
}

function EmptyCompact({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-6 text-center">
      <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <p className="text-xs text-muted-foreground">{title}</p>
    </div>
  );
}

function rowLabel(row: FolioTransactionRow): string {
  return isTaxOrServiceCategory(row.category) || row.type === "charge"
    ? labelTransactionCategory(row.category)
    : labelTransactionType(row.type);
}

/* ------------------------------------------------------------- Charges */

export type RowActions = {
  onDetails: (row: FolioTransactionRow) => void;
  onTransfer: (row: FolioTransactionRow) => void;
  onCorrect: (type: CorrectionType, row: FolioTransactionRow) => void;
  onCorrectCharge: (row: FolioTransactionRow) => void;
  onPrintReceipt?: (row: FolioTransactionRow) => void;
};

function legalCorrections(
  row: FolioTransactionRow,
  rows: FolioTransactionRow[],
  workspace: FolioWorkspace,
): CorrectionType[] {
  const caps = workspace.capabilities;
  const out: CorrectionType[] = [];
  if (
    caps.canRefund &&
    (row.type === "payment" || row.type === "deposit") &&
    (remainingOnPaymentSource(row, rows) ?? 0) > 0.009
  )
    out.push("refund");
  return out;
}

const CORRECTION_ITEM: Record<CorrectionType, { label: string; icon: LucideIcon; className: string }> = {
  adjustment: { label: "Post Adjustment", icon: SlidersHorizontal, className: "text-amber-700" },
  discount: { label: "Apply Discount", icon: Tag, className: "text-purple-700" },
  refund: { label: "Refund", icon: Undo2, className: "text-destructive" },
};

function RowMenu({
  row,
  workspace,
  actions,
  onApply,
}: {
  row: FolioTransactionRow;
  workspace: FolioWorkspace;
  actions: RowActions;
  onApply?: (row: FolioTransactionRow) => void;
}) {
  const rows = workspace.folio.transactions;
  const corrections = legalCorrections(row, rows, workspace);
  const depositLine = workspace.depositLines.find((line) => line.transaction.id === row.id);
  const canApply =
    Boolean(onApply) &&
    row.type === "deposit" &&
    workspace.canManage &&
    workspace.folio.status === "open" &&
    (depositLine?.available ?? 0) > 0.009;
  const refundLabel = row.type === "deposit" ? "Refund Deposit" : "Refund Payment";
  const canTransfer =
    workspace.capabilities.canTransfer &&
    isParentTransferCharge(row) &&
    chargeGroupRemainder(row.id, rows).grossRemaining > 0.009;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          aria-label="Line actions"
        >
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={() => actions.onDetails(row)}>
          <Eye className="size-4" /> View Details
        </DropdownMenuItem>
        {(row.type === "payment" || row.type === "deposit") && actions.onPrintReceipt ? (
          <DropdownMenuItem onSelect={() => actions.onPrintReceipt?.(row)}>
            <Printer className="size-4" /> Print receipt
          </DropdownMenuItem>
        ) : null}
        {canTransfer ? (
          <DropdownMenuItem onSelect={() => actions.onTransfer(row)}>
            <ArrowLeftRight className="size-4" /> Transfer Charge
          </DropdownMenuItem>
        ) : null}
        {workspace.capabilities.canAdjust &&
        isParentTransferCharge(row) &&
        correctableGroupRemainder(row.id, rows).grossRemaining > 0.009 ? (
          <DropdownMenuItem onSelect={() => actions.onCorrectCharge(row)}>
            <SlidersHorizontal className="size-4 text-amber-700" /> Correct Charge
          </DropdownMenuItem>
        ) : null}
        {canApply ? (
          <DropdownMenuItem onSelect={() => onApply?.(row)}>
            <WalletCards className="size-4" /> Apply deposit
          </DropdownMenuItem>
        ) : null}
        {corrections.length === 1 && corrections[0] === "refund" ? (
          <DropdownMenuItem onSelect={() => actions.onCorrect("refund", row)}>
            <Undo2 className="size-4 text-destructive" /> {refundLabel}
          </DropdownMenuItem>
        ) : corrections.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ShieldAlert className="size-4 text-amber-700" /> Correct
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {corrections.map((type) => {
                  const item = CORRECTION_ITEM[type];
                  const Icon = item.icon;
                  return (
                    <DropdownMenuItem key={type} onSelect={() => actions.onCorrect(type, row)}>
                      <Icon className={cn("size-4", item.className)} /> {item.label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ChargeRow({
  row,
  child,
  net,
  taxService,
  total,
  workspace,
  money,
  dateTime,
  actions,
  selected,
}: {
  row: FolioTransactionRow;
  child?: boolean;
  net: number | null;
  taxService: number | null;
  total: number | null;
  workspace: FolioWorkspace;
  money: Money;
  dateTime: DateTimeFormat;
  actions: RowActions;
  selected?: boolean;
}) {
  const source = child ? null : chargeSourceLabel(row);
  const department = child ? null : chargeDepartment(row);
  const quantity = child ? null : chargeQuantity(row);
  const unitAmount = child ? null : chargeUnitAmount(row);
  return (
    <tr
      className={cn(
        TABLE_ROW,
        child ? "bg-muted/10 text-xs text-muted-foreground" : "cursor-pointer text-foreground",
        selected && "bg-[#C89933]/8 hover:bg-[#C89933]/10",
      )}
      onClick={child ? undefined : () => actions.onDetails(row)}
      data-selected={selected ? "true" : undefined}
    >
      <td
        className={cn(
          "whitespace-nowrap px-3 py-2 text-xs text-muted-foreground",
          selected && "border-l-2 border-l-[#C89933]",
        )}
      >
        {child ? "" : dateTime(row.postedAt)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
        {child ? "" : (department ?? "—")}
      </td>
      <td className={cn("px-3 py-2", child ? "pl-7 text-muted-foreground" : "font-medium")}>
        {child ? (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="text-muted-foreground/70">↳</span>
            {row.description}
          </span>
        ) : (
          <span className="block">
            <span className="block">{chargeItemTitle(row)}</span>
            {source ? (
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {source}
              </span>
            ) : null}
          </span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right text-xs tabular-nums">
        {child ? "" : quantity == null ? "—" : String(quantity)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right text-xs tabular-nums">
        {child ? "" : unitAmount == null ? "—" : money(unitAmount)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
        {net === null ? "" : money(net)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
        {taxService === null || (!child && taxService === 0) ? (
          <span className="text-muted-foreground/60">{taxService === 0 ? "—" : ""}</span>
        ) : (
          money(taxService)
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">
        {total === null ? "" : money(total)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
        {child ? "" : (row.postedBy ?? "—")}
      </td>
      <td className="px-1 py-1 text-right" onClick={(event) => event.stopPropagation()}>
        {child ? null : <RowMenu row={row} workspace={workspace} actions={actions} />}
      </td>
    </tr>
  );
}

export function ChargesTab({
  workspace,
  money,
  dateTime,
  actions,
  selectedChargeId,
  onPostCharge,
  onPostAdjustment,
  onTransferCharge,
  onGoTab,
}: {
  workspace: FolioWorkspace;
  money: Money;
  dateTime: DateTimeFormat;
  actions: RowActions;
  selectedChargeId: string | null;
  onPostCharge: () => void;
  onPostAdjustment: () => void;
  onTransferCharge: () => void;
  onGoTab: (tab: FolioWorkspaceTabId) => void;
}) {
  const caps = workspace.capabilities;
  const groups = workspace.chargeGroups;
  const totals = groups.reduce(
    (acc, group) => ({
      net: acc.net + (isTaxOrServiceCategory(group.parent.category) ? 0 : group.net),
      taxService:
        acc.taxService +
        (isTaxOrServiceCategory(group.parent.category) ? group.net : group.taxService),
      total: acc.total + group.total,
    }),
    { net: 0, taxService: 0, total: 0 },
  );
  const hasMore = caps.canAdjust || (caps.canTransfer && groups.length > 0);
  return (
    <div className="space-y-4">
      <SectionCard
        title="Charges"
        description="Review posted charges, tax and service amounts for this folio."
        testId="folio-charges"
        action={
          <div className="flex items-center gap-2">
            {caps.canPostCharge ? (
              <Button
                size="sm"
                className="h-8 bg-[#C89933] text-[#251605] hover:bg-[#B5882D]"
                onClick={onPostCharge}
              >
                + Post Charge
              </Button>
            ) : null}
            {hasMore ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="h-8">
                    More ▾
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {caps.canAdjust ? (
                    <DropdownMenuItem onSelect={onPostAdjustment}>
                      <SlidersHorizontal className="size-4 text-amber-700" /> Post adjustment
                    </DropdownMenuItem>
                  ) : null}
                  {caps.canTransfer && groups.length > 0 ? (
                    <DropdownMenuItem onSelect={onTransferCharge}>
                      <ArrowLeftRight className="size-4" /> Transfer a charge
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        }
      >
        {groups.length === 0 ? (
          <div className="p-4">
            <InventoryState
              state="empty"
              title="No charges posted"
              description="Room and manual charges appear here once posted to this folio."
            />
          </div>
        ) : (
          <TableScroll>
            <thead className={TABLE_HEAD}>
              <tr>
                <Th>Posted</Th>
                <Th>Department</Th>
                <Th>Charge item</Th>
                <Th right>Qty</Th>
                <Th right>Unit price</Th>
                <Th right>Net</Th>
                <Th right>Tax / Service</Th>
                <Th right>Total</Th>
                <Th>Posted by</Th>
                <th className="w-10" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {groups.map((group: FolioChargeGroup) => (
                <ChargeGroupRows
                  key={group.parent.id}
                  group={group}
                  workspace={workspace}
                  money={money}
                  dateTime={dateTime}
                  actions={actions}
                  selectedChargeId={selectedChargeId}
                />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[#E8E1D7] bg-muted/20 text-sm font-semibold">
                <td className="px-3 py-2.5" colSpan={5}>
                  Total charges
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {money(roundFolioMoney(totals.net))}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {money(roundFolioMoney(totals.taxService))}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {money(roundFolioMoney(totals.total))}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </TableScroll>
        )}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Recent Payments"
          action={
            <button type="button" className={LINK_ACTION} onClick={() => onGoTab("payments")}>
              View all <ArrowRight className="size-3" />
            </button>
          }
        >
          {workspace.recentPayments.length === 0 ? (
            <EmptyCompact icon={CreditCard} title="No payments received yet." />
          ) : (
            <ul className="divide-y divide-[#E8E1D7]/80">
              {workspace.recentPayments.map((row) => (
                <li key={row.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700">
                    <CreditCard className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{methodLabel(row.paymentMethod)}</p>
                    <p className="text-[11px] text-muted-foreground">{dateTime(row.postedAt)}</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">
                    {money(Math.abs(row.amount))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard
          title="Deposit Summary"
          action={
            <button type="button" className={LINK_ACTION} onClick={() => onGoTab("payments")}>
              Manage <ArrowRight className="size-3" />
            </button>
          }
        >
          <DepositTotals summary={workspace.depositSummary} money={money} />
        </SectionCard>
      </div>
    </div>
  );
}

function ChargeGroupRows({
  group,
  workspace,
  money,
  dateTime,
  actions,
  selectedChargeId,
}: {
  group: FolioChargeGroup;
  workspace: FolioWorkspace;
  money: Money;
  dateTime: DateTimeFormat;
  actions: RowActions;
  selectedChargeId: string | null;
}) {
  const taxOnly = isTaxOrServiceCategory(group.parent.category);
  return (
    <>
      <ChargeRow
        row={group.parent}
        net={taxOnly ? null : group.net}
        taxService={taxOnly ? group.net : group.taxService}
        total={group.total}
        workspace={workspace}
        money={money}
        dateTime={dateTime}
        actions={actions}
        selected={group.parent.id === selectedChargeId}
      />
      {group.children.map((child) => (
        <ChargeRow
          key={child.id}
          row={child}
          child
          net={null}
          taxService={child.amount}
          total={null}
          workspace={workspace}
          money={money}
          dateTime={dateTime}
          actions={actions}
        />
      ))}
    </>
  );
}

function DepositTotals({
  summary,
  money,
}: {
  summary: FolioWorkspace["depositSummary"];
  money: Money;
}) {
  const items: Array<{ label: string; value: number; icon: LucideIcon; tint: string }> = [
    { label: "Received", value: summary.received, icon: ArrowDownToLine, tint: KPI_TINT.deposit },
    { label: "Applied", value: summary.applied, icon: CheckCircle2, tint: KPI_TINT.neutral },
    { label: "Available", value: summary.available, icon: WalletCards, tint: KPI_TINT.tax },
  ];
  return (
    <div>
      <div className="grid grid-cols-3 divide-x divide-[#E8E1D7]/80">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="px-4 py-3">
              <div className="flex items-center gap-1.5">
                <span className={cn("flex size-5 items-center justify-center rounded-md", item.tint)}>
                  <Icon className="size-3" />
                </span>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {item.label}
                </p>
              </div>
              <p className="mt-1 text-base font-semibold tabular-nums">{money(item.value)}</p>
            </div>
          );
        })}
      </div>
      {summary.available > 0.009 ? (
        <p className="flex items-center gap-1.5 border-t border-[#E8E1D7]/80 bg-blue-500/5 px-4 py-2 text-[11px] text-blue-800 dark:text-blue-300">
          <span className="size-1.5 rounded-full bg-blue-500" />
          {money(summary.available)} deposit credit is available to apply.
        </p>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------- Payments & Deposits */

const TENDER_STATE_CLASS: Record<string, string> = {
  Posted: "border-[#E8E1D7] bg-muted/40 text-muted-foreground",
  Unapplied: "border-blue-500/20 bg-blue-500/10 text-blue-800",
  "Partially applied": "border-amber-500/20 bg-amber-500/10 text-amber-800",
  "Partially refunded": "border-amber-500/20 bg-amber-500/10 text-amber-800",
  "Fully applied": "border-emerald-500/20 bg-emerald-500/10 text-emerald-800",
  Refunded: "border-destructive/20 bg-destructive/10 text-destructive",
};

function TenderStateBadge({ state }: { state: string | null }) {
  if (!state) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium",
        TENDER_STATE_CLASS[state] ?? TENDER_STATE_CLASS.Posted,
      )}
    >
      {state}
    </span>
  );
}

export function PaymentsDepositsTab({
  workspace,
  money,
  dateTime,
  actions,
  onReceivePayment,
  onAddDeposit,
  onAllocate,
}: {
  workspace: FolioWorkspace;
  money: Money;
  dateTime: DateTimeFormat;
  actions: RowActions;
  onReceivePayment: () => void;
  onAddDeposit: () => void;
  onAllocate: (line: FolioDepositLine) => void;
}) {
  const caps = workspace.capabilities;
  const [search, setSearch] = useState("");
  const [type, setType] = useState<TenderTypeFilter>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const depositById = useMemo(() => {
    const map = new Map<string, FolioDepositLine>();
    for (const line of workspace.depositLines) map.set(line.transaction.id, line);
    return map;
  }, [workspace.depositLines]);
  const rows = useMemo(
    () =>
      filterTenderRows(workspace.folio.transactions, { search, type, from, to }).sort((a, b) =>
        a.postedAt < b.postedAt ? 1 : -1,
      ),
    [workspace.folio.transactions, search, type, from, to],
  );
  const unapplied = workspace.depositLines.filter((line) => line.available > 0.009);
  const applyRow = (row: FolioTransactionRow) => {
    const line = depositById.get(row.id);
    if (line) onAllocate(line);
  };

  return (
    <div className="space-y-4" data-testid="payments-deposits">
      <section className={cn(CARD, "overflow-hidden")}>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#E8E1D7] px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
            <div className="min-w-[180px] flex-1">
              <Label htmlFor="tender-search" className="text-[11px] text-muted-foreground">
                Search
              </Label>
              <Input
                id="tender-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Notes, method, or posted by"
                className="h-8"
              />
            </div>
            <div className="w-[140px]">
              <Label className="text-[11px] text-muted-foreground">Type</Label>
              <Select value={type} onValueChange={(value) => setType(value as TenderTypeFilter)}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="payment">Payment</SelectItem>
                  <SelectItem value="deposit">Deposit</SelectItem>
                  <SelectItem value="refund">Refund</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="tender-from" className="text-[11px] text-muted-foreground">
                From
              </Label>
              <Input
                id="tender-from"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="h-8 w-[148px]"
              />
            </div>
            <div>
              <Label htmlFor="tender-to" className="text-[11px] text-muted-foreground">
                To
              </Label>
              <Input
                id="tender-to"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="h-8 w-[148px]"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {caps.canPostPayment ? (
              <Button size="sm" className="h-8" onClick={onReceivePayment}>
                Receive Payment
              </Button>
            ) : null}
            {caps.canPostDeposit ? (
              <Button size="sm" variant="outline" className="h-8" onClick={onAddDeposit}>
                Record Deposit
              </Button>
            ) : null}
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyCompact icon={CreditCard} title="No payments, deposits, or refunds match." />
        ) : (
          <TableScroll minWidth="min-w-[860px]">
            <thead className={TABLE_HEAD}>
              <tr>
                <Th>Date</Th>
                <Th>Type</Th>
                <Th>Method</Th>
                <Th>Notes</Th>
                <Th right>Amount</Th>
                <Th right>Remaining</Th>
                <Th>Status</Th>
                <Th>Posted by</Th>
                <th className="w-10" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const deposit = depositById.get(row.id) ?? null;
                const state = tenderDisplayState(row, workspace.folio.transactions, deposit);
                const refundable = remainingOnPaymentSource(row, workspace.folio.transactions);
                const remaining =
                  row.type === "deposit"
                    ? (deposit?.available ?? null)
                    : row.type === "payment"
                      ? refundable
                      : null;
                return (
                  <tr key={row.id} className={TABLE_ROW}>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                      {dateTime(row.postedAt)}
                    </td>
                    <td className="px-3 py-2 text-xs font-medium">{labelTransactionType(row.type)}</td>
                    <td className="px-3 py-2 text-xs">{methodLabel(row.paymentMethod)}</td>
                    <td className="max-w-[220px] truncate px-3 py-2 text-xs">{row.description}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">
                      {money(Math.abs(row.amount))}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {remaining == null ? "—" : money(remaining)}
                    </td>
                    <td className="px-3 py-2">
                      <TenderStateBadge state={state} />
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{row.postedBy ?? "—"}</td>
                    <td className="px-1 py-1 text-right">
                      <RowMenu
                        row={row}
                        workspace={workspace}
                        actions={actions}
                        onApply={applyRow}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableScroll>
        )}
      </section>

      <section className={cn(CARD, "overflow-hidden")} data-testid="unapplied-deposits">
        <div className="border-b border-[#E8E1D7] px-4 py-3">
          <h3 className="text-sm font-semibold">Unapplied deposits</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Cash already on this folio. Applying a deposit to a charge does not change the balance.
          </p>
        </div>
        <DepositTotals summary={workspace.depositSummary} money={money} />
        {unapplied.length === 0 ? (
          <div className="border-t border-[#E8E1D7]/80">
            <EmptyCompact icon={Landmark} title="No unapplied deposit credit." />
          </div>
        ) : (
          <div className="border-t border-[#E8E1D7]">
            <TableScroll minWidth="min-w-[720px]">
              <thead className={TABLE_HEAD}>
                <tr>
                  <Th>Date</Th>
                  <Th>Notes</Th>
                  <Th right>Original</Th>
                  <Th right>Applied</Th>
                  <Th right>Remaining</Th>
                  <Th>Status</Th>
                  <th className="w-10" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {unapplied.map((line) => (
                  <tr key={line.transaction.id} className={TABLE_ROW}>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                      {dateTime(line.transaction.postedAt)}
                    </td>
                    <td className="px-3 py-2 text-xs">{line.transaction.description}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(line.received)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(line.applied)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {money(line.available)}
                    </td>
                    <td className="px-3 py-2">
                      <TenderStateBadge
                        state={tenderDisplayState(
                          line.transaction,
                          workspace.folio.transactions,
                          line,
                        )}
                      />
                    </td>
                    <td className="px-1 py-1 text-right">
                      <RowMenu
                        row={line.transaction}
                        workspace={workspace}
                        actions={actions}
                        onApply={applyRow}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableScroll>
          </div>
        )}
      </section>
    </div>
  );
}

/* ---------------------------------------------------------- Adjustments */

const CORRECTION_TONE: Record<string, string> = {
  adjustment: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  discount: "border-purple-500/20 bg-purple-500/10 text-purple-700 dark:text-purple-400",
  refund: "border-destructive/20 bg-destructive/10 text-destructive",
};

export function AdjustmentsTab({
  workspace,
  money,
  dateTime,
  actions,
}: {
  workspace: FolioWorkspace;
  money: Money;
  dateTime: DateTimeFormat;
  actions: RowActions;
}) {
  const rows = workspace.folio.transactions.filter(
    (row) => row.type === "adjustment" || row.type === "discount" || row.type === "refund",
  );
  return (
    <SectionCard
      title="Adjustments"
      description="Adjustments, discounts and refunds posted against this folio."
    >
      {rows.length === 0 ? (
        <EmptyCompact icon={SlidersHorizontal} title="No corrections posted." />
      ) : (
        <TableScroll>
          <thead className={TABLE_HEAD}>
            <tr>
              <Th>Date</Th>
              <Th>Type</Th>
              <Th>Original Transaction</Th>
              <Th>Description / Reason</Th>
              <Th right>Amount</Th>
              <Th>Posted By</Th>
              <th className="w-10" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={TABLE_ROW}>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                  {dateTime(row.postedAt)}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      "inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium",
                      CORRECTION_TONE[row.type],
                    )}
                  >
                    {row.referenceType === "settlement_write_off"
                      ? "Write-off"
                      : labelTransactionType(row.type)}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {row.sourceDescription ?? "—"}
                </td>
                <td className="px-3 py-2 font-medium">{row.description}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">
                  {money(row.amount)}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{row.postedBy ?? "—"}</td>
                <td className="px-1 py-1 text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 text-muted-foreground"
                    aria-label="View details"
                    onClick={() => actions.onDetails(row)}
                  >
                    <Eye className="size-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </TableScroll>
      )}
    </SectionCard>
  );
}

/* ------------------------------------------------------------ Transfers */

export function TransfersTab({
  workspace,
  money,
  dateTime,
  onTransferCharge,
}: {
  workspace: FolioWorkspace;
  money: Money;
  dateTime: DateTimeFormat;
  onTransferCharge: () => void;
}) {
  const folio = workspace.folio;
  const rows = folio.transactions.filter(
    (row) => row.type === "transfer_out" || row.type === "transfer_in",
  );
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = row.transferId ?? row.id;
    const bucket = groups.get(key) ?? [];
    bucket.push(row);
    groups.set(key, bucket);
  }
  const entries = [...groups.entries()].map(([id, lines]) => {
    const first = [...lines].sort((a, b) => a.postedAt.localeCompare(b.postedAt))[0];
    const out = lines.some((line) => line.type === "transfer_out");
    const other = first.transferId ? workspace.transferCounterparts[first.transferId] : undefined;
    const otherLabel = other?.accountName
      ? `${other.accountName}${other.accountNumber ? ` · ${other.accountNumber}` : ""}`
      : (other?.folioNumber ?? "—");
    const parentLine =
      lines.find((line) => line.sourceCharge && !isTaxOrServiceCategory(line.sourceCharge.category)) ??
      lines[0];
    const source = parentLine.sourceCharge;
    const charge = source?.description ?? parentLine.sourceDescription ?? parentLine.description;
    const detail = [
      source?.departmentName,
      source?.quantity != null ? `Qty ${source.quantity}` : null,
      source?.unitAmount != null ? money(source.unitAmount) : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      id,
      postedAt: first.postedAt,
      from: out ? folio.folioNumber : otherLabel,
      to: out ? otherLabel : folio.folioNumber,
      charge,
      detail,
      amount: Math.abs(roundFolioMoney(lines.reduce((sum, line) => sum + line.amount, 0))),
      postedBy: first.postedBy,
      reason: first.description,
    };
  });
  return (
    <SectionCard
      title="Transfers"
      description="Charges moved between guest folios."
      action={
        workspace.capabilities.canTransfer && workspace.chargeGroups.length > 0 ? (
          <Button size="sm" variant="outline" className="h-8" onClick={onTransferCharge}>
            <ArrowLeftRight className="size-4" /> Transfer a charge
          </Button>
        ) : null
      }
    >
      {rows.length === 0 ? (
        <EmptyCompact icon={ArrowLeftRight} title="No transfers on this folio." />
      ) : (
        <TableScroll>
          <thead className={TABLE_HEAD}>
              <tr>
                <Th>Date</Th>
                <Th>From</Th>
                <Th>To</Th>
                <Th>Charge / Description</Th>
                <Th right>Amount</Th>
                <Th>Posted by</Th>
                <Th>Reason</Th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className={TABLE_ROW}>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                    {dateTime(entry.postedAt)}
                  </td>
                  <td className="px-3 py-2">{entry.from}</td>
                  <td className="px-3 py-2">{entry.to}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className="block font-medium text-foreground">{entry.charge}</span>
                    {entry.detail ? (
                      <span className="text-muted-foreground">{entry.detail}</span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">
                    {money(entry.amount)}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{entry.postedBy ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{entry.reason}</td>
                </tr>
              ))}
          </tbody>
        </TableScroll>
      )}
    </SectionCard>
  );
}

/* ----------------------------------------------------------- Settlement */

export function SettlementTab({
  restaurantId,
  workspace,
  money,
  dateTime,
  onAllocate,
  onWriteOff,
  onClose,
  onPosted,
  onPrintStatement,
  onGoTab,
}: {
  restaurantId: string;
  workspace: FolioWorkspace;
  money: Money;
  dateTime: DateTimeFormat;
  onAllocate: () => void;
  onWriteOff: () => void;
  onClose: () => void;
  onPosted: () => void;
  onPrintStatement: () => void;
  onGoTab: (tab: FolioWorkspaceTabId) => void;
}) {
  const folio = workspace.folio;
  const summary = workspace.financialSummary;
  const caps = workspace.capabilities;
  const balance = summary.currentBalance;
  const meta = BALANCE_META[balanceTone(balance)];
  const open = folio.status === "open";
  const outstanding = settlementPaymentDefault(balance);
  const closeBlock = settlementCloseBlock(balance);
  const currency = folio.currency?.trim() || "ETB";
  const canAllocate =
    workspace.canManage && open && workspace.depositSummary.available > 0.009;
  const fetchShifts = useServerFn(listCashierShifts);
  const shifts = useQuery({
    queryKey: ["settlement-cashier-shifts", restaurantId],
    queryFn: () => fetchShifts({ data: { restaurantId } }),
  });
  const shiftOpen = (shifts.data ?? []).some((shift) => shift.status === "open");
  const payments = workspace.recentPayments;
  const writeOffs = folio.transactions
    .filter((row) => row.referenceType === "settlement_write_off")
    .slice()
    .sort((a, b) => (a.postedAt < b.postedAt ? 1 : -1))
    .slice(0, 5);

  return (
    <div className="space-y-4" data-testid="folio-settlement">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={meta.label}
          value={formatBalance(money, balance)}
          detail={open ? "Ledger balance" : "Financially closed"}
          icon={Wallet}
          tint={meta.tint}
          valueClassName={meta.text}
        />
        <KpiCard
          label="Deposits"
          value={money(summary.deposits)}
          detail="Already included in the balance"
          icon={WalletCards}
          tint={KPI_TINT.deposit}
        />
        <KpiCard
          label="Cashier shift"
          value={shiftOpen ? "Open" : "None"}
          detail="Informational. Posting is not blocked."
          icon={Coins}
          tint={KPI_TINT.neutral}
        />
        <KpiCard
          label="Folio status"
          value={open ? "Open" : "Closed"}
          detail={folio.closedAt ? `Closed ${dateTime(folio.closedAt)}` : "Accepting postings"}
          icon={FileText}
          tint={open ? KPI_TINT.tax : KPI_TINT.neutral}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <SectionCard
          title="Settlement summary"
          description="Posted ledger lines. Tax and service are the amounts already on the folio."
          testId="settlement-summary"
          action={
            <Button type="button" size="sm" variant="outline" onClick={onPrintStatement}>
              <Printer className="size-4" /> Print statement
            </Button>
          }
        >
          <div className="divide-y divide-[#E8E1D7] px-4 py-1 text-sm [&>div]:py-2">
            <SummaryLine label="Charges" value={money(summary.netCharges)} />
            <SummaryLine label="Tax" value={money(summary.tax)} />
            <SummaryLine label="Service charge" value={money(summary.serviceCharge)} />
            <SummaryLine label="Adjustments" value={formatBalance(money, summary.adjustments)} />
            <SummaryLine label="Discounts" value={`− ${money(summary.discounts)}`} />
            <SummaryLine label="Payments" value={`− ${money(summary.payments)}`} />
            <SummaryLine label="Deposits" value={`− ${money(summary.deposits)}`} />
            <SummaryLine label="Refunds" value={formatBalance(money, summary.refunds)} />
            <SummaryLine label="Transfers in" value={formatBalance(money, summary.transfersIn)} />
            <SummaryLine label="Transfers out" value={`− ${money(summary.transfersOut)}`} />
            <SummaryLine label={meta.label} value={formatBalance(money, balance)} />
          </div>
          {summary.deposits > 0.009 ? (
            <p className="border-t border-[#E8E1D7] px-4 py-3 text-xs text-muted-foreground">
              Deposits are already included in the folio balance. Applying a deposit only tracks allocation and does not reduce the balance again.
            </p>
          ) : null}
          {canAllocate ? (
            <div className="border-t border-[#E8E1D7] px-4 py-3">
              <Button type="button" size="sm" variant="outline" onClick={onAllocate}>
                <WalletCards className="size-4" /> Allocate deposit
              </Button>
            </div>
          ) : null}
          {payments.length > 0 ? (
            <div className="border-t border-[#E8E1D7] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Recent payments
              </p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {payments.map((row) => (
                  <li key={row.id} className="flex justify-between gap-3">
                    <span className="truncate">{row.description}</span>
                    <span className="shrink-0 tabular-nums">{money(Math.abs(row.amount))}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {writeOffs.length > 0 ? (
            <div className="border-t border-[#E8E1D7] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Write-offs
              </p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {writeOffs.map((row) => (
                  <li key={row.id} className="flex justify-between gap-3">
                    <span className="truncate">{row.description}</span>
                    <span className="shrink-0 tabular-nums">{formatBalance(money, row.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </SectionCard>

        <div className="space-y-4">
          {open && outstanding > 0 && caps.canPostPayment ? (
            <SettlementPaymentCard
              restaurantId={restaurantId}
              folioId={folio.id}
              balance={balance}
              currency={currency}
              guestName={folio.guestName}
              money={money}
              onPosted={onPosted}
            />
          ) : null}
          {open && Math.abs(balance) < 0.01 ? (
            <SectionCard title="Final payment" description="This folio is financially settled.">
              <p className="px-4 py-4 text-sm text-emerald-800">
                Settled {money(0)}. Post another payment only if a new charge is added first.
              </p>
            </SectionCard>
          ) : null}
          {open && balance < -0.009 ? (
            <SectionCard title="Final payment" description="Resolve the credit balance before closing.">
              <div className="space-y-3 px-4 py-4 text-sm">
                <p>
                  Credit balance {formatBalance(money, balance)}. A refund must name the original payment or deposit.
                </p>
                <Button type="button" size="sm" variant="outline" onClick={() => onGoTab("payments")}>
                  Open Payments & Deposits
                </Button>
              </div>
            </SectionCard>
          ) : null}
          {open && workspace.canManage ? (
            <SectionCard title="Routing" description="Company and group billing stays on Transfer / Routing.">
              <div className="px-4 py-4">
                <p className="text-sm text-muted-foreground">
                  Need to bill a company or group? Move the charges first. City ledger is not a payment method.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => onGoTab("transfers")}
                >
                  <ArrowLeftRight className="size-4" /> Use Transfer / Routing
                </Button>
              </div>
            </SectionCard>
          ) : null}
          {!open ? (
            <SectionCard title="Closed folio">
              <p className="px-4 py-4 text-sm text-muted-foreground">
                Closed{folio.closedAt ? ` ${dateTime(folio.closedAt)}` : ""}. New charges, payments, refunds, transfers and normal corrections cannot be posted.
              </p>
            </SectionCard>
          ) : null}
          {open && !workspace.canOperate ? (
            <p className="text-sm text-muted-foreground">Read-only access for your role.</p>
          ) : null}
        </div>
      </div>

      {open && workspace.canManage ? (
        <SectionCard
          title="Close folio"
          description="This action financially closes the folio. Guest checkout remains a Front Office action."
          testId="settlement-close"
          action={
            caps.canWriteOff ? (
              <Button type="button" size="sm" variant="outline" onClick={onWriteOff}>
                <SlidersHorizontal className="size-4" /> Post write-off
              </Button>
            ) : null
          }
        >
          <div className="space-y-3 px-4 py-4">
            {closeBlock ? (
              <p className="flex items-start gap-2 text-sm text-amber-800">
                <Info className="mt-0.5 size-4 shrink-0" />
                <span>
                  {closeBlock} Remaining balance must be settled before this folio can be closed.
                </span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Current balance is zero. Closing does not check the guest out or change the room.
              </p>
            )}
            <Button type="button" size="sm" disabled={!caps.canClose} onClick={onClose}>
              Close folio
            </Button>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}

function SettlementPaymentCard({
  restaurantId,
  folioId,
  balance,
  currency,
  guestName,
  money,
  onPosted,
}: {
  restaurantId: string;
  folioId: string;
  balance: number;
  currency: string;
  guestName: string;
  money: Money;
  onPosted: () => void;
}) {
  const outstanding = settlementPaymentDefault(balance);
  const [amount, setAmount] = useState(() => String(outstanding));
  const [method, setMethod] = useState("");
  const [receivedFrom, setReceivedFrom] = useState(guestName.trim());
  const [notes, setNotes] = useState("");
  const [payKey, setPayKey] = useState(() => idempotencyKey("pay"));
  const [posting, setPosting] = useState(false);
  const set1 = usePmsSet1Foundation(restaurantId);
  const tenders = cashieringTenderOptions({
    available: set1.data?.polish1?.paymentMethodsAvailable ?? false,
    methods: set1.data?.polish1?.paymentMethods ?? emptyPolish1Snapshot().paymentMethods,
  });
  const entered = Number(amount);
  const projected = projectedFolioBalance(balance, Number.isFinite(entered) ? entered : 0);
  const projectedTone = BALANCE_META[balanceTone(projected)];
  const post = useServerFn(postFolioEntry);

  useEffect(() => {
    setAmount(String(outstanding));
    setPayKey(idempotencyKey("pay"));
  }, [outstanding, folioId]);

  useEffect(() => {
    if (!tenders.some((row) => row.code === method)) setMethod(tenders[0]?.code ?? "");
  }, [tenders, method]);

  const mutation = useMutation({
    mutationFn: async () => {
      const value = Number(amount);
      if (!Number.isFinite(value) || value <= 0) throw new Error("Enter an amount greater than zero.");
      if (!method) throw new Error("Choose a payment method.");
      if (!receivedFrom.trim()) throw new Error("Enter who the money was received from.");
      if (!notes.trim()) throw new Error("Enter a note for this payment.");
      return post({
        data: {
          restaurantId,
          folioId,
          type: "payment",
          amount: value,
          description: notes.trim(),
          method,
          receivedFrom: receivedFrom.trim(),
          idempotencyKey: payKey,
        },
      });
    },
    onSuccess: (result) => {
      setPosting(false);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Payment posted");
      setNotes("");
      setPayKey(idempotencyKey("pay"));
      onPosted();
    },
    onError: (error: Error) => {
      setPosting(false);
      toast.error(error.message);
    },
  });

  return (
    <SectionCard
      title="Final payment"
      description="Posts one payment on this folio. A remaining balance is paid with another payment."
      testId="settlement-payment"
    >
      <form
        className="space-y-3 px-4 py-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (posting || mutation.isPending) return;
          setPosting(true);
          mutation.mutate();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="settlement-amount">Amount *</Label>
            <Input
              id="settlement-amount"
              className="mt-1.5"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="settlement-method">Payment method *</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="settlement-method" className="mt-1.5">
                <SelectValue placeholder="Choose a method" />
              </SelectTrigger>
              <SelectContent>
                {tenders.map((row) => (
                  <SelectItem key={row.code} value={row.code}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="settlement-from">Received from *</Label>
            <Input
              id="settlement-from"
              className="mt-1.5"
              value={receivedFrom}
              onChange={(event) => setReceivedFrom(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="settlement-notes">Notes *</Label>
            <Input
              id="settlement-notes"
              className="mt-1.5"
              maxLength={200}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Currency {currency}. Posting now.
        </p>
        <div className="rounded-xl border border-[#E8E1D7] bg-[#F7F4EE]/70 p-3 text-sm" data-testid="settlement-projected">
          <div className="flex justify-between gap-3">
            <span>Current balance</span>
            <span className="tabular-nums">{formatBalance(money, balance)}</span>
          </div>
          <div className="mt-1 flex justify-between gap-3">
            <span>Payment</span>
            <span className="tabular-nums">− {money(Number.isFinite(entered) && entered > 0 ? entered : 0)}</span>
          </div>
          <div className={cn("mt-2 flex justify-between gap-3 border-t border-[#E8E1D7] pt-2 font-medium", projectedTone.text)}>
            <span>{projectedTone.label}</span>
            <span className="tabular-nums">{formatBalance(money, projected)}</span>
          </div>
          {projected > 0.009 ? (
            <p className="mt-2 text-xs text-amber-800">
              Remaining balance must be settled before this folio can be closed.
            </p>
          ) : null}
          {projected < -0.009 ? (
            <p className="mt-2 text-xs text-blue-800">
              This payment will create a credit balance of {formatBalance(money, projected)}. A credit balance must be refunded or otherwise resolved before the folio can be closed.
            </p>
          ) : null}
        </div>
        <Button type="submit" size="sm" disabled={posting || mutation.isPending || tenders.length === 0}>
          {mutation.isPending ? "Posting..." : "Post payment"}
        </Button>
      </form>
    </SectionCard>
  );
}

/* -------------------------------------------------------------- Sidebar */

export function folioWarnings(workspace: FolioWorkspace, money: Money): string[] {
  const folio = workspace.folio;
  const balance = workspace.financialSummary.currentBalance;
  const warnings: string[] = [];
  if (folio.unsettledCheckout)
    warnings.push("Unsettled checkout exception. This folio is still open.");
  else if (folio.status === "open" && folio.reservationStatus === "checked_out")
    warnings.push("Guest has checked out but the folio is still open.");
  if (folio.status === "open" && balance > 0.009)
    warnings.push(`${money(balance)} outstanding balance on this folio.`);
  const invoice = folio.issuedInvoice;
  if (
    invoice &&
    invoice.snapshot.version < 2 &&
    Math.abs(invoice.snapshot.totals.balance - balance) > 0.009
  )
    warnings.push("Invoice issued, but the live folio has changed since issuance.");
  if (folio.status === "open" && workspace.depositSummary.available > 0.009)
    warnings.push(
      `${money(workspace.depositSummary.available)} deposit credit remains available to allocate.`,
    );
  return warnings;
}

function SidebarCard({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={cn(CARD, "p-4")}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {Icon ? <Icon className="size-3.5" /> : null}
          {title}
        </p>
        {action}
      </div>
      {children}
    </section>
  );
}

function SummaryLine({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums", muted ? "text-muted-foreground" : "font-medium")}>
        {value}
      </span>
    </div>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium">{value}</p>
    </div>
  );
}

export function FolioSidebar({
  workspace,
  money,
  dateTime,
  onViewInvoice,
  onClose,
}: {
  workspace: FolioWorkspace;
  money: Money;
  dateTime: DateTimeFormat;
  onViewInvoice: () => void;
  onClose?: () => void;
}) {
  const folio = workspace.folio;
  const s = workspace.financialSummary;
  const meta = BALANCE_META[balanceTone(s.currentBalance)];
  const nights = stayNights(folio.arrivalDate, folio.departureDate);
  const warnings = folioWarnings(workspace, money);
  const invoice = folio.issuedInvoice;
  const transfers = roundFolioMoney(s.transfersIn - s.transfersOut);
  const signed = (value: number) => (value === 0 ? money(0) : formatBalance(money, value));

  return (
    <aside className="space-y-3.5 lg:sticky lg:top-4" data-testid="folio-sidebar">
      {onClose ? (
        <div className="flex items-center justify-between rounded-xl border border-[#E8E1D7] bg-card px-3.5 py-2 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <PanelRightClose className="size-3.5 text-[#8a6a1f]" />
            <span>Folio Details</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-7 px-2 text-xs text-muted-foreground hover:bg-[#F7F4EE] hover:text-foreground"
            title="Hide panel to give tables full width"
          >
            <X className="mr-1 size-3.5" />
            <span>Hide</span>
          </Button>
        </div>
      ) : null}

      <section className={cn(CARD, "overflow-hidden")}>
        <div className="flex items-center justify-between gap-2 border-b border-[#E8E1D7] bg-[#F7F4EE]/60 px-4 py-2.5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#765719]">
            <span className="flex size-6 items-center justify-center rounded-md bg-[#C89933]/15 text-[#8a6a1f]">
              <Wallet className="size-3.5" />
            </span>
            Financial Summary
          </p>
          <span className="rounded-md border border-[#E8E1D7] bg-white px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {folio.currency}
          </span>
        </div>
        <div className="space-y-1.5 px-4 py-3">
          <SummaryLine label="Net Charges" value={money(s.netCharges)} />
          <SummaryLine label="Tax" value={money(s.tax)} muted={s.tax === 0} />
          <SummaryLine label="Service Charge" value={money(s.serviceCharge)} muted={s.serviceCharge === 0} />
        </div>
        <div className="space-y-1.5 border-t border-[#E8E1D7]/70 px-4 py-3">
          <SummaryLine label="Payments" value={signed(-s.payments)} muted={s.payments === 0} />
          <SummaryLine label="Deposits" value={signed(-s.deposits)} muted={s.deposits === 0} />
          <SummaryLine label="Adjustments" value={signed(s.adjustments)} muted={s.adjustments === 0} />
          <SummaryLine label="Discounts" value={signed(-s.discounts)} muted={s.discounts === 0} />
          <SummaryLine label="Refunds" value={money(s.refunds)} muted={s.refunds === 0} />
          {transfers !== 0 ? <SummaryLine label="Transfers" value={signed(transfers)} /> : null}
        </div>
        <div className="border-t border-[#E8E1D7] bg-[#F7F4EE]/40 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Current Balance
          </p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <p className={cn("text-xl font-semibold tabular-nums tracking-tight", meta.text)}>
              {formatBalance(money, s.currentBalance)}
            </p>
            <InventoryStatusBadge tone={meta.tone}>{meta.label}</InventoryStatusBadge>
          </div>
        </div>
      </section>

      <SidebarCard title="Guest">
        <div className="flex items-center gap-3">
          <Avatar className="size-9 shrink-0">
            <AvatarFallback className="bg-[#C89933]/15 text-xs font-semibold text-[#251605]">
              {guestInitials(folio.guestName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate font-medium">
              {folio.guestName}
              {folio.guestVip ? <InventoryStatusBadge tone="warning">VIP</InventoryStatusBadge> : null}
            </p>
            <p className="text-[11px] text-muted-foreground">Guest Profile</p>
          </div>
        </div>
        <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
          {folio.guestPhone ? (
            <p className="flex items-center gap-2 truncate">
              <Phone className="size-3.5 shrink-0 text-[#8a6a1f]" /> {folio.guestPhone}
            </p>
          ) : null}
          {folio.guestEmail ? (
            <p className="flex items-center gap-2 truncate">
              <Mail className="size-3.5 shrink-0 text-[#8a6a1f]" /> {folio.guestEmail}
            </p>
          ) : null}
          {folio.guestNationality ? (
            <p className="flex items-center gap-2 truncate">
              <Globe className="size-3.5 shrink-0 text-[#8a6a1f]" /> {folio.guestNationality}
            </p>
          ) : null}
        </div>
        {folio.guestId ? (
          <Button asChild variant="outline" size="sm" className="mt-3 h-8 w-full gap-1 border-[#E8E1D7] hover:bg-[#F7F4EE]">
            <Link
              to="/restaurant/pms/guests/$guestId"
              params={{ guestId: folio.guestId }}
              data-testid="folio-view-guest"
            >
              View Guest Profile <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        ) : null}
      </SidebarCard>

      {folio.reservationId ? (
        <SidebarCard title="Reservation">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 font-medium">
              <CalendarDays className="size-4 text-[#8a6a1f]" />
              {folio.confirmationNumber ?? "Reservation"}
            </p>
            {folio.roomNumber ? (
              <span className="rounded-md border border-[#E8E1D7] bg-[#F7F4EE] px-2 py-0.5 text-xs font-semibold text-[#251605]">
                Room {folio.roomNumber}
              </span>
            ) : null}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
            {folio.roomTypeName ? (
              <div className="col-span-2">
                <Field label="Room Type" value={folio.roomTypeName} />
              </div>
            ) : null}
            <div className="col-span-2">
              <Field
                label="Stay"
                value={
                  folio.arrivalDate && folio.departureDate
                    ? `${formatStayDate(folio.arrivalDate.slice(0, 10))} → ${formatStayDate(folio.departureDate.slice(0, 10))}${nights ? ` · ${nights} ${nights === 1 ? "night" : "nights"}` : ""}`
                    : "—"
                }
              />
            </div>
            <div className="col-span-2">
              <Field label="Rate Plan" value={folio.ratePlanName ?? folio.ratePlanCode ?? "Not configured"} />
            </div>
            <Field label="Market Segment" value={folio.marketSegment ?? "Not configured"} />
            <Field label="Booking Source" value={folio.bookingSource ?? "Not configured"} />
          </div>
          <Button asChild variant="outline" size="sm" className="mt-3 h-8 w-full gap-1 border-[#E8E1D7] hover:bg-[#F7F4EE]">
            <Link
              to="/restaurant/pms/reservations/$reservationId"
              params={{ reservationId: folio.reservationId }}
              data-testid="folio-view-reservation"
            >
              View Reservation <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </SidebarCard>
      ) : null}

      <SidebarCard title="Documents & Guarantee">
        {invoice ? (
          <div className="flex items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-700">
              <FileText className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-muted-foreground">Invoice</p>
              <p className="truncate text-sm font-semibold">{invoice.issuedNumber}</p>
              <p className="text-[11px] text-muted-foreground">Issued {dateTime(invoice.issuedAt)}</p>
              <button type="button" className={cn(LINK_ACTION, "mt-1.5")} onClick={onViewInvoice}>
                View Invoice <ArrowRight className="size-3" />
              </button>
            </div>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileText className="size-3.5" /> No issued invoice
          </p>
        )}
        {folio.guaranteeMethod ? (
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#E8E1D7]/80 pt-2.5 text-xs">
            <span className="text-muted-foreground">Guarantee Method</span>
            <span className="font-medium">{titleCase(folio.guaranteeMethod.toLowerCase())}</span>
          </div>
        ) : null}
      </SidebarCard>

      {warnings.length > 0 ? (
        <section
          className="rounded-xl border border-amber-500/30 bg-amber-50/60 p-4 shadow-sm dark:bg-amber-500/5"
          data-testid="folio-warnings"
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-300">
            <TriangleAlert className="size-4 text-amber-600" /> Needs Attention
          </p>
          <ul className="mt-2 space-y-1.5 text-xs text-amber-900/90 dark:text-amber-200">
            {warnings.map((warning) => (
              <li key={warning} className="flex gap-2">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-amber-600" />
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </aside>
  );
}

/* -------------------------------------------------------------- Dialogs */

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function historyLabel(eventType: string): string {
  if (eventType === "payment_received") return "Payment received";
  if (eventType === "deposit_received") return "Deposit received";
  if (eventType === "refund_posted") return "Refund posted";
  if (eventType.includes("alloc")) return "Deposit applied";
  return eventType.replace(/_/g, " ");
}

export function TransactionDetailDialog({
  restaurantId,
  folioId,
  row,
  rows,
  depositLine = null,
  money,
  dateTime,
  onClose,
  onViewReceipt,
}: {
  restaurantId?: string;
  folioId?: string;
  row: FolioTransactionRow | null;
  rows: FolioTransactionRow[];
  depositLine?: FolioDepositLine | null;
  money: Money;
  dateTime: DateTimeFormat;
  onClose: () => void;
  onViewReceipt?: (row: FolioTransactionRow) => void;
}) {
  const history = useServerFn(listFolioTenderHistory);
  const tender = row?.type === "payment" || row?.type === "deposit" || row?.type === "refund";
  const historyQuery = useQuery({
    queryKey: ["folio-tender-history", restaurantId, folioId, row?.id],
    queryFn: () => history({ data: { restaurantId: restaurantId!, folioId: folioId! } }),
    enabled: Boolean(tender && restaurantId && folioId && row),
  });
  const linked = row ? rows.filter((other) => other.originalTransactionId === row.id) : [];
  const refundable = row ? remainingOnPaymentSource(row, rows) : null;
  const refunded =
    row && refundable != null
      ? roundFolioMoney(Math.abs(row.amount) - refundable)
      : null;
  const state = row ? tenderDisplayState(row, rows, depositLine) : null;
  const events = (historyQuery.data ?? []).filter((event) => {
    if (!row) return false;
    return (
      event.transactionId === row.id ||
      event.depositTransactionId === row.id ||
      event.originalTransactionId === row.id
    );
  });
  const snapshot = row?.taxSnapshot as
    | { code?: string; name?: string; calculation?: string; amount?: number }
    | null
    | undefined;
  return (
    <Sheet open={row !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <SheetContent
        className="flex w-full max-w-none flex-col gap-0 overflow-hidden border-[#E8E1D7] bg-card p-0 sm:w-[70vw] sm:max-w-[70vw] md:max-w-[460px]"
        data-testid="tender-details-sheet"
      >
        <header className="flex items-start gap-3 border-b border-[#E8E1D7] bg-[#F7F4EE]/80 px-6 py-4.5 pr-12 text-left">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#C89933]/15 text-[#8a6a1f] shadow-xs">
            <Receipt className="size-5" />
          </span>
          <div className="min-w-0">
            <SheetTitle className="text-base font-semibold leading-tight text-[#251605]">
              {row ? rowLabel(row) : "Line Details"}
            </SheetTitle>
            <SheetDescription className="mt-1 text-xs text-muted-foreground leading-normal">
              Posted lines stay immutable. A refund or adjustment is recorded as a new linked line.
            </SheetDescription>
          </div>
        </header>
        {row ? (
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <dl className="space-y-1.5 text-sm">
              <DetailRow
                label="Amount"
                value={money(
                  row.type === "payment" || row.type === "deposit" || row.type === "refund"
                    ? Math.abs(row.amount)
                    : row.amount,
                )}
              />
              <DetailRow label="Type" value={labelTransactionType(row.type)} />
              {state ? <DetailRow label="Status" value={state} /> : null}
              {row.paymentMethod ? (
                <DetailRow label="Method" value={methodLabel(row.paymentMethod)} />
              ) : null}
              <DetailRow label="Notes" value={row.description} />
              <DetailRow label="Posted" value={dateTime(row.postedAt)} />
              <DetailRow label="Posted by" value={row.postedBy ?? "—"} />
              {row.type === "deposit" && depositLine ? (
                <>
                  <DetailRow label="Applied" value={money(depositLine.applied)} />
                  <DetailRow label="Remaining" value={money(depositLine.available)} />
                </>
              ) : null}
              {refunded != null && refundable != null && (row.type === "payment" || row.type === "deposit") ? (
                <>
                  <DetailRow label="Refunded" value={money(refunded)} />
                  <DetailRow label="Refundable" value={money(refundable)} />
                </>
              ) : null}
              {row.sourceDescription ? (
                <DetailRow label="Source line" value={row.sourceDescription} />
              ) : null}
              {row.departmentName ? (
                <DetailRow label="Department" value={row.departmentName} />
              ) : null}
              {snapshot?.name || snapshot?.code ? (
                <DetailRow
                  label="Tax rule"
                  value={`${snapshot.name ?? snapshot.code}${snapshot.calculation ? ` · ${snapshot.calculation}` : ""}`}
                />
              ) : null}
            </dl>
            {linked.length > 0 ? (
              <div className="border-t border-[#E8E1D7] pt-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Linked lines</p>
                {linked.map((other) => (
                  <DetailRow key={other.id} label={rowLabel(other)} value={money(other.amount)} />
                ))}
              </div>
            ) : null}
            {tender ? (
              <div className="border-t border-[#E8E1D7] pt-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">History</p>
                {historyQuery.isLoading ? (
                  <p className="text-xs text-muted-foreground">Loading history…</p>
                ) : events.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No separate history events for this line.</p>
                ) : (
                  <ul className="space-y-2">
                    {events.map((event) => (
                      <li key={event.id} className="text-xs">
                        <span className="font-medium">
                          {historyLabel(event.eventType)}
                        </span>
                        <span className="text-muted-foreground"> · {dateTime(event.createdAt)}</span>
                        {event.notes ? (
                          <span className="mt-0.5 block text-muted-foreground">{event.notes}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
        <SheetFooter className="flex flex-row items-center justify-between border-t border-[#E8E1D7] px-5 py-3">
          {row && (row.type === "payment" || row.type === "deposit") && onViewReceipt ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onClose();
                onViewReceipt(row);
              }}
              className="border-[#E8E1D7] text-[#8a6a1f] hover:bg-[#F7F4EE]"
            >
              <Receipt className="mr-1.5 size-3.5" /> View Receipt
            </Button>
          ) : <div />}
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}


export function ApplyDepositDialog({
  restaurantId,
  workspace,
  initialDepositId,
  open,
  onClose,
  onDone,
}: {
  restaurantId: string;
  workspace: FolioWorkspace;
  initialDepositId: string | null;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const money = useMoney();
  const deposits = workspace.depositLines.filter((line) => line.available > 0.009);
  const charges = workspace.folio.transactions.filter((row) => row.type === "charge");
  const [depositId, setDepositId] = useState("");
  const [chargeId, setChargeId] = useState("");
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (!open) return;
    const first = deposits.find((line) => line.transaction.id === initialDepositId) ?? deposits[0];
    setDepositId(first?.transaction.id ?? "");
    setChargeId(charges[0]?.id ?? "");
    setAmount(first ? String(first.available) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialDepositId]);

  const selected = deposits.find((line) => line.transaction.id === depositId) ?? null;
  const allocate = useServerFn(allocateFolioDeposit);
  const mutation = useMutation({
    mutationFn: async () => {
      const value = Number(amount);
      if (!selected) throw new Error("Choose a deposit.");
      if (!chargeId) throw new Error("Choose a charge.");
      if (!Number.isFinite(value) || value <= 0) throw new Error("Enter an amount greater than zero.");
      if (value > selected.available + 0.001)
        throw new Error("Amount cannot exceed the available deposit.");
      return allocate({
        data: {
          restaurantId,
          depositTransactionId: selected.transaction.id,
          chargeTransactionId: chargeId,
          amount: value,
          idempotencyKey: idempotencyKey("alloc"),
        },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Deposit applied to charge");
      onDone();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100%-2rem)] max-w-[500px] flex-col gap-0 overflow-hidden rounded-2xl border border-[#E8E1D7] bg-card p-0 shadow-2xl sm:max-w-[500px]">
        <header className="flex items-start gap-3 border-b border-[#E8E1D7] bg-[#F7F4EE]/80 px-6 py-4.5 pr-12">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#C89933]/15 text-[#8a6a1f] shadow-xs">
            <WalletCards className="size-5" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-base font-semibold leading-tight text-[#251605]">
              Apply Deposit
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs text-muted-foreground leading-normal">
              Links available deposit credit to a charge on this folio. The folio balance does not change.
            </DialogDescription>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Deposit Credit
            </Label>
            <Select
              value={depositId}
              onValueChange={(val) => {
                setDepositId(val);
                const dep = deposits.find((d) => d.transaction.id === val);
                if (dep) setAmount(String(dep.available));
              }}
            >
              <SelectTrigger className="h-10 border-[#E8E1D7] bg-background">
                <SelectValue placeholder="Choose a deposit" />
              </SelectTrigger>
              <SelectContent className="border-[#E8E1D7]">
                {deposits.map((line) => (
                  <SelectItem key={line.transaction.id} value={line.transaction.id}>
                    {line.transaction.description} · Available: {money(line.available)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Target Charge Line
            </Label>
            <Select value={chargeId} onValueChange={setChargeId}>
              <SelectTrigger className="h-10 border-[#E8E1D7] bg-background">
                <SelectValue placeholder="Choose a charge" />
              </SelectTrigger>
              <SelectContent className="border-[#E8E1D7]">
                {charges.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.description} · {money(row.amount)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="alloc-amount" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Amount to Allocate
              </Label>
              {selected ? (
                <button
                  type="button"
                  onClick={() => setAmount(String(selected.available))}
                  className="text-xs font-medium text-[#8a6a1f] hover:underline"
                >
                  Max ({money(selected.available)})
                </button>
              ) : null}
            </div>
            <Input
              id="alloc-amount"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="h-10 border-[#E8E1D7] bg-background text-base font-semibold tabular-nums focus-visible:ring-[#C89933]"
            />
          </div>

          {selected ? (
            <div className="rounded-xl border border-[#E8E1D7] bg-[#F7F4EE]/70 p-3.5 space-y-2 text-xs">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Allocation Summary
              </p>
              <div className="divide-y divide-[#E8E1D7]/60 text-xs">
                <div className="flex justify-between py-1.5 text-muted-foreground">
                  <span>Available from deposit</span>
                  <span className="font-medium text-foreground tabular-nums">{money(selected.available)}</span>
                </div>
                <div className="flex justify-between py-1.5 text-muted-foreground">
                  <span>Amount applying</span>
                  <span className="font-semibold text-emerald-700 tabular-nums">
                    {Number.isFinite(Number(amount)) && Number(amount) > 0 ? money(Number(amount)) : "—"}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 font-medium">
                  <span className="text-foreground">Remaining deposit credit</span>
                  <span className="font-bold tabular-nums text-[#251605]">
                    {money(Math.max(0, selected.available - (Number.isFinite(Number(amount)) ? Number(amount) : 0)))}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2.5 border-t border-[#E8E1D7] bg-[#F7F4EE]/50 px-6 py-3.5">
          <Button variant="outline" onClick={onClose} className="border-[#E8E1D7] hover:bg-[#F7F4EE]">
            Cancel
          </Button>
          <Button
            disabled={mutation.isPending || !selected || !chargeId}
            onClick={() => mutation.mutate()}
            className="bg-[#C89933] text-[#251605] font-semibold hover:bg-[#b88928] shadow-sm disabled:opacity-50"
          >
            {mutation.isPending ? "Applying..." : "Apply Deposit"}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

export function WriteOffDialog({
  restaurantId,
  folioId,
  balance,
  open,
  onClose,
  onDone,
}: {
  restaurantId: string;
  folioId: string;
  balance: number;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const money = useMoney();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) {
      setAmount(balance > 0 ? String(roundFolioMoney(balance)) : "");
      setReason("");
    }
  }, [open, balance]);
  const post = useServerFn(postSettlementWriteOff);
  const mutation = useMutation({
    mutationFn: async () => {
      const value = Number(amount);
      if (!Number.isFinite(value) || value <= 0) throw new Error("Enter an amount greater than zero.");
      if (value > balance + 0.001) throw new Error("A write-off cannot exceed the balance.");
      if (!reason.trim()) throw new Error("Enter a reason.");
      return post({
        data: {
          restaurantId,
          folioId,
          amount: value,
          reason: reason.trim(),
          idempotencyKey: idempotencyKey("woff"),
        },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Write-off posted");
      onDone();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100%-2rem)] max-w-[480px] flex-col gap-0 overflow-hidden rounded-2xl border border-[#E8E1D7] bg-card p-0 shadow-2xl sm:max-w-[480px]">
        <header className="flex items-start gap-3 border-b border-[#E8E1D7] bg-[#F7F4EE]/80 px-6 py-4.5 pr-12">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#C89933]/15 text-[#8a6a1f] shadow-xs">
            <ShieldAlert className="size-5" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-base font-semibold leading-tight text-[#251605]">
              Write Off Balance
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs text-muted-foreground leading-normal">
              Post an authorized settlement adjustment to write off residual folio balance.
            </DialogDescription>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 text-xs text-amber-900 space-y-1.5">
            <div className="flex items-center justify-between font-semibold">
              <span className="text-[11px] uppercase tracking-wider text-amber-800">Residual Balance</span>
              <span className="text-base font-bold tabular-nums text-amber-900">{money(balance)}</span>
            </div>
            <p className="text-[11px] text-amber-700 leading-normal">
              Write-offs adjust the ledger down and impact revenue. Every write-off is logged in audit history with your reason.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="woff-amount" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Write-off Amount
            </Label>
            <Input
              id="woff-amount"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-10 border-[#E8E1D7] bg-background text-base font-semibold tabular-nums focus-visible:ring-[#C89933]"
              placeholder="0.00"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="woff-reason" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Authorized Reason
            </Label>
            <Input
              id="woff-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Small residual rounding, Management concession"
              className="h-10 border-[#E8E1D7] bg-background focus-visible:ring-[#C89933]"
            />
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2.5 border-t border-[#E8E1D7] bg-[#F7F4EE]/50 px-6 py-3.5">
          <Button variant="outline" onClick={onClose} className="border-[#E8E1D7] hover:bg-[#F7F4EE]">
            Cancel
          </Button>
          <Button
            disabled={mutation.isPending || !reason.trim() || !amount}
            onClick={() => mutation.mutate()}
            className="bg-[#C89933] text-[#251605] font-semibold hover:bg-[#b88928] shadow-sm disabled:opacity-50"
          >
            {mutation.isPending ? "Posting..." : "Post Write-off"}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

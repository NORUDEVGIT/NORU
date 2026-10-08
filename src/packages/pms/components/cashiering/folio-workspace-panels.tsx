import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowRight,
  BadgeDollarSign,
  BedDouble,
  CalendarDays,
  CheckCircle2,
  Coins,
  CreditCard,
  Eye,
  FileText,
  Globe,
  Landmark,
  Mail,
  MoreVertical,
  Percent,
  Phone,
  Receipt,
  ReceiptText,
  ShieldAlert,
  SlidersHorizontal,
  Tag,
  TriangleAlert,
  Undo2,
  Wallet,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";

import {
  InventoryState,
  InventoryStatusBadge,
} from "@/packages/pms/components/rooms/room-inventory-shared";
import {
  labelTransactionCategory,
  labelTransactionType,
} from "@/packages/pms/components/cashiering/folio-bits";
import {
  listFolios,
  type FolioTransactionRow,
  type FolioWorkspace,
} from "@/packages/pms/lib/cashiering.functions";
import {
  allocateFolioDeposit,
  listFolioWindows,
  postFolioTransfer,
  postSettlementWriteOff,
} from "@/packages/pms/lib/cashiering-phases.functions";
import { remainingOnPaymentSource } from "@/packages/pms/lib/cashiering.server";
import {
  balanceTone,
  guestInitials,
  isTaxOrServiceCategory,
  referenceLabel,
  roundFolioMoney,
  stayNights,
  transferableRemainder,
  type FolioChargeGroup,
  type FolioDepositLine,
  type FolioFinancialSummary,
  type FolioWorkspaceTabId,
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
import { cn } from "@/shared/lib/utils";

export type Money = (value: number) => string;
export type DateTimeFormat = (iso: string | null | undefined) => string;
export type CorrectionType = "adjustment" | "discount" | "refund";

export const CARD = "rounded-xl border border-[#E8E1D7] bg-card shadow-sm";
const TABLE_HEAD =
  "border-b border-[#E8E1D7] bg-muted/30 text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const TABLE_ROW = "border-b border-[#E8E1D7]/80 last:border-0 transition-colors hover:bg-muted/20";
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

function categoryVisual(row: FolioTransactionRow): { icon: LucideIcon; label: string } {
  if (row.type === "transfer_in" || row.type === "transfer_out" || row.category === "transfer")
    return { icon: ArrowLeftRight, label: "Transfer" };
  if (row.category === "room") return { icon: BedDouble, label: "Room" };
  if (row.category === "tax") return { icon: Percent, label: "Tax" };
  if (row.category === "service_charge") return { icon: BadgeDollarSign, label: "Service" };
  if (row.category === "manual") return { icon: Receipt, label: "Manual" };
  return { icon: ReceiptText, label: labelTransactionCategory(row.category) };
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
};

function legalCorrections(
  row: FolioTransactionRow,
  rows: FolioTransactionRow[],
  workspace: FolioWorkspace,
): CorrectionType[] {
  const caps = workspace.capabilities;
  const out: CorrectionType[] = [];
  if (caps.canAdjust) out.push("adjustment");
  if (caps.canDiscount && row.type === "charge") out.push("discount");
  if (
    caps.canRefund &&
    (row.type === "payment" || row.type === "deposit") &&
    (remainingOnPaymentSource(row, rows) ?? 0) > 0.009
  )
    out.push("refund");
  return out;
}

const CORRECTION_ITEM: Record<CorrectionType, { label: string; icon: LucideIcon; className: string }> = {
  adjustment: { label: "Adjustment", icon: SlidersHorizontal, className: "text-amber-700" },
  discount: { label: "Discount", icon: Tag, className: "text-purple-700" },
  refund: { label: "Refund", icon: Undo2, className: "text-destructive" },
};

function RowMenu({
  row,
  workspace,
  actions,
}: {
  row: FolioTransactionRow;
  workspace: FolioWorkspace;
  actions: RowActions;
}) {
  const rows = workspace.folio.transactions;
  const corrections = legalCorrections(row, rows, workspace);
  const canTransfer =
    workspace.capabilities.canTransfer &&
    row.type === "charge" &&
    transferableRemainder(row.id, rows) > 0.009;
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
        {canTransfer ? (
          <DropdownMenuItem onSelect={() => actions.onTransfer(row)}>
            <ArrowLeftRight className="size-4" /> Transfer
          </DropdownMenuItem>
        ) : null}
        {corrections.length > 0 ? (
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
}) {
  const visual = categoryVisual(row);
  const Icon = visual.icon;
  return (
    <tr
      className={cn(
        TABLE_ROW,
        child ? "bg-muted/10 text-xs text-muted-foreground" : "text-foreground",
      )}
    >
      <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
        {child ? "" : dateTime(row.postedAt)}
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        <span className={cn("inline-flex items-center gap-1.5", child && "pl-3")}>
          {child ? <span aria-hidden className="text-muted-foreground/70">↳</span> : null}
          <Icon
            className={cn(
              "size-3.5",
              row.category === "tax"
                ? "text-blue-600"
                : row.category === "service_charge"
                  ? "text-purple-600"
                  : "text-muted-foreground",
            )}
          />
          <span className={child ? "" : "text-xs font-medium"}>{visual.label}</span>
        </span>
      </td>
      <td className={cn("px-3 py-2", child ? "pl-7" : "font-medium")}>{row.description}</td>
      <td className="whitespace-nowrap px-3 py-2 text-xs capitalize text-muted-foreground">
        {child ? "" : referenceLabel(row)}
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
      <td className="px-1 py-1 text-right">
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
  onPostCharge,
  onPostAdjustment,
  onTransferCharge,
  onGoTab,
}: {
  workspace: FolioWorkspace;
  money: Money;
  dateTime: DateTimeFormat;
  actions: RowActions;
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
                <Th>Category</Th>
                <Th>Description</Th>
                <Th>Reference</Th>
                <Th right>Net</Th>
                <Th right>Tax / Service</Th>
                <Th right>Total</Th>
                <Th>Posted By</Th>
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
                />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[#E8E1D7] bg-muted/20 text-sm font-semibold">
                <td className="px-3 py-2.5" colSpan={4}>
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
}: {
  group: FolioChargeGroup;
  workspace: FolioWorkspace;
  money: Money;
  dateTime: DateTimeFormat;
  actions: RowActions;
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

function SubTab({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex h-9 items-center px-2.5 text-xs font-medium transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
      {active ? (
        <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#C89933]" />
      ) : null}
    </button>
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
  const [sub, setSub] = useState<"payments" | "deposits">("payments");
  const caps = workspace.capabilities;
  const rows = workspace.folio.transactions;
  const payments = rows.filter((row) => row.type === "payment");
  const totalPaid = roundFolioMoney(payments.reduce((sum, row) => sum + Math.abs(row.amount), 0));
  return (
    <section className={cn(CARD, "overflow-hidden")}>
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-[#E8E1D7] px-2">
        <div className="flex items-end">
          <SubTab active={sub === "payments"} onClick={() => setSub("payments")}>
            Payments
          </SubTab>
          <SubTab active={sub === "deposits"} onClick={() => setSub("deposits")}>
            Deposits
          </SubTab>
        </div>
        <div className="flex items-center gap-3 py-1.5 pr-2">
          {sub === "payments" ? (
            <span className="text-xs text-muted-foreground">
              Total Paid{" "}
              <span className="font-semibold tabular-nums text-foreground">{money(totalPaid)}</span>
            </span>
          ) : null}
          {sub === "payments" && caps.canPostPayment ? (
            <Button size="sm" className="h-8" onClick={onReceivePayment}>
              Receive Payment
            </Button>
          ) : null}
          {sub === "deposits" && caps.canPostDeposit ? (
            <Button size="sm" className="h-8" onClick={onAddDeposit}>
              Add Deposit
            </Button>
          ) : null}
        </div>
      </div>

      {sub === "payments" ? (
        payments.length === 0 ? (
          <EmptyCompact icon={CreditCard} title="No payments received yet." />
        ) : (
          <TableScroll minWidth="min-w-[640px]">
            <thead className={TABLE_HEAD}>
              <tr>
                <Th>Date</Th>
                <Th>Method</Th>
                <Th>Reference</Th>
                <Th right>Amount</Th>
                <Th>Posted By</Th>
                <th className="w-10" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {payments.map((row) => (
                <tr key={row.id} className={TABLE_ROW}>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                    {dateTime(row.postedAt)}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <CreditCard className="size-3.5 text-emerald-600" />
                      {methodLabel(row.paymentMethod)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{row.description}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">
                    {money(Math.abs(row.amount))}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{row.postedBy ?? "—"}</td>
                  <td className="px-1 py-1 text-right">
                    <RowMenu row={row} workspace={workspace} actions={actions} />
                  </td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
        )
      ) : (
        <div>
          <DepositTotals summary={workspace.depositSummary} money={money} />
          {workspace.folio.guaranteeMethod ? (
            <p className="border-t border-[#E8E1D7]/80 px-4 py-2 text-xs text-muted-foreground">
              Guarantee method ·{" "}
              <span className="font-medium text-foreground">
                {titleCase(workspace.folio.guaranteeMethod.toLowerCase())}
              </span>
            </p>
          ) : null}
          {workspace.depositLines.length === 0 ? (
            <div className="border-t border-[#E8E1D7]/80">
              <EmptyCompact icon={Landmark} title="No deposit credits on this folio." />
            </div>
          ) : (
            <div className="border-t border-[#E8E1D7]">
              <TableScroll>
                <thead className={TABLE_HEAD}>
                  <tr>
                    <Th>Date</Th>
                    <Th>Method</Th>
                    <Th>Description</Th>
                    <Th right>Received</Th>
                    <Th right>Applied</Th>
                    <Th right>Available</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {workspace.depositLines.map((line) => (
                    <tr key={line.transaction.id} className={TABLE_ROW}>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                        {dateTime(line.transaction.postedAt)}
                      </td>
                      <td className="px-3 py-2">{methodLabel(line.transaction.paymentMethod)}</td>
                      <td className="px-3 py-2 text-xs">{line.transaction.description}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(line.received)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(line.applied)}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">
                        {money(line.available)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {workspace.canManage &&
                          workspace.folio.status === "open" &&
                          line.available > 0.009 ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7"
                              onClick={() => onAllocate(line)}
                            >
                              Allocate
                            </Button>
                          ) : null}
                          {caps.canRefund && line.available > 0.009 ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7"
                              onClick={() => actions.onCorrect("refund", line.transaction)}
                            >
                              Refund unused
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7"
                            onClick={() => actions.onDetails(line.transaction)}
                          >
                            View details
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableScroll>
            </div>
          )}
        </div>
      )}
    </section>
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
  const sourceById = new Map(folio.transactions.map((row) => [row.id, row]));
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
              <Th>Transfer ID</Th>
              <Th>From</Th>
              <Th>To</Th>
              <Th>Source Transaction</Th>
              <Th right>Amount</Th>
              <Th>Posted By</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const other = row.transferId ? workspace.transferCounterparts[row.transferId] : undefined;
              const otherLabel = other?.folioNumber ?? "—";
              const out = row.type === "transfer_out";
              const source = row.originalTransactionId
                ? sourceById.get(row.originalTransactionId)
                : undefined;
              return (
                <tr key={row.id} className={TABLE_ROW}>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                    {dateTime(row.postedAt)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {row.transferId ? row.transferId.slice(0, 8).toUpperCase() : "—"}
                  </td>
                  <td className={cn("px-3 py-2", out && "font-medium")}>
                    {out ? folio.folioNumber : otherLabel}
                  </td>
                  <td className={cn("px-3 py-2", !out && "font-medium")}>
                    {out ? otherLabel : folio.folioNumber}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {source?.description ?? row.sourceDescription ?? row.description}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">
                    {money(row.amount)}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{row.postedBy ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </TableScroll>
      )}
    </SectionCard>
  );
}

/* ----------------------------------------------------------- Settlement */

export function SettlementTab({
  workspace,
  money,
  dateTime,
  onAllocate,
  onReceivePayment,
  onWriteOff,
  onClose,
}: {
  workspace: FolioWorkspace;
  money: Money;
  dateTime: DateTimeFormat;
  onAllocate: () => void;
  onReceivePayment: () => void;
  onWriteOff: () => void;
  onClose: () => void;
}) {
  const folio = workspace.folio;
  const caps = workspace.capabilities;
  const balance = workspace.financialSummary.currentBalance;
  const meta = BALANCE_META[balanceTone(balance)];
  const canAllocate =
    workspace.canManage && folio.status === "open" && workspace.depositSummary.available > 0.009;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Current Balance"
          value={formatBalance(money, balance)}
          detail={meta.label}
          icon={Wallet}
          tint={meta.tint}
          valueClassName={meta.text}
        />
        <KpiCard
          label="Deposits Available"
          value={money(workspace.depositSummary.available)}
          detail="Credit not yet applied"
          icon={WalletCards}
          tint={KPI_TINT.deposit}
        />
        <KpiCard
          label="Settlement Exception"
          value={folio.unsettledCheckout ? "Unsettled" : "None"}
          detail={folio.unsettledCheckout ? "Checked out with balance" : "No exception"}
          icon={TriangleAlert}
          tint={folio.unsettledCheckout ? KPI_TINT.adjustment : KPI_TINT.neutral}
          valueClassName={folio.unsettledCheckout ? "text-amber-700" : undefined}
        />
        <KpiCard
          label="Folio Status"
          value={folio.status === "open" ? "Open" : "Closed"}
          detail={folio.closedAt ? `Closed ${dateTime(folio.closedAt)}` : "Accepting postings"}
          icon={FileText}
          tint={folio.status === "open" ? KPI_TINT.tax : KPI_TINT.neutral}
        />
      </div>
      <SectionCard
        title="Settle this folio"
        description="Close is available only when the balance is zero."
      >
        <div className="flex flex-wrap items-center gap-2 p-4">
          {canAllocate ? (
            <Button size="sm" variant="outline" onClick={onAllocate}>
              <WalletCards className="size-4" /> Allocate Deposit
            </Button>
          ) : null}
          {caps.canPostPayment ? (
            <Button size="sm" variant="outline" onClick={onReceivePayment}>
              <CreditCard className="size-4" /> Receive Payment
            </Button>
          ) : null}
          {caps.canWriteOff ? (
            <Button size="sm" variant="outline" onClick={onWriteOff}>
              <SlidersHorizontal className="size-4" /> Post Write-off
            </Button>
          ) : null}
          {workspace.canManage && folio.status === "open" ? (
            <Button size="sm" disabled={!caps.canClose} onClick={onClose}>
              Close Folio
            </Button>
          ) : null}
          {folio.status !== "open" ? (
            <p className="text-sm text-muted-foreground">
              This folio is closed. New lines cannot be posted.
            </p>
          ) : null}
          {folio.status === "open" && !workspace.canOperate ? (
            <p className="text-sm text-muted-foreground">Read-only access for your role.</p>
          ) : null}
        </div>
      </SectionCard>
    </div>
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
  if (invoice && Math.abs(invoice.snapshot.totals.balance - balance) > 0.009)
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
}: {
  workspace: FolioWorkspace;
  money: Money;
  dateTime: DateTimeFormat;
  onViewInvoice: () => void;
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
    <aside className="space-y-4 lg:sticky lg:top-4" data-testid="folio-sidebar">
      <section className={cn(CARD, "overflow-hidden")}>
        <div className="flex items-center justify-between gap-2 border-b border-[#E8E1D7] px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex size-7 items-center justify-center rounded-lg bg-[#C89933]/12 text-[#8a6a1f]">
              <Wallet className="size-3.5" />
            </span>
            Financial Summary
          </p>
          <span className="rounded-md border border-[#E8E1D7] px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {folio.currency}
          </span>
        </div>
        <div className="space-y-1.5 px-4 py-3">
          <SummaryLine label="Net Charges" value={money(s.netCharges)} />
          <SummaryLine label="Tax" value={money(s.tax)} muted={s.tax === 0} />
          <SummaryLine label="Service Charge" value={money(s.serviceCharge)} muted={s.serviceCharge === 0} />
        </div>
        <div className="space-y-1.5 border-t border-[#E8E1D7]/80 px-4 py-3">
          <SummaryLine label="Payments" value={signed(-s.payments)} muted={s.payments === 0} />
          <SummaryLine label="Deposits" value={signed(-s.deposits)} muted={s.deposits === 0} />
          <SummaryLine label="Adjustments" value={signed(s.adjustments)} muted={s.adjustments === 0} />
          <SummaryLine label="Discounts" value={signed(-s.discounts)} muted={s.discounts === 0} />
          <SummaryLine label="Refunds" value={money(s.refunds)} muted={s.refunds === 0} />
          {transfers !== 0 ? <SummaryLine label="Transfers" value={signed(transfers)} /> : null}
        </div>
        <div className="border-t border-[#E8E1D7] bg-muted/20 px-4 py-3">
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
          <Avatar className="size-10 shrink-0">
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
              <Phone className="size-3.5 shrink-0" /> {folio.guestPhone}
            </p>
          ) : null}
          {folio.guestEmail ? (
            <p className="flex items-center gap-2 truncate">
              <Mail className="size-3.5 shrink-0" /> {folio.guestEmail}
            </p>
          ) : null}
          {folio.guestNationality ? (
            <p className="flex items-center gap-2 truncate">
              <Globe className="size-3.5 shrink-0" /> {folio.guestNationality}
            </p>
          ) : null}
        </div>
        {folio.guestId ? (
          <Button asChild variant="outline" size="sm" className="mt-3 h-8 w-full gap-1">
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
          <p className="flex items-center gap-2 font-medium">
            <CalendarDays className="size-4 text-[#8a6a1f]" />
            {folio.confirmationNumber ?? "Reservation"}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
            <div className="col-span-2">
              <Field
                label="Room"
                value={[folio.roomNumber ?? "Unassigned", folio.roomTypeName].filter(Boolean).join(" · ")}
              />
            </div>
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
          <Button asChild variant="outline" size="sm" className="mt-3 h-8 w-full gap-1">
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
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="size-4" /> No issued invoice
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

export function TransactionDetailDialog({
  row,
  rows,
  money,
  dateTime,
  onClose,
}: {
  row: FolioTransactionRow | null;
  rows: FolioTransactionRow[];
  money: Money;
  dateTime: DateTimeFormat;
  onClose: () => void;
}) {
  const linked = row ? rows.filter((other) => other.originalTransactionId === row.id) : [];
  const snapshot = row?.taxSnapshot as
    | { code?: string; name?: string; calculation?: string; amount?: number }
    | null
    | undefined;
  return (
    <Dialog open={row !== null} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row ? rowLabel(row) : "Line"}</DialogTitle>
          <DialogDescription>Posted ledger lines cannot be edited or removed.</DialogDescription>
        </DialogHeader>
        {row ? (
          <dl className="space-y-1.5 text-sm">
            <DetailRow label="Description" value={row.description} />
            <DetailRow label="Amount" value={money(row.amount)} />
            <DetailRow label="Posted" value={dateTime(row.postedAt)} />
            <DetailRow label="Posted by" value={row.postedBy ?? "—"} />
            <DetailRow label="Type" value={labelTransactionType(row.type)} />
            <DetailRow label="Category" value={labelTransactionCategory(row.category)} />
            {row.paymentMethod ? (
              <DetailRow label="Method" value={methodLabel(row.paymentMethod)} />
            ) : null}
            {row.sourceDescription ? (
              <DetailRow label="Source line" value={row.sourceDescription} />
            ) : null}
            {snapshot?.name || snapshot?.code ? (
              <DetailRow
                label="Tax rule"
                value={`${snapshot.name ?? snapshot.code}${snapshot.calculation ? ` · ${snapshot.calculation}` : ""}`}
              />
            ) : null}
            {linked.length > 0 ? (
              <div className="border-t border-[#E8E1D7] pt-2">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Linked lines</p>
                {linked.map((other) => (
                  <DetailRow key={other.id} label={rowLabel(other)} value={money(other.amount)} />
                ))}
              </div>
            ) : null}
          </dl>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TransferChargeDialog({
  restaurantId,
  workspace,
  initialSourceId,
  open,
  onClose,
  onDone,
}: {
  restaurantId: string;
  workspace: FolioWorkspace;
  initialSourceId: string | null;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const money = useMoney();
  const folio = workspace.folio;
  const sources = useMemo(
    () =>
      folio.transactions
        .filter((row) => row.type === "charge")
        .map((row) => ({ row, remainder: transferableRemainder(row.id, folio.transactions) }))
        .filter((entry) => entry.remainder > 0.009),
    [folio.transactions],
  );
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [windowId, setWindowId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open) return;
    const first = sources.find((entry) => entry.row.id === initialSourceId) ?? sources[0];
    setSourceId(first?.row.id ?? "");
    setAmount(first ? String(first.remainder) : "");
    setDescription(first ? `Transfer: ${first.row.description}` : "");
    setTargetId("");
    setWindowId("");
  }, [open, initialSourceId, sources]);

  const fetchFolios = useServerFn(listFolios);
  const fetchWindows = useServerFn(listFolioWindows);
  const foliosQuery = useQuery({
    queryKey: ["cashiering-folios", restaurantId, "open-transfer-targets"],
    queryFn: () => fetchFolios({ data: { restaurantId, status: "open" } }),
    enabled: open,
    retry: false,
  });
  const targets = (foliosQuery.data ?? []).filter((row) => row.id !== folio.id);
  const windowsQuery = useQuery({
    queryKey: ["folio-windows", restaurantId, targetId],
    queryFn: () => fetchWindows({ data: { restaurantId, folioId: targetId } }),
    enabled: open && Boolean(targetId),
    retry: false,
  });
  useEffect(() => {
    const windows = windowsQuery.data ?? [];
    if (windows.length === 0) return;
    if (windows.some((w) => w.id === windowId)) return;
    setWindowId((windows.find((w) => w.isPrimary) ?? windows[0]).id);
  }, [windowsQuery.data, windowId]);

  const selected = sources.find((entry) => entry.row.id === sourceId) ?? null;
  const post = useServerFn(postFolioTransfer);
  const mutation = useMutation({
    mutationFn: async () => {
      const value = Number(amount);
      if (!selected) throw new Error("Choose a charge to transfer.");
      if (!targetId) throw new Error("Choose a target folio.");
      if (!windowId) throw new Error("The target folio has no billing window.");
      if (!Number.isFinite(value) || value <= 0) throw new Error("Enter an amount greater than zero.");
      if (value > selected.remainder + 0.001)
        throw new Error(`Amount cannot exceed ${money(selected.remainder)}.`);
      if (!description.trim()) throw new Error("Enter a description.");
      return post({
        data: {
          restaurantId,
          sourceFolioId: folio.id,
          targetFolioId: targetId,
          sourceTransactionId: selected.row.id,
          targetWindowId: windowId,
          amount: value,
          description: description.trim(),
          idempotencyKey: idempotencyKey("xfer"),
        },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Transfer posted");
      onDone();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer a charge</DialogTitle>
          <DialogDescription>
            Moves part or all of a charge to another open guest folio. Both folios record a ledger
            line.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Charge</Label>
            <Select
              value={sourceId}
              onValueChange={(value) => {
                setSourceId(value);
                const entry = sources.find((e) => e.row.id === value);
                if (entry) setAmount(String(entry.remainder));
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a charge" />
              </SelectTrigger>
              <SelectContent>
                {sources.map((entry) => (
                  <SelectItem key={entry.row.id} value={entry.row.id}>
                    {entry.row.description} · {money(entry.remainder)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Target folio</Label>
            <Select
              value={targetId}
              onValueChange={(value) => {
                setTargetId(value);
                setWindowId("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={foliosQuery.isLoading ? "Loading…" : "Choose an open folio"} />
              </SelectTrigger>
              <SelectContent>
                {targets.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.folioNumber} · {row.guestName}
                    {row.roomNumber ? ` · Room ${row.roomNumber}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="xfer-amount">Amount</Label>
            <Input
              id="xfer-amount"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="xfer-description">Description</Label>
            <Input
              id="xfer-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            Post transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Allocate deposit</DialogTitle>
          <DialogDescription>
            Applies available deposit credit to a charge on this folio. The folio balance does not
            change; the deposit was already credited.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Deposit</Label>
            <Select value={depositId} onValueChange={setDepositId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a deposit" />
              </SelectTrigger>
              <SelectContent>
                {deposits.map((line) => (
                  <SelectItem key={line.transaction.id} value={line.transaction.id}>
                    {line.transaction.description} · available {money(line.available)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Charge</Label>
            <Select value={chargeId} onValueChange={setChargeId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a charge" />
              </SelectTrigger>
              <SelectContent>
                {charges.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.description} · {money(row.amount)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="alloc-amount">Amount</Label>
            <Input
              id="alloc-amount"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            Allocate
          </Button>
        </DialogFooter>
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Post write-off</DialogTitle>
          <DialogDescription>
            Posts a settlement adjustment line that reduces the balance. It cannot exceed the
            current balance.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="woff-amount">Amount</Label>
            <Input
              id="woff-amount"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="woff-reason">Reason</Label>
            <Input id="woff-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            Post write-off
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

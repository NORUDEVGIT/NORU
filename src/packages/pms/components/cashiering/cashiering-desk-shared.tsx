import type { ReactNode } from "react";
import {
  Banknote,
  Coins,
  Plus,
  SlidersHorizontal,
  Undo2,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/shared/lib/utils";

export const KPI_TONE = {
  blue: "border-sky-200 bg-sky-50/80",
  amber: "border-amber-200 bg-amber-50/80",
  green: "border-emerald-200 bg-emerald-50/80",
  gold: "border-[#E4D3A8] bg-[#FBF6EA]",
  rose: "border-rose-200 bg-rose-50/80",
  teal: "border-teal-200 bg-teal-50/80",
} as const;

export const KPI_ICON = {
  blue: "bg-sky-100 text-sky-700",
  amber: "bg-amber-100 text-amber-800",
  green: "bg-emerald-100 text-emerald-700",
  gold: "bg-[#F3E6C4] text-[#8A6A24]",
  rose: "bg-rose-100 text-rose-700",
  teal: "bg-teal-100 text-teal-700",
} as const;

export type KpiTone = keyof typeof KPI_TONE;

const TXN_MARK: Record<string, { icon: LucideIcon; className: string }> = {
  charge: { icon: Plus, className: "bg-sky-100 text-sky-700" },
  payment: { icon: Banknote, className: "bg-emerald-100 text-emerald-700" },
  deposit: { icon: Coins, className: "bg-[#F3E6C4] text-[#8A6A24]" },
  refund: { icon: Undo2, className: "bg-rose-100 text-rose-700" },
  adjustment: { icon: SlidersHorizontal, className: "bg-violet-100 text-violet-700" },
  discount: { icon: SlidersHorizontal, className: "bg-muted text-muted-foreground" },
  transfer_out: { icon: Undo2, className: "bg-violet-100 text-violet-700" },
  transfer_in: { icon: Plus, className: "bg-teal-100 text-teal-700" },
};

export function methodLabel(code: string | null): string {
  if (!code) return "—";
  return code.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function shortRef(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

export function Kpi({
  label,
  value,
  hint,
  tone = "blue",
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: KpiTone;
  icon?: LucideIcon;
}) {
  return (
    <div className={cn("rounded-xl border px-3 py-2.5 shadow-sm", KPI_TONE[tone])}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {Icon ? (
          <span
            className={cn("grid size-7 shrink-0 place-items-center rounded-md", KPI_ICON[tone])}
          >
            <Icon className="size-3.5" aria-hidden />
          </span>
        ) : null}
      </div>
      <p className="mt-1 font-display text-lg font-semibold tabular-nums text-foreground">
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function SummaryTile({ label, value, tone }: { label: string; value: string; tone: KpiTone }) {
  return (
    <div className={cn("rounded-lg border px-2.5 py-2", KPI_TONE[tone])}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function TxnMark({ type }: { type: string }) {
  const mark = TXN_MARK[type] ?? TXN_MARK.charge;
  const Icon = mark?.icon ?? Plus;
  return (
    <span
      className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-md", mark?.className)}
    >
      <Icon className="size-3.5" aria-hidden />
    </span>
  );
}

export function DeskSection({
  title,
  loading,
  error,
  empty,
  isEmpty,
  children,
  testId,
}: {
  title: string;
  loading?: boolean;
  error?: string | null;
  empty?: string;
  isEmpty?: boolean;
  children?: ReactNode;
  testId?: string;
}) {
  return (
    <section
      className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
      data-testid={testId}
    >
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {loading ? <p className="p-4 text-sm text-muted-foreground">Loading…</p> : null}
      {error ? <p className="p-4 text-sm text-destructive">{error}</p> : null}
      {!loading && !error && isEmpty && empty ? (
        <p className="p-8 text-center text-sm text-muted-foreground">{empty}</p>
      ) : null}
      {!loading && !error && !isEmpty ? children : null}
    </section>
  );
}

export type DeskActionBorderTone = "payment" | "deposit" | "refund" | "transfer" | "account" | "neutral";

const ACTION_BORDER: Record<DeskActionBorderTone, string> = {
  payment: "border-emerald-200",
  deposit: "border-[#E4D3A8]",
  refund: "border-rose-200",
  transfer: "border-violet-200",
  account: "border-sky-200",
  neutral: "border-border",
};

export function DeskActionPanel({
  title,
  note,
  borderTone = "neutral",
  testId,
  children,
  footer,
}: {
  title: string;
  note?: string;
  borderTone?: DeskActionBorderTone;
  testId?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section
      className={cn(
        "space-y-4 rounded-xl border bg-card p-4 shadow-sm",
        ACTION_BORDER[borderTone],
      )}
      data-testid={testId}
    >
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
      </div>
      {children}
      {footer ? <p className="text-xs text-muted-foreground">{footer}</p> : null}
    </section>
  );
}

export function FolioBalanceBlock({
  balance,
  money,
}: {
  balance: number;
  money: (value: number) => string;
}) {
  const unsettled = balance > 0.009;
  return (
    <div className={cn("rounded-lg px-3 py-2", unsettled ? "bg-destructive/10" : "bg-muted/40")}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Outstanding Balance</p>
      <p
        className={cn(
          "font-display text-xl tabular-nums",
          unsettled ? "text-destructive" : "text-foreground",
        )}
      >
        {money(balance)}
      </p>
    </div>
  );
}

export function StatusChip({
  label,
  tone = "green",
}: {
  label: string;
  tone?: "green" | "muted" | "amber" | "rose";
}) {
  const styles = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    muted: "border-border bg-muted/40 text-muted-foreground",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    rose: "border-rose-200 bg-rose-50 text-rose-800",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
        styles[tone],
      )}
    >
      {label}
    </span>
  );
}

export function DeskTwoColumn({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">{children}</div>
  );
}

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
  blue: "border-[#DDD4C5] bg-card hover:border-sky-300/80 hover:bg-sky-50/30",
  amber: "border-[#DDD4C5] bg-card hover:border-amber-300/80 hover:bg-amber-50/30",
  green: "border-[#DDD4C5] bg-card hover:border-emerald-300/80 hover:bg-emerald-50/30",
  gold: "border-[#DDD4C5] bg-card hover:border-[#C89933]/80 hover:bg-[#FAF6EE]",
  rose: "border-[#DDD4C5] bg-card hover:border-rose-300/80 hover:bg-rose-50/30",
  teal: "border-[#DDD4C5] bg-card hover:border-teal-300/80 hover:bg-teal-50/30",
} as const;

export const KPI_ICON = {
  blue: "border border-sky-200/80 bg-sky-50 text-sky-700",
  amber: "border border-amber-200/80 bg-amber-50 text-amber-800",
  green: "border border-emerald-200/80 bg-emerald-50 text-emerald-700",
  gold: "border border-[#E5D7B7] bg-[#FAF3E3] text-[#8A6A24]",
  rose: "border border-rose-200/80 bg-rose-50 text-rose-700",
  teal: "border border-teal-200/80 bg-teal-50 text-teal-700",
} as const;

export type KpiTone = keyof typeof KPI_TONE;

const TXN_MARK: Record<string, { icon: LucideIcon; className: string }> = {
  charge: { icon: Plus, className: "border border-sky-200/80 bg-sky-50 text-sky-700" },
  payment: { icon: Banknote, className: "border border-emerald-200/80 bg-emerald-50 text-emerald-700" },
  deposit: { icon: Coins, className: "border border-[#E5D7B7] bg-[#FAF3E3] text-[#8A6A24]" },
  refund: { icon: Undo2, className: "border border-rose-200/80 bg-rose-50 text-rose-700" },
  adjustment: { icon: SlidersHorizontal, className: "border border-violet-200/80 bg-violet-50 text-violet-700" },
  discount: { icon: SlidersHorizontal, className: "border border-border bg-muted/60 text-muted-foreground" },
  transfer_out: { icon: Undo2, className: "border border-violet-200/80 bg-violet-50 text-violet-700" },
  transfer_in: { icon: Plus, className: "border border-teal-200/80 bg-teal-50 text-teal-700" },
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
    <div
      className={cn(
        "group relative flex flex-col justify-between rounded-xl border p-3.5 shadow-xs transition-all duration-150 hover:shadow-sm",
        KPI_TONE[tone],
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#765719]">
          {label}
        </p>
        {Icon ? (
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-lg shadow-2xs transition-transform duration-150 group-hover:scale-105",
              KPI_ICON[tone],
            )}
          >
            <Icon className="size-3.5" aria-hidden />
          </span>
        ) : null}
      </div>
      <div className="mt-2">
        <p className="font-display text-xl font-bold tracking-tight tabular-nums text-[#251605]">
          {value}
        </p>
        {hint ? (
          <p className="mt-0.5 truncate text-[11px] font-medium text-[#7A7167]">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function SummaryTile({ label, value, tone }: { label: string; value: string; tone: KpiTone }) {
  return (
    <div className={cn("rounded-lg border px-3 py-2", KPI_TONE[tone])}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#765719]">
        {label}
      </p>
      <p className="mt-0.5 font-display text-sm font-bold tabular-nums text-[#251605]">{value}</p>
    </div>
  );
}

export function TxnMark({ type }: { type: string }) {
  const mark = TXN_MARK[type] ?? TXN_MARK.charge;
  const Icon = mark?.icon ?? Plus;
  return (
    <span
      className={cn(
        "mt-0.5 grid size-6 shrink-0 place-items-center rounded-md shadow-2xs",
        mark?.className,
      )}
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
      className="overflow-hidden rounded-xl border border-[#DDD4C5] bg-card shadow-xs"
      data-testid={testId}
    >
      <div className="border-b border-[#DDD4C5] bg-[#FAF8F4]/90 px-4 py-3">
        <h2 className="font-display text-sm font-semibold text-[#251605]">{title}</h2>
      </div>
      {loading ? <p className="p-4 text-sm text-[#7A7167]">Loading…</p> : null}
      {error ? <p className="p-4 text-sm text-destructive">{error}</p> : null}
      {!loading && !error && isEmpty && empty ? (
        <p className="p-8 text-center text-sm text-[#7A7167]">{empty}</p>
      ) : null}
      {!loading && !error && !isEmpty ? children : null}
    </section>
  );
}

export type DeskActionBorderTone = "payment" | "deposit" | "refund" | "transfer" | "account" | "neutral";

const ACTION_BORDER: Record<DeskActionBorderTone, string> = {
  payment: "border-emerald-200/90",
  deposit: "border-[#E4D3A8]",
  refund: "border-rose-200/90",
  transfer: "border-violet-200/90",
  account: "border-sky-200/90",
  neutral: "border-[#DDD4C5]",
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
        "space-y-4 rounded-xl border bg-card p-4 shadow-xs",
        ACTION_BORDER[borderTone],
      )}
      data-testid={testId}
    >
      <div>
        <h2 className="font-display text-sm font-semibold text-[#251605]">{title}</h2>
        {note ? <p className="mt-1 text-xs text-[#7A7167]">{note}</p> : null}
      </div>
      {children}
      {footer ? <p className="text-xs text-[#7A7167]">{footer}</p> : null}
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
    <div
      className={cn(
        "rounded-lg border px-3 py-2",
        unsettled
          ? "border-destructive/20 bg-destructive/10"
          : "border-[#DDD4C5] bg-[#FAF8F4]/80",
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#765719]">
        Outstanding Balance
      </p>
      <p
        className={cn(
          "font-display text-xl font-bold tabular-nums",
          unsettled ? "text-destructive" : "text-[#251605]",
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
    muted: "border-[#DDD4C5] bg-[#FAF8F4] text-[#5F554B]",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    rose: "border-rose-200 bg-rose-50 text-rose-800",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
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

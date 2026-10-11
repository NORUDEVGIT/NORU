import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  HelpCircle,
  History,
  Info,
  Landmark,
  PiggyBank,
  PlusCircle,
  Receipt,
  RotateCcw,
  Search,
  User,
  Users,
  Wallet,
  X,
} from "lucide-react";

import { methodLabel } from "@/packages/pms/components/cashiering/cashiering-desk-shared";
import {
  closeCashierShift,
  listCashierShifts,
  openCashierShift,
  postHotelDrawerMovement,
  type CashierShiftRow,
} from "@/packages/pms/lib/cashiering.functions";
import {
  getCashierShiftActivity,
  getCashieringBusinessDateActivity,
} from "@/packages/pms/lib/cashiering-control.functions";
import {
  formatShiftDuration,
  otherOpenShifts,
  previousClosedShift,
  selectOwnOpenShift,
  variancePresentation,
  visibleShiftHistory,
} from "@/packages/pms/lib/cashiering-control";
import type { CashieringTabId } from "@/packages/pms/lib/cashiering-shell";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";

const CARD = "rounded-xl border border-[#E8E1D7] bg-white shadow-2xs";

export function CashierControl({
  restaurantId,
  membershipId,
  role,
  canOperate,
  canManage,
  money,
  dateTime,
  onNavigate,
}: {
  restaurantId: string;
  membershipId: string;
  role: string;
  canOperate: boolean;
  canManage: boolean;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  onNavigate: (tab: CashieringTabId) => void;
}) {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const [mode, setMode] = useState<"desk" | "open" | "close">("desk");
  const [closeId, setCloseId] = useState<string | null>(null);
  const [viewDate, setViewDate] = useState("");
  const [closedSummary, setClosedSummary] = useState<CashierShiftRow | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const fetchShifts = useServerFn(listCashierShifts);
  const fetchActivity = useServerFn(getCashieringBusinessDateActivity);
  const shiftsQuery = useQuery({
    queryKey: ["cashier-shifts", restaurantId],
    queryFn: () => fetchShifts({ data: { restaurantId } }),
    retry: false,
  });
  const activityQuery = useQuery({
    queryKey: ["cashiering-business-date", restaurantId, viewDate],
    queryFn: () =>
      fetchActivity({
        data: { restaurantId, ...(viewDate ? { viewDate } : {}) },
      }),
    retry: false,
  });

  const shifts = useMemo(() => shiftsQuery.data ?? [], [shiftsQuery.data]);
  useEffect(() => {
    if (!closedSummary) return;
    const fresh = shifts.find(
      (shift) => shift.id === closedSummary.id && shift.status === "closed",
    );
    if (fresh?.closedAt && fresh.closedAt !== closedSummary.closedAt) setClosedSummary(fresh);
  }, [shifts, closedSummary]);

  const mine = selectOwnOpenShift(shifts, membershipId);
  const activity = activityQuery.data;
  const businessDate = activity?.canonicalBusinessDate ?? "—";
  const history = visibleShiftHistory(shifts, membershipId, role);
  const others = canManage ? otherOpenShifts(shifts, membershipId) : [];
  const isHistorical = Boolean(viewDate && viewDate !== activity?.canonicalBusinessDate);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["cashier-shifts", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["cashiering-business-date", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["cashiering-dashboard", restaurantId] });
  }

  return (
    <div className="space-y-4" data-testid="cashier-control">
      {/* Workspace Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#E8E1D7] pb-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8A6A24]">
            Cashiering
          </p>
          <h2 className="font-display text-2xl font-bold tracking-tight text-[#251605]">
            Cashier Control
          </h2>
          <p className="mt-0.5 text-xs sm:text-sm text-[#5F554B]">
            Manage your cash drawer and monitor current business-date activity.
          </p>
        </div>

        {/* Business Date & Historical Control */}
        <div className="flex flex-wrap items-center gap-2 sm:self-center">
          <div className="flex items-center gap-2.5 rounded-xl border border-[#E8E1D7] bg-white px-3.5 py-2 shadow-2xs">
            <div className="flex size-7 items-center justify-center rounded-lg bg-[#FAF5EB] text-[#8A6A24]">
              <Calendar className="size-4" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#7A7167]">
                Business Date
              </p>
              <p
                className="text-sm font-semibold tabular-nums text-[#251605]"
                data-testid="business-date"
              >
                {businessDate}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 rounded-xl border border-[#E8E1D7] bg-white px-2.5 py-1.5 shadow-2xs text-xs text-[#7A7167]">
            <span>View Date:</span>
            <input
              type="date"
              value={viewDate || activity?.canonicalBusinessDate || ""}
              onChange={(event) => {
                const next = event.target.value;
                setViewDate(next && next !== activity?.canonicalBusinessDate ? next : "");
              }}
              className="bg-transparent text-xs font-medium text-[#251605] outline-none cursor-pointer"
              aria-label="View business date"
            />
          </div>
        </div>
      </header>

      {/* Historical View Warning Banner */}
      {isHistorical ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[#FCD34D] bg-[#FFFBEB] px-4 py-2.5 text-xs text-[#92400E] shadow-2xs">
          <div className="flex items-center gap-2">
            <Calendar className="size-4 shrink-0 text-[#B45309]" />
            <span>
              Viewing historical Business Date: <strong>{viewDate}</strong>. Current hotel Business
              Date is <strong>{activity?.canonicalBusinessDate ?? businessDate}</strong>.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setViewDate("")}
            className="flex items-center gap-1 font-semibold text-[#B45309] hover:underline"
          >
            <RotateCcw className="size-3.5" />
            Reset to Current
          </button>
        </div>
      ) : null}

      {/* Closed Shift Summary Toast / Card */}
      {closedSummary ? (
        <ClosedSummary
          shift={closedSummary}
          businessDate={activity?.canonicalBusinessDate ?? businessDate}
          money={money}
          dateTime={dateTime}
          canOperate={canOperate}
          onOpen={() => {
            setClosedSummary(null);
            setMode("open");
          }}
          onDismiss={() => setClosedSummary(null)}
        />
      ) : null}

      {/* 12-Column Responsive Workspace Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* ROW 1: My Shift (8 Cols) & Quick Actions (4 Cols) */}
        <div className="lg:col-span-8 flex flex-col">
          <MyShiftCard
            shift={mine}
            businessDate={activity?.canonicalBusinessDate ?? businessDate}
            money={money}
            dateTime={dateTime}
            now={now}
            canOperate={canOperate}
            restaurantId={restaurantId}
            onOpen={() => setMode("open")}
            onClose={() => {
              if (!mine) return;
              setCloseId(mine.id);
              setMode("close");
            }}
            onMoved={refresh}
          />
        </div>

        <div className="lg:col-span-4 flex flex-col">
          <QuickActionsCard onNavigate={onNavigate} />
        </div>

        {/* ROW 2: Business Date Activity (8 Cols) & Operational Attention (4 Cols) */}
        <div className="lg:col-span-8 flex flex-col">
          <BusinessDateActivity
            activity={activity}
            loading={activityQuery.isLoading}
            error={activityQuery.isError ? (activityQuery.error as Error).message : null}
            money={money}
            businessDate={activity?.viewedBusinessDate ?? businessDate}
          />
        </div>

        <div className="lg:col-span-4 flex flex-col gap-4">
          <NeedsAttentionCard rows={activity?.departuresDue ?? []} money={money} />

          {canManage ? (
            <OtherShiftsCard
              rows={others}
              money={money}
              dateTime={dateTime}
              now={now}
              onClose={(id) => {
                setCloseId(id);
                setMode("close");
              }}
            />
          ) : null}
        </div>

        {/* ROW 3: Recent Transactions (12 Cols Full Width) */}
        <div className="lg:col-span-12">
          <RecentTransactionsCard
            rows={activity?.recent ?? []}
            money={money}
            dateTime={dateTime}
            onViewAll={() => onNavigate("reports")}
          />
        </div>

        {/* ROW 4: Shift History (12 Cols Full Width) */}
        <div className="lg:col-span-12">
          <ShiftHistoryCard
            rows={history}
            money={money}
            dateTime={dateTime}
            ownOnly={role === "cashier"}
          />
        </div>
      </div>

      {/* Modal: Open Shift */}
      {canOperate ? (
        <Dialog open={mode === "open"} onOpenChange={(open) => !open && setMode("desk")}>
          <DialogContent className="max-w-2xl bg-white border border-[#E8E1D7] rounded-xl p-0 overflow-hidden shadow-lg">
            <OpenShiftForm
              restaurantId={restaurantId}
              businessDate={activity?.canonicalBusinessDate ?? businessDate}
              previous={previousClosedShift(shifts, membershipId)}
              money={money}
              dateTime={dateTime}
              onCancel={() => setMode("desk")}
              onOpened={() => {
                setClosedSummary(null);
                setMode("desk");
                refresh();
              }}
            />
          </DialogContent>
        </Dialog>
      ) : null}

      {/* Modal: Close Shift */}
      {closeId ? (
        <Dialog open={mode === "close"} onOpenChange={(open) => !open && setMode("desk")}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-white border border-[#E8E1D7] rounded-xl p-0 shadow-lg">
            <CloseShiftForm
              restaurantId={restaurantId}
              shift={shifts.find((shift) => shift.id === closeId) ?? null}
              businessDate={activity?.canonicalBusinessDate ?? businessDate}
              money={money}
              dateTime={dateTime}
              now={now}
              onCancel={() => setMode("desk")}
              onClosed={(shift) => {
                setClosedSummary(shift);
                setCloseId(null);
                setMode("desk");
                refresh();
              }}
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

// ============================================================================
// 1. MY CASHIER SHIFT CARD
// ============================================================================

function MyShiftCard({
  shift,
  businessDate,
  money,
  dateTime,
  now,
  canOperate,
  restaurantId,
  onOpen,
  onClose,
  onMoved,
}: {
  shift: CashierShiftRow | null;
  businessDate: string;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  now: number;
  canOperate: boolean;
  restaurantId: string;
  onOpen: () => void;
  onClose: () => void;
  onMoved: () => void;
}) {
  const [movementModal, setMovementModal] = useState<"cash_in" | "cash_out" | null>(null);

  return (
    <section className={`${CARD} flex flex-col h-full`} data-testid="my-shift">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#E8E1D7] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-[#FAF5EB] text-[#8A6A24]">
            <Wallet className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#251605]">My Cashier Shift</h3>
            <p className="text-[11px] text-[#7A7167]">Manage your active cash drawer.</p>
          </div>
        </div>

        {shift ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E7F6EE] px-2.5 py-0.5 text-xs font-semibold text-[#146C43] border border-[#A3E0C1]">
            <span className="size-1.5 rounded-full bg-[#146C43] animate-pulse" />
            Shift Open
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-[#F5F2EC] px-2.5 py-0.5 text-xs font-medium text-[#7A7167] border border-[#E0D7CA]">
            No Open Shift
          </span>
        )}
      </div>

      {shift ? (
        <div className="flex flex-col justify-between flex-1 p-4 space-y-4">
          {/* Metadata Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="rounded-lg bg-[#FAF8F4] px-3 py-2 border border-[#F0EAE1]">
              <span className="text-[10px] uppercase font-semibold text-[#7A7167] block">
                Cashier
              </span>
              <span className="font-semibold text-[#251605] truncate block">{shift.staffName}</span>
            </div>
            <div className="rounded-lg bg-[#FAF8F4] px-3 py-2 border border-[#F0EAE1]">
              <span className="text-[10px] uppercase font-semibold text-[#7A7167] block">
                Opened
              </span>
              <span className="font-semibold text-[#251605] block">{dateTime(shift.openedAt)}</span>
            </div>
            <div className="rounded-lg bg-[#FAF8F4] px-3 py-2 border border-[#F0EAE1]">
              <span className="text-[10px] uppercase font-semibold text-[#7A7167] block">
                Duration
              </span>
              <span className="font-semibold text-[#251605] block">
                {formatShiftDuration(shift.openedAt, null, now)}
              </span>
            </div>
            <div className="rounded-lg bg-[#FAF8F4] px-3 py-2 border border-[#F0EAE1]">
              <span className="text-[10px] uppercase font-semibold text-[#7A7167] block">
                Business Date
              </span>
              <span className="font-semibold text-[#251605] block tabular-nums">
                {businessDate}
              </span>
            </div>
          </div>

          {/* Metric Strip with Expected Cash Emphasized */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="rounded-lg border border-[#E8E1D7] bg-white p-2.5 shadow-2xs">
              <span className="text-[11px] font-medium text-[#7A7167] block">Opening Cash</span>
              <span className="text-base font-semibold tabular-nums text-[#251605]">
                {money(shift.openingCash ?? 0)}
              </span>
            </div>

            {/* Expected Cash — Visually Emphasized with Tooltip */}
            <div className="rounded-lg border-2 border-[#C89933] bg-[#FDFBF7] p-2.5 shadow-2xs relative">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#8A6A24] uppercase tracking-wide">
                  Expected Cash
                </span>
                <span
                  title="Expected Cash = Opening Cash + Cash In - Cash Out + Cash Payments + Cash Deposits - Cash Refunds. Restaurant sales are not included."
                  className="cursor-help text-[#8A6A24]"
                >
                  <Info className="size-3.5" />
                </span>
              </div>
              <span className="text-lg font-bold tabular-nums text-[#251605] block mt-0.5">
                {money(shift.expected)}
              </span>
            </div>

            <div className="rounded-lg border border-[#E8E1D7] bg-white p-2.5 shadow-2xs">
              <span className="text-[11px] font-medium text-[#7A7167] block">Cash In</span>
              <span className="text-base font-semibold tabular-nums text-[#146C43]">
                +{money(shift.cashIn)}
              </span>
            </div>

            <div className="rounded-lg border border-[#E8E1D7] bg-white p-2.5 shadow-2xs">
              <span className="text-[11px] font-medium text-[#7A7167] block">Cash Out</span>
              <span className="text-base font-semibold tabular-nums text-[#B45309]">
                -{money(shift.cashOut)}
              </span>
            </div>
          </div>

          {/* Formula Helper / Drawer Note */}
          <div className="flex items-center justify-between rounded-lg bg-[#FAF8F4] px-3 py-2 border border-[#E8E1D7] text-xs text-[#7A7167]">
            <div className="flex items-center gap-1.5">
              <Info className="size-3.5 text-[#8A6A24]" />
              <span>
                Expected Cash formula: Opening + Cash In - Cash Out + Net Cash Tendered. Restaurant
                sales are not included.
              </span>
            </div>
            <div className="font-medium text-[#251605]">
              Net Cash Activity:{" "}
              <span className="tabular-nums font-semibold">{money(shift.hotelCash)}</span>
            </div>
          </div>

          {/* Operational Actions */}
          {canOperate ? (
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 border-[#E8E1D7] text-xs font-semibold text-[#251605] hover:bg-[#FAF8F4]"
                  onClick={() => setMovementModal("cash_in")}
                >
                  <ArrowDownLeft className="size-3.5 text-[#146C43]" />
                  Cash In
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 border-[#E8E1D7] text-xs font-semibold text-[#251605] hover:bg-[#FAF8F4]"
                  onClick={() => setMovementModal("cash_out")}
                >
                  <ArrowUpRight className="size-3.5 text-[#B45309]" />
                  Cash Out
                </Button>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 border-[#E8E1D7] text-xs font-semibold text-[#B91C1C] hover:bg-[#FEF2F2] hover:border-[#FCA5A5]"
                onClick={onClose}
              >
                Close Shift
              </Button>
            </div>
          ) : null}

          {/* Movement Dialog Modal */}
          {movementModal ? (
            <MovementDialog
              open={Boolean(movementModal)}
              onOpenChange={(open) => !open && setMovementModal(null)}
              restaurantId={restaurantId}
              shiftId={shift.id}
              kind={movementModal}
              onMoved={() => {
                setMovementModal(null);
                onMoved();
              }}
            />
          ) : null}
        </div>
      ) : (
        /* Empty State: Intentional, Compact & Purpose-built */
        <div className="flex flex-col items-center justify-center p-6 text-center space-y-3 flex-1">
          <div className="flex size-12 items-center justify-center rounded-full bg-[#FAF5EB] text-[#8A6A24] border border-[#EADFCB]">
            <Wallet className="size-6" />
          </div>

          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-[#251605]">
              No cashier shift is currently open for you
            </h4>
            <p className="text-xs text-[#7A7167] max-w-sm">
              Open a shift when you begin handling physical cash. Opening cash will become the
              starting expected drawer balance.
            </p>
          </div>

          <div className="text-xs text-[#5F554B]">
            Current Business Date:{" "}
            <span className="font-semibold text-[#251605]">{businessDate}</span>
          </div>

          {canOperate ? (
            <Button
              type="button"
              className="mt-1 min-h-10 px-5 bg-[#C89933] text-[#251605] hover:bg-[#B5882D] font-semibold text-xs shadow-xs"
              onClick={onOpen}
            >
              Open Shift
            </Button>
          ) : (
            <p className="text-xs text-[#A89F91] italic">
              Drawer operations require cashier or manager permissions.
            </p>
          )}

          <div className="text-[11px] text-[#A89F91] pt-1">
            Expected Cash calculations track physical currency in your drawer. Restaurant sales are
            not included.
          </div>
        </div>
      )}
    </section>
  );
}

// ============================================================================
// 2. QUICK ACTIONS CARD
// ============================================================================

function QuickActionsCard({ onNavigate }: { onNavigate: (tab: CashieringTabId) => void }) {
  return (
    <section className={`${CARD} flex flex-col h-full`}>
      <div className="flex items-center justify-between border-b border-[#E8E1D7] px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-[#251605]">Quick Actions</h3>
          <p className="text-[11px] text-[#7A7167]">Common cashiering tasks</p>
        </div>
      </div>

      <div className="p-3 grid grid-cols-2 gap-2 flex-1 content-start">
        {/* Primary Action */}
        <button
          type="button"
          onClick={() => onNavigate("folios")}
          className="col-span-2 flex items-center gap-2.5 rounded-lg border border-[#E0D0AE] bg-[#FAF5EB] px-3 py-2.5 text-xs font-semibold text-[#251605] hover:bg-[#F3EAD5] transition-colors shadow-2xs"
        >
          <Search className="size-4 text-[#8A6A24]" />
          <span>Find Folio</span>
        </button>

        {/* Secondary Actions */}
        <button
          type="button"
          onClick={() => onNavigate("folios")}
          className="flex items-center gap-2 rounded-lg border border-[#E8E1D7] bg-white px-2.5 py-2 text-xs font-medium text-[#251605] hover:bg-[#FAF8F4] transition-colors shadow-2xs"
        >
          <CreditCard className="size-3.5 text-[#146C43]" />
          <span>Receive Payment</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate("folios")}
          className="flex items-center gap-2 rounded-lg border border-[#E8E1D7] bg-white px-2.5 py-2 text-xs font-medium text-[#251605] hover:bg-[#FAF8F4] transition-colors shadow-2xs"
        >
          <PiggyBank className="size-3.5 text-[#0369A1]" />
          <span>Record Deposit</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate("folios")}
          className="flex items-center gap-2 rounded-lg border border-[#E8E1D7] bg-white px-2.5 py-2 text-xs font-medium text-[#251605] hover:bg-[#FAF8F4] transition-colors shadow-2xs"
        >
          <PlusCircle className="size-3.5 text-[#8A6A24]" />
          <span>Post Charge</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate("folios")}
          className="flex items-center gap-2 rounded-lg border border-[#E8E1D7] bg-white px-2.5 py-2 text-xs font-medium text-[#251605] hover:bg-[#FAF8F4] transition-colors shadow-2xs"
        >
          <FileText className="size-3.5 text-[#5F554B]" />
          <span>Create Invoice</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate("accounts")}
          className="flex items-center gap-2 rounded-lg border border-[#E8E1D7] bg-white px-2.5 py-2 text-xs font-medium text-[#251605] hover:bg-[#FAF8F4] transition-colors shadow-2xs"
        >
          <Building2 className="size-3.5 text-[#4338CA]" />
          <span>Company Invoice</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate("folios")}
          className="flex items-center gap-2 rounded-lg border border-[#E8E1D7] bg-white px-2.5 py-2 text-xs font-medium text-[#251605] hover:bg-[#FAF8F4] transition-colors shadow-2xs"
        >
          <Receipt className="size-3.5 text-[#B45309]" />
          <span>Settlement</span>
        </button>
      </div>
    </section>
  );
}

// ============================================================================
// 3. BUSINESS DATE ACTIVITY (8 COLS)
// ============================================================================

function BusinessDateActivity({
  activity,
  loading,
  error,
  money,
  businessDate,
}: {
  activity:
    | {
        viewedBusinessDate: string;
        payments: { amount: number; count: number };
        deposits: { amount: number; count: number };
        refunds: { amount: number; count: number };
        transactions: number;
        departuresDue: unknown[];
        paymentMethods: Array<{
          method: string;
          paymentAmount: number;
          depositAmount: number;
          refundAmount: number;
          net: number;
          count: number;
        }>;
      }
    | undefined;
  loading: boolean;
  error: string | null;
  money: (value: number) => string;
  businessDate: string;
}) {
  return (
    <section className={CARD} data-testid="business-date-activity">
      <div className="border-b border-[#E8E1D7] px-4 py-3">
        <h3 className="text-sm font-semibold text-[#251605]">Business Date Activity</h3>
        <p className="text-[11px] text-[#7A7167]">
          Property activity for Business Date {businessDate}.
        </p>
      </div>

      <div className="p-4 space-y-4">
        {loading ? <p className="text-xs text-[#7A7167]">Loading business date activity…</p> : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        {/* 4 Compact KPI Cards */}
        {activity ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F4] p-3 shadow-2xs">
              <div className="flex items-center justify-between text-[#146C43] mb-1">
                <span className="text-[10px] uppercase font-bold text-[#7A7167]">Payments</span>
                <ArrowDownLeft className="size-4" />
              </div>
              <p className="text-base font-bold tabular-nums text-[#251605]">
                {money(activity.payments.amount)}
              </p>
              <p className="text-[10px] text-[#7A7167] mt-0.5">
                {activity.payments.count} payments
              </p>
            </div>

            <div className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F4] p-3 shadow-2xs">
              <div className="flex items-center justify-between text-[#0369A1] mb-1">
                <span className="text-[10px] uppercase font-bold text-[#7A7167]">Deposits</span>
                <Landmark className="size-4" />
              </div>
              <p className="text-base font-bold tabular-nums text-[#251605]">
                {money(activity.deposits.amount)}
              </p>
              <p className="text-[10px] text-[#7A7167] mt-0.5">
                {activity.deposits.count} deposits
              </p>
            </div>

            <div className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F4] p-3 shadow-2xs">
              <div className="flex items-center justify-between text-[#B91C1C] mb-1">
                <span className="text-[10px] uppercase font-bold text-[#7A7167]">Refunds</span>
                <ArrowUpRight className="size-4" />
              </div>
              <p className="text-base font-bold tabular-nums text-[#251605]">
                {money(activity.refunds.amount)}
              </p>
              <p className="text-[10px] text-[#7A7167] mt-0.5">{activity.refunds.count} refunds</p>
            </div>

            <div className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F4] p-3 shadow-2xs">
              <div className="flex items-center justify-between text-[#8A6A24] mb-1">
                <span className="text-[10px] uppercase font-bold text-[#7A7167]">Transactions</span>
                <Receipt className="size-4" />
              </div>
              <p className="text-base font-bold tabular-nums text-[#251605]">
                {activity.transactions}
              </p>
              <p className="text-[10px] text-[#7A7167] mt-0.5">Total events</p>
            </div>
          </div>
        ) : null}

        {/* Payment Method Summary Table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-[#251605]">Payment Method Summary</h4>
            <span className="text-[11px] text-[#7A7167]">
              Property activity for the selected Business Date.
            </span>
          </div>

          {activity && activity.paymentMethods.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-[#E8E1D7]">
              <table className="w-full text-xs">
                <thead className="bg-[#FAF8F4] text-left text-[10px] uppercase tracking-wide text-[#7A7167] border-b border-[#E8E1D7]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Method</th>
                    <th className="px-3 py-2 text-right font-medium">Payments</th>
                    <th className="px-3 py-2 text-right font-medium">Deposits</th>
                    <th className="px-3 py-2 text-right font-medium">Refunds</th>
                    <th className="px-3 py-2 text-right font-medium">Net</th>
                    <th className="px-3 py-2 text-right font-medium">Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E1D7]">
                  {activity.paymentMethods.map((row) => (
                    <tr key={row.method} className="hover:bg-[#FCFBF9]">
                      <td className="px-3 py-2 font-medium text-[#251605]">
                        {methodLabel(row.method)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#146C43]">
                        {money(row.paymentAmount)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#0369A1]">
                        {money(row.depositAmount)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#B91C1C]">
                        {money(row.refundAmount)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#251605]">
                        {money(row.net)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#7A7167]">
                        {row.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F4] p-3 text-center text-xs text-[#7A7167]">
              No tender movements recorded for this Business Date.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// 4. NEEDS ATTENTION CARD (4 COLS)
// ============================================================================

function NeedsAttentionCard({
  rows,
  money,
}: {
  rows: Array<{
    folioId: string;
    folioNumber: string;
    room: string | null;
    guest: string;
    departure: string;
    balance: number;
  }>;
  money: (value: number) => string;
}) {
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? rows : rows.slice(0, 3);

  return (
    <section className={CARD} data-testid="departures-due">
      <div className="flex items-center justify-between border-b border-[#E8E1D7] px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-[#251605]">Needs Attention</h3>
          <p className="text-[11px] text-[#7A7167]">Departures with balance</p>
        </div>
        <span
          className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${
            rows.length > 0
              ? "bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]"
              : "bg-[#E7F6EE] text-[#146C43] border-[#A3E0C1]"
          }`}
        >
          {rows.length}
        </span>
      </div>

      <div className="p-3">
        {rows.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-4 text-center text-xs text-[#146C43]">
            <CheckCircle2 className="size-4 shrink-0" />
            <span>No departures with outstanding balances.</span>
          </div>
        ) : (
          <div className="space-y-2">
            {displayed.map((row) => (
              <div
                key={row.folioId}
                className="flex items-center justify-between gap-2 rounded-lg border border-[#E8E1D7] bg-[#FAF8F4] p-2.5 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-[#251605] truncate">{row.guest}</span>
                    <span className="rounded bg-[#EFECE6] px-1.5 py-0.2 text-[10px] font-semibold text-[#5F554B]">
                      {row.room ? `Rm ${row.room}` : "No Rm"}
                    </span>
                  </div>
                  <div className="text-[10px] text-[#7A7167] truncate mt-0.5">
                    Folio {row.folioNumber} · Due:{" "}
                    <span className="font-semibold text-[#B91C1C] tabular-nums">
                      {money(row.balance)}
                    </span>
                  </div>
                </div>

                <Link
                  to="/restaurant/pms/cashiering/folios/$folioId"
                  params={{ folioId: row.folioId }}
                  search={{ tab: "settlement" }}
                  className="rounded border border-[#E8E1D7] bg-white px-2.5 py-1 text-xs font-semibold text-[#8A6A24] hover:bg-[#FAF5EB] shadow-2xs shrink-0"
                >
                  Settle
                </Link>
              </div>
            ))}

            {rows.length > 3 ? (
              <button
                type="button"
                onClick={() => setShowAll((prev) => !prev)}
                className="w-full text-center text-xs font-semibold text-[#8A6A24] hover:underline pt-1"
              >
                {showAll ? "Show Less" : `View all ${rows.length} departures`}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

// ============================================================================
// 5. OTHER OPEN SHIFTS (MANAGER ONLY)
// ============================================================================

function OtherShiftsCard({
  rows,
  money,
  dateTime,
  now,
  onClose,
}: {
  rows: CashierShiftRow[];
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  now: number;
  onClose: (id: string) => void;
}) {
  return (
    <section className={CARD} data-testid="other-open-shifts">
      <div className="flex items-center justify-between border-b border-[#E8E1D7] px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-[#251605]">Other Open Shifts</h3>
          <p className="text-[11px] text-[#7A7167]">Active property drawers</p>
        </div>
        <span className="text-xs font-semibold text-[#7A7167] tabular-nums">{rows.length}</span>
      </div>

      <div className="p-3">
        {rows.length === 0 ? (
          <p className="py-2 text-center text-xs text-[#7A7167]">
            No other cashier has an open shift.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((shift) => (
              <div
                key={shift.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-[#E8E1D7] bg-[#FAF8F4] p-2.5 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[#251605] truncate">{shift.staffName}</p>
                  <p className="text-[10px] text-[#7A7167] mt-0.5">
                    {formatShiftDuration(shift.openedAt, null, now)} · Expected:{" "}
                    <span className="font-semibold text-[#251605] tabular-nums">
                      {money(shift.expected)}
                    </span>
                  </p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 border-[#E8E1D7] text-xs font-semibold text-[#B91C1C] hover:bg-[#FEF2F2]"
                  onClick={() => onClose(shift.id)}
                >
                  Close
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ============================================================================
// 6. RECENT TRANSACTIONS (12 COLS FULL WIDTH)
// ============================================================================

function RecentTransactionsCard({
  rows,
  money,
  dateTime,
  onViewAll,
}: {
  rows: Array<{
    id: string;
    occurredAt: string;
    label: string;
    guestOrAccount: string;
    description: string;
    amount: number;
    method: string | null;
    actor: string | null;
  }>;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  onViewAll: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const displayed = expanded ? rows : rows.slice(0, 8);

  return (
    <section className={CARD} data-testid="recent-business-events">
      <div className="flex items-center justify-between border-b border-[#E8E1D7] px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-[#251605]">Recent Transactions</h3>
          <p className="text-[11px] text-[#7A7167]">
            Grouped business events on the viewed business date.
          </p>
        </div>

        <button
          type="button"
          onClick={onViewAll}
          className="text-xs font-semibold text-[#8A6A24] hover:underline"
        >
          View Transaction History
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="p-4 text-xs text-[#7A7167]">No business events on this business date.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs">
            <thead className="bg-[#FAF8F4] text-left text-[10px] uppercase tracking-wide text-[#7A7167] border-b border-[#E8E1D7]">
              <tr>
                <th className="px-3 py-2.5 font-medium">Time</th>
                <th className="px-3 py-2.5 font-medium">Type</th>
                <th className="px-3 py-2.5 font-medium">Guest / Account</th>
                <th className="px-3 py-2.5 font-medium">Description</th>
                <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                <th className="px-3 py-2.5 font-medium">Method</th>
                <th className="px-3 py-2.5 font-medium">Actor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E1D7]">
              {displayed.map((row) => (
                <tr key={row.id} className="hover:bg-[#FCFBF9]">
                  <td className="px-3 py-2 text-[#5F554B] tabular-nums">
                    {dateTime(row.occurredAt)}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-block rounded-md bg-[#FAF5EB] px-2 py-0.5 text-[10px] font-semibold text-[#8A6A24] border border-[#EADFCB]">
                      {row.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-medium text-[#251605]">{row.guestOrAccount}</td>
                  <td className="px-3 py-2 text-[#5F554B] max-w-xs truncate">{row.description}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#251605]">
                    {money(row.amount)}
                  </td>
                  <td className="px-3 py-2">{row.method ? methodLabel(row.method) : "—"}</td>
                  <td className="px-3 py-2 text-[#7A7167]">{row.actor ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {rows.length > 8 ? (
            <div className="border-t border-[#E8E1D7] p-2 text-center bg-[#FAF8F4]">
              <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                className="text-xs font-semibold text-[#8A6A24] hover:underline"
              >
                {expanded ? "Show Less" : `View All (${rows.length})`}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

// ============================================================================
// 7. SHIFT HISTORY (12 COLS FULL WIDTH)
// ============================================================================

function ShiftHistoryCard({
  rows,
  money,
  dateTime,
  ownOnly,
}: {
  rows: CashierShiftRow[];
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  ownOnly: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const displayed = expanded ? rows : rows.slice(0, 5);

  return (
    <section className={CARD}>
      <div className="flex items-center justify-between border-b border-[#E8E1D7] px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-[#251605]">Shift History</h3>
          <p className="text-[11px] text-[#7A7167]">
            {ownOnly ? "Your previous cashier shifts" : "Property cashier shift reconciliation"}
          </p>
        </div>
        <span className="text-xs text-[#7A7167] tabular-nums font-medium">
          {rows.length} recorded
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="p-4 text-xs text-[#7A7167]">No cashier shifts recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-xs">
            <thead className="bg-[#FAF8F4] text-left text-[10px] uppercase tracking-wide text-[#7A7167] border-b border-[#E8E1D7]">
              <tr>
                <th className="px-3 py-2.5 font-medium">Cashier</th>
                <th className="px-3 py-2.5 font-medium">Opened</th>
                <th className="px-3 py-2.5 font-medium">Closed</th>
                <th className="px-3 py-2.5 text-right font-medium">Opening</th>
                <th className="px-3 py-2.5 text-right font-medium">Expected</th>
                <th className="px-3 py-2.5 text-right font-medium">Counted</th>
                <th className="px-3 py-2.5 text-right font-medium">Variance</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E1D7]">
              {displayed.map((shift) => {
                const isMatched = shift.variance !== null && Math.abs(shift.variance) < 0.01;

                return (
                  <tr key={shift.id} className="hover:bg-[#FCFBF9]">
                    <td className="px-3 py-2 font-medium text-[#251605]">{shift.staffName}</td>
                    <td className="px-3 py-2 text-[#5F554B] tabular-nums">
                      {dateTime(shift.openedAt)}
                    </td>
                    <td className="px-3 py-2 text-[#5F554B] tabular-nums">
                      {shift.closedAt ? dateTime(shift.closedAt) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {shift.openingCash === null ? "—" : money(shift.openingCash)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-[#251605]">
                      {money(shift.expected)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {shift.closingCash === null ? "—" : money(shift.closingCash)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {shift.variance === null ? (
                        "—"
                      ) : isMatched ? (
                        <span className="inline-block rounded-full bg-[#E7F6EE] px-2 py-0.5 text-[10px] font-semibold text-[#146C43] border border-[#A3E0C1]">
                          Matched
                        </span>
                      ) : (
                        <span className="inline-block rounded-full bg-[#FEF2F2] px-2 py-0.5 text-[10px] font-semibold text-[#B91C1C] border border-[#FECACA]">
                          {shift.variance > 0 ? "+" : ""}
                          {money(shift.variance)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 capitalize text-[#5F554B]">{shift.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {rows.length > 5 ? (
            <div className="border-t border-[#E8E1D7] p-2 text-center bg-[#FAF8F4]">
              <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                className="text-xs font-semibold text-[#8A6A24] hover:underline"
              >
                {expanded ? "Show Less" : `View All (${rows.length})`}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

// ============================================================================
// 8. OPEN SHIFT FORM (COMPACT TWO-COLUMN DIALOG)
// ============================================================================

function OpenShiftForm({
  restaurantId,
  businessDate,
  previous,
  money,
  dateTime,
  onCancel,
  onOpened,
}: {
  restaurantId: string;
  businessDate: string;
  previous: CashierShiftRow | null;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  onCancel: () => void;
  onOpened: () => void;
}) {
  const [openingCash, setOpeningCash] = useState("0");
  const [notes, setNotes] = useState("");
  const openShift = useServerFn(openCashierShift);
  const mutation = useMutation({
    mutationFn: async () => {
      const amount = Number(openingCash);
      if (!Number.isFinite(amount) || amount < 0)
        throw new Error("Enter an opening cash amount of zero or more.");
      return openShift({ data: { restaurantId, openingCash: amount, notes } });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Cashier shift opened");
      onOpened();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <form
      data-testid="open-shift-form"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
      className="flex flex-col"
    >
      <div className="border-b border-[#E8E1D7] px-6 py-4 bg-[#FAF8F4]">
        <h3 className="text-base font-semibold text-[#251605]">Open Cashier Shift</h3>
        <p className="text-xs text-[#7A7167]">Initialize your cash drawer for active operations.</p>
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Left Column: Form Inputs */}
        <div className="space-y-4">
          <div className="rounded-lg bg-[#FAF8F4] p-3 border border-[#E8E1D7] text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-[#7A7167]">Business Date</span>
              <span className="font-semibold text-[#251605]">{businessDate}</span>
            </div>
            <p className="text-[10px] text-[#A89F91]">
              Opening timestamp is verified and recorded by the server.
            </p>
          </div>

          <div>
            <Label htmlFor="opening-cash" className="text-xs font-semibold text-[#251605]">
              Opening Cash Amount
            </Label>
            <Input
              id="opening-cash"
              type="number"
              min="0"
              step="0.01"
              value={openingCash}
              onChange={(event) => setOpeningCash(event.target.value)}
              className="mt-1.5 min-h-10 text-sm font-semibold"
              required
              autoFocus
            />
            <p className="mt-1 text-[11px] text-[#7A7167]">
              Count of physical cash currency placed in this drawer.
            </p>
          </div>

          <div>
            <Label htmlFor="opening-note" className="text-xs font-semibold text-[#251605]">
              Opening Note (Optional)
            </Label>
            <Textarea
              id="opening-note"
              value={notes}
              maxLength={300}
              placeholder="e.g. Standard float verified..."
              onChange={(event) => setNotes(event.target.value)}
              className="mt-1.5 text-xs resize-none"
              rows={3}
            />
          </div>
        </div>

        {/* Right Column: Previous Shift Summary */}
        <div className="rounded-xl border border-[#E8E1D7] bg-[#FAF8F4] p-4 flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#8A6A24] mb-3">
              Previous Closed Shift
            </h4>
            {previous ? (
              <dl className="grid grid-cols-2 gap-2.5 text-xs">
                <div>
                  <dt className="text-[10px] text-[#7A7167] uppercase">Cashier</dt>
                  <dd className="font-semibold text-[#251605] truncate">{previous.staffName}</dd>
                </div>
                <div>
                  <dt className="text-[10px] text-[#7A7167] uppercase">Closed At</dt>
                  <dd className="font-semibold text-[#251605]">{dateTime(previous.closedAt)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] text-[#7A7167] uppercase">Expected</dt>
                  <dd className="font-semibold text-[#251605] tabular-nums">
                    {money(previous.expected)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] text-[#7A7167] uppercase">Counted</dt>
                  <dd className="font-semibold text-[#251605] tabular-nums">
                    {previous.closingCash === null ? "—" : money(previous.closingCash)}
                  </dd>
                </div>
                <div className="col-span-2 pt-1 border-t border-[#E8E1D7]">
                  <dt className="text-[10px] text-[#7A7167] uppercase">Variance</dt>
                  <dd className="font-bold tabular-nums">
                    {previous.variance === null ? (
                      "—"
                    ) : Math.abs(previous.variance) < 0.01 ? (
                      <span className="text-[#146C43]">Matched (0.00)</span>
                    ) : (
                      <span className="text-[#B91C1C]">
                        {previous.variance > 0 ? "+" : ""}
                        {money(previous.variance)}
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-xs text-[#7A7167]">No previous closed shift on record.</p>
            )}
          </div>

          <div className="mt-4 rounded-lg bg-white p-2.5 border border-[#E8E1D7] text-[11px] text-[#7A7167]">
            Ensure the physical cash drawer matches your entered opening cash before serving guests.
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-[#E8E1D7] px-6 py-3 bg-[#FAF8F4]">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} className="h-9">
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          className="h-9 bg-[#C89933] text-[#251605] hover:bg-[#B5882D] font-semibold px-4"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? "Opening…" : "Open Cashier Shift"}
        </Button>
      </div>
    </form>
  );
}

// ============================================================================
// 9. CLOSE SHIFT FORM (STRUCTURED RECONCILIATION MODAL)
// ============================================================================

function CloseShiftForm({
  restaurantId,
  shift,
  businessDate,
  money,
  dateTime,
  now,
  onCancel,
  onClosed,
}: {
  restaurantId: string;
  shift: CashierShiftRow | null;
  businessDate: string;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  now: number;
  onCancel: () => void;
  onClosed: (shift: CashierShiftRow) => void;
}) {
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const fetchActivity = useServerFn(getCashierShiftActivity);
  const closeShift = useServerFn(closeCashierShift);
  const activityQuery = useQuery({
    queryKey: ["cashier-shift-activity", restaurantId, shift?.id],
    queryFn: () => fetchActivity({ data: { restaurantId, shiftId: shift!.id } }),
    enabled: Boolean(shift?.id),
    retry: false,
  });

  const countedValue = counted.trim() === "" ? null : Number(counted);
  const variance =
    shift && countedValue !== null && Number.isFinite(countedValue)
      ? variancePresentation(countedValue, shift.expected)
      : variancePresentation(null, shift?.expected ?? 0);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!shift) throw new Error("That shift is no longer open.");
      if (countedValue === null || !Number.isFinite(countedValue) || countedValue < 0) {
        throw new Error("Enter the counted cash amount.");
      }
      return closeShift({
        data: { restaurantId, shiftId: shift.id, closingCash: countedValue, notes },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      if (!shift || countedValue === null) return;
      const closed = variancePresentation(countedValue, shift.expected);
      toast.success("Cashier shift closed");
      onClosed({
        ...shift,
        status: "closed",
        closedAt: new Date().toISOString(),
        closingCash: countedValue,
        variance: closed.difference,
        notes: notes.trim() || shift.notes,
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!shift) return <p className="p-6 text-sm text-[#7A7167]">That shift is no longer open.</p>;
  const lines = activityQuery.data?.lines ?? [];
  const splits = activityQuery.data;

  return (
    <form
      data-testid="close-shift"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
      className="flex flex-col"
    >
      <div className="border-b border-[#E8E1D7] px-6 py-4 bg-[#FAF8F4]">
        <h3 className="text-base font-semibold text-[#251605]">Close Cashier Shift</h3>
        <p className="text-xs text-[#7A7167]">
          Reconcile physical cash drawer and balance against expected amounts.
        </p>
      </div>

      <div className="p-6 space-y-5">
        {/* Top Header Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 rounded-xl border border-[#E8E1D7] bg-[#FAF8F4] p-3 text-xs">
          <div>
            <span className="text-[10px] uppercase font-semibold text-[#7A7167] block">
              Cashier
            </span>
            <span className="font-semibold text-[#251605] truncate block">{shift.staffName}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-semibold text-[#7A7167] block">Opened</span>
            <span className="font-semibold text-[#251605] block">{dateTime(shift.openedAt)}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-semibold text-[#7A7167] block">
              Duration
            </span>
            <span className="font-semibold text-[#251605] block">
              {formatShiftDuration(shift.openedAt, null, now)}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-semibold text-[#7A7167] block">
              Business Date
            </span>
            <span className="font-semibold text-[#251605] block tabular-nums">{businessDate}</span>
          </div>
        </div>

        {/* 2-Column: Position vs Count */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left: Expected Cash Breakdown */}
          <div className="rounded-xl border border-[#E8E1D7] bg-white p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#8A6A24]">
              Shift Cash Position
            </h4>

            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded bg-[#FAF8F4] p-2">
                <dt className="text-[10px] text-[#7A7167]">Opening Cash</dt>
                <dd className="font-semibold tabular-nums text-[#251605]">
                  {money(shift.openingCash ?? 0)}
                </dd>
              </div>
              <div className="rounded bg-[#FAF8F4] p-2">
                <dt className="text-[10px] text-[#7A7167]">Cash In</dt>
                <dd className="font-semibold tabular-nums text-[#146C43]">
                  +{money(shift.cashIn)}
                </dd>
              </div>
              <div className="rounded bg-[#FAF8F4] p-2">
                <dt className="text-[10px] text-[#7A7167]">Cash Out</dt>
                <dd className="font-semibold tabular-nums text-[#B91C1C]">
                  -{money(shift.cashOut)}
                </dd>
              </div>
              <div className="rounded bg-[#FAF8F4] p-2">
                <dt className="text-[10px] text-[#7A7167]">Cash Payments</dt>
                <dd className="font-semibold tabular-nums text-[#146C43]">
                  +{money(splits?.cashPayments ?? 0)}
                </dd>
              </div>
              <div className="rounded bg-[#FAF8F4] p-2">
                <dt className="text-[10px] text-[#7A7167]">Cash Deposits</dt>
                <dd className="font-semibold tabular-nums text-[#0369A1]">
                  +{money(splits?.cashDeposits ?? 0)}
                </dd>
              </div>
              <div className="rounded bg-[#FAF8F4] p-2">
                <dt className="text-[10px] text-[#7A7167]">Cash Refunds</dt>
                <dd className="font-semibold tabular-nums text-[#B91C1C]">
                  -{money(splits?.cashRefunds ?? 0)}
                </dd>
              </div>
            </dl>

            <div className="rounded-lg border-2 border-[#C89933] bg-[#FDFBF7] p-2.5">
              <span className="text-[10px] uppercase font-bold text-[#8A6A24] block">
                Total Expected Cash
              </span>
              <span className="text-lg font-bold tabular-nums text-[#251605]">
                {money(shift.expected)}
              </span>
            </div>
          </div>

          {/* Right: Cash Count & Variance */}
          <div className="rounded-xl border border-[#E8E1D7] bg-white p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#8A6A24]">
              Physical Cash Count
            </h4>

            <div>
              <Label htmlFor="counted-cash" className="text-xs font-semibold text-[#251605]">
                Counted Cash in Drawer
              </Label>
              <Input
                id="counted-cash"
                type="number"
                min="0"
                step="0.01"
                value={counted}
                onChange={(event) => setCounted(event.target.value)}
                placeholder="0.00"
                className="mt-1 min-h-10 text-base font-bold tabular-nums"
                required
                autoFocus
              />
            </div>

            {/* Reconciliation Comparison */}
            <div className="grid grid-cols-2 gap-2 text-xs rounded-lg bg-[#FAF8F4] p-2.5 border border-[#E8E1D7]">
              <div>
                <span className="text-[10px] text-[#7A7167] block uppercase">Counted</span>
                <span className="font-semibold text-[#251605] tabular-nums">
                  {countedValue === null ? "—" : money(countedValue)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-[#7A7167] block uppercase">Variance</span>
                <span className="font-bold tabular-nums">
                  {variance.difference === null ? (
                    "—"
                  ) : Math.abs(variance.difference) < 0.01 ? (
                    <span className="text-[#146C43]">0.00 (Matched)</span>
                  ) : (
                    <span className="text-[#B91C1C]">
                      {variance.difference > 0 ? "+" : ""}
                      {money(variance.difference)}
                    </span>
                  )}
                </span>
              </div>
            </div>

            {variance.label === "Variance" && variance.difference !== null ? (
              <div className="rounded-lg bg-[#FFFBEB] p-2 border border-[#FCD34D] text-[11px] text-[#92400E]">
                A cash variance of {money(variance.difference)} will be recorded permanently with
                this shift.
              </div>
            ) : null}

            <div>
              <Label htmlFor="close-note" className="text-xs font-semibold text-[#251605]">
                Closing Note (Optional)
              </Label>
              <Textarea
                id="close-note"
                value={notes}
                maxLength={300}
                placeholder="Reason for variance, handover notes..."
                onChange={(event) => setNotes(event.target.value)}
                className="mt-1 text-xs resize-none"
                rows={2}
              />
            </div>
          </div>
        </div>

        {/* Bottom: Shift Cash Movements Activity */}
        <div className="rounded-xl border border-[#E8E1D7] bg-white overflow-hidden">
          <div className="border-b border-[#E8E1D7] px-4 py-2.5 bg-[#FAF8F4]">
            <h4 className="text-xs font-semibold text-[#251605]">
              Drawer Cash Movements ({lines.length})
            </h4>
          </div>

          {lines.length === 0 ? (
            <p className="p-3 text-xs text-[#7A7167]">
              No cash movements recorded during this shift.
            </p>
          ) : (
            <div className="max-h-36 overflow-y-auto divide-y divide-[#E8E1D7] text-xs">
              {lines.map((line) => (
                <div
                  key={line.id}
                  className="flex items-center justify-between px-4 py-2 hover:bg-[#FAF8F4]"
                >
                  <div>
                    <span className="font-medium text-[#251605]">
                      {line.accountTitle ?? line.description}
                    </span>
                    <span className="text-[10px] text-[#7A7167] block">
                      {dateTime(line.occurredAt)}
                      {line.accountTitle
                        ? ` · ${line.party ?? "Account"} · Cash${line.actor ? ` · ${line.actor}` : ""}`
                        : line.guest
                          ? ` · ${line.guest}`
                          : ""}
                    </span>
                  </div>
                  <span className="font-semibold tabular-nums text-[#251605]">
                    {money(line.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-[#E8E1D7] px-6 py-3 bg-[#FAF8F4]">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} className="h-9">
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          className="h-9 bg-[#B91C1C] text-white hover:bg-[#991B1B] font-semibold px-4"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? "Closing…" : "Confirm Close Shift"}
        </Button>
      </div>
    </form>
  );
}

// ============================================================================
// 10. REUSABLE MOVEMENT DIALOG (CASH IN / CASH OUT)
// ============================================================================

function MovementDialog({
  open,
  onOpenChange,
  restaurantId,
  shiftId,
  kind,
  onMoved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurantId: string;
  shiftId: string;
  kind: "cash_in" | "cash_out";
  onMoved: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const post = useServerFn(postHotelDrawerMovement);

  const mutation = useMutation({
    mutationFn: async () => {
      const value = Number(amount);
      if (!Number.isFinite(value) || value <= 0)
        throw new Error("Enter an amount greater than zero.");
      return post({
        data: {
          restaurantId,
          shiftId,
          movementType: kind,
          amount: value,
          notes,
          idempotencyKey: crypto.randomUUID(),
        },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(kind === "cash_in" ? "Cash In recorded" : "Cash Out recorded");
      setAmount("");
      setNotes("");
      onMoved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const isCashIn = kind === "cash_in";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white border border-[#E8E1D7] rounded-xl p-0 overflow-hidden shadow-lg">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="border-b border-[#E8E1D7] px-5 py-3.5 bg-[#FAF8F4]">
            <DialogTitle className="text-sm font-semibold text-[#251605]">
              {isCashIn ? "Post Cash In" : "Post Cash Out"}
            </DialogTitle>
            <DialogDescription className="text-xs text-[#7A7167] mt-0.5">
              {isCashIn ? "Cash In increases Expected Cash." : "Cash Out decreases Expected Cash."}
            </DialogDescription>
          </div>

          <div className="p-5 space-y-3.5">
            <div>
              <Label htmlFor={`${kind}-amount`} className="text-xs font-semibold text-[#251605]">
                Amount
              </Label>
              <Input
                id={`${kind}-amount`}
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                className="mt-1 min-h-10 text-sm font-semibold"
                required
                autoFocus
              />
            </div>

            <div>
              <Label htmlFor={`${kind}-notes`} className="text-xs font-semibold text-[#251605]">
                Reason / Notes
              </Label>
              <Textarea
                id={`${kind}-notes`}
                value={notes}
                maxLength={300}
                placeholder={
                  isCashIn
                    ? "e.g. Additional drawer change..."
                    : "e.g. Safe drop / petty expense..."
                }
                onChange={(event) => setNotes(event.target.value)}
                className="mt-1 text-xs resize-none"
                rows={3}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[#E8E1D7] px-5 py-3 bg-[#FAF8F4]">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-9"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className={`h-9 font-semibold px-4 text-white ${
                isCashIn ? "bg-[#146C43] hover:bg-[#0F5333]" : "bg-[#B45309] hover:bg-[#92400E]"
              }`}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Posting…" : isCashIn ? "Post Cash In" : "Post Cash Out"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// 11. CLOSED SUMMARY CONFIRMATION CARD
// ============================================================================

function ClosedSummary({
  shift,
  businessDate,
  money,
  dateTime,
  canOperate,
  onOpen,
  onDismiss,
}: {
  shift: CashierShiftRow;
  businessDate: string;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  canOperate: boolean;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const variance = variancePresentation(shift.closingCash, shift.expected);
  const isMatched = variance.difference !== null && Math.abs(variance.difference) < 0.01;

  return (
    <section
      className={`${CARD} p-4 border-[#C89933] bg-[#FAF8F4]`}
      data-testid="shift-closed-summary"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-[#146C43]" />
          <div>
            <h3 className="text-sm font-semibold text-[#251605]">Shift Successfully Closed</h3>
            <p className="text-xs text-[#7A7167]">Reconciliation recorded for {shift.staffName}.</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-[#7A7167] hover:text-[#251605]"
          aria-label="Dismiss"
        >
          <X className="size-4" />
        </button>
      </div>

      <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs">
        <div className="rounded bg-white p-2 border border-[#E8E1D7]">
          <dt className="text-[10px] text-[#7A7167] uppercase">Opened / Closed</dt>
          <dd className="font-semibold text-[#251605]">
            {dateTime(shift.openedAt)} → {dateTime(shift.closedAt)}
          </dd>
        </div>
        <div className="rounded bg-white p-2 border border-[#E8E1D7]">
          <dt className="text-[10px] text-[#7A7167] uppercase">Expected Cash</dt>
          <dd className="font-semibold text-[#251605] tabular-nums">{money(shift.expected)}</dd>
        </div>
        <div className="rounded bg-white p-2 border border-[#E8E1D7]">
          <dt className="text-[10px] text-[#7A7167] uppercase">Counted Cash</dt>
          <dd className="font-semibold text-[#251605] tabular-nums">
            {shift.closingCash === null ? "—" : money(shift.closingCash)}
          </dd>
        </div>
        <div className="rounded bg-white p-2 border border-[#E8E1D7]">
          <dt className="text-[10px] text-[#7A7167] uppercase">Variance</dt>
          <dd className="font-bold tabular-nums">
            {variance.difference === null ? (
              "—"
            ) : isMatched ? (
              <span className="text-[#146C43]">Matched (0.00)</span>
            ) : (
              <span className="text-[#B91C1C]">
                {variance.difference > 0 ? "+" : ""}
                {money(variance.difference)}
              </span>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex items-center justify-end gap-2">
        {canOperate ? (
          <Button
            type="button"
            size="sm"
            className="h-8 bg-[#C89933] text-[#251605] hover:bg-[#B5882D] font-semibold text-xs"
            onClick={onOpen}
          >
            Open New Shift
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={onDismiss}
        >
          Back to Control
        </Button>
      </div>
    </section>
  );
}

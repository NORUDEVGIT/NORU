import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Printer, ReceiptText, RotateCcw, Wallet } from "lucide-react";
import {
  RmCashUpFlow,
  RmShiftListsSheet,
  RmUnpaidDraftBlock,
} from "@/packages/restaurant-management/components/rm-pos/rm-cash-up-flow";
import { canStartCashUp } from "@/packages/restaurant-management/lib/rm-cash-up";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { NoruLogo } from "@/core/components/noru-logo";
import { PosMenuPanel } from "@/packages/restaurant-management/components/rm-pos/pos-menu-panel";
import { PosSalePanel, type PosLine, type PosOrderType } from "@/packages/restaurant-management/components/rm-pos/pos-sale-panel";
import { PosPaymentDialog, type PosPaymentChoice } from "@/packages/restaurant-management/components/rm-pos/pos-payment-dialog";
import { ChargeToRoomDialog } from "@/packages/restaurant-management/components/orders/charge-to-room-dialog";
import { RecentPaidSalesSheet } from "@/packages/restaurant-management/components/rm-pos/recent-paid-sales-sheet";
import { getPosContext, openPosShift, payPosSale, placePosSale, type PosMenuItem, type PosSale } from "@/packages/restaurant-management/lib/rm-pos.functions";
import { DEFAULT_RM_TAX_SETTINGS } from "@/packages/restaurant-management/lib/rm-tax";
import { getMyRestaurants } from "@/core/lib/restaurant.functions";
import { useAuth } from "@/core/state/auth-store";
import { RestaurantSettingsProvider, useMoney, useRestaurantTime } from "@/packages/restaurant-management/state/restaurant-context";
import { formatMoney } from "@/shared/lib/property-time";


interface HeldSale {
  id: string;
  lines: PosLine[];
  orderType: PosOrderType;
}

export function PosPage() {
  const { session, user } = useAuth();
  const fetchRestaurants = useServerFn(getMyRestaurants);
  const { data, isLoading } = useQuery({
    queryKey: ["my-restaurants", user?.id],
    queryFn: () => fetchRestaurants(),
    enabled: !!session && !!user?.id,
    retry: false,
  });

  const membership = data?.[0];

  if (isLoading) {
    return <Centered>Loading the till…</Centered>;
  }
  if (!membership) {
    return (
      <Centered>
        <p>You need a property membership to use the till.</p>
        <Link to="/restaurant/login" className="mt-3 inline-block underline">
          Sign in
        </Link>
      </Centered>
    );
  }

  return (
    <RestaurantSettingsProvider
      timezone={membership.restaurant.timezone}
      currencyCode={membership.restaurant.currencyCode}
    >
      <PosTill restaurantId={membership.restaurant.id} propertyName={membership.restaurant.name} />
    </RestaurantSettingsProvider>
  );
}

function PosTill({ restaurantId, propertyName }: { restaurantId: string; propertyName: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const money = useMoney();
  const { dateTime } = useRestaurantTime();

  const loadContext = useServerFn(getPosContext);
  const openShift = useServerFn(openPosShift);
  const placeSale = useServerFn(placePosSale);
  const paySale = useServerFn(payPosSale);

  const [lines, setLines] = useState<PosLine[]>([]);
  const [orderType, setOrderType] = useState<PosOrderType>("counter");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [held, setHeld] = useState<HeldSale[]>([]);
  const [openingCash, setOpeningCash] = useState("0");
  const [sale, setSale] = useState<PosSale | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [roomOpen, setRoomOpen] = useState(false);
  const [done, setDone] = useState<{ sale: PosSale; label: string; change: number } | null>(null);
  const [recentOpen, setRecentOpen] = useState(false);
  const [cashUpOpen, setCashUpOpen] = useState(false);
  const [cashUpShiftId, setCashUpShiftId] = useState<string | null>(null);
  const [draftBlockOpen, setDraftBlockOpen] = useState(false);
  const [shiftsOpen, setShiftsOpen] = useState(false);

  const context = useQuery({
    queryKey: ["pos-context", restaurantId],
    queryFn: () => loadContext({ data: { restaurantId } }),
    retry: false,
  });

  const currency = context.data?.currencyCode ?? "GBP";
  const tillMoney = useMemo(
    () => (value: number) => formatMoney(value, currency),
    [currency],
  );

  const taxSettings = context.data?.taxSettings;
  const total = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);

  const shiftMutation = useMutation({
    mutationFn: () => openShift({ data: { restaurantId, openingCash: Number(openingCash) || 0 } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Cashier shift open");
      void queryClient.invalidateQueries({ queryKey: ["pos-context", restaurantId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saleMutation = useMutation({
    mutationFn: () =>
      placeSale({
        data: {
          restaurantId,
          orderType,
          lines: lines.map((line) => ({ menuItemId: line.menuItemId, quantity: line.quantity })),
        },
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setSale(result.sale);
      setPayOpen(true);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const paymentMutation = useMutation({
    mutationFn: (choice: Exclude<PosPaymentChoice, { method: "room" }>) => {
      if (!sale) throw new Error("No sale to settle.");
      return paySale({
        data: {
          restaurantId,
          orderId: sale.id,
          method: choice.method,
          amount: sale.total,
          tendered: choice.method === "cash" ? choice.tendered : null,
          reference: choice.method === "card" ? choice.reference || null : null,
        },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      finish(result.payment.method === "cash" ? "Cash" : "Card", result.payment.change);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function finish(label: string, change: number) {
    if (!sale) return;
    setDone({ sale, label, change });
    setPayOpen(false);
    setRoomOpen(false);
    setLines([]);
    setSale(null);
  }

  function addItem(item: PosMenuItem) {
    setLines((prev) => {
      const existing = prev.find((line) => line.menuItemId === item.id);
      if (existing) {
        return prev.map((line) =>
          line.menuItemId === item.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [...prev, { menuItemId: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
  }

  function setQuantity(menuItemId: string, quantity: number) {
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((line) => line.menuItemId !== menuItemId)
        : prev.map((line) => (line.menuItemId === menuItemId ? { ...line, quantity } : line)),
    );
  }

  function holdSale() {
    setHeld((prev) => [...prev, { id: `${Date.now()}`, lines, orderType }]);
    setLines([]);
    toast.success("Sale parked on this screen");
  }

  function recall(id: string) {
    const parked = held.find((h) => h.id === id);
    if (!parked) return;
    if (lines.length > 0) {
      toast.error("Finish or hold the current sale first.");
      return;
    }
    setLines(parked.lines);
    setOrderType(parked.orderType);
    setHeld((prev) => prev.filter((h) => h.id !== id));
  }

  if (context.isLoading) return <Centered>Loading the till…</Centered>;
  if (context.isError) {
    return (
      <Centered>
        <p>{(context.error as Error).message}</p>
        <Link to="/restaurant/home" className="mt-3 inline-block underline">
          Back to NORU Home
        </Link>
      </Centered>
    );
  }

  const shift = context.data?.shift ?? null;
  const canChargeRoom = context.data?.role !== "kitchen";
  const canManage = context.data?.canManage === true;
  const unpaidDraft = !canStartCashUp({
    lineCount: lines.length,
    hasUnpaidPlacedSale: Boolean(sale),
  });

  function startCashUp(shiftId: string) {
    if (unpaidDraft) {
      setDraftBlockOpen(true);
      return;
    }
    setCashUpShiftId(shiftId);
    setCashUpOpen(true);
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background">
      <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-card px-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/restaurant/home"
            aria-label="Exit the till"
            className="grid size-11 shrink-0 place-items-center rounded-xl border border-border"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <NoruLogo size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{propertyName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {context.data?.cashierName} ·{" "}
              {shift ? "Shift open" : "No open shift"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {shift ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl"
              onClick={() => startCashUp(shift.id)}
            >
              Close shift
            </Button>
          ) : null}
          {canManage ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl"
              onClick={() => setShiftsOpen(true)}
            >
              Shifts
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-xl"
            onClick={() => {
              if (lines.length > 0) holdSale();
              setRecentOpen(true);
            }}
          >
            <ReceiptText className="mr-2 size-4" /> Recent
          </Button>
          {held.map((parked, index) => (
            <Button
              key={parked.id}
              type="button"
              variant="outline"
              className="h-11 rounded-xl"
              onClick={() => recall(parked.id)}
            >
              Held {index + 1}
            </Button>
          ))}
        </div>
      </header>

      {!shift ? (
        <div className="grid flex-1 place-items-center p-6">
          <div className="w-full max-w-sm space-y-4 rounded-3xl border border-border bg-card p-6 text-center">
            <Wallet className="mx-auto size-8 text-primary" />
            <h1 className="text-xl font-bold">Open your cashier shift</h1>
            <p className="text-sm text-muted-foreground">
              Payments are recorded against your drawer, so the till needs an open shift.
            </p>
            <div className="space-y-2 text-left">
              <Label htmlFor="pos-opening-cash">Opening float</Label>
              <Input
                id="pos-opening-cash"
                inputMode="decimal"
                value={openingCash}
                onChange={(event) => setOpeningCash(event.target.value)}
                className="h-14 rounded-2xl text-base"
              />
            </div>
            <Button
              type="button"
              className="h-14 w-full rounded-2xl text-base font-bold"
              disabled={shiftMutation.isPending}
              onClick={() => shiftMutation.mutate()}
            >
              Open shift
            </Button>
          </div>
        </div>
      ) : (
        <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <PosMenuPanel
            items={context.data?.items ?? []}
            categories={context.data?.categories ?? []}
            categoryId={categoryId}
            onCategory={setCategoryId}
            search={search}
            onSearch={setSearch}
            onAdd={addItem}
            money={tillMoney}
          />
          <PosSalePanel
            lines={lines}
            orderType={orderType}
            onOrderType={setOrderType}
            onQuantity={setQuantity}
            onRemove={(id) => setQuantity(id, 0)}
            onHold={holdSale}
            onClear={() => setLines([])}
            onPay={() => saleMutation.mutate()}
            busy={saleMutation.isPending}
            money={tillMoney}
            taxSettings={taxSettings ?? DEFAULT_RM_TAX_SETTINGS}
          />
        </main>
      )}

      <PosPaymentDialog
        open={payOpen && !!sale}
        total={sale?.total ?? total}
        {...(sale?.bill ? { bill: sale.bill } : {})}
        busy={paymentMutation.isPending}
        canChargeRoom={canChargeRoom}
        money={tillMoney}
        onClose={() => setPayOpen(false)}
        onConfirm={(choice) => {
          if (choice.method === "room") {
            setPayOpen(false);
            setRoomOpen(true);
            return;
          }
          paymentMutation.mutate(choice);
        }}
      />

      <RecentPaidSalesSheet
        restaurantId={restaurantId}
        open={recentOpen}
        onClose={() => setRecentOpen(false)}
        money={tillMoney}
        dateTime={dateTime}
      />

      <RmUnpaidDraftBlock open={draftBlockOpen} onBack={() => setDraftBlockOpen(false)} />

      {canManage ? (
        <RmShiftListsSheet
          restaurantId={restaurantId}
          open={shiftsOpen}
          onClose={() => setShiftsOpen(false)}
          onCloseShift={startCashUp}
          money={tillMoney}
          dateTime={dateTime}
        />
      ) : null}

      {cashUpShiftId ? (
        <RmCashUpFlow
          restaurantId={restaurantId}
          shiftId={cashUpShiftId}
          open={cashUpOpen}
          onClose={() => setCashUpOpen(false)}
          onClosed={() => {
            setCashUpOpen(false);
            setCashUpShiftId(null);
            void queryClient.invalidateQueries({ queryKey: ["pos-context", restaurantId] });
          }}
          money={tillMoney}
          dateTime={dateTime}
        />
      ) : null}

      {sale ? (
        <ChargeToRoomDialog
          restaurantId={restaurantId}
          orderId={sale.id}
          orderNumber={sale.orderNumber}
          orderTotal={sale.total}
          open={roomOpen}
          onClose={() => {
            setRoomOpen(false);
            setPayOpen(true);
          }}
          onDone={() => finish("Charged to room", 0)}
        />
      ) : null}

      {done ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/95 p-6">
          <div className="w-full max-w-md space-y-4 rounded-3xl border border-border bg-card p-8 text-center">
            <p className="text-sm uppercase tracking-widest text-muted-foreground">Sale complete</p>
            <p className="text-4xl font-bold tabular-nums">{money(done.sale.total)}</p>
            <p className="text-sm text-muted-foreground">
              Order #{done.sale.orderNumber} · {done.label}
              {done.change > 0 ? ` · Change ${money(done.change)}` : ""}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-14 rounded-2xl"
                onClick={() => window.print()}
              >
                <Printer className="mr-2 size-5" /> Print
              </Button>
              <Button
                type="button"
                className="h-14 rounded-2xl font-bold"
                onClick={() => {
                  setDone(null);
                  void queryClient.invalidateQueries({ queryKey: ["pos-context", restaurantId] });
                }}
              >
                <RotateCcw className="mr-2 size-5" /> New sale
              </Button>
            </div>
            <button
              type="button"
              className="text-sm text-muted-foreground underline"
              onClick={() => void navigate({ to: "/restaurant/home" })}
            >
              Exit the till
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center p-8 text-center text-muted-foreground">
      <div>{children}</div>
    </div>
  );
}

/**
 * Phase 8F3 — shared Restaurant Management order detail screen.
 *
 * Extracted unchanged from the legacy `/restaurant/orders/$orderId` route so
 * the legacy address and the canonical Restaurant Management address render
 * exactly one implementation. Links resolve through `useRmRoutes()` so each
 * family keeps its own children.
 */
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ChefHat, Percent, ReceiptText, Undo2 } from "lucide-react";

import { OrderStatusBadge } from "@/packages/restaurant-management/components/order-status-badge";
import { PaymentStatusBadge } from "@/packages/restaurant-management/components/payment-status-badge";
import { RefundHistory, RefundSaleFlow } from "@/packages/restaurant-management/components/rm-pos/refund-sale-flow";
import { AdjustmentHistory, RmAdjustCheckFlow } from "@/packages/restaurant-management/components/rm-pos/rm-adjust-check-flow";
import { getRefundSale } from "@/packages/restaurant-management/lib/rm-refunds.functions";
import { getAdjustCheck } from "@/packages/restaurant-management/lib/rm-adjust.functions";
import { restaurantPaymentStatus } from "@/packages/restaurant-management/lib/rm-refunds";
import { Button } from "@/shared/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  ACTIVE_ORDER_STATUSES,
  getRestaurantOrderDetail,
  type OrderDetail,
} from "@/packages/restaurant-management/lib/restaurant-orders.functions";
import { statusLabel } from "@/packages/restaurant-management/lib/order-status";
import { getOrderBilling } from "@/integrations/cross-package/room-charge.functions";
import {
  ChargeToRoomDialog,
  ReverseRoomChargeDialog,
} from "@/packages/restaurant-management/components/orders/charge-to-room-dialog";
import { useRmRoutes } from "@/packages/restaurant-management/lib/rm-routes";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { useMoney, useRestaurantTime } from "@/packages/restaurant-management/state/restaurant-context";
import { BillTotals } from "@/packages/restaurant-management/components/bill-totals";
import { RmGuestReceiptSheet } from "@/packages/restaurant-management/components/rm-pos/rm-guest-receipt-sheet";
import { canOfferGuestReceipt } from "@/packages/restaurant-management/lib/rm-receipts";

export function OrderDetailBody({
  membership,
  orderId,
}: {
  membership: RestaurantMembership;
  orderId: string;
}) {
  const rm = useRmRoutes();
  const clock = useRestaurantTime();
  const money = useMoney();
  const restaurantId = membership.restaurantId;
  const fetchDetail = useServerFn(getRestaurantOrderDetail);
  const queryClient = useQueryClient();

  const [refundOpen, setRefundOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const fetchRefund = useServerFn(getRefundSale);
  const fetchAdjust = useServerFn(getAdjustCheck);
  const refundQuery = useQuery({
    queryKey: ["rm-refund-sale", restaurantId, orderId],
    queryFn: () => fetchRefund({ data: { restaurantId, orderId } }),
    retry: false,
  });
  const adjustQuery = useQuery({
    queryKey: ["rm-adjust-check", restaurantId, orderId],
    queryFn: () => fetchAdjust({ data: { restaurantId, orderId } }),
    retry: false,
  });

  const queryKey = ["restaurant-order", restaurantId, orderId];
  const query = useQuery<OrderDetail>({
    queryKey,
    queryFn: () => fetchDetail({ data: { restaurantId, orderId } }),
    retry: false,
  });

  // Realtime: refresh this order's status/timeline, scoped to the tenant.
  useEffect(() => {
    const channel = supabase
      .channel(`order-detail-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, orderId, queryClient]);

  if (query.isLoading) return <DetailSkeleton />;

  if (query.isError || !query.data) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <h1 className="font-display text-xl">Order not found.</h1>
        <Button asChild className="mt-4" size="sm" variant="outline">
          <Link to={rm.orders} search={{ status: "all", period: "today", sort: "newest", page: 1 }}>
            Back to Orders
          </Link>
        </Button>
      </div>
    );
  }

  const order = query.data;
  const isActive = (ACTIVE_ORDER_STATUSES as readonly string[]).includes(order.status);
  const paymentStatus = restaurantPaymentStatus({
    paidAt: order.paidAt,
    billingMethod: order.billingMethod,
    roomPosted: order.roomPosted,
    total: order.total,
    refundedAmount: order.refundedAmount,
  });
  const showPaymentBadge = paymentStatus !== "unpaid";
  const showReceipt = canOfferGuestReceipt(paymentStatus);
  const canOfferRefund = Boolean(refundQuery.data?.canRefund);
  const canOfferAdjust = Boolean(
    adjustQuery.data &&
      (adjustQuery.data.canDiscount || adjustQuery.data.canComp || adjustQuery.data.canComplete),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-xl leading-tight tabular-nums">Order #{order.orderNumber}</h1>
            <OrderStatusBadge status={order.status} />
            {showPaymentBadge ? <PaymentStatusBadge status={paymentStatus} /> : null}
          </div>
          <p className="text-sm text-muted-foreground">{clock.dateTime(order.createdAt)}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to={rm.orders} search={{ status: "all", period: "today", sort: "newest", page: 1 }}>
              <ArrowLeft className="mr-2 size-4" /> Back to Orders
            </Link>
          </Button>
          {canOfferAdjust ? (
            <Button size="sm" variant="outline" onClick={() => setAdjustOpen(true)}>
              <Percent className="mr-2 size-4" /> Adjust
            </Button>
          ) : null}
          {showReceipt ? (
            <Button size="sm" variant="outline" onClick={() => setReceiptOpen(true)}>
              <ReceiptText className="mr-2 size-4" /> Receipt
            </Button>
          ) : null}
          {canOfferRefund ? (
            <Button size="sm" onClick={() => setRefundOpen(true)}>
              <Undo2 className="mr-2 size-4" /> Refund
            </Button>
          ) : null}
          {isActive ? (
            <Button asChild size="sm">
              <Link to={rm.kitchen}><ChefHat className="mr-2 size-4" /> Open in Kitchen</Link>
            </Button>
          ) : null}
        </div>
      </div>

      {order.status === "cancelled" ? (
        <p className="rounded-xl bg-destructive/10 p-4 text-sm font-medium text-destructive">
          This order was cancelled.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="space-y-4 lg:col-span-2">
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-lg">Order Information</h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
              <Field label="Table" value={`Table ${order.tableNumber}`} />
              <Field label="Customer Type" value={order.isGuest ? "Guest" : "Registered Customer"} />
              <Field
                label="Order source"
                value={order.source === "waiter_assisted" ? "Waiter-assisted" : "Customer QR"}
              />
              <Field label="Waiter" value={order.waiterName ?? "Unassigned"} />
              {order.createdByStaffName ? (
                <Field label="Taken by" value={order.createdByStaffName} />
              ) : null}
              <Field label="Status" value={statusLabel(order.status)} />
              <Field label="Created" value={clock.dateTime(order.createdAt)} />
              <Field label="Last updated" value={clock.dateTime(order.updatedAt)} />
              <Field label="Payable" value={money(order.total)} />
            </dl>
          </div>

          <BillingSection restaurantId={restaurantId} orderId={order.id} />

          {adjustQuery.data ? (
            <AdjustmentHistory history={adjustQuery.data.history} money={money} dateTime={clock.dateTime} />
          ) : null}

          {refundQuery.data ? (
            <RefundHistory history={refundQuery.data.history} money={money} dateTime={clock.dateTime} />
          ) : null}


          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-lg">Items</h2>
            <ul className="mt-2 divide-y divide-border">
              {order.items.map((item) => (
                <li key={item.id} className="flex gap-3 py-3">
                  <span className="w-8 shrink-0 font-semibold tabular-nums">{item.quantity}×</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-muted-foreground tabular-nums">
                      {money(item.price)} each
                    </p>
                    {item.specialInstructions ? (
                      <p className="mt-1 text-sm text-muted-foreground">Note: {item.specialInstructions}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums">{money(item.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 border-t border-border pt-3">
              <BillTotals bill={order.bill} money={money} />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-display text-lg">Status Timeline</h2>
          {order.timeline.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No status history recorded for this order.</p>
          ) : (
            <ol className="mt-3 space-y-4">
              {order.timeline.map((entry, index) => (
                <li key={entry.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="mt-1 size-2.5 shrink-0 rounded-full bg-primary" />
                    {index < order.timeline.length - 1 ? (
                      <span className="my-1 w-px flex-1 bg-border" />
                    ) : null}
                  </div>
                  <div className="pb-1">
                    <p className="text-sm font-medium">{statusLabel(entry.status)}</p>
                    <p className="text-xs text-muted-foreground">{clock.time(entry.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <RmGuestReceiptSheet
        restaurantId={restaurantId}
        orderId={order.id}
        open={receiptOpen}
        mode="reprint"
        onClose={() => setReceiptOpen(false)}
      />
      <RefundSaleFlow
        restaurantId={restaurantId}
        orderId={order.id}
        open={refundOpen}
        onClose={() => setRefundOpen(false)}
        onSuccess={() => {
          void queryClient.invalidateQueries({ queryKey });
          void queryClient.invalidateQueries({ queryKey: ["rm-refund-sale", restaurantId, orderId] });
        }}
        money={money}
      />
      <RmAdjustCheckFlow
        restaurantId={restaurantId}
        orderId={order.id}
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        onSuccess={() => {
          void queryClient.invalidateQueries({ queryKey });
          void queryClient.invalidateQueries({ queryKey: ["rm-adjust-check", restaurantId, orderId] });
          void queryClient.invalidateQueries({ queryKey: ["order-billing", restaurantId, orderId] });
        }}
        money={money}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="h-64 animate-pulse rounded-2xl bg-muted lg:col-span-2" />
        <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  );
}

/** Billing card: charge this order to a checked-in guest's room, or reverse it. */
function BillingSection({ restaurantId, orderId }: { restaurantId: string; orderId: string }) {
  const money = useMoney();
  const clock = useRestaurantTime();
  const queryClient = useQueryClient();
  const [chargeOpen, setChargeOpen] = useState(false);
  const [reverseOpen, setReverseOpen] = useState(false);

  const fetchBilling = useServerFn(getOrderBilling);
  const query = useQuery({
    queryKey: ["order-billing", restaurantId, orderId],
    queryFn: () => fetchBilling({ data: { restaurantId, orderId } }),
    retry: false,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["order-billing", restaurantId, orderId] });
    void queryClient.invalidateQueries({ queryKey: ["restaurant-order", restaurantId, orderId] });
  };

  if (query.isLoading || !query.data) return null;
  const billing = query.data;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-lg">Billing</h2>
      {billing.posted ? (
        <div className="mt-3 space-y-1 text-sm">
          <p className="font-medium">Charged to room</p>
          <p className="text-muted-foreground">
            {billing.posted.roomNumber ? `Room ${billing.posted.roomNumber} · ` : ""}
            {billing.posted.guestName} · Folio {billing.posted.folioNumber}
          </p>
          <p className="text-muted-foreground">
            {money(billing.total)} posted {clock.dateTime(billing.posted.postedAt)}
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button asChild size="sm" variant="outline">
              <Link
                to="/restaurant/cashiering/folios/$folioId"
                params={{ folioId: billing.posted.folioId }}
              >
                View folio
              </Link>
            </Button>
            {billing.canReverse ? (
              <Button size="sm" variant="ghost" onClick={() => setReverseOpen(true)}>
                Reverse charge
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-2 text-sm">
          <p className="text-muted-foreground">
            {billing.billingMethod === "direct"
              ? "Settled directly with the restaurant."
              : "Not charged to a room."}
          </p>
          {billing.canPost ? (
            <Button size="sm" onClick={() => setChargeOpen(true)}>
              Charge to room
            </Button>
          ) : billing.blockedReason ? (
            <p className="text-muted-foreground">{billing.blockedReason}</p>
          ) : null}
        </div>
      )}

      <ChargeToRoomDialog
        restaurantId={restaurantId}
        orderId={orderId}
        orderNumber={billing.orderNumber}
        orderTotal={billing.total}
        open={chargeOpen}
        onClose={() => setChargeOpen(false)}
        onDone={refresh}
      />
      <ReverseRoomChargeDialog
        restaurantId={restaurantId}
        orderId={orderId}
        open={reverseOpen}
        onClose={() => setReverseOpen(false)}
        onDone={refresh}
      />
    </div>
  );
}

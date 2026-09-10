import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Undo2 } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { PaymentStatusBadge } from "@/packages/restaurant-management/components/payment-status-badge";
import { RefundHistory, RefundSaleFlow } from "@/packages/restaurant-management/components/rm-pos/refund-sale-flow";
import {
  getRefundSale,
  listRecentPaidSales,
  type RecentPaidSaleRow,
  type RefundSaleView,
} from "@/packages/restaurant-management/lib/rm-refunds.functions";
import { tenderLabel } from "@/packages/restaurant-management/lib/rm-refunds";

export function RecentPaidSalesSheet({
  restaurantId,
  open,
  onClose,
  money,
  dateTime,
}: {
  restaurantId: string;
  open: boolean;
  onClose: () => void;
  money: (value: number) => string;
  dateTime: (value: string) => string;
}) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);

  const listFn = useServerFn(listRecentPaidSales);
  const detailFn = useServerFn(getRefundSale);

  const list = useQuery({
    queryKey: ["rm-recent-paid", restaurantId, search],
    queryFn: () => listFn({ data: { restaurantId, search: search.trim() || null } }),
    enabled: open,
    retry: false,
  });

  const detail = useQuery({
    queryKey: ["rm-refund-sale", restaurantId, selectedId],
    queryFn: () => detailFn({ data: { restaurantId, orderId: selectedId as string } }),
    enabled: open && Boolean(selectedId),
    retry: false,
  });

  const rows = list.data ?? [];

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setSelectedId(null);
          onClose();
        }
      }}
    >
      <SheetContent
        side="right"
        className="flex h-dvh w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[480px]"
      >
        <SheetHeader className="space-y-1 border-b border-border px-5 py-4 text-left">
          <SheetTitle>Recent paid sales</SheetTitle>
          <SheetDescription>
            Restaurant sales already taken. The live cart stays on the till.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {selectedId && detail.data ? (
            <SaleDetail
              money={money}
              dateTime={dateTime}
              view={detail.data}
              onBack={() => setSelectedId(null)}
              onRefund={() => setRefundOpen(true)}
            />
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search order number or table"
                  aria-label="Search recent paid restaurant sales"
                  className="h-12 rounded-2xl pl-9"
                />
              </div>
              {list.isLoading ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Loading recent sales…</p>
              ) : rows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border px-4 py-12 text-center">
                  <p className="font-medium">No recent paid restaurant sales</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Paid till and room-charged restaurant sales from the last two weeks appear here.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {rows.map((row) => (
                    <SaleRow key={row.orderId} row={row} money={money} dateTime={dateTime} onOpen={setSelectedId} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </SheetContent>

      {selectedId ? (
        <RefundSaleFlow
          restaurantId={restaurantId}
          orderId={selectedId}
          open={refundOpen}
          onClose={() => setRefundOpen(false)}
          onSuccess={() => {
            void detail.refetch();
            void list.refetch();
          }}
          money={money}
        />
      ) : null}
    </Sheet>
  );
}

function SaleRow({
  row,
  money,
  dateTime,
  onOpen,
}: {
  row: RecentPaidSaleRow;
  money: (value: number) => string;
  dateTime: (value: string) => string;
  onOpen: (id: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(row.orderId)}
        className="w-full rounded-2xl border border-border bg-card p-4 text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold tabular-nums">Restaurant sale #{row.orderNumber}</p>
            <p className="text-xs text-muted-foreground">
              {row.tableLabel}
              {row.paidAt ? ` · ${dateTime(row.paidAt)}` : ""}
            </p>
          </div>
          <PaymentStatusBadge status={row.paymentStatus} />
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {row.methods.map(tenderLabel).join(" · ") || "Settled"}
          </span>
          <span className="font-semibold tabular-nums">{money(row.total)}</span>
        </div>
      </button>
    </li>
  );
}

function SaleDetail({
  view,
  money,
  dateTime,
  onBack,
  onRefund,
}: {
  view: RefundSaleView;
  money: (value: number) => string;
  dateTime: (value: string) => string;
  onBack: () => void;
  onRefund: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold tabular-nums">Restaurant sale #{view.orderNumber}</p>
          <p className="text-sm text-muted-foreground">{view.tableLabel}</p>
        </div>
        <PaymentStatusBadge status={view.paymentStatus} />
      </div>
      <ul className="divide-y divide-border rounded-2xl border border-border">
        {view.lines.map((line) => (
          <li key={line.id} className="flex justify-between gap-3 px-3 py-2 text-sm">
            <span>
              {line.quantity}× {line.name}
            </span>
            <span className="tabular-nums">{money(line.lineTotal)}</span>
          </li>
        ))}
      </ul>
      <RefundHistory history={view.history} money={money} dateTime={dateTime} />
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className="h-12 rounded-2xl" onClick={onBack}>
          Back
        </Button>
        {view.canRefund ? (
          <Button type="button" className="h-12 rounded-2xl font-bold" onClick={onRefund}>
            <Undo2 className="mr-2 size-4" /> Refund
          </Button>
        ) : (
          <p className="col-span-1 self-center text-right text-xs text-muted-foreground">
            {view.remaining <= 0 ? "Fully refunded" : "Refund not available"}
          </p>
        )}
      </div>
    </div>
  );
}

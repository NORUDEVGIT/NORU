import { Mail, Printer, ReceiptText } from "lucide-react";
import { useState } from "react";

import { Button } from "@/shared/components/ui/button";
import { EmailReceiptDialog } from "@/packages/restaurant-management/components/rm-pos/email-receipt-dialog";
import { RmGuestReceiptSheet } from "@/packages/restaurant-management/components/rm-pos/rm-guest-receipt-sheet";

export function SaleSuccessActions({
  restaurantId,
  orderId,
  orderNumber,
  amountLabel,
  tenderLabel,
  changeLabel,
  onDone,
}: {
  restaurantId: string;
  orderId: string;
  orderNumber: number;
  amountLabel: string;
  tenderLabel: string;
  changeLabel?: string;
  onDone: () => void;
}) {
  const [viewOpen, setViewOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  return (
    <div className="w-full max-w-md space-y-5 rounded-3xl border border-border bg-card p-6 text-center">
      <div className="space-y-1">
        <p className="text-sm uppercase tracking-widest text-muted-foreground">Sale complete</p>
        <p className="text-base font-semibold tabular-nums">
          {amountLabel} · {tenderLabel} · Sale #{orderNumber}
        </p>
        {changeLabel ? <p className="text-sm text-muted-foreground">{changeLabel}</p> : null}
      </div>

      <Button type="button" className="h-14 w-full rounded-2xl text-base font-bold" onClick={onDone}>
        Done
      </Button>

      <div className="grid grid-cols-3 gap-2">
        <Button type="button" variant="outline" className="h-12 rounded-2xl" onClick={() => setPrintOpen(true)}>
          <Printer className="size-4" /> Print
        </Button>
        <Button type="button" variant="outline" className="h-12 rounded-2xl" onClick={() => setEmailOpen(true)}>
          <Mail className="size-4" /> Email
        </Button>
        <Button type="button" variant="outline" className="h-12 rounded-2xl" onClick={() => setViewOpen(true)}>
          <ReceiptText className="size-4" /> View
        </Button>
      </div>

      <RmGuestReceiptSheet
        restaurantId={restaurantId}
        orderId={orderId}
        open={viewOpen || printOpen}
        mode="original"
        autoPrint={printOpen}
        onClose={() => {
          setViewOpen(false);
          setPrintOpen(false);
        }}
      />
      <EmailReceiptDialog
        restaurantId={restaurantId}
        orderId={orderId}
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
      />
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Mail, Printer, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { EmailReceiptDialog } from "@/packages/restaurant-management/components/rm-pos/email-receipt-dialog";
import { RmGuestReceiptView } from "@/packages/restaurant-management/components/rm-pos/rm-guest-receipt-view";
import { getOrderReceipt, recordReceiptReprint } from "@/packages/restaurant-management/lib/rm-receipts.functions";

export function RmGuestReceiptSheet({
  restaurantId,
  orderId,
  open,
  onClose,
  mode = "reprint",
  autoPrint = false,
}: {
  restaurantId: string;
  orderId: string;
  open: boolean;
  onClose: () => void;
  mode?: "original" | "reprint";
  autoPrint?: boolean;
}) {
  const [emailOpen, setEmailOpen] = useState(false);
  const printedFor = useRef<string | null>(null);
  const load = useServerFn(getOrderReceipt);
  const reprint = useServerFn(recordReceiptReprint);

  const query = useQuery({
    queryKey: ["rm-guest-receipt", restaurantId, orderId, mode],
    queryFn: () => load({ data: { restaurantId, orderId, mode } }),
    enabled: open && Boolean(orderId),
    retry: false,
  });

  async function handlePrint() {
    try {
      await reprint({ data: { restaurantId, orderId } });
      void query.refetch();
    } catch (error) {
      toast.error((error as Error).message);
    }
    window.print();
  }

  const view = query.data;

  useEffect(() => {
    if (!open) {
      printedFor.current = null;
      return;
    }
    if (!autoPrint || !view || printedFor.current === view.orderId) return;
    printedFor.current = view.orderId;
    void (async () => {
      try {
        await reprint({ data: { restaurantId, orderId } });
        void query.refetch();
      } catch (error) {
        toast.error((error as Error).message);
      }
      window.print();
    })();
  }, [open, autoPrint, view, restaurantId, orderId, reprint, query]);

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
        <DialogContent className="flex max-h-[92dvh] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:rounded-3xl [&>button]:rm-no-print">
          <DialogHeader className="rm-no-print space-y-1 border-b border-border px-5 py-4 text-left">
            <DialogTitle>Guest receipt</DialogTitle>
            <DialogDescription>
              Frozen bill for this restaurant sale. Print or email does not change totals.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[#faf8f4]">
            {query.isLoading ? (
              <p className="px-5 py-12 text-center text-sm text-muted-foreground">Loading receipt…</p>
            ) : query.isError || !view ? (
              <p className="px-5 py-12 text-center text-sm text-destructive">
                {(query.error as Error | undefined)?.message ?? "This restaurant sale has not been paid."}
              </p>
            ) : (
              <>
                {view.profileIncomplete ? (
                  <p className="rm-no-print mx-5 mt-4 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                    Property profile is incomplete — add address, phone or email in settings. This note is
                    not printed on the guest copy.
                  </p>
                ) : null}
                <RmGuestReceiptView
                  snapshot={view.snapshot}
                  reprint={view.reprint}
                  reprintCount={view.reprintCount}
                  lastReprintedAt={view.lastReprintedAt}
                />
              </>
            )}
          </div>

          <div className="rm-no-print grid grid-cols-3 gap-2 border-t border-border p-4">
            <Button
              type="button"
              variant="outline"
              className="h-12 rounded-2xl"
              disabled={!view}
              onClick={() => void handlePrint()}
            >
              <Printer className="mr-2 size-4" /> Print
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 rounded-2xl"
              disabled={!view}
              onClick={() => setEmailOpen(true)}
            >
              <Mail className="mr-2 size-4" /> Email
            </Button>
            <Button type="button" className="h-12 rounded-2xl font-bold" onClick={onClose}>
              <X className="mr-2 size-4" /> Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {open ? (
        <EmailReceiptDialog
          restaurantId={restaurantId}
          orderId={orderId}
          open={emailOpen}
          onClose={() => setEmailOpen(false)}
        />
      ) : null}

      <style>{`
        @media print {
          @page { margin: 12mm; }
          body * { visibility: hidden; }
          .rm-guest-receipt, .rm-guest-receipt * { visibility: visible; }
          .rm-guest-receipt {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            max-width: none;
            box-shadow: none;
          }
          .rm-guest-receipt-line { break-inside: avoid; }
          .rm-no-print { display: none !important; }
        }
      `}</style>
    </>
  );
}

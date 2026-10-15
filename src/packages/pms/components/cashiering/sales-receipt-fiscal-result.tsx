import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";

export function SalesReceiptFiscalResult({
  rrn,
  providerId,
  providerStatus,
  qrSrc,
}: {
  rrn: string | null;
  providerId: string | null;
  providerStatus: string | null;
  qrSrc: string | null;
}) {
  const [rrnOpen, setRrnOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const longRrn = (rrn?.length ?? 0) > 24;
  const shownRrn = !rrn ? "—" : rrnOpen || !longRrn ? rrn : `${rrn.slice(0, 16)}…`;

  return (
    <div
      className="mt-2 space-y-1 text-xs text-[#251605]"
      data-testid="sales-receipt-fiscal-result"
    >
      <p className="font-medium">Sales Receipt</p>
      <p>Status: Registered</p>
      <p>
        RRN: <span className="font-mono break-all">{shownRrn}</span>
      </p>
      <div className="flex flex-wrap gap-1">
        {longRrn ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setRrnOpen((open) => !open)}
          >
            {rrnOpen ? "Hide RRN" : "Show RRN"}
          </Button>
        ) : null}
        {rrn ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(rrn).then(
                () => toast.success("RRN copied."),
                () => toast.error("RRN could not be copied."),
              );
            }}
          >
            Copy RRN
          </Button>
        ) : null}
      </div>
      <p>Provider Receipt ID: {providerId ?? "—"}</p>
      <p>QR:</p>
      {qrSrc ? (
        <>
          <button type="button" onClick={() => setQrOpen(true)} aria-label="View QR">
            <img src={qrSrc} alt="Sales receipt QR" className="h-28 w-28 bg-white" />
          </button>
          <Dialog open={qrOpen} onOpenChange={setQrOpen}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Sales receipt QR</DialogTitle>
              </DialogHeader>
              <img src={qrSrc} alt="Sales receipt QR" className="mx-auto h-64 w-64 bg-white" />
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <p>QR not supplied by provider</p>
      )}
      <p>Registered / Provider Status: {providerStatus ?? "—"}</p>
    </div>
  );
}

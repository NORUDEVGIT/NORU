import { createPortal } from "react-dom";
import type { ReactNode } from "react";

const PRINT_CLASS = "cashiering-print-layer";

/** Renders print-only content on `document.body` so parent `print:hidden` does not suppress it. */
export function CashieringPrintLayer({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  if (!active || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div className={`${PRINT_CLASS} hidden bg-white print:block`}>{children}</div>
      <style>{`
        @media print {
          @page { margin: 12mm; }
          body * { visibility: hidden; }
          .${PRINT_CLASS}, .${PRINT_CLASS} * { visibility: visible; }
          .${PRINT_CLASS} {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </>,
    document.body,
  );
}

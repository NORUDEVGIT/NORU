import { createPortal } from "react-dom";
import type { ReactNode } from "react";

const PRINT_CLASS = "cashiering-print-layer";

/**
 * Renders print-only content on `document.body` so parent `print:hidden` does not suppress it.
 * `singlePage` keeps a receipt on one sheet. A report passes `false` so every row is printed.
 */
export function CashieringPrintLayer({
  active,
  singlePage = true,
  children,
}: {
  active: boolean;
  singlePage?: boolean;
  children: ReactNode;
}) {
  if (!active || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div className={`${PRINT_CLASS} hidden bg-white print:block`}>{children}</div>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            ${singlePage ? "" : "height: auto !important; overflow: visible !important;"}
          }
          body > * { display: none !important; }
          body > .${PRINT_CLASS} {
            display: block !important;
            position: relative !important;
            width: 210mm !important;
            margin: 0 !important;
            padding: 8mm 10mm !important;
            box-sizing: border-box !important;
            background: #fff !important;
            box-shadow: none !important;
            ${
              singlePage
                ? "height: 297mm !important; max-height: 297mm !important; overflow: hidden !important;"
                : "height: auto !important; max-height: none !important; overflow: visible !important;"
            }
          }
        }
      `}</style>
    </>,
    document.body,
  );
}

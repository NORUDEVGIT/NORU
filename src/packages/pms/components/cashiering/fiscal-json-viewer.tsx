import { useState } from "react";
import { Copy } from "lucide-react";

import {
  collapseFiscalExchangeValues,
  fiscalExchangeCopyText,
} from "@/packages/pms/lib/fiscal/fiscal-exchange";
import { Button } from "@/shared/components/ui/button";

export function FiscalJsonViewer({
  value,
  emptyLabel,
}: {
  value: unknown | null;
  emptyLabel: string;
}) {
  const [full, setFull] = useState(false);
  const [copied, setCopied] = useState(false);
  if (value == null) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  const display = full ? value : collapseFiscalExchangeValues(value);
  const shown = JSON.stringify(display, null, 2);
  const shortened = shown !== JSON.stringify(value, null, 2);

  async function copyJson() {
    await navigator.clipboard.writeText(fiscalExchangeCopyText(value));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-2">
        {shortened ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFull((open) => !open)}
          >
            {full ? "Shorten large values" : "Show full value"}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => void copyJson()}
        >
          <Copy className="size-3.5" />
          {copied ? "Copied" : "Copy JSON"}
        </Button>
      </div>
      <pre className="max-h-80 overflow-auto rounded-xl border border-[#E8E1D7] bg-white p-3 font-mono text-xs leading-5 text-[#251605]">
        {shown}
      </pre>
    </div>
  );
}

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { IntegrationNotice } from "@/packages/pms/components/settings/pms-card6-integration-bits";
import { SIMULATED_TEST_NOTICE } from "@/packages/pms/lib/integrations-card6.server";
import type { SimulatedTestOutcome } from "@/packages/pms/lib/integrations-catalog";

/**
 * Simulated connection test. It reports what NORU can actually verify locally
 * and never claims the provider answered, because no request is made.
 */
export function Card6TestConnectionDialog({
  open,
  onOpenChange,
  integrationName,
  providerLabel,
  run,
  onRecord,
  recording,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integrationName: string;
  providerLabel: string;
  run: () => SimulatedTestOutcome;
  onRecord?: (outcome: SimulatedTestOutcome) => void;
  recording?: boolean;
}) {
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<SimulatedTestOutcome | null>(null);

  useEffect(() => {
    if (!open) {
      setRunning(false);
      setOutcome(null);
    }
  }, [open]);

  function start() {
    setRunning(true);
    setOutcome(null);
    const result = run();
    window.setTimeout(() => {
      setRunning(false);
      setOutcome(result);
      onRecord?.(result);
    }, 700);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="card6-test-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-xl text-[#251605]">Test connection</DialogTitle>
          <DialogDescription>
            {integrationName} · {providerLabel}
          </DialogDescription>
        </DialogHeader>

        <IntegrationNotice tone="warning">{SIMULATED_TEST_NOTICE}</IntegrationNotice>

        {running ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Running checks…
          </p>
        ) : outcome ? (
          <div className="space-y-3" data-testid={`card6-test-${outcome.result}`}>
            <p
              className={
                outcome.result === "passed"
                  ? "flex items-center gap-2 text-sm font-medium text-[#436436]"
                  : "flex items-center gap-2 text-sm font-medium text-destructive"
              }
            >
              {outcome.result === "passed" ? (
                <CheckCircle2 className="size-4" />
              ) : (
                <XCircle className="size-4" />
              )}
              {outcome.result === "passed"
                ? "All local checks passed"
                : "Some checks failed — fix these before going live"}
            </p>
            <ul className="space-y-2">
              {outcome.checks.map((check) => (
                <li
                  key={check.id}
                  className="flex items-start gap-2 rounded-xl border border-[#E5DED1] px-3 py-2"
                >
                  {check.passed ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#436436]" />
                  ) : (
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                  )}
                  <div>
                    <p className="text-sm text-[#251605]">{check.label}</p>
                    <p className="text-xs text-muted-foreground">{check.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
            {outcome.result === "passed" ? (
              <IntegrationNotice>
                The integration stays Pending. It is marked Connected only once NORU can complete a
                real handshake with the provider.
              </IntegrationNotice>
            ) : null}
          </div>
        ) : (
          <p className="py-6 text-sm text-muted-foreground">
            NORU will check the provider selection, required settings, the credentials held in this
            session, and the shape of any endpoint addresses.
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            type="button"
            disabled={running || recording}
            onClick={start}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
          >
            {running ? "Running…" : outcome ? "Run again" : "Run test"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

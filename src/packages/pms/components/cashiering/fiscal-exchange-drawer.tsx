import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { FiscalJsonViewer } from "@/packages/pms/components/cashiering/fiscal-json-viewer";
import { getFiscalRegistrationExchange } from "@/packages/pms/lib/fiscal/fiscal.functions";
import type { FiscalExchangeAttempt } from "@/packages/pms/lib/fiscal/fiscal-exchange";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";

const STATUS_LABEL: Record<string, string> = {
  NOT_REGISTERED: "Not registered",
  BLOCKED: "Blocked",
  PENDING: "Queued",
  REGISTERED: "Registered",
  FAILED: "Failed",
  CANCEL_PENDING: "Cancel pending",
  CANCELLED: "Cancelled",
};

export function FiscalExchangeDrawer({
  open,
  onOpenChange,
  restaurantId,
  registrationId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurantId: string;
  registrationId: string;
}) {
  const load = useServerFn(getFiscalRegistrationExchange);
  const query = useQuery({
    queryKey: ["fiscal-exchange", restaurantId, registrationId],
    queryFn: () => load({ data: { restaurantId, registrationId } }),
    enabled: open,
  });
  const exchange = query.data;
  const registration = exchange?.registration;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden bg-[#F7F4EE] p-0 sm:max-w-xl"
      >
        <SheetHeader className="border-b border-[#E8E1D7] bg-white px-5 py-4 text-left">
          <SheetTitle className="text-[#251605]">Fiscal API exchange</SheetTitle>
          <SheetDescription>
            Stored request and provider response. Nothing is rebuilt.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading exchange…</p>
          ) : null}
          {query.isError ? (
            <p className="text-sm text-destructive">
              {query.error instanceof Error
                ? query.error.message
                : "The exchange could not be loaded."}
            </p>
          ) : null}
          {registration ? (
            <Tabs defaultValue="overview">
              <TabsList className="bg-[#EFE8DC]">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="request">Request</TabsTrigger>
                <TabsTrigger value="response">Response</TabsTrigger>
                <TabsTrigger value="attempts">Attempts</TabsTrigger>
              </TabsList>
              <TabsContent value="overview">
                <dl className="space-y-1 rounded-xl border border-[#E8E1D7] bg-white p-4 text-sm shadow-sm">
                  <Row label="Invoice" value={registration.invoiceNumber ?? "—"} />
                  <Row label="Document type" value={registration.documentType} />
                  <Row label="Transaction ID" value={registration.trnxId} />
                  <Row
                    label="Status"
                    value={STATUS_LABEL[registration.status] ?? registration.status}
                  />
                  <Row label="External status" value={registration.externalStatus ?? "—"} />
                  <Row
                    label="Fiscal document no."
                    value={registration.externalDocumentNumber ?? "—"}
                  />
                  <Row label="IRN" value={registration.externalIrn ?? "—"} />
                  <Row label="Created" value={formatWhen(registration.createdAt)} />
                  <Row label="Registered" value={formatWhen(registration.registeredAt)} />
                  <Row label="Acknowledged" value={formatWhen(registration.acknowledgedAt)} />
                  <Row label="Attempts" value={String(registration.attemptCount)} />
                  <Row
                    label="Last attempt"
                    value={formatWhen(exchange.attempts.at(-1)?.startedAt ?? null)}
                  />
                  <Row label="Next retry" value={formatWhen(registration.nextAttemptAt)} />
                  {registration.lastErrorMessage ? (
                    <Row label="Last error" value={registration.lastErrorMessage} />
                  ) : null}
                </dl>
              </TabsContent>
              <TabsContent value="request">
                <Snapshot
                  state={registration.requestState}
                  value={registration.requestSnapshot}
                  emptyLabel="No request snapshot stored."
                />
              </TabsContent>
              <TabsContent value="response">
                <Snapshot
                  state={registration.responseState}
                  value={registration.responseSnapshot}
                  emptyLabel="No provider response has been recorded yet."
                />
              </TabsContent>
              <TabsContent value="attempts" className="space-y-3">
                {exchange.attempts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No attempts have been recorded yet.
                  </p>
                ) : (
                  exchange.attempts.map((attempt, index) => (
                    <AttemptCard
                      key={attempt.id || String(attempt.attemptNumber)}
                      attempt={attempt}
                      nextAttemptAt={
                        index === exchange.attempts.length - 1 ? registration.nextAttemptAt : null
                      }
                    />
                  ))
                )}
              </TabsContent>
            </Tabs>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Snapshot({
  state,
  value,
  emptyLabel,
}: {
  state: "ready" | "empty" | "invalid";
  value: unknown | null;
  emptyLabel: string;
}) {
  if (state === "invalid") {
    return (
      <p className="text-sm text-muted-foreground">
        Stored snapshot could not be rendered as JSON.
      </p>
    );
  }
  return <FiscalJsonViewer value={state === "ready" ? value : null} emptyLabel={emptyLabel} />;
}

function AttemptCard({
  attempt,
  nextAttemptAt,
}: {
  attempt: FiscalExchangeAttempt;
  nextAttemptAt: string | null;
}) {
  const retryable = attempt.outcome === "retryable_error" || attempt.outcome === "timeout";
  return (
    <details className="rounded-xl border border-[#E8E1D7] bg-white p-3 text-sm shadow-sm">
      <summary className="cursor-pointer font-medium text-[#251605]">
        Attempt {attempt.attemptNumber}
      </summary>
      <div className="mt-2 space-y-1 text-[#251605]">
        <p>{formatWhen(attempt.startedAt)}</p>
        <p>HTTP {attempt.httpStatus ?? "—"}</p>
        <p>{outcomeLabel(attempt.outcome)}</p>
        {attempt.externalStatus ? <p>External status: {attempt.externalStatus}</p> : null}
        {attempt.errorCode ? <p>Error code: {attempt.errorCode}</p> : null}
        {attempt.errorMessage ? <p>{attempt.errorMessage}</p> : null}
        {retryable && nextAttemptAt ? <p>Next retry: {formatWhen(nextAttemptAt)}</p> : null}
      </div>
      <div className="mt-3 space-y-3">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[#8a6a1f]">Request</p>
          <Snapshot
            state={attempt.requestState}
            value={attempt.requestSnapshot}
            emptyLabel="No request snapshot stored."
          />
        </div>
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[#8a6a1f]">
            Response
          </p>
          <Snapshot
            state={attempt.responseState}
            value={attempt.responseSnapshot}
            emptyLabel="No provider response has been recorded yet."
          />
        </div>
      </div>
    </details>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[9.5rem_minmax(0,1fr)] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-all">{value}</dd>
    </div>
  );
}

function outcomeLabel(outcome: FiscalExchangeAttempt["outcome"]): string {
  if (outcome === "success") return "Registered";
  if (outcome === "retryable_error" || outcome === "timeout") return "Retryable failure";
  return "Fatal failure";
}

function formatWhen(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

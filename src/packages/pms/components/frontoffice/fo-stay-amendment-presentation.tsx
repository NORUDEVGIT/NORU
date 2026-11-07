import { useState, type ReactNode } from "react";

import { Button } from "@/shared/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { cn } from "@/shared/lib/utils";
import {
  formatAmendmentOccurredAt,
  isStayAmendmentHistoryEvent,
  stayAmendmentChangeLines,
  stayAmendmentTableLine,
  stayAmendmentTooltipLines,
  type FoStayAmendmentHistoryRow,
} from "@/packages/pms/lib/fo-amendments";

export function FoStayAmendedMark({
  amendment,
  compact = false,
  className,
}: {
  amendment: FoStayAmendmentHistoryRow;
  compact?: boolean;
  className?: string;
}) {
  const changes = stayAmendmentChangeLines(amendment.previousValues, amendment.newValues, {
    dateStyle: "short",
  });
  const tooltip = stayAmendmentTooltipLines(changes);
  const tableLine = stayAmendmentTableLine(changes);
  const label = compact ? (tableLine ? `Amended · ${tableLine}` : "Amended") : "Amended";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "shrink-0 font-medium tracking-wide",
            compact ? "text-[11px] text-muted-foreground" : "text-[10px] opacity-80",
            className,
          )}
          data-testid="fo-stay-amended-mark"
        >
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs space-y-0.5 text-xs">
        {tooltip.length > 0 ? tooltip.map((line) => <p key={line}>{line}</p>) : <p>Amended</p>}
      </TooltipContent>
    </Tooltip>
  );
}

function AmendmentChangeList({
  amendment,
  money,
}: {
  amendment: FoStayAmendmentHistoryRow;
  money?: (n: number) => string;
}) {
  const changes = stayAmendmentChangeLines(amendment.previousValues, amendment.newValues, {
    dateStyle: "full",
    money,
  });
  if (changes.length === 0) return null;
  return (
    <dl className="mt-2 space-y-1">
      {changes.map((change) => (
        <div key={change.label} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 text-sm">
          <dt className="text-muted-foreground">{change.label}</dt>
          <dd className="min-w-0 font-medium text-foreground">
            {change.previous} → {change.next}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function AmendmentCard({
  amendment,
  money,
  children,
}: {
  amendment: FoStayAmendmentHistoryRow;
  money?: (n: number) => string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-md border border-border/70 bg-muted/20 px-2.5 py-2">
      <p className="text-sm font-medium text-foreground">
        Amended {formatAmendmentOccurredAt(amendment.createdAt)}
      </p>
      {amendment.actorName ? (
        <p className="text-xs text-muted-foreground">Changed by {amendment.actorName}</p>
      ) : null}
      <AmendmentChangeList amendment={amendment} money={money} />
      {children}
    </div>
  );
}

export function FoStayAmendmentHistorySection({
  events,
  money,
  testId = "fo-stay-amendment-history",
}: {
  events: Array<
    Pick<
      FoStayAmendmentHistoryRow,
      "eventType" | "createdAt" | "actorName" | "previousValues" | "newValues"
    > & { reservationId?: string }
  >;
  money?: (n: number) => string;
  testId?: string;
}) {
  const [showPrevious, setShowPrevious] = useState(false);
  const amendments = events
    .filter((event) => isStayAmendmentHistoryEvent(event.eventType))
    .map((event) => ({
      reservationId: event.reservationId ?? "",
      eventType: event.eventType,
      createdAt: event.createdAt,
      actorName: event.actorName,
      previousValues: event.previousValues,
      newValues: event.newValues,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (amendments.length === 0) return null;
  const [latest, ...older] = amendments;
  return (
    <section className="rounded-xl border border-border bg-card p-3 shadow-sm" data-testid={testId}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Amendment History
      </h3>
      <div className="mt-2 space-y-2">
        <AmendmentCard amendment={latest} money={money} />
        {older.length > 0 ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setShowPrevious((open) => !open)}
            >
              {showPrevious
                ? "Hide previous amendments"
                : older.length === 1
                  ? "View previous amendments"
                  : `${amendments.length} amendments`}
            </Button>
            {showPrevious
              ? older.map((amendment) => (
                  <AmendmentCard
                    key={`${amendment.createdAt}-${amendment.eventType}`}
                    amendment={amendment}
                    money={money}
                  />
                ))
              : null}
          </>
        ) : null}
      </div>
    </section>
  );
}

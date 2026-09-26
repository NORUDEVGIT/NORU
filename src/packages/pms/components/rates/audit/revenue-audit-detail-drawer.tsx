import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ChevronRight, Clock, FileText, Info, User, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/components/ui/sheet";
import { getAuditOperationDetail } from "@/packages/pms/lib/revenue/revenue-audit.functions";
import type { UnifiedRevenueAuditEntry } from "@/packages/pms/lib/revenue/revenue-audit";

function formatTimestamp(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

export function RevenueAuditDetailDrawer({
  restaurantId,
  entry,
  open,
  onClose,
}: {
  restaurantId: string;
  entry: UnifiedRevenueAuditEntry | null;
  open: boolean;
  onClose: () => void;
}) {
  const fetchDetail = useServerFn(getAuditOperationDetail);

  const query = useQuery({
    queryKey: [
      "audit-operation-detail",
      restaurantId,
      entry?.id,
      entry?.sourceTable,
      entry?.operationId,
    ],
    queryFn: () => {
      if (!entry) throw new Error("No entry selected");
      return fetchDetail({
        data: {
          restaurantId,
          eventId: entry.id,
          sourceTable: entry.sourceTable,
          operationId: entry.operationId,
        },
      });
    },
    enabled: Boolean(open && entry),
  });

  const detail = query.data;

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg bg-[#F7F4EE] overflow-y-auto">
        <SheetHeader className="border-b border-[#E8E1D7] pb-3">
          <div className="flex items-center justify-between">
            <SheetTitle className="font-display text-lg font-semibold text-foreground">
              Audit Operation Detail
            </SheetTitle>
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm opacity-70 hover:opacity-100 p-1"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close detail</span>
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Granular change inspection and approval lineage.
          </p>
        </SheetHeader>

        {query.isLoading && (
          <div className="space-y-3 py-6" aria-busy="true">
            <div className="h-28 animate-pulse rounded-xl border border-[#E8E1D7] bg-card" />
            <div className="h-40 animate-pulse rounded-xl border border-[#E8E1D7] bg-card" />
          </div>
        )}

        {query.isError && (
          <div className="my-6 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-xs text-destructive">
            Unable to load granular operation detail.
          </div>
        )}

        {detail && (
          <div className="mt-4 space-y-4 text-xs">
            {/* 1. Operation Summary Card */}
            <div className="rounded-xl border border-[#E8E1D7] bg-card p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="rounded bg-muted px-2 py-0.5 font-mono text-[10px] uppercase font-semibold text-muted-foreground">
                  {detail.domain}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {formatTimestamp(detail.entry.timestamp)}
                </span>
              </div>

              <div>
                <h4 className="font-semibold text-sm text-foreground">{detail.summary}</h4>
                <p className="mt-0.5 text-muted-foreground">{detail.entry.scopeLabel}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#E8E1D7]/60 text-[11px]">
                <div>
                  <span className="text-muted-foreground">Actor:</span>{" "}
                  <span className="font-medium text-foreground">{detail.entry.actorLabel}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Action:</span>{" "}
                  <span className="font-mono text-foreground">{detail.entry.action}</span>
                </div>
                {detail.operationId && (
                  <div className="col-span-2 truncate">
                    <span className="text-muted-foreground">Operation ID:</span>{" "}
                    <span className="font-mono text-[10px] text-foreground">
                      {detail.operationId}
                    </span>
                  </div>
                )}
                {detail.entry.reason && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Reason:</span>{" "}
                    <span className="text-foreground italic">{detail.entry.reason}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 2. Approval Lineage */}
            {detail.approvalLineage && (
              <div className="rounded-xl border border-[#C89933]/30 bg-[#FBF7EE] p-3.5 space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#8B651D]">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Approved Operation Lineage</span>
                </div>
                <div className="space-y-1.5 text-[11px] border-l-2 border-[#C89933]/50 pl-3 ml-1">
                  <div>
                    <span className="text-muted-foreground">Requested by:</span>{" "}
                    <span className="font-medium text-foreground">
                      {detail.approvalLineage.requestedBy}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      at {formatTimestamp(detail.approvalLineage.requestedAt)}
                    </span>
                  </div>
                  {detail.approvalLineage.reviewedBy && (
                    <div>
                      <span className="text-muted-foreground">Reviewed & approved by:</span>{" "}
                      <span className="font-medium text-foreground">
                        {detail.approvalLineage.reviewedBy}
                      </span>{" "}
                      <span className="text-muted-foreground">
                        at {formatTimestamp(detail.approvalLineage.reviewedAt)}
                      </span>
                    </div>
                  )}
                  {detail.approvalLineage.reviewReason && (
                    <div>
                      <span className="text-muted-foreground">Review note:</span>{" "}
                      <span className="italic text-foreground">
                        {detail.approvalLineage.reviewReason}
                      </span>
                    </div>
                  )}
                  <div className="text-[10px] text-muted-foreground font-mono truncate">
                    Approval Request ID: {detail.approvalLineage.requestId}
                  </div>
                </div>
              </div>
            )}

            {/* 3. Granular Changes / Diff Matrix */}
            <div className="rounded-xl border border-[#E8E1D7] bg-card p-4 space-y-2 shadow-2xs">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-xs text-foreground uppercase tracking-wider">
                  State Changes ({detail.batchCount} record{detail.batchCount > 1 ? "s" : ""})
                </h4>
              </div>

              {detail.changes.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-2">
                  No individual field diffs recorded for this action.
                </p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pt-1">
                  {detail.changes.map((change, idx) => (
                    <div
                      key={idx}
                      className="rounded border border-[#E8E1D7]/70 bg-muted/20 p-2.5 space-y-1"
                    >
                      {detail.domain === "rates" && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono font-medium text-foreground">
                            {String(change.stayDate || "Stay Date")}
                          </span>
                          <div className="flex items-center gap-1.5 font-mono">
                            <span className="text-muted-foreground line-through">
                              {change.previousRate !== null && change.previousRate !== undefined
                                ? `${change.currency ?? ""} ${change.previousRate}`
                                : "None"}
                            </span>
                            <ChevronRight className="h-3 w-3 text-muted-foreground" />
                            <span className="font-semibold text-foreground">
                              {change.newRate !== null && change.newRate !== undefined
                                ? `${change.currency ?? ""} ${change.newRate}`
                                : "None"}
                            </span>
                          </div>
                        </div>
                      )}

                      {detail.domain === "restrictions" && (
                        <div className="space-y-1 text-xs">
                          <div className="font-mono font-medium text-foreground">
                            {String(change.stayDate || "Stay Date")}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            Action:{" "}
                            <span className="font-mono text-foreground">
                              {String(change.actionType || "")}
                            </span>
                          </div>
                        </div>
                      )}

                      {detail.domain === "commercial" && (
                        <div className="space-y-1 text-xs">
                          <div className="font-medium text-foreground">
                            {String(change.entityType || "Entity")}{" "}
                            {String(change.actionType || "")}
                          </div>
                          {change.reason && (
                            <div className="text-[11px] text-muted-foreground italic">
                              {String(change.reason)}
                            </div>
                          )}
                        </div>
                      )}

                      {detail.domain === "approvals" && (
                        <div className="space-y-1 text-xs">
                          <div className="font-medium text-foreground">
                            {String(change.eventType || "Event")}
                          </div>
                          {change.reason && (
                            <div className="text-[11px] text-muted-foreground italic">
                              {String(change.reason)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

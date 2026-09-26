import { MoreHorizontal } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import type { RevenueApprovalListItem } from "@/packages/pms/lib/revenue/revenue-approval.server";
import type { RevenueApprovalTab } from "@/packages/pms/lib/revenue/revenue-context";
import {
  revenueApprovalDomainLabel,
  revenueApprovalReasonLabel,
  revenueApprovalRequesterLabel,
  revenueApprovalScopeLabel,
} from "@/packages/pms/lib/revenue/revenue-approval-ui";
import { ApprovalStatusChip } from "./approval-status-chip";

function formatWhen(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function ApprovalTable({
  rows,
  tab,
  membershipId,
  onReview,
  onCancel,
}: {
  rows: RevenueApprovalListItem[];
  tab: RevenueApprovalTab;
  membershipId?: string | null;
  onReview: (row: RevenueApprovalListItem) => void;
  onCancel?: (row: RevenueApprovalListItem) => void;
}) {
  const history = tab === "history";
  const mine = tab === "mine";

  return (
    <>
      <div className="hidden overflow-auto rounded-xl border border-[#E8E1D7] bg-card md:block">
        <table className="min-w-max w-full border-collapse">
          <thead>
            <tr className="border-b border-[#E8E1D7] bg-[#F7F4EE]">
              {(history
                ? [
                    "Reviewed / Updated",
                    "Domain",
                    "Change",
                    "Requested By",
                    "Reviewed By",
                    "Status",
                    "Reason",
                    "Actions",
                  ]
                : mine
                  ? ["Submitted", "Domain", "Change", "Status", "Reviewed By", "Updated", "Actions"]
                  : [
                      "Submitted",
                      "Domain",
                      "Change",
                      "Scope",
                      "Requested By",
                      "Reason",
                      "Status",
                      "Actions",
                    ]
              ).map((label) => (
                <th
                  key={label}
                  className="whitespace-nowrap px-2 py-1.5 text-left text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-t border-[#E8E1D7] hover:bg-[#F7F4EE]"
                onClick={() => onReview(row)}
              >
                <td className="whitespace-nowrap px-2 py-1.5 text-[10px] text-[#251605]">
                  {formatWhen(history ? (row.reviewedAt ?? row.requestedAt) : row.requestedAt)}
                </td>
                <td className="px-2 py-1.5 text-[10px] text-[#251605]">
                  {revenueApprovalDomainLabel(row.domain)}
                </td>
                <td className="max-w-56 px-2 py-1.5 text-[10px] text-[#251605]">{row.summary}</td>
                {history ? (
                  <>
                    <td className="px-2 py-1.5 text-[10px] text-[#251605]">
                      {revenueApprovalRequesterLabel(row.requestedByLabel)}
                    </td>
                    <td className="px-2 py-1.5 text-[10px] text-[#251605]">
                      {row.reviewedByLabel
                        ? revenueApprovalRequesterLabel(row.reviewedByLabel)
                        : "—"}
                    </td>
                    <td className="px-2 py-1.5">
                      <ApprovalStatusChip status={row.status} />
                    </td>
                    <td className="max-w-40 truncate px-2 py-1.5 text-[10px] text-muted-foreground">
                      {revenueApprovalReasonLabel(row.reviewReason ?? row.requestReason)}
                    </td>
                  </>
                ) : mine ? (
                  <>
                    <td className="px-2 py-1.5">
                      <ApprovalStatusChip status={row.status} />
                    </td>
                    <td className="px-2 py-1.5 text-[10px] text-[#251605]">
                      {row.reviewedByLabel
                        ? revenueApprovalRequesterLabel(row.reviewedByLabel)
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-[10px] text-[#251605]">
                      {formatWhen(row.reviewedAt ?? row.requestedAt)}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="max-w-48 px-2 py-1.5 text-[10px] text-[#251605]">
                      {revenueApprovalScopeLabel(row.displaySnapshot)}
                    </td>
                    <td className="px-2 py-1.5 text-[10px] text-[#251605]">
                      {revenueApprovalRequesterLabel(row.requestedByLabel)}
                    </td>
                    <td className="max-w-40 truncate px-2 py-1.5 text-[10px] text-muted-foreground">
                      {revenueApprovalReasonLabel(row.requestReason)}
                    </td>
                    <td className="px-2 py-1.5">
                      <ApprovalStatusChip status={row.status} />
                    </td>
                  </>
                )}
                <td className="px-2 py-1.5 text-right" onClick={(event) => event.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Actions for ${row.summary}`}
                        className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[#F3ECE2] hover:text-[#251605] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]/40"
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-44">
                      <DropdownMenuItem onSelect={() => onReview(row)}>
                        {tab === "pending" ? "Review" : "View"}
                      </DropdownMenuItem>
                      {mine &&
                      row.status === "pending" &&
                      row.requestedBy === membershipId &&
                      onCancel ? (
                        <DropdownMenuItem onSelect={() => onCancel(row)}>Cancel</DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-2 md:hidden">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => onReview(row)}
            className="w-full rounded-xl border border-[#E8E1D7] bg-card px-3 py-2 text-left"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] font-medium text-[#251605]">{row.summary}</p>
              <ApprovalStatusChip status={row.status} />
            </div>
            <p className="mt-1 text-[10px] text-[#251605]">
              {revenueApprovalDomainLabel(row.domain)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {formatWhen(row.requestedAt)} · {revenueApprovalRequesterLabel(row.requestedByLabel)}
            </p>
            <p className="mt-1 text-[10px] text-[#251605]">
              {revenueApprovalScopeLabel(row.displaySnapshot)}
            </p>
          </button>
        ))}
      </div>
    </>
  );
}

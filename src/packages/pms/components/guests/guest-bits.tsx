import { AlertTriangle, ChevronLeft, ChevronRight, Star } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { cn } from "@/shared/lib/utils";

import {
  guestRestrictionWarning,
  type GuestRestrictionFlags,
} from "@/packages/pms/lib/guest-profile-individual";

export function VipBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
      <Star className="size-3" /> VIP
    </span>
  );
}

export function StatusBadge({ status }: { status: "active" | "inactive" }) {
  return (
    <span
      className={
        status === "active"
          ? "inline-flex rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-success"
          : "inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
      }
    >
      {status}
    </span>
  );
}

export function GuestRestrictionBadges({
  guest,
}: {
  guest: GuestRestrictionFlags | null | undefined;
}) {
  if (!guest) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1" data-testid="guest-restriction-badges">
      {guest.restricted ? (
        <span
          data-testid="guest-restricted-badge"
          className="inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800"
        >
          Restricted
        </span>
      ) : null}
      {guest.blacklisted ? (
        <span
          data-testid="guest-blacklisted-badge"
          className="inline-flex rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-destructive"
        >
          Blacklisted
        </span>
      ) : null}
    </span>
  );
}

export function GuestRestrictionWarn({
  guest,
}: {
  guest: GuestRestrictionFlags | null | undefined;
}) {
  const message = guestRestrictionWarning(guest);
  if (!message) return null;
  const reason = (guest?.restrictionReason ?? "").trim();
  return (
    <div
      data-testid="guest-restriction-warn"
      className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>
        <p>{message}</p>
        {reason ? (
          <p className="mt-1 text-xs" data-testid="guest-restriction-warn-reason">
            Reason: {reason}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export const DIRECTORY_HEAD_CLASS =
  "border-b border-[#DDD4C5] bg-[#FAF8F4] text-left text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground";

export const DIRECTORY_ACTION_BUTTON =
  "size-7 text-[#7A6B58] hover:text-[#251605]";

export function DirectoryPager({
  page,
  pageCount,
  pageSize,
  pageSizes,
  total,
  offset,
  noun,
  disabled = false,
  onPage,
  onPageSize,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  pageSizes: readonly number[];
  total: number;
  offset: number;
  noun: string;
  disabled?: boolean;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const shown = Math.min(5, pageCount);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#7A6B58]">
      <div>
        Showing {total === 0 ? 0 : offset + 1}–{Math.min(offset + pageSize, total)} of{" "}
        <span className="font-medium text-[#251605]">{total.toLocaleString()}</span> {noun}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={page <= 0 || disabled}
            onClick={() => onPage(Math.max(0, page - 1))}
            className="size-7 border-[#E8E4DC] text-[#251605]"
            aria-label="Previous page"
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          {Array.from({ length: shown }, (_, i) => {
            let pageIdx = i;
            if (pageCount > 5 && page > 2) {
              pageIdx = Math.min(page - 2 + i, pageCount - 5 + i);
            }
            const isCurrent = page === pageIdx;
            return (
              <Button
                key={pageIdx}
                type="button"
                variant={isCurrent ? "default" : "outline"}
                size="icon"
                disabled={disabled}
                onClick={() => onPage(pageIdx)}
                className={cn(
                  "size-7 text-xs",
                  isCurrent
                    ? "bg-[#C89933] font-semibold text-white hover:bg-[#B38728]"
                    : "border-[#E8E4DC] text-[#251605]",
                )}
              >
                {pageIdx + 1}
              </Button>
            );
          })}
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={page >= pageCount - 1 || disabled}
            onClick={() => onPage(page + 1)}
            className="size-7 border-[#E8E4DC] text-[#251605]"
            aria-label="Next page"
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
        <Select value={String(pageSize)} onValueChange={(value) => onPageSize(Number(value))}>
          <SelectTrigger className="h-7 w-28 border-[#E8E4DC] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizes.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size} / page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

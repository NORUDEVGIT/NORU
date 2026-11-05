import { ArrowLeft, ChevronDown, RefreshCw } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { cn } from "@/shared/lib/utils";

export type DetailNavItem = {
  id: string;
  label: string;
  description?: string;
};

/**
 * Tab bar used by every guest detail page (individual, company, travel agency, group):
 * primary tabs + a "More" dropdown, in the individual guest style.
 */
export function GuestDetailNav({
  ariaLabel,
  navTestId,
  testIdPrefix,
  primary,
  more,
  activeId,
  onSelect,
}: {
  ariaLabel: string;
  navTestId: string;
  /** Tabs get data-testid `${testIdPrefix}-nav-${id}`, the More trigger `${testIdPrefix}-nav-more`. */
  testIdPrefix: string;
  primary: readonly DetailNavItem[];
  more: readonly DetailNavItem[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const activeMore = more.find((item) => item.id === activeId);
  const isMoreActive = Boolean(activeMore);

  return (
    <nav
      aria-label={ariaLabel}
      className="flex w-full items-center gap-1 overflow-x-auto border-b border-[#DDD4C5] pb-px"
      role="tablist"
      data-testid={navTestId}
    >
      {primary.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={`${testIdPrefix}-nav-${item.id}`}
            onClick={() => onSelect(item.id)}
            className={cn(
              "shrink-0 border-b-2 px-3.5 py-2 text-xs transition-colors",
              active
                ? "border-[#C89933] font-semibold text-[#251605]"
                : "border-transparent text-[#756A5B] hover:border-[#DDD4C5] hover:text-[#251605]",
            )}
          >
            {item.label}
          </button>
        );
      })}

      {more.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              role="tab"
              aria-selected={isMoreActive}
              aria-label="More sections"
              data-testid={`${testIdPrefix}-nav-more`}
              className={cn(
                "inline-flex shrink-0 items-center gap-1 border-b-2 px-3.5 py-2 text-xs transition-colors",
                isMoreActive
                  ? "border-[#C89933] font-semibold text-[#8A641A]"
                  : "border-transparent text-[#756A5B] hover:border-[#DDD4C5] hover:text-[#251605]",
              )}
            >
              <span>{activeMore ? activeMore.label : "More"}</span>
              <ChevronDown className="size-3.5 opacity-70" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-52 border-[#DDD4C5] bg-white text-[#251605] shadow-xl"
          >
            {more.map((item) => {
              const selected = item.id === activeId;
              return (
                <DropdownMenuItem
                  key={item.id}
                  data-testid={`${testIdPrefix}-nav-${item.id}`}
                  onSelect={() => onSelect(item.id)}
                  className={cn(
                    "cursor-pointer py-2 text-xs",
                    selected
                      ? "bg-[#F4E9D0] font-semibold text-[#8A641A]"
                      : "text-[#251605] hover:bg-[#F7F4EE]",
                  )}
                >
                  <div className="flex flex-col">
                    <span>{item.label}</span>
                    {item.description ? (
                      <span className="line-clamp-1 text-[10px] text-[#756A5B]">
                        {item.description}
                      </span>
                    ) : null}
                  </div>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </nav>
  );
}

/** Loading skeleton, same as the individual guest detail page. */
export function GuestDetailLoading({ label }: { label: string }) {
  return (
    <div className="space-y-6" data-testid="guest-detail-loading">
      <div className="flex items-center gap-2 text-xs text-[#756A5B]">
        <RefreshCw className="size-3.5 animate-spin text-[#8A641A]" />
        <span>{label}</span>
      </div>
      <div className="h-28 animate-pulse rounded-xl border border-[#DDD4C5] bg-white" />
      <div className="h-64 animate-pulse rounded-xl border border-[#DDD4C5] bg-white" />
    </div>
  );
}

/** "Not found / unable to load" card with a back button. */
export function GuestDetailMissing({
  title,
  message,
  testId,
  backLabel = "Back to Guest Directory",
  onBack,
}: {
  title: string;
  message: string;
  testId: string;
  backLabel?: string;
  onBack: () => void;
}) {
  return (
    <div
      className="space-y-4 rounded-xl border border-[#DDD4C5] bg-white p-8 text-center shadow-sm"
      data-testid={testId}
    >
      <p className="font-display text-lg font-semibold text-[#251605]">{title}</p>
      <p className="text-xs text-[#756A5B]">{message}</p>
      <Button
        variant="outline"
        size="sm"
        className="border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE]"
        onClick={onBack}
      >
        <ArrowLeft className="mr-1.5 size-3.5" /> {backLabel}
      </Button>
    </div>
  );
}

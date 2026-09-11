import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { cn } from "@/shared/lib/utils";

/**
 * Calm Coming soon surface. Never performs a network write. Permission denied
 * is a different state and must not reuse this copy.
 */
export function ComingSoonPanel({
  title,
  description,
  className,
}: {
  title?: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      data-testid="fo-coming-soon"
      className={cn(
        "rounded-2xl border border-dashed border-[#CCCCCC] bg-card/60 px-6 py-10 text-center",
        className,
      )}
    >
      <p className="text-sm font-medium text-[#251605]">{title ?? "Coming soon"}</p>
      <p className="mt-2 text-sm text-muted-foreground">
        {description ?? "This Front Office action is not live yet. Nothing was changed."}
      </p>
    </div>
  );
}

export function ComingSoonChip({
  label,
  hint,
  className,
}: {
  label: string;
  hint?: string;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          data-testid="fo-coming-soon-chip"
          className={cn(
            "inline-flex cursor-default items-center rounded-full border border-dashed border-[#CCCCCC] px-2.5 py-1 text-xs text-muted-foreground",
            className,
          )}
        >
          {label}
          <span className="ml-1 text-[10px] uppercase tracking-wide">Coming soon</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{hint ?? "Coming soon — no change was made."}</TooltipContent>
    </Tooltip>
  );
}

export function ComingSoonButton({
  label,
  hint,
  className,
  onComingSoon,
}: {
  label: string;
  hint?: string;
  className?: string;
  onComingSoon?: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-testid="fo-coming-soon-action"
          className={cn(
            "inline-flex items-center justify-center rounded-lg border border-dashed border-[#CCCCCC] px-3 py-1.5 text-sm text-muted-foreground",
            className,
          )}
          onClick={() => onComingSoon?.()}
        >
          {label}
        </button>
      </TooltipTrigger>
      <TooltipContent>{hint ?? "Coming soon — nothing is posted."}</TooltipContent>
    </Tooltip>
  );
}

export function PermissionDeniedPanel({ message, className }: { message?: string; className?: string }) {
  return (
    <div
      data-testid="fo-permission-denied"
      className={cn("rounded-2xl border border-border bg-card p-6", className)}
    >
      <p className="text-sm font-medium text-[#251605]">Permission denied</p>
      <p className="mt-2 text-sm text-muted-foreground">
        {message ?? "You don't have access to this Front Office action for this property."}
      </p>
    </div>
  );
}

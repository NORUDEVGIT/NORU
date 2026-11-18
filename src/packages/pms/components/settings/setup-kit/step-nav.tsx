import type { CSSProperties } from "react";
import { Check } from "lucide-react";

import type { PropertySetupCardStatus } from "@/packages/pms/lib/pms-property-setup-card1";
import { cn } from "@/shared/lib/utils";

export type PropertySetupStepNavItem = {
  id: string;
  number: number;
  title: string;
  status: PropertySetupCardStatus;
};

export function PropertySetupStepNav({
  steps,
  activeId,
  onSelect,
  marked = false,
}: {
  steps: readonly PropertySetupStepNavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  marked?: boolean;
}) {
  const markedColumns = Math.max(steps.length, 1);

  return (
    <ol
      className={cn(
        marked
          ? "flex w-full min-w-0 gap-1.5 max-lg:overflow-x-auto max-lg:[scrollbar-width:none] max-lg:[-ms-overflow-style:none] max-lg:[&::-webkit-scrollbar]:hidden lg:grid lg:overflow-x-hidden"
          : "flex w-full gap-1 overflow-x-auto pb-0.5",
      )}
      style={
        marked
          ? ({
              gridTemplateColumns: `repeat(${markedColumns}, minmax(0, 1fr))`,
            } as CSSProperties)
          : undefined
      }
      data-testid="property-setup-step-nav"
    >
      {steps.map((row) => {
        const active = activeId === row.id;
        const complete = row.status === "complete";

        return (
          <li key={row.id} className={cn(marked ? "min-w-0 max-lg:shrink-0" : "shrink-0")}>
            <button
              type="button"
              onClick={() => onSelect(row.id)}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex items-center border text-left font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]",
                marked
                  ? "h-auto min-h-9 w-full min-w-0 gap-1 whitespace-normal rounded-lg px-1.5 py-1 text-[11px] leading-tight max-lg:whitespace-nowrap max-lg:px-2"
                  : "h-8 gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[11px]",
                active && "border-[#C89933] bg-[#F4E9D0] text-[#251605]",
                !active &&
                  complete &&
                  (marked
                    ? "border-[#E6E1D8] bg-white text-[#251605] hover:border-[#C89933]/60"
                    : "border-transparent bg-transparent text-[#251605] hover:bg-[#F7F4EE]"),
                !active &&
                  !complete &&
                  (marked
                    ? "border-[#E6E1D8] bg-white text-[#6B6458] hover:bg-[#F7F4EE]"
                    : "border-transparent bg-transparent text-[#6B6458] hover:bg-[#F7F4EE]"),
              )}
            >
              {marked ? (
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold leading-none",
                    (complete || active) && "bg-[#C89933] text-[#251605]",
                    !active && !complete && "bg-[#EFEAE2] text-[#6B6458]",
                  )}
                >
                  {complete ? <Check className="size-2.5" strokeWidth={3} aria-hidden /> : row.number}
                </span>
              ) : complete ? (
                <Check
                  className={cn("size-3 shrink-0", active ? "text-[#C89933]" : "text-[#8A6A24]")}
                  strokeWidth={2.5}
                  aria-hidden
                />
              ) : null}
              <span className="min-w-0 leading-tight">{row.title}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
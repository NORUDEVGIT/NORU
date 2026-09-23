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
}: {
  steps: readonly PropertySetupStepNavItem[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ol
      className="flex w-full gap-2 overflow-x-auto pb-1"
      data-testid="property-setup-step-nav"
    >
      {steps.map((row) => {
        const active = activeId === row.id;
        const complete = row.status === "complete";

        return (
          <li key={row.id} className="shrink-0">
            <button
              type="button"
              onClick={() => onSelect(row.id)}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex h-12 min-w-[9.5rem] items-center gap-2 whitespace-nowrap rounded-[6px] border px-3 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]",
                active && "border-[#C89933] bg-[#C89933] text-[#251605]",
                !active && complete && "border-[#E6E1D8] bg-[#F4EDE0] text-[#251605]",
                !active && !complete && "border-[#CCCCCC] bg-white text-[#6B6458]",
              )}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-[6px] text-[11px] font-semibold",
                  active ? "bg-white/80 text-[#251605]" : "bg-[#F7F4EE] text-[#251605]",
                )}
              >
                {complete && !active ? (
                  <Check className="size-3.5" strokeWidth={2.5} />
                ) : (
                  row.number
                )}
              </span>

              <span className="leading-none">{row.title}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
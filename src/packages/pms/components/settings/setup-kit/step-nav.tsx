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
      className="flex w-full gap-1 overflow-x-auto pb-0.5"
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
                "flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-left text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]",
                active && "border-[#C89933] bg-[#F4E9D0] text-[#251605]",
                !active && complete && "border-transparent bg-transparent text-[#251605] hover:bg-[#F7F4EE]",
                !active && !complete && "border-transparent bg-transparent text-[#6B6458] hover:bg-[#F7F4EE]",
              )}
            >
              {complete ? (
                <Check
                  className={cn("size-3 shrink-0", active ? "text-[#C89933]" : "text-[#8A6A24]")}
                  strokeWidth={2.5}
                  aria-hidden
                />
              ) : null}
              <span className="leading-none">{row.title}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
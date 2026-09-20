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
      className={cn(
        "flex gap-2 overflow-x-auto pb-1 sm:grid sm:overflow-visible",
        steps.length <= 3
          ? "sm:grid-cols-3"
          : steps.length <= 5
            ? "sm:grid-cols-3 xl:grid-cols-5"
            : steps.length <= 6
              ? "sm:grid-cols-3 xl:grid-cols-6"
              : "sm:grid-cols-4 xl:grid-cols-8",
      )}
      data-testid="property-setup-step-nav"
    >
      {steps.map((row) => {
        const active = activeId === row.id;
        const complete = row.status === "complete";
        return (
          <li key={row.id} className="min-w-[9.5rem] sm:min-w-0">
            <button
              type="button"
              onClick={() => onSelect(row.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-[6px] border px-2.5 py-2 text-left text-xs",
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
              <span className="leading-tight">{row.title}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

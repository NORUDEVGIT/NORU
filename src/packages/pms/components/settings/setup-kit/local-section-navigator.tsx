import { Check, Menu } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { cn } from "@/shared/lib/utils";

export type LocalSectionNavigatorItem = {
  id: string;
  label: string;
};

export function LocalSectionNavigator({
  items,
  activeId,
  onSelect,
  testId,
}: {
  items: readonly LocalSectionNavigatorItem[];
  activeId: string;
  onSelect: (id: string) => void;
  testId?: string;
}) {
  const currentLabel = items.find((item) => item.id === activeId)?.label ?? items[0]?.label ?? "";

  return (
    <div className="flex justify-start">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            aria-label={`Section: ${currentLabel}`}
            title={currentLabel}
            data-testid={testId}
            className={cn(
              "h-8 max-w-full gap-1.5 rounded-md border border-[#DDD4C5] bg-white px-2.5",
              "text-xs font-medium text-[#251605] shadow-none",
              "hover:border-[#C89933] hover:bg-[#F7F4EE]",
              "focus-visible:ring-2 focus-visible:ring-[#C89933]",
              "data-[state=open]:border-[#C89933] data-[state=open]:bg-[#F4E9D0]",
            )}
          >
            <Menu className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">{currentLabel}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-48 border-[#DDD4C5]">
          {items.map((item) => {
            const selected = item.id === activeId;
            return (
              <DropdownMenuItem
                key={item.id}
                className={cn(selected && "bg-[#F4E9D0] text-[#251605] focus:bg-[#F4E9D0]")}
                onSelect={() => onSelect(item.id)}
              >
                <Check
                  className={cn("size-3.5 text-[#C89933]", selected ? "opacity-100" : "opacity-0")}
                  aria-hidden
                />
                {item.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

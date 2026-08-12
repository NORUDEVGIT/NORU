import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function QuantityStepper({
  quantity,
  onChange,
  min = 1,
  size = "default",
}: {
  quantity: number;
  onChange: (value: number) => void;
  min?: number;
  size?: "default" | "sm";
}) {
  const dimension = size === "sm" ? "h-10 w-10" : "h-12 w-12";
  return (
    <div className="flex items-center gap-1 rounded-full border border-border bg-surface p-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Decrease quantity"
        className={`${dimension} rounded-full`}
        onClick={() => onChange(quantity - 1)}
        disabled={quantity <= min}
      >
        <Minus className="size-4" />
      </Button>
      <span className="min-w-8 text-center text-base font-semibold tabular-nums">
        {quantity}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Increase quantity"
        className={`${dimension} rounded-full`}
        onClick={() => onChange(quantity + 1)}
      >
        <Plus className="size-4" />
      </Button>
    </div>
  );
}

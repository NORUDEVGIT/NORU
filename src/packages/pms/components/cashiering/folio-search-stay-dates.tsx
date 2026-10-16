import { CalendarDays } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { cn } from "@/shared/lib/utils";

function formatRangeLabel(from: string, to: string): string {
  if (!from || !to) return "Stay Dates";
  const fmt = (value: string) =>
    new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  return `${fmt(from)} – ${fmt(to)}`;
}

export function FolioSearchStayDates({
  from,
  to,
  onChange,
  className,
}: {
  from: string;
  to: string;
  onChange: (next: { from: string; to: string }) => void;
  className?: string;
}) {
  const active = Boolean(from && to);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-9 min-h-9 justify-start gap-2 bg-background px-3 text-left font-normal",
            !active && "text-muted-foreground",
            className,
          )}
        >
          <CalendarDays className="size-4 shrink-0 opacity-70" />
          <span className="truncate">{formatRangeLabel(from, to)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3 p-3">
        <div className="space-y-2">
          <Label htmlFor="folio-stay-from">From</Label>
          <Input
            id="folio-stay-from"
            type="date"
            value={from}
            onChange={(event) => onChange({ from: event.target.value, to })}
            className="h-9"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="folio-stay-to">To</Label>
          <Input
            id="folio-stay-to"
            type="date"
            value={to}
            onChange={(event) => onChange({ from, to: event.target.value })}
            className="h-9"
          />
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="flex-1"
            onClick={() => onChange({ from: "", to: "" })}
          >
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

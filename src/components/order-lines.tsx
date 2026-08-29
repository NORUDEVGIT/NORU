import type { CartLine } from "@/state/order-store";
import { useMoney } from "@/state/restaurant-context";

export function OrderLines({ lines }: { lines: CartLine[] }) {
  const money = useMoney();
  return (
    <ul className="divide-y divide-border">
      {lines.map((line) => (
        <li key={line.lineId} className="flex gap-3 py-3">
          <img
            src={line.item.image ?? ""}
            alt={line.item.name}
            loading="lazy"
            width={800}
            height={600}
            className="size-14 shrink-0 rounded-xl object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">
              {line.quantity} × {line.item.name}
            </p>
            {line.notes ? (
              <p className="mt-0.5 text-sm text-muted-foreground">Note: {line.notes}</p>
            ) : null}
          </div>
          <span className="shrink-0 font-semibold tabular-nums">
            {money(line.item.price * line.quantity)}
          </span>
        </li>
      ))}
    </ul>
  );
}

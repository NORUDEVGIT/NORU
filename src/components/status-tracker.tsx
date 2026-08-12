import { Check } from "lucide-react";
import { ORDER_STATUS_STEPS, type OrderStatus } from "@/state/order-store";

export function StatusTracker({ status }: { status: OrderStatus }) {
  const activeIndex = ORDER_STATUS_STEPS.findIndex((step) => step.key === status);

  return (
    <ol className="space-y-1">
      {ORDER_STATUS_STEPS.map((step, index) => {
        const done = index < activeIndex;
        const active = index === activeIndex;
        return (
          <li key={step.key} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span
                className={[
                  "grid size-11 shrink-0 place-items-center rounded-full border-2 transition-colors",
                  done
                    ? "border-primary bg-primary text-primary-foreground"
                    : active
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border bg-card text-muted-foreground",
                ].join(" ")}
              >
                {done ? <Check className="size-5" /> : <span className="text-sm font-semibold">{index + 1}</span>}
              </span>
              {index < ORDER_STATUS_STEPS.length - 1 ? (
                <span
                  className={`my-1 w-0.5 flex-1 rounded-full ${done ? "bg-primary" : "bg-border"}`}
                />
              ) : null}
            </div>
            <div className="pb-6">
              <p className={`text-lg font-semibold ${active ? "text-accent" : ""}`}>{step.label}</p>
              <p className="text-sm text-muted-foreground">{step.hint}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

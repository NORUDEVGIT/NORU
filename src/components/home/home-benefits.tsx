import { Check } from "lucide-react";

const BENEFITS = [
  "No app required for customers",
  "Faster ordering",
  "Real-time kitchen workflow",
  "Better table accountability",
  "Staff scheduling and attendance",
  "Multi-restaurant architecture",
  "Secure restaurant data separation",
  "Built for mobile restaurant operations",
];

export function HomeBenefits() {
  return (
    <section className="bg-muted/50">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <h2 className="font-display text-3xl sm:text-4xl">Why NORU</h2>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {BENEFITS.map((benefit) => (
            <li
              key={benefit}
              className="flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-4"
            >
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-success/15 text-success">
                <Check className="size-3.5" />
              </span>
              <span className="text-sm font-medium">{benefit}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

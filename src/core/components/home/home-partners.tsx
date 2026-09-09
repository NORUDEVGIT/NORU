import { Store } from "lucide-react";

export function HomePartners() {
  return (
    <section className="border-b border-border bg-background" aria-labelledby="partners-heading">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <h2
          id="partners-heading"
          className="text-center text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground"
        >
          Trusted by Modern Hospitality Businesses
        </h2>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className="flex h-20 items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-muted/50 text-xs font-medium text-muted-foreground"
            >
              <Store className="size-4" />
              Partner logo
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

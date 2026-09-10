import { getMarketingContent, publishedOf } from "@/core/lib/marketing";

export function HomeTestimonials() {
  const testimonials = publishedOf(getMarketingContent().testimonials);
  if (testimonials.length === 0) return null;

  return (
    <section id="testimonials" className="bg-muted/50" aria-labelledby="testimonials-heading">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <h2 id="testimonials-heading" className="font-display text-3xl sm:text-4xl">
          What operators say
        </h2>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {testimonials.map((item) => (
            <li key={item.id} className="rounded-3xl border border-border bg-card p-6">
              <blockquote className="text-sm text-muted-foreground">“{item.quote}”</blockquote>
              <p className="mt-4 text-sm font-semibold">{item.authorName}</p>
              {item.authorRole || item.propertyName ? (
                <p className="text-xs text-muted-foreground">
                  {[item.authorRole, item.propertyName].filter(Boolean).join(" · ")}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

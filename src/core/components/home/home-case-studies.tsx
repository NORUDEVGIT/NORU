import { getMarketingContent, publishedOf } from "@/core/lib/marketing";

export function HomeCaseStudies() {
  const studies = publishedOf(getMarketingContent().caseStudies);
  if (studies.length === 0) return null;

  return (
    <section id="case-studies" className="bg-background" aria-labelledby="case-studies-heading">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <h2 id="case-studies-heading" className="font-display text-3xl sm:text-4xl">
          Case studies
        </h2>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {studies.map((study) => (
            <li key={study.id} className="rounded-3xl border border-border bg-card p-6">
              <h3 className="font-display text-xl">{study.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{study.summary}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

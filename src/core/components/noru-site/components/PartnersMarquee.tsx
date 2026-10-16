import { useNoruSite } from "../site-context";

export function PartnersMarquee() {
  const { partners } = useNoruSite();
  /* The list is rendered twice so the CSS marquee loops without a gap. */
  const loop = [...partners, ...partners];
  return (
    <section className="alt brown">
      <div className="w">
        <h2 style={{ textAlign: "center" }}>Our Partners</h2>
        <div className="mq" aria-label="Partner logos">
          <div className="mt">
            {loop.map((p, i) => (
              <div className="lg" key={`${p.id}-${i}`}>
                {p.logoUrl ? (
                  <img src={p.logoUrl} alt={p.logoAlt || p.name} loading="lazy" />
                ) : (
                  p.name
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

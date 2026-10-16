import type { SitePlan } from "@/core/lib/marketing/types";
import { useRequestDemo } from "../lib/router";
import { useNoruSite } from "../site-context";

function priceLabel(plan: SitePlan): string {
  return plan.priceEtb === null ? "ETB TBA" : `ETB ${plan.priceEtb.toLocaleString("en-US")}`;
}

function PlanCard({ plan }: { plan: SitePlan }) {
  const requestDemo = useRequestDemo();
  return (
    <div
      className="card top"
      style={plan.featured ? { borderTopColor: "var(--brass)" } : undefined}
    >
      <h3>{plan.name}</h3>
      <span>{plan.modules}</span>
      <span className="price">
        {priceLabel(plan)}{" "}
        <small style={{ fontSize: ".8rem", fontWeight: 400, color: "var(--mut)" }}>/ year</small>
      </span>
      <a
        className={plan.featured ? "btn" : "btn s"}
        href="#resources/contact"
        style={{ marginTop: 10, textAlign: "center" }}
        onClick={(event) => {
          event.preventDefault();
          requestDemo();
        }}
      >
        {plan.featured ? "Request Demo" : "Choose Plan"}
      </a>
    </div>
  );
}

export function Pricing() {
  const { hotelPlans, restaurantPlans } = useNoruSite();
  return (
    <div className="pg on" id="pricing">
      <div className="pbn">
        <div className="w ph1">
          <h1>Pricing</h1>
          <p className="mut">
            Packages are billed annually in Ethiopian Birr (ETB) and differ by property type and
            module.
          </p>
        </div>
      </div>
      <section>
        <div className="w">
          <h2>Hotel / Property pricing</h2>
          <p className="mut">Tiered by number of rooms.</p>
          <div className="g4">
            {hotelPlans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} />
            ))}
          </div>
        </div>
      </section>
      <section className="alt">
        <div className="w">
          <h2>Restaurant pricing</h2>
          <p className="mut">Tiered by choice of module.</p>
          <div className="g4" style={{ maxWidth: 720 }}>
            {restaurantPlans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

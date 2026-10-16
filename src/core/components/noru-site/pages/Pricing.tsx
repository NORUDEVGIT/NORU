import { HOTEL_PLANS, RESTAURANT_PLANS, type Plan } from "../data/content";
import { useRequestDemo } from "../lib/router";

function priceLabel(plan: Plan): string {
  return plan.priceEtb === null ? "ETB TBA" : `ETB ${plan.priceEtb.toLocaleString("en-US")}`;
}

function PlanCard({ plan }: { plan: Plan }) {
  const requestDemo = useRequestDemo();
  return (
    <div className="card top" style={plan.featured ? { borderTopColor: "var(--brass)" } : undefined}>
      <h3>{plan.name}</h3>
      <span>{plan.modules}</span>
      <span className="price">
        {priceLabel(plan)} <small style={{ fontSize: ".8rem", fontWeight: 400, color: "var(--mut)" }}>/ year</small>
      </span>
      <a
        className={plan.featured ? "btn" : "btn s"}
        href="#resources/contact"
        style={{ marginTop: 10, textAlign: "center" }}
        onClick={(e) => {
          e.preventDefault();
          requestDemo();
        }}
      >
        {plan.featured ? "Request Demo" : "Choose Plan"}
      </a>
    </div>
  );
}

export function Pricing() {
  return (
    <div className="pg on" id="pricing">
      <div className="pbn">
        <div className="w ph1">
          <h1>Pricing</h1>
          <p className="mut">Packages are billed annually in Ethiopian Birr (ETB) and differ by property type and module.</p>
        </div>
      </div>
      <section>
        <div className="w">
          <h2>Hotel / Property pricing</h2>
          <p className="mut">Tiered by number of rooms.</p>
          <div className="g4">
            {HOTEL_PLANS.map((plan) => (
              <PlanCard key={plan.name} plan={plan} />
            ))}
          </div>
        </div>
      </section>
      <section className="alt">
        <div className="w">
          <h2>Restaurant pricing</h2>
          <p className="mut">Tiered by choice of module.</p>
          <div className="g4" style={{ maxWidth: 720 }}>
            {RESTAURANT_PLANS.map((plan) => (
              <PlanCard key={plan.name} plan={plan} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

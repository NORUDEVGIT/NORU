const STEPS = [
  { title: "Customer scans QR", body: "Each table has its own secure QR code." },
  { title: "Order is placed", body: "By the customer, or by a checked-in waiter." },
  { title: "Kitchen receives it", body: "Live order board from New to Ready." },
  { title: "You manage it all", body: "Orders, staff and insights in NORU." },
];

export function HomeSteps() {
  return (
    <section id="how-it-works" className="bg-muted/50">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <div className="max-w-2xl">
          <h2 className="font-display text-3xl sm:text-4xl">How It Works</h2>
          <p className="mt-3 text-base text-muted-foreground">
            Four steps from the table to the kitchen to your dashboard.
          </p>
        </div>

        <ol className="relative mt-10 grid gap-6 lg:grid-cols-4">
          <span
            aria-hidden
            className="absolute left-5 top-6 hidden h-[calc(100%-3rem)] w-px bg-border sm:block lg:left-0 lg:top-6 lg:h-px lg:w-full"
          />
          {STEPS.map((step, index) => (
            <li key={step.title} className="relative rounded-3xl border border-border bg-card p-6">
              <span className="grid size-11 place-items-center rounded-full bg-primary font-display text-lg text-primary-foreground">
                {index + 1}
              </span>
              <h3 className="mt-4 font-display text-xl">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

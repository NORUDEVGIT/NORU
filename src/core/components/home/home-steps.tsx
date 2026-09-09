const STEPS = [
  { title: "Choose your packages", body: "Restaurant Management, PMS, Standalone POS and Back Office." },
  { title: "Register your company", body: "Create the property account. Packages are assigned after review." },
  { title: "Run the operation", body: "Floor, rooms, till and office work from the same NORU workspace." },
  { title: "Guests still scan QR", body: "Dining guests order from the table without downloading an app." },
];

export function HomeSteps() {
  return (
    <section id="how-it-works" className="bg-background">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <div className="max-w-2xl">
          <h2 className="font-display text-3xl sm:text-4xl">How It Works</h2>
          <p className="mt-3 text-base text-muted-foreground">
            From company registration to live service — across restaurants and hotels.
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

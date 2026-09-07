/**
 * Phase 8G1 — shared body for every Back Office foundation page.
 *
 * Presentation only. It never reads business data and never grants access: the
 * "open the current screen" link appears only when the person already holds the
 * existing module access for that shared service.
 */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight } from "lucide-react";
import { getMyModuleAccess } from "@/core/lib/module-access.functions";
import { BO_STATUS_LABEL, type BoModule } from "@/lib/back-office-modules";

export function BackOfficeStatusChip({ module }: { module: BoModule }) {
  return (
    <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {BO_STATUS_LABEL[module.implementationStatus]}
    </span>
  );
}

export function BackOfficeFoundation({
  module,
  restaurantId,
}: {
  module: BoModule;
  restaurantId: string;
}) {
  const fetchModules = useServerFn(getMyModuleAccess);
  const access = useQuery({
    queryKey: ["my-module-access", restaurantId],
    queryFn: () => fetchModules({ data: { restaurantId } }),
    enabled: !!module.moduleKey,
    retry: false,
  });
  const allowed = access.data?.modules ?? [];
  const showLink =
    !!module.currentRoute && !!module.moduleKey && allowed.includes(module.moduleKey);

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <module.icon className="size-5" />
          </span>
          <h1 className="font-display text-2xl sm:text-3xl">{module.title}</h1>
          <BackOfficeStatusChip module={module} />
        </div>
        <p className="text-sm text-muted-foreground">{module.description}</p>
      </header>

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="font-display text-lg">What Back Office will own</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          {module.futureScope.map((line) => (
            <li key={line} className="flex gap-2">
              <span aria-hidden className="text-primary">
                •
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
        {module.sourcePackages?.length ? (
          <p className="mt-4 text-xs text-muted-foreground">
            Source packages: {module.sourcePackages.join(" · ")}
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-dashed border-border bg-muted/30 p-5 sm:p-6">
        <h2 className="font-display text-lg">Where this lives today</h2>
        <p className="mt-2 text-sm text-muted-foreground">{module.todayNote}</p>
        {showLink ? (
          <Link
            to={module.currentRoute!}
            {...(module.currentSearch ? { search: module.currentSearch } : {})}
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-background px-3.5 py-2 text-sm font-medium transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {module.currentLabel ?? "Open the current screen"}
            <ArrowUpRight className="size-4" />
          </Link>
        ) : null}
      </section>
    </div>
  );
}

/**
 * Honest empty state for Rate & Revenue views that are not implemented yet.
 * Prompt 3 shell only — do not invent metrics, competitor rates, or queues.
 */

export function RevenueFoundationView({
  title,
  description,
  plannedCapability,
  sources,
}: {
  title: string;
  description: string;
  plannedCapability?: string | undefined;
  sources?: readonly string[] | undefined;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 p-6 sm:p-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Foundation ready
      </p>
      <h2 className="mt-2 font-display text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
      {plannedCapability ? (
        <p className="mt-4 max-w-2xl text-sm text-foreground">
          <span className="font-medium">Planned capability: </span>
          {plannedCapability}
        </p>
      ) : null}
      {sources && sources.length > 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Expected sources: </span>
          {sources.join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

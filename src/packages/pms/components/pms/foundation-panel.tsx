/**
 * Phase 7D.2F1 patch — shared "not yet supported by the backend" panel.
 * Presentational only: never renders sample or placeholder records.
 */
export function FoundationPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center">
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">{description}</p>
      <span className="mt-4 inline-flex rounded-full border border-border px-3 py-1 text-xs uppercase tracking-wide text-muted-foreground">
        Planned
      </span>
    </div>
  );
}

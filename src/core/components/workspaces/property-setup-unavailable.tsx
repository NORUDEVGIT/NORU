import type { RestaurantMembership } from "@/core/lib/restaurant.functions";

/**
 * Settings → Property & Business is the only editable property setup surface.
 * Properties without the PMS package see their registered details read-only
 * here until a platform administrator enables PMS.
 */
export function PropertySetupUnavailable({ membership }: { membership: RestaurantMembership }) {
  const r = membership.restaurant;
  const address = [r.address, r.city, r.postcode, r.country].filter(Boolean).join(", ");
  const rows: [string, string][] = [
    ["Property name", r.name],
    ["Email", r.email ?? ""],
    ["Phone", r.phone ?? ""],
    ["Address", address],
    ["Web address", `/${r.slug}`],
    ["Status", r.approved ? "Approved" : "Pending approval"],
  ];

  return (
    <div className="space-y-6" data-testid="property-setup-unavailable">
      <div>
        <h1 className="font-display text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Property setup continues in Settings → Property &amp; Business once NORU enables PMS for
          this property.
        </p>
      </div>
      <dl className="grid gap-3 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="space-y-1">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </dt>
            <dd className="text-sm">{value || "—"}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        Approval status, visibility and your web address are managed by the platform.
      </p>
    </div>
  );
}

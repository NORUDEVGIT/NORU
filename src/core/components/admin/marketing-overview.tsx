import { Link } from "@tanstack/react-router";
import { useMarketingEditor } from "@/core/components/admin/marketing-editor-provider";
import { SectionCard } from "@/core/components/admin/marketing-form-fields";
import { landingInventory } from "@/core/lib/marketing";
import { Button } from "@/shared/components/ui/button";

const LINKS = [
  { to: "/admin/marketing/header", label: "Header & Navigation" },
  { to: "/admin/marketing/hero", label: "Hero & Animation" },
  { to: "/admin/marketing/partners", label: "Partners" },
  { to: "/admin/marketing/events", label: "Events" },
  { to: "/admin/marketing/products", label: "Product Highlights" },
  { to: "/admin/marketing/solutions", label: "Property Solutions" },
  { to: "/admin/marketing/faq", label: "FAQ" },
  { to: "/admin/marketing/cta", label: "Final CTA" },
  { to: "/admin/marketing/footer", label: "Footer" },
] as const;

export function MarketingOverview() {
  const { draft, snapshot, report, dirty, publish, revertDraft, resetToSeed } = useMarketingEditor();
  const inventory = landingInventory(draft);

  const cards = [
    { label: "Header nav items", value: String(inventory.headerNavItems) },
    { label: "Partners", value: String(inventory.partners) },
    { label: "Events", value: String(inventory.events) },
    { label: "Product highlights", value: String(inventory.productHighlights) },
    { label: "Property solutions", value: String(inventory.propertySolutions) },
    { label: "FAQ items", value: String(inventory.faqItems) },
    { label: "Final CTA", value: inventory.finalCtaEnabled ? "Enabled" : "Disabled" },
    { label: "Hero animation", value: inventory.heroAnimationEnabled ? "Enabled" : "Disabled" },
  ];

  return (
    <div className="space-y-5">
      <SectionCard
        title="Publish status"
        description="Draft and published documents live in Core marketing tables. The public site reads the published site block and falls back to the built-in copy when that block is absent. A newer draft from someone else is kept instead of overwritten."
      >
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Draft updated</dt>
            <dd className="font-medium">{new Date(snapshot.draftUpdatedAt).toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Last published</dt>
            <dd className="font-medium">
              {snapshot.publishedAt ? new Date(snapshot.publishedAt).toLocaleString() : "Never"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Unpublished changes</dt>
            <dd className="font-medium">{dirty ? "Yes" : "No"}</dd>
          </div>
        </dl>
        {report.errors.length > 0 ? (
          <ul className="list-disc space-y-1 rounded-lg bg-destructive/10 px-5 py-3 text-sm text-destructive" role="alert">
            {report.errors.map((error, index) => (
              <li key={`${error.code}-${index}`}>{error.message}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Draft passes allowlist, protected-nav, and Available-now checks.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void publish()} disabled={!report.ok}>
            Publish
          </Button>
          <Button type="button" variant="outline" onClick={() => void revertDraft()} disabled={!dirty}>
            Revert Draft
          </Button>
          <Button type="button" variant="outline" onClick={() => void resetToSeed()}>
            Reset to Seed
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        title="Landing page content"
        description="Counts for the current public NORU landing. Legacy package and pricing inventory lives under Advanced / Legacy."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <div key={card.label} className="rounded-lg border border-border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{card.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{card.value}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {LINKS.map((link) => (
            <Button key={link.to} asChild variant="outline" size="sm">
              <Link to={link.to}>{link.label}</Link>
            </Button>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

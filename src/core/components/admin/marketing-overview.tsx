import { Link } from "@tanstack/react-router";
import { useMarketingEditor } from "@/core/components/admin/marketing-editor-provider";
import { SectionCard } from "@/core/components/admin/marketing-form-fields";
import { Button } from "@/shared/components/ui/button";
import { MARKETING_CARD_DISCLAIMER, publishedOf } from "@/core/lib/marketing";

const LINKS = [
  { to: "/admin/marketing/brand", label: "Brand & hero" },
  { to: "/admin/marketing/nav", label: "Navigation" },
  { to: "/admin/marketing/packages", label: "Packages" },
  { to: "/admin/marketing/pricing", label: "Pricing" },
  { to: "/admin/marketing/content", label: "Content" },
  { to: "/admin/marketing/site", label: "Site chrome" },
] as const;

export function MarketingOverview() {
  const { draft, snapshot, report, dirty, publish, revertDraft, resetToSeed } = useMarketingEditor();

  const cards = [
    { label: "Nav items", value: draft.nav.length },
    { label: "Marketing cards", value: draft.packages.length },
    { label: "Published partners", value: publishedOf(draft.partners).length },
    { label: "Published testimonials", value: publishedOf(draft.testimonials).length },
    { label: "Published case studies", value: publishedOf(draft.caseStudies).length },
    { label: "Published posts", value: publishedOf(draft.blogPosts).length },
    { label: "FAQ items", value: draft.faq.length },
    { label: "Promo banners", value: draft.promoBanners.length },
  ];

  return (
    <div className="space-y-5">
      <SectionCard
        title="Publish"
        description="Draft and published documents live in Core marketing tables. Public `/` reads the published document and falls back to the honest seed if a read fails. Concurrent edits are last-write-wins."
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
            Revert draft
          </Button>
          <Button type="button" variant="outline" onClick={() => void resetToSeed()}>
            Reset to seed
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Inventory" description={MARKETING_CARD_DISCLAIMER}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <div key={card.label} className="rounded-lg border border-border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{card.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{card.value}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Partners, testimonials, case studies, and blog start empty. Do not invent social proof.
        </p>
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

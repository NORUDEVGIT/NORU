import { useMarketingEditor } from "@/core/components/admin/marketing-editor-provider";
import { AreaField, Field, HrefSelect, SectionCard, TextField } from "@/core/components/admin/marketing-form-fields";
import { setOptionalString } from "@/core/components/admin/marketing-optional";
import type { MarketingCta, MarketingNavHref } from "@/core/lib/marketing";

function CtaFields({
  idPrefix,
  cta,
  onChange,
}: {
  idPrefix: string;
  cta: MarketingCta;
  onChange: (cta: MarketingCta) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField
        id={`${idPrefix}-label`}
        label="CTA label"
        value={cta.label}
        onChange={(label) => onChange({ ...cta, label })}
      />
      <Field label="CTA target (allowlist only)">
        <HrefSelect value={cta.target} onChange={(target: MarketingNavHref) => onChange({ ...cta, target })} />
      </Field>
    </div>
  );
}

export function MarketingBrandForm() {
  const { draft, updateDraft } = useMarketingEditor();

  return (
    <div className="space-y-5">
      <SectionCard title="Brand" description="Site name, tagline, and SEO used on the public landing.">
        <TextField
          id="site-name"
          label="Site name"
          value={draft.brand.siteName}
          onChange={(siteName) => updateDraft((d) => { d.brand.siteName = siteName; })}
        />
        <TextField
          id="tagline"
          label="Tagline"
          value={draft.brand.tagline}
          onChange={(tagline) => updateDraft((d) => { d.brand.tagline = tagline; })}
        />
        <TextField
          id="logo-url"
          label="Logo URL (optional)"
          value={draft.brand.logoUrl ?? ""}
          onChange={(logoUrl) => updateDraft((d) => { setOptionalString(d.brand, "logoUrl", logoUrl); })}
          hint="Leave blank to keep the built-in NORU mark."
        />
        <TextField
          id="seo-title"
          label="SEO title"
          value={draft.brand.seoTitle}
          onChange={(seoTitle) => updateDraft((d) => { d.brand.seoTitle = seoTitle; })}
        />
        <AreaField
          id="seo-description"
          label="SEO description"
          value={draft.brand.seoDescription}
          onChange={(seoDescription) => updateDraft((d) => { d.brand.seoDescription = seoDescription; })}
        />
        <AreaField
          id="og-description"
          label="Open Graph description"
          value={draft.brand.ogDescription}
          onChange={(ogDescription) => updateDraft((d) => { d.brand.ogDescription = ogDescription; })}
        />
      </SectionCard>

      <SectionCard title="Hero" description="Primary landing headline and allowlisted calls to action.">
        <TextField
          id="hero-eyebrow"
          label="Eyebrow"
          value={draft.hero.eyebrow}
          onChange={(eyebrow) => updateDraft((d) => { d.hero.eyebrow = eyebrow; })}
        />
        <TextField
          id="hero-headline"
          label="Headline"
          value={draft.hero.headline}
          onChange={(headline) => updateDraft((d) => { d.hero.headline = headline; })}
        />
        <AreaField
          id="hero-description"
          label="Description"
          value={draft.hero.description}
          onChange={(description) => updateDraft((d) => { d.hero.description = description; })}
        />
        <CtaFields
          idPrefix="hero-primary"
          cta={draft.hero.primaryCta}
          onChange={(primaryCta) => updateDraft((d) => { d.hero.primaryCta = primaryCta; })}
        />
        <CtaFields
          idPrefix="hero-secondary"
          cta={draft.hero.secondaryCta ?? { label: "See packages", target: "#packages" }}
          onChange={(secondaryCta) =>
            updateDraft((d) => {
              if (!secondaryCta.label.trim()) delete d.hero.secondaryCta;
              else d.hero.secondaryCta = secondaryCta;
            })
          }
        />
      </SectionCard>
    </div>
  );
}

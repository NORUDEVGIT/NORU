import { MarketingLegacyHeroForm } from "@/core/components/admin/marketing-brand-form";
import { MarketingContentForms } from "@/core/components/admin/marketing-content-forms";
import { SectionCard } from "@/core/components/admin/marketing-form-fields";
import { SitePlansForm, SiteResourcesForm } from "@/core/components/admin/marketing-noru-site-forms";
import { MarketingPackagesForm } from "@/core/components/admin/marketing-packages-form";
import { MarketingPricingForm } from "@/core/components/admin/marketing-pricing-form";
import { MarketingSiteForms } from "@/core/components/admin/marketing-site-forms";

export function MarketingLegacyForm() {
  return (
    <div className="space-y-5">
      <SectionCard
        title="Compatibility fields"
        description="These JSON keys remain in MarketingContent for older documents. They are not the current public landing editor. Header, products, solutions, partners, events, FAQ, animation, CTA, and footer live in the primary tabs."
      >
        <p className="text-sm text-muted-foreground">
          Edits here do not replace the current-site tabs. Do not use this section to fight the live landing copy.
        </p>
      </SectionCard>
      <MarketingLegacyHeroForm />
      <MarketingPackagesForm />
      <MarketingPricingForm />
      <SitePlansForm />
      <SiteResourcesForm />
      <MarketingContentForms />
      <MarketingSiteForms />
    </div>
  );
}

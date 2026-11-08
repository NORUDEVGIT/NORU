import { MarketingBrandFields } from "@/core/components/admin/marketing-brand-form";
import { Field, NoruHrefSelect, SectionCard, TextField } from "@/core/components/admin/marketing-form-fields";
import { MarketingNavForm } from "@/core/components/admin/marketing-nav-form";
import { useSiteDraft } from "@/core/components/admin/marketing-noru-site-forms";
import { isAllowedNoruSiteHref, NORU_SITE_CTA_DEFAULTS } from "@/core/lib/marketing";
import { toast } from "sonner";

export function MarketingHeaderForm() {
  const { site, updateSite } = useSiteDraft();
  const buttonLabel = site.cta?.buttonLabel ?? "";
  const target = site.cta?.target ?? "";

  return (
    <div className="space-y-5">
      <MarketingBrandFields />
      <SectionCard
        title="Live header"
        description="The current public header is not a free-form menu builder. Product and solution labels come from those landing sections. Pricing, Resources, and Sign In are application chrome."
      >
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Product Features menu → Product Highlights titles</li>
          <li>Solutions menu → Property Solutions titles</li>
          <li>Pricing, Resources, and Sign In stay in application code</li>
          <li>Request Demo button below shares Final CTA label and target</li>
        </ul>
      </SectionCard>
      <MarketingNavForm />
      <SectionCard
        title="Request Demo"
        description="Header and final CTA share this button. Values stay empty until you edit them; the public site then uses the built-in Request Demo fallback."
      >
        <TextField
          id="header-demo-label"
          label="Button label"
          value={buttonLabel}
          placeholder={NORU_SITE_CTA_DEFAULTS.buttonLabel}
          onChange={(next) =>
            updateSite((draft) => {
              draft.cta = { ...draft.cta, buttonLabel: next };
            })
          }
        />
        <Field label="Target" hint="Current public-site hashes and restaurant auth only.">
          <NoruHrefSelect
            id="header-demo-target"
            value={target || NORU_SITE_CTA_DEFAULTS.target}
            onChange={(next) => {
              if (!isAllowedNoruSiteHref(next)) {
                toast.error("That target is not allowed on the public site.");
                return;
              }
              updateSite((draft) => {
                draft.cta = { ...draft.cta, target: next };
              });
            }}
          />
        </Field>
      </SectionCard>
    </div>
  );
}

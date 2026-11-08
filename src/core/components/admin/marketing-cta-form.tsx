import { Field, NoruHrefSelect, SectionCard, TextField, AreaField } from "@/core/components/admin/marketing-form-fields";
import { useSiteDraft } from "@/core/components/admin/marketing-noru-site-forms";
import { isAllowedNoruSiteHref, NORU_SITE_CTA_DEFAULTS } from "@/core/lib/marketing";
import { resolveSiteCta } from "@/core/lib/marketing/site-content";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { toast } from "sonner";

export function MarketingCtaForm() {
  const { site, updateSite } = useSiteDraft();
  const resolved = resolveSiteCta(site);
  const stored = site.cta;

  return (
    <SectionCard
      title="Final CTA"
      description="Controls the Request Demo band. Empty fields keep the current public copy until you edit them."
    >
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={resolved.enabled}
          onCheckedChange={(checked) =>
            updateSite((draft) => {
              draft.cta = { ...draft.cta, enabled: checked === true };
            })
          }
        />
        Enabled
      </label>
      <TextField
        id="cta-title"
        label="Title"
        value={stored?.title ?? ""}
        placeholder={NORU_SITE_CTA_DEFAULTS.title}
        onChange={(title) =>
          updateSite((draft) => {
            draft.cta = { ...draft.cta, title };
          })
        }
      />
      <AreaField
        id="cta-description"
        label="Description"
        value={stored?.description ?? ""}
        placeholder={NORU_SITE_CTA_DEFAULTS.description}
        onChange={(description) =>
          updateSite((draft) => {
            draft.cta = { ...draft.cta, description };
          })
        }
      />
      <TextField
        id="cta-button"
        label="Button label"
        value={stored?.buttonLabel ?? ""}
        placeholder={NORU_SITE_CTA_DEFAULTS.buttonLabel}
        onChange={(buttonLabel) =>
          updateSite((draft) => {
            draft.cta = { ...draft.cta, buttonLabel };
          })
        }
      />
      <Field label="Target" hint="Current public-site hashes and restaurant auth only.">
        <NoruHrefSelect
          id="cta-target"
          value={stored?.target || NORU_SITE_CTA_DEFAULTS.target}
          onChange={(target) => {
            if (!isAllowedNoruSiteHref(target)) {
              toast.error("That target is not allowed on the public site.");
              return;
            }
            updateSite((draft) => {
              draft.cta = { ...draft.cta, target };
            });
          }}
        />
      </Field>
    </SectionCard>
  );
}

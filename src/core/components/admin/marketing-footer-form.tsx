import { AreaField, Field, NoruHrefSelect, SectionCard, TextField } from "@/core/components/admin/marketing-form-fields";
import { useSiteDraft } from "@/core/components/admin/marketing-noru-site-forms";
import { nextOrder, setOptionalString } from "@/core/components/admin/marketing-optional";
import {
  isAllowedNoruSiteHref,
  isAllowedSocialHref,
  newMarketingId,
  NORU_SITE_FOOTER_DEFAULTS,
} from "@/core/lib/marketing";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { toast } from "sonner";

export function MarketingFooterForm() {
  const { site, updateSite } = useSiteDraft();
  const contact = site.footerContact;
  const socials = [...(contact.socialLinks ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return (
    <div className="space-y-5">
      <SectionCard
        title="Brand"
        description="Name and logo are edited in Header & Navigation. The public footer currently uses the bundled mark plus this tagline."
      >
        <TextField
          id="footer-tagline"
          label="Tagline"
          value={contact.tagline ?? ""}
          placeholder={NORU_SITE_FOOTER_DEFAULTS.tagline}
          onChange={(tagline) =>
            updateSite((draft) => {
              setOptionalString(draft.footerContact, "tagline", tagline);
            })
          }
        />
      </SectionCard>

      <SectionCard
        title="Product links"
        description="The public Products column lists visible Product Highlights. Edit titles and order there — this is a read-only map."
      >
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {site.products.filter((item) => item.visible).map((item) => (
            <li key={item.id}>{item.title}</li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard
        title="Solution links"
        description="The public Solutions column lists visible Property Solutions. Edit titles and order there."
      >
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {site.solutions.filter((item) => item.visible).map((item) => (
            <li key={item.id}>{item.title}</li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard
        title="Resource links"
        description="The live footer still uses the built-in About, Blogs, Testimonials, and Contact stubs. There is no separate resource-link JSON field on the current site contract."
      >
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>About Us</li>
          <li>Blogs</li>
          <li>Testimonials</li>
          <li>Contact Us</li>
        </ul>
      </SectionCard>

      <SectionCard title="Contact" description="Email, phone, and office address on the public footer.">
        <TextField
          id="footer-email"
          label="Email"
          value={contact.email}
          onChange={(email) =>
            updateSite((draft) => {
              draft.footerContact.email = email;
            })
          }
        />
        <TextField
          id="footer-phone"
          label="Phone"
          value={contact.phone}
          onChange={(phone) =>
            updateSite((draft) => {
              draft.footerContact.phone = phone;
            })
          }
        />
        <AreaField
          id="footer-address"
          label="Address"
          value={contact.address}
          onChange={(address) =>
            updateSite((draft) => {
              draft.footerContact.address = address;
            })
          }
        />
      </SectionCard>

      <SectionCard title="Social links" description="HTTPS URLs only. Inactive links are kept in the draft but omitted by the resolver.">
        {socials.map((link) => (
          <div key={link.id} className="space-y-3 rounded-lg border border-border p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                id={`${link.id}-platform`}
                label="Platform"
                value={link.platform}
                onChange={(platform) =>
                  updateSite((draft) => {
                    const row = draft.footerContact.socialLinks?.find((item) => item.id === link.id);
                    if (row) row.platform = platform;
                  })
                }
              />
              <TextField
                id={`${link.id}-order`}
                label="Order"
                value={String(link.order ?? 0)}
                onChange={(order) =>
                  updateSite((draft) => {
                    const row = draft.footerContact.socialLinks?.find((item) => item.id === link.id);
                    if (row) row.order = Number(order) || 0;
                  })
                }
              />
              <TextField
                id={`${link.id}-href`}
                label="HTTPS URL"
                value={link.href}
                onChange={(href) =>
                  updateSite((draft) => {
                    const row = draft.footerContact.socialLinks?.find((item) => item.id === link.id);
                    if (!row) return;
                    const trimmed = href.trim();
                    if (trimmed && !isAllowedSocialHref(trimmed)) {
                      toast.error("Social links must be https and must not point at Admin.");
                      return;
                    }
                    row.href = trimmed;
                  })
                }
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={link.active !== false}
                  onCheckedChange={(checked) =>
                    updateSite((draft) => {
                      const row = draft.footerContact.socialLinks?.find((item) => item.id === link.id);
                      if (row) row.active = checked === true;
                    })
                  }
                />
                Active
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  updateSite((draft) => {
                    draft.footerContact.socialLinks = (draft.footerContact.socialLinks ?? []).filter(
                      (item) => item.id !== link.id,
                    );
                  })
                }
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            updateSite((draft) => {
              const list = draft.footerContact.socialLinks ?? [];
              list.push({
                id: newMarketingId("social"),
                platform: "",
                href: "",
                active: true,
                order: nextOrder(list.map((item) => ({ order: item.order ?? 0 }))),
              });
              draft.footerContact.socialLinks = list;
            })
          }
        >
          Add social link
        </Button>
      </SectionCard>

      <SectionCard title="Legal" description="Privacy and Terms destinations. Empty fields keep the current public stubs.">
        <Field label="Privacy Policy">
          <NoruHrefSelect
            id="footer-privacy"
            value={contact.privacyTarget || NORU_SITE_FOOTER_DEFAULTS.privacyTarget}
            onChange={(privacyTarget) => {
              if (!isAllowedNoruSiteHref(privacyTarget)) {
                toast.error("That destination is not allowed.");
                return;
              }
              updateSite((draft) => {
                draft.footerContact.privacyTarget = privacyTarget;
              });
            }}
          />
        </Field>
        <Field label="Terms of Service">
          <NoruHrefSelect
            id="footer-terms"
            value={contact.termsTarget || NORU_SITE_FOOTER_DEFAULTS.termsTarget}
            onChange={(termsTarget) => {
              if (!isAllowedNoruSiteHref(termsTarget)) {
                toast.error("That destination is not allowed.");
                return;
              }
              updateSite((draft) => {
                draft.footerContact.termsTarget = termsTarget;
              });
            }}
          />
        </Field>
        <TextField
          id="footer-copyright"
          label="Copyright"
          value={contact.copyrightText ?? ""}
          placeholder={NORU_SITE_FOOTER_DEFAULTS.copyrightText}
          onChange={(copyrightText) =>
            updateSite((draft) => {
              setOptionalString(draft.footerContact, "copyrightText", copyrightText);
            })
          }
        />
      </SectionCard>
    </div>
  );
}

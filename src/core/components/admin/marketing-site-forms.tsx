import { useMarketingEditor } from "@/core/components/admin/marketing-editor-provider";
import {
  AreaField,
  EmptyState,
  Field,
  HrefSelect,
  SectionCard,
  TextField,
} from "@/core/components/admin/marketing-form-fields";
import { nextOrder, setOptionalString } from "@/core/components/admin/marketing-optional";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  isAllowedSocialHref,
  newMarketingId,
  requireMarketingHref,
  sortByOrder,
  type MarketingCta,
  type MarketingNavHref,
} from "@/core/lib/marketing";
import { toast } from "sonner";

export function MarketingSiteForms() {
  const { draft, updateDraft } = useMarketingEditor();

  return (
    <div className="space-y-5">
      <SectionCard title="Contact" description="Public contact heading and allowlisted CTAs.">
        <TextField
          id="contact-heading"
          label="Heading"
          value={draft.contact.heading}
          onChange={(heading) => updateDraft((d) => { d.contact.heading = heading; })}
        />
        <AreaField
          id="contact-description"
          label="Description"
          value={draft.contact.description}
          onChange={(description) => updateDraft((d) => { d.contact.description = description; })}
        />
        <TextField
          id="contact-primary-label"
          label="Primary CTA label"
          value={draft.contact.primaryCta.label}
          onChange={(label) => updateDraft((d) => { d.contact.primaryCta.label = label; })}
        />
        <Field label="Primary CTA target">
          <HrefSelect
            value={draft.contact.primaryCta.target}
            onChange={(target: MarketingNavHref) =>
              updateDraft((d) => { d.contact.primaryCta.target = requireMarketingHref(target); })
            }
          />
        </Field>
        <TextField
          id="contact-secondary-label"
          label="Secondary CTA label"
          value={draft.contact.secondaryCta?.label ?? ""}
          onChange={(label) =>
            updateDraft((d) => {
              const current: MarketingCta = d.contact.secondaryCta ?? { label: "", target: "/restaurant/login" };
              if (!label.trim()) delete d.contact.secondaryCta;
              else d.contact.secondaryCta = { ...current, label };
            })
          }
        />
        {draft.contact.secondaryCta ? (
          <Field label="Secondary CTA target">
            <HrefSelect
              value={draft.contact.secondaryCta.target}
              onChange={(target: MarketingNavHref) =>
                updateDraft((d) => {
                  if (!d.contact.secondaryCta) return;
                  d.contact.secondaryCta.target = requireMarketingHref(target);
                })
              }
            />
          </Field>
        ) : null}
      </SectionCard>

      <SectionCard title="Footer" description="Footer copy and allowlisted link groups. Socials must be https.">
        <AreaField
          id="footer-blurb"
          label="Blurb"
          value={draft.footer.blurb}
          onChange={(blurb) => updateDraft((d) => { d.footer.blurb = blurb; })}
        />
        <TextField
          id="footer-copyright"
          label="Copyright"
          value={draft.footer.copyright}
          onChange={(copyright) => updateDraft((d) => { d.footer.copyright = copyright; })}
        />
        {sortByOrder(draft.footer.linkGroups).map((group) => (
          <div key={group.id} className="space-y-3 rounded-lg border border-border p-4">
            <TextField
              id={`${group.id}-title`}
              label="Group title"
              value={group.title}
              onChange={(title) =>
                updateDraft((d) => {
                  const row = d.footer.linkGroups.find((entry) => entry.id === group.id);
                  if (row) row.title = title;
                })
              }
            />
            {sortByOrder(group.links).map((link) => (
              <div key={link.id} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <TextField
                  id={`${link.id}-label`}
                  label="Link label"
                  value={link.label}
                  onChange={(label) =>
                    updateDraft((d) => {
                      const parent = d.footer.linkGroups.find((entry) => entry.id === group.id);
                      const row = parent?.links.find((entry) => entry.id === link.id);
                      if (row) row.label = label;
                    })
                  }
                />
                <Field label="Target">
                  <HrefSelect
                    value={link.href}
                    onChange={(href: MarketingNavHref) =>
                      updateDraft((d) => {
                        const parent = d.footer.linkGroups.find((entry) => entry.id === group.id);
                        const row = parent?.links.find((entry) => entry.id === link.id);
                        if (row) row.href = requireMarketingHref(href);
                      })
                    }
                  />
                </Field>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      updateDraft((d) => {
                        const parent = d.footer.linkGroups.find((entry) => entry.id === group.id);
                        if (parent) parent.links = parent.links.filter((entry) => entry.id !== link.id);
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
              size="sm"
              onClick={() =>
                updateDraft((d) => {
                  const parent = d.footer.linkGroups.find((entry) => entry.id === group.id);
                  if (!parent) return;
                  parent.links.push({
                    id: newMarketingId("ft"),
                    label: "New link",
                    href: "#packages",
                    order: nextOrder(parent.links),
                  });
                })
              }
            >
              Add footer link
            </Button>
          </div>
        ))}
        <div className="space-y-3">
          <p className="text-sm font-medium">Socials</p>
          {draft.footer.socials.length === 0 ? <EmptyState>No social links yet.</EmptyState> : null}
          {sortByOrder(draft.footer.socials).map((social) => (
            <div key={social.id} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <TextField
                id={`${social.id}-label`}
                label="Label"
                value={social.label}
                onChange={(label) =>
                  updateDraft((d) => {
                    const row = d.footer.socials.find((entry) => entry.id === social.id);
                    if (row) row.label = label;
                  })
                }
              />
              <TextField
                id={`${social.id}-href`}
                label="https URL"
                value={social.href}
                onChange={(href) =>
                  updateDraft((d) => {
                    const row = d.footer.socials.find((entry) => entry.id === social.id);
                    if (!row) return;
                    if (href.trim() && !isAllowedSocialHref(href.trim())) {
                      toast.error("Social links must be https and must not point at Admin.");
                      return;
                    }
                    row.href = href.trim();
                  })
                }
              />
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    updateDraft((d) => {
                      d.footer.socials = d.footer.socials.filter((entry) => entry.id !== social.id);
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
            size="sm"
            onClick={() =>
              updateDraft((d) => {
                d.footer.socials.push({
                  id: newMarketingId("social"),
                  label: "",
                  href: "https://",
                  order: nextOrder(d.footer.socials),
                });
              })
            }
          >
            Add social
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="FAQ" description="Optional questions. Inactive items stay off the public site.">
        {draft.faq.length === 0 ? <EmptyState>No FAQ items yet.</EmptyState> : null}
        {sortByOrder(draft.faq).map((item) => (
          <div key={item.id} className="space-y-3 rounded-lg border border-border p-4">
            <TextField
              id={`${item.id}-q`}
              label="Question"
              value={item.question}
              onChange={(question) =>
                updateDraft((d) => {
                  const row = d.faq.find((entry) => entry.id === item.id);
                  if (row) row.question = question;
                })
              }
            />
            <AreaField
              id={`${item.id}-a`}
              label="Answer"
              value={item.answer}
              onChange={(answer) =>
                updateDraft((d) => {
                  const row = d.faq.find((entry) => entry.id === item.id);
                  if (row) row.answer = answer;
                })
              }
            />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={item.active}
                onCheckedChange={(checked) =>
                  updateDraft((d) => {
                    const row = d.faq.find((entry) => entry.id === item.id);
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
              onClick={() => updateDraft((d) => { d.faq = d.faq.filter((entry) => entry.id !== item.id); })}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            updateDraft((d) => {
              d.faq.push({
                id: newMarketingId("faq"),
                question: "",
                answer: "",
                order: nextOrder(d.faq),
                active: false,
              });
            })
          }
        >
          Add FAQ
        </Button>
      </SectionCard>

      <SectionCard title="Promo banners" description="Optional banners. Leave empty unless you have a real promotion.">
        {draft.promoBanners.length === 0 ? <EmptyState>No promo banners yet.</EmptyState> : null}
        {sortByOrder(draft.promoBanners).map((banner) => (
          <div key={banner.id} className="space-y-3 rounded-lg border border-border p-4">
            <TextField
              id={`${banner.id}-headline`}
              label="Headline"
              value={banner.headline}
              onChange={(headline) =>
                updateDraft((d) => {
                  const row = d.promoBanners.find((entry) => entry.id === banner.id);
                  if (row) row.headline = headline;
                })
              }
            />
            <AreaField
              id={`${banner.id}-description`}
              label="Description (optional)"
              value={banner.description ?? ""}
              onChange={(description) =>
                updateDraft((d) => {
                  const row = d.promoBanners.find((entry) => entry.id === banner.id);
                  if (row) setOptionalString(row, "description", description);
                })
              }
            />
            <TextField
              id={`${banner.id}-cta-label`}
              label="CTA label (optional)"
              value={banner.cta?.label ?? ""}
              onChange={(label) =>
                updateDraft((d) => {
                  const row = d.promoBanners.find((entry) => entry.id === banner.id);
                  if (!row) return;
                  if (!label.trim()) {
                    delete row.cta;
                    return;
                  }
                  row.cta = { label, target: row.cta?.target ?? "#contact" };
                })
              }
            />
            {banner.cta ? (
              <Field label="CTA target">
                <HrefSelect
                  value={banner.cta.target}
                  onChange={(target: MarketingNavHref) =>
                    updateDraft((d) => {
                      const row = d.promoBanners.find((entry) => entry.id === banner.id);
                      if (row?.cta) row.cta.target = requireMarketingHref(target);
                    })
                  }
                />
              </Field>
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={banner.active}
                onCheckedChange={(checked) =>
                  updateDraft((d) => {
                    const row = d.promoBanners.find((entry) => entry.id === banner.id);
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
              onClick={() => updateDraft((d) => { d.promoBanners = d.promoBanners.filter((entry) => entry.id !== banner.id); })}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            updateDraft((d) => {
              d.promoBanners.push({
                id: newMarketingId("promo"),
                headline: "",
                order: nextOrder(d.promoBanners),
                active: false,
              });
            })
          }
        >
          Add promo banner
        </Button>
      </SectionCard>
    </div>
  );
}

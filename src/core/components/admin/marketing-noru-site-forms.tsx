import { useMarketingEditor } from "@/core/components/admin/marketing-editor-provider";
import { MarketingImageField } from "@/core/components/admin/marketing-image-field";
import { AreaField, SectionCard, TextField } from "@/core/components/admin/marketing-form-fields";
import { nextOrder, setOptionalString } from "@/core/components/admin/marketing-optional";
import { currentNoruSiteContent } from "@/core/components/noru-site/data/site-defaults";
import { isAllowedSocialHref, newMarketingId, sortByOrder } from "@/core/lib/marketing";
import {
  NORU_SITE_ICONS,
  type NoruSiteContent,
  type NoruSiteIcon,
  type SiteOffering,
} from "@/core/lib/marketing/types";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { toast } from "sonner";

function useSiteDraft() {
  const { draft, updateDraft } = useMarketingEditor();
  const site = draft.site ?? currentNoruSiteContent();
  const updateSite = (mutator: (site: NoruSiteContent) => void) => {
    updateDraft((next) => {
      if (!next.site) next.site = currentNoruSiteContent();
      mutator(next.site);
    });
  };
  return { site, updateSite };
}

function Flag({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      {label}
    </label>
  );
}

function OfferingEditor({
  kind,
  withImage,
}: {
  kind: "products" | "solutions";
  withImage: boolean;
}) {
  const { site, updateSite } = useSiteDraft();
  const rows = sortByOrder(site[kind]);

  function patch(id: string, mutator: (row: SiteOffering) => void) {
    updateSite((next) => {
      const row = next[kind].find((item) => item.id === id);
      if (row) mutator(row);
    });
  }

  return (
    <div className="space-y-5">
      {rows.map((row) => (
        <SectionCard
          key={row.id}
          title={row.title || "Untitled"}
          description="Shown on the public site when visible."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              id={`${row.id}-title`}
              label="Title"
              value={row.title}
              onChange={(title) =>
                patch(row.id, (item) => {
                  item.title = title;
                })
              }
            />
            <label className="space-y-2 text-sm">
              Icon
              <select
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3"
                value={row.icon}
                onChange={(event) =>
                  patch(row.id, (item) => {
                    item.icon = event.target.value as NoruSiteIcon;
                  })
                }
              >
                {NORU_SITE_ICONS.map((icon) => (
                  <option key={icon} value={icon}>
                    {icon}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <AreaField
            id={`${row.id}-blurb`}
            label="Card blurb"
            value={row.blurb}
            onChange={(blurb) =>
              patch(row.id, (item) => {
                item.blurb = blurb;
              })
            }
          />
          <AreaField
            id={`${row.id}-lead`}
            label="Detail intro"
            value={row.lead}
            onChange={(lead) =>
              patch(row.id, (item) => {
                item.lead = lead;
              })
            }
          />
          <div className="space-y-3">
            <p className="text-sm font-medium">Feature points</p>
            {row.points.map((point, index) => (
              <div
                key={`${row.id}-point-${index}`}
                className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]"
              >
                <TextField
                  id={`${row.id}-strong-${index}`}
                  label="Bold label"
                  value={point.strong ?? ""}
                  onChange={(strong) =>
                    patch(row.id, (item) => {
                      const target = item.points[index];
                      if (target) setOptionalString(target, "strong", strong);
                    })
                  }
                />
                <TextField
                  id={`${row.id}-text-${index}`}
                  label="Text"
                  value={point.text}
                  onChange={(text) =>
                    patch(row.id, (item) => {
                      const target = item.points[index];
                      if (target) target.text = text;
                    })
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-end"
                  onClick={() =>
                    patch(row.id, (item) => {
                      item.points.splice(index, 1);
                    })
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                patch(row.id, (item) => {
                  item.points.push({ text: "" });
                })
              }
            >
              Add point
            </Button>
          </div>
          {withImage ? (
            <MarketingImageField
              id={`${row.id}-image`}
              label="Photo"
              url={row.imageUrl ?? ""}
              alt={row.imageAlt ?? ""}
              onUrl={(imageUrl) =>
                patch(row.id, (item) => setOptionalString(item, "imageUrl", imageUrl))
              }
              onAlt={(imageAlt) =>
                patch(row.id, (item) => setOptionalString(item, "imageAlt", imageAlt))
              }
            />
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Flag
              label="Visible"
              checked={row.visible}
              onChange={(visible) =>
                patch(row.id, (item) => {
                  item.visible = visible;
                })
              }
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                updateSite((next) => {
                  next[kind] = next[kind].filter((item) => item.id !== row.id);
                })
              }
            >
              Remove
            </Button>
          </div>
        </SectionCard>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          updateSite((next) => {
            next[kind].push({
              id: newMarketingId(kind === "products" ? "product" : "solution"),
              icon: kind === "products" ? "pms" : "guest",
              title: kind === "products" ? "New product" : "New solution",
              blurb: "",
              lead: "",
              points: [],
              order: nextOrder(next[kind]),
              visible: true,
            });
          })
        }
      >
        Add {kind === "products" ? "product" : "solution"}
      </Button>
    </div>
  );
}

export function SiteProductsForm() {
  return <OfferingEditor kind="products" withImage={false} />;
}

export function SiteSolutionsForm() {
  return <OfferingEditor kind="solutions" withImage />;
}

export function SitePlansForm() {
  const { site, updateSite } = useSiteDraft();
  return (
    <div className="space-y-5">
      <PlanGroup title="Hotel plans" group="hotelPlans" site={site} updateSite={updateSite} />
      <PlanGroup
        title="Restaurant plans"
        group="restaurantPlans"
        site={site}
        updateSite={updateSite}
      />
      <p className="text-sm text-muted-foreground">
        Prices are display-only. They do not change restaurant package entitlements.
      </p>
    </div>
  );
}

function PlanGroup({
  title,
  group,
  site,
  updateSite,
}: {
  title: string;
  group: "hotelPlans" | "restaurantPlans";
  site: NoruSiteContent;
  updateSite: (mutator: (site: NoruSiteContent) => void) => void;
}) {
  return (
    <SectionCard title={title} description="Leave the price blank to show ETB TBA.">
      {sortByOrder(site[group]).map((plan) => (
        <div key={plan.id} className="space-y-3 rounded-lg border border-border p-4">
          <TextField
            id={`${plan.id}-name`}
            label="Name"
            value={plan.name}
            onChange={(name) =>
              updateSite((next) => {
                const row = next[group].find((item) => item.id === plan.id);
                if (row) row.name = name;
              })
            }
          />
          <TextField
            id={`${plan.id}-modules`}
            label="Included modules"
            value={plan.modules}
            onChange={(modules) =>
              updateSite((next) => {
                const row = next[group].find((item) => item.id === plan.id);
                if (row) row.modules = modules;
              })
            }
          />
          <TextField
            id={`${plan.id}-price`}
            label="Annual price in ETB"
            value={plan.priceEtb === null ? "" : String(plan.priceEtb)}
            onChange={(price) =>
              updateSite((next) => {
                const row = next[group].find((item) => item.id === plan.id);
                if (!row) return;
                const trimmed = price.trim();
                row.priceEtb = trimmed ? Math.max(0, Number(trimmed) || 0) : null;
              })
            }
          />
          <Flag
            label="Featured"
            checked={plan.featured}
            onChange={(featured) =>
              updateSite((next) => {
                const row = next[group].find((item) => item.id === plan.id);
                if (row) row.featured = featured;
              })
            }
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              updateSite((next) => {
                next[group] = next[group].filter((item) => item.id !== plan.id);
              })
            }
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          updateSite((next) => {
            next[group].push({
              id: newMarketingId("plan"),
              name: "New plan",
              modules: "",
              priceEtb: null,
              featured: false,
              order: nextOrder(next[group]),
            });
          })
        }
      >
        Add plan
      </Button>
    </SectionCard>
  );
}

export function SiteFaqForm() {
  const { site, updateSite } = useSiteDraft();
  return (
    <div className="space-y-5">
      {sortByOrder(site.faq).map((item) => (
        <SectionCard
          key={item.id}
          title={item.question || "Question"}
          description="Active questions appear on the homepage."
        >
          <TextField
            id={`${item.id}-q`}
            label="Question"
            value={item.question}
            onChange={(question) =>
              updateSite((next) => {
                const row = next.faq.find((entry) => entry.id === item.id);
                if (row) row.question = question;
              })
            }
          />
          <AreaField
            id={`${item.id}-a`}
            label="Answer"
            value={item.answer}
            onChange={(answer) =>
              updateSite((next) => {
                const row = next.faq.find((entry) => entry.id === item.id);
                if (row) row.answer = answer;
              })
            }
          />
          <Flag
            label="Active"
            checked={item.active}
            onChange={(active) =>
              updateSite((next) => {
                const row = next.faq.find((entry) => entry.id === item.id);
                if (row) row.active = active;
              })
            }
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              updateSite((next) => {
                next.faq = next.faq.filter((entry) => entry.id !== item.id);
              })
            }
          >
            Remove
          </Button>
        </SectionCard>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          updateSite((next) => {
            next.faq.push({
              id: newMarketingId("faq"),
              question: "",
              answer: "",
              order: nextOrder(next.faq),
              active: true,
            });
          })
        }
      >
        Add question
      </Button>
    </div>
  );
}

export function SitePartnersForm() {
  const { site, updateSite } = useSiteDraft();
  return (
    <div className="space-y-5">
      {sortByOrder(site.partners).map((partner) => (
        <SectionCard
          key={partner.id}
          title={partner.name || "Partner"}
          description="Published partners appear in the homepage strip."
        >
          <TextField
            id={`${partner.id}-name`}
            label="Name"
            value={partner.name}
            onChange={(name) =>
              updateSite((next) => {
                const row = next.partners.find((item) => item.id === partner.id);
                if (row) row.name = name;
              })
            }
          />
          <TextField
            id={`${partner.id}-href`}
            label="https link"
            value={partner.href ?? ""}
            onChange={(href) =>
              updateSite((next) => {
                const row = next.partners.find((item) => item.id === partner.id);
                if (!row) return;
                const trimmed = href.trim();
                if (trimmed && !isAllowedSocialHref(trimmed)) {
                  toast.error("Partner links must be https and must not point at Admin.");
                  return;
                }
                setOptionalString(row, "href", trimmed);
              })
            }
          />
          <MarketingImageField
            id={`${partner.id}-logo`}
            label="Logo"
            url={partner.logoUrl ?? ""}
            alt={partner.logoAlt ?? ""}
            onUrl={(logoUrl) =>
              updateSite((next) => {
                const row = next.partners.find((item) => item.id === partner.id);
                if (row) setOptionalString(row, "logoUrl", logoUrl);
              })
            }
            onAlt={(logoAlt) =>
              updateSite((next) => {
                const row = next.partners.find((item) => item.id === partner.id);
                if (row) setOptionalString(row, "logoAlt", logoAlt);
              })
            }
          />
          <Flag
            label="Published"
            checked={partner.published}
            onChange={(published) =>
              updateSite((next) => {
                const row = next.partners.find((item) => item.id === partner.id);
                if (row) row.published = published;
              })
            }
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              updateSite((next) => {
                next.partners = next.partners.filter((item) => item.id !== partner.id);
              })
            }
          >
            Remove
          </Button>
        </SectionCard>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          updateSite((next) => {
            next.partners.push({
              id: newMarketingId("partner"),
              name: "Partner",
              order: nextOrder(next.partners),
              published: true,
            });
          })
        }
      >
        Add partner
      </Button>
    </div>
  );
}

export function SiteEventsForm() {
  const { site, updateSite } = useSiteDraft();
  return (
    <div className="space-y-5">
      {sortByOrder(site.events).map((event) => (
        <SectionCard
          key={event.id}
          title={event.title || "Event"}
          description="Published events appear in the homepage strip."
        >
          <TextField
            id={`${event.id}-title`}
            label="Title"
            value={event.title}
            onChange={(title) =>
              updateSite((next) => {
                const row = next.events.find((item) => item.id === event.id);
                if (row) row.title = title;
              })
            }
          />
          <TextField
            id={`${event.id}-date`}
            label="Date"
            value={event.date}
            onChange={(date) =>
              updateSite((next) => {
                const row = next.events.find((item) => item.id === event.id);
                if (row) row.date = date;
              })
            }
          />
          <TextField
            id={`${event.id}-place`}
            label="Location"
            value={event.place}
            onChange={(place) =>
              updateSite((next) => {
                const row = next.events.find((item) => item.id === event.id);
                if (row) row.place = place;
              })
            }
          />
          <AreaField
            id={`${event.id}-note`}
            label="Note"
            value={event.note}
            onChange={(note) =>
              updateSite((next) => {
                const row = next.events.find((item) => item.id === event.id);
                if (row) row.note = note;
              })
            }
          />
          <Flag
            label="Published"
            checked={event.published}
            onChange={(published) =>
              updateSite((next) => {
                const row = next.events.find((item) => item.id === event.id);
                if (row) row.published = published;
              })
            }
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              updateSite((next) => {
                next.events = next.events.filter((item) => item.id !== event.id);
              })
            }
          >
            Remove
          </Button>
        </SectionCard>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          updateSite((next) => {
            next.events.push({
              id: newMarketingId("event"),
              date: "",
              title: "Event",
              place: "",
              note: "",
              order: nextOrder(next.events),
              published: true,
            });
          })
        }
      >
        Add event
      </Button>
    </div>
  );
}

export function SiteResourcesForm() {
  const { site, updateSite } = useSiteDraft();
  return (
    <div className="space-y-5">
      <SectionCard title="About Us" description="Plain text. This does not render HTML.">
        <TextField
          id="about-title"
          label="Title"
          value={site.about.title}
          onChange={(title) =>
            updateSite((next) => {
              next.about.title = title;
            })
          }
        />
        <AreaField
          id="about-intro"
          label="Intro"
          value={site.about.intro}
          onChange={(intro) =>
            updateSite((next) => {
              next.about.intro = intro;
            })
          }
        />
        <AreaField
          id="about-body"
          label="Body"
          value={site.about.body}
          onChange={(body) =>
            updateSite((next) => {
              next.about.body = body;
            })
          }
          rows={6}
        />
      </SectionCard>
      {sortByOrder(site.posts).map((post) => (
        <SectionCard
          key={post.id}
          title={post.title || "Article"}
          description="A published article with a body gets a detail view."
        >
          <TextField
            id={`${post.id}-title`}
            label="Title"
            value={post.title}
            onChange={(title) =>
              updateSite((next) => {
                const row = next.posts.find((item) => item.id === post.id);
                if (row) row.title = title;
              })
            }
          />
          <TextField
            id={`${post.id}-slug`}
            label="Slug"
            value={post.slug}
            onChange={(slug) =>
              updateSite((next) => {
                const row = next.posts.find((item) => item.id === post.id);
                if (row) row.slug = slug;
              })
            }
          />
          <AreaField
            id={`${post.id}-excerpt`}
            label="Excerpt"
            value={post.excerpt}
            onChange={(excerpt) =>
              updateSite((next) => {
                const row = next.posts.find((item) => item.id === post.id);
                if (row) row.excerpt = excerpt;
              })
            }
          />
          <AreaField
            id={`${post.id}-body`}
            label="Body"
            value={post.body}
            onChange={(body) =>
              updateSite((next) => {
                const row = next.posts.find((item) => item.id === post.id);
                if (row) row.body = body;
              })
            }
            rows={8}
          />
          <Flag
            label="Published"
            checked={post.published}
            onChange={(published) =>
              updateSite((next) => {
                const row = next.posts.find((item) => item.id === post.id);
                if (row) row.published = published;
              })
            }
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              updateSite((next) => {
                next.posts = next.posts.filter((item) => item.id !== post.id);
              })
            }
          >
            Remove
          </Button>
        </SectionCard>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          updateSite((next) => {
            next.posts.push({
              id: newMarketingId("post"),
              slug: "",
              title: "New article",
              excerpt: "",
              body: "",
              published: false,
              order: nextOrder(next.posts),
            });
          })
        }
      >
        Add article
      </Button>
      {sortByOrder(site.quotes).map((quote) => (
        <SectionCard
          key={quote.id}
          title={quote.authorName || "Testimonial"}
          description="Published quotes appear on the resources page. There is no detail page."
        >
          <AreaField
            id={`${quote.id}-quote`}
            label="Quote"
            value={quote.quote}
            onChange={(value) =>
              updateSite((next) => {
                const row = next.quotes.find((item) => item.id === quote.id);
                if (row) row.quote = value;
              })
            }
          />
          <TextField
            id={`${quote.id}-author`}
            label="Author"
            value={quote.authorName}
            onChange={(authorName) =>
              updateSite((next) => {
                const row = next.quotes.find((item) => item.id === quote.id);
                if (row) row.authorName = authorName;
              })
            }
          />
          <TextField
            id={`${quote.id}-role`}
            label="Role"
            value={quote.authorRole ?? ""}
            onChange={(authorRole) =>
              updateSite((next) => {
                const row = next.quotes.find((item) => item.id === quote.id);
                if (row) setOptionalString(row, "authorRole", authorRole);
              })
            }
          />
          <TextField
            id={`${quote.id}-property`}
            label="Property"
            value={quote.propertyName ?? ""}
            onChange={(propertyName) =>
              updateSite((next) => {
                const row = next.quotes.find((item) => item.id === quote.id);
                if (row) setOptionalString(row, "propertyName", propertyName);
              })
            }
          />
          <Flag
            label="Published"
            checked={quote.published}
            onChange={(published) =>
              updateSite((next) => {
                const row = next.quotes.find((item) => item.id === quote.id);
                if (row) row.published = published;
              })
            }
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              updateSite((next) => {
                next.quotes = next.quotes.filter((item) => item.id !== quote.id);
              })
            }
          >
            Remove
          </Button>
        </SectionCard>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          updateSite((next) => {
            next.quotes.push({
              id: newMarketingId("quote"),
              quote: "",
              authorName: "",
              order: nextOrder(next.quotes),
              published: true,
            });
          })
        }
      >
        Add testimonial
      </Button>
    </div>
  );
}

export function SiteDetailsForm() {
  const { site, updateSite } = useSiteDraft();
  return (
    <div className="space-y-5">
      <SectionCard
        title="Hero words"
        description="The walk-and-bow animation stays in code. These two lines are the editable copy."
      >
        <TextField
          id="hero-tagline"
          label="Tagline"
          value={site.hero.tagline}
          onChange={(tagline) =>
            updateSite((next) => {
              next.hero.tagline = tagline;
            })
          }
        />
        <TextField
          id="hero-amharic"
          label="Amharic line"
          value={site.hero.amharic}
          onChange={(amharic) =>
            updateSite((next) => {
              next.hero.amharic = amharic;
            })
          }
        />
      </SectionCard>
      <SectionCard
        title="Footer contact"
        description="Replaces the footer contact lines. Social and legal links stay in the page code."
      >
        <TextField
          id="footer-email"
          label="Email"
          value={site.footerContact.email}
          onChange={(email) =>
            updateSite((next) => {
              next.footerContact.email = email;
            })
          }
        />
        <TextField
          id="footer-phone"
          label="Phone"
          value={site.footerContact.phone}
          onChange={(phone) =>
            updateSite((next) => {
              next.footerContact.phone = phone;
            })
          }
        />
        <TextField
          id="footer-address"
          label="Office address"
          value={site.footerContact.address}
          onChange={(address) =>
            updateSite((next) => {
              next.footerContact.address = address;
            })
          }
        />
      </SectionCard>
    </div>
  );
}

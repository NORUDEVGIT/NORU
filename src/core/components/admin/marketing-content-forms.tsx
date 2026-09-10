import { useMarketingEditor } from "@/core/components/admin/marketing-editor-provider";
import { AreaField, EmptyState, SectionCard, TextField } from "@/core/components/admin/marketing-form-fields";
import { nextOrder, setOptionalString } from "@/core/components/admin/marketing-optional";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { isAllowedSocialHref, newMarketingId, sortByOrder } from "@/core/lib/marketing";
import { toast } from "sonner";

const EMPTY_PROOF =
  "Empty on purpose. Add a real entry only when you have one — do not invent partners, quotes, case studies, or posts.";

export function MarketingContentForms() {
  const { draft, updateDraft } = useMarketingEditor();

  return (
    <div className="space-y-5">
      <SectionCard title="Partners" description={EMPTY_PROOF}>
        {draft.partners.length === 0 ? <EmptyState>No partners yet.</EmptyState> : null}
        {sortByOrder(draft.partners).map((partner) => (
          <div key={partner.id} className="space-y-3 rounded-lg border border-border p-4">
            <TextField
              id={`${partner.id}-name`}
              label="Name"
              value={partner.name}
              onChange={(name) =>
                updateDraft((d) => {
                  const row = d.partners.find((item) => item.id === partner.id);
                  if (row) row.name = name;
                })
              }
            />
            <TextField
              id={`${partner.id}-logo`}
              label="Logo URL (optional)"
              value={partner.logoUrl ?? ""}
              onChange={(logoUrl) =>
                updateDraft((d) => {
                  const row = d.partners.find((item) => item.id === partner.id);
                  if (row) setOptionalString(row, "logoUrl", logoUrl);
                })
              }
            />
            <TextField
              id={`${partner.id}-href`}
              label="https link (optional)"
              value={partner.href ?? ""}
              onChange={(href) =>
                updateDraft((d) => {
                  const row = d.partners.find((item) => item.id === partner.id);
                  if (!row) return;
                  const trimmed = href.trim();
                  if (!trimmed) {
                    delete row.href;
                    return;
                  }
                  if (!isAllowedSocialHref(trimmed)) {
                    toast.error("Partner links must be https and must not point at Admin.");
                    return;
                  }
                  row.href = trimmed;
                })
              }
            />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={partner.published}
                onCheckedChange={(checked) =>
                  updateDraft((d) => {
                    const row = d.partners.find((item) => item.id === partner.id);
                    if (row) row.published = checked === true;
                  })
                }
              />
              Published
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => updateDraft((d) => { d.partners = d.partners.filter((item) => item.id !== partner.id); })}
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
              d.partners.push({
                id: newMarketingId("partner"),
                name: "",
                order: nextOrder(d.partners),
                published: false,
              });
            })
          }
        >
          Add partner
        </Button>
      </SectionCard>

      <SectionCard title="Testimonials" description={EMPTY_PROOF}>
        {draft.testimonials.length === 0 ? <EmptyState>No testimonials yet.</EmptyState> : null}
        {sortByOrder(draft.testimonials).map((item) => (
          <div key={item.id} className="space-y-3 rounded-lg border border-border p-4">
            <AreaField
              id={`${item.id}-quote`}
              label="Quote"
              value={item.quote}
              onChange={(quote) =>
                updateDraft((d) => {
                  const row = d.testimonials.find((entry) => entry.id === item.id);
                  if (row) row.quote = quote;
                })
              }
            />
            <TextField
              id={`${item.id}-author`}
              label="Author"
              value={item.authorName}
              onChange={(authorName) =>
                updateDraft((d) => {
                  const row = d.testimonials.find((entry) => entry.id === item.id);
                  if (row) row.authorName = authorName;
                })
              }
            />
            <TextField
              id={`${item.id}-role`}
              label="Role (optional)"
              value={item.authorRole ?? ""}
              onChange={(authorRole) =>
                updateDraft((d) => {
                  const row = d.testimonials.find((entry) => entry.id === item.id);
                  if (row) setOptionalString(row, "authorRole", authorRole);
                })
              }
            />
            <TextField
              id={`${item.id}-property`}
              label="Property (optional)"
              value={item.propertyName ?? ""}
              onChange={(propertyName) =>
                updateDraft((d) => {
                  const row = d.testimonials.find((entry) => entry.id === item.id);
                  if (row) setOptionalString(row, "propertyName", propertyName);
                })
              }
            />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={item.published}
                onCheckedChange={(checked) =>
                  updateDraft((d) => {
                    const row = d.testimonials.find((entry) => entry.id === item.id);
                    if (row) row.published = checked === true;
                  })
                }
              />
              Published
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => updateDraft((d) => { d.testimonials = d.testimonials.filter((entry) => entry.id !== item.id); })}
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
              d.testimonials.push({
                id: newMarketingId("quote"),
                quote: "",
                authorName: "",
                order: nextOrder(d.testimonials),
                published: false,
              });
            })
          }
        >
          Add testimonial
        </Button>
      </SectionCard>

      <SectionCard title="Case studies" description={EMPTY_PROOF}>
        {draft.caseStudies.length === 0 ? <EmptyState>No case studies yet.</EmptyState> : null}
        {sortByOrder(draft.caseStudies).map((study) => (
          <div key={study.id} className="space-y-3 rounded-lg border border-border p-4">
            <TextField
              id={`${study.id}-slug`}
              label="Slug"
              value={study.slug}
              onChange={(slug) =>
                updateDraft((d) => {
                  const row = d.caseStudies.find((entry) => entry.id === study.id);
                  if (row) row.slug = slug;
                })
              }
            />
            <TextField
              id={`${study.id}-title`}
              label="Title"
              value={study.title}
              onChange={(title) =>
                updateDraft((d) => {
                  const row = d.caseStudies.find((entry) => entry.id === study.id);
                  if (row) row.title = title;
                })
              }
            />
            <AreaField
              id={`${study.id}-summary`}
              label="Summary"
              value={study.summary}
              onChange={(summary) =>
                updateDraft((d) => {
                  const row = d.caseStudies.find((entry) => entry.id === study.id);
                  if (row) row.summary = summary;
                })
              }
            />
            <AreaField
              id={`${study.id}-body`}
              label="Body (optional)"
              value={study.body ?? ""}
              onChange={(body) =>
                updateDraft((d) => {
                  const row = d.caseStudies.find((entry) => entry.id === study.id);
                  if (row) setOptionalString(row, "body", body);
                })
              }
            />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={study.published}
                onCheckedChange={(checked) =>
                  updateDraft((d) => {
                    const row = d.caseStudies.find((entry) => entry.id === study.id);
                    if (row) row.published = checked === true;
                  })
                }
              />
              Published
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => updateDraft((d) => { d.caseStudies = d.caseStudies.filter((entry) => entry.id !== study.id); })}
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
              d.caseStudies.push({
                id: newMarketingId("case"),
                slug: "",
                title: "",
                summary: "",
                order: nextOrder(d.caseStudies),
                published: false,
              });
            })
          }
        >
          Add case study
        </Button>
      </SectionCard>

      <SectionCard title="Blog" description={EMPTY_PROOF}>
        {draft.blogPosts.length === 0 ? <EmptyState>No blog posts yet.</EmptyState> : null}
        {sortByOrder(draft.blogPosts).map((post) => (
          <div key={post.id} className="space-y-3 rounded-lg border border-border p-4">
            <TextField
              id={`${post.id}-slug`}
              label="Slug"
              value={post.slug}
              onChange={(slug) =>
                updateDraft((d) => {
                  const row = d.blogPosts.find((entry) => entry.id === post.id);
                  if (row) row.slug = slug;
                })
              }
            />
            <TextField
              id={`${post.id}-title`}
              label="Title"
              value={post.title}
              onChange={(title) =>
                updateDraft((d) => {
                  const row = d.blogPosts.find((entry) => entry.id === post.id);
                  if (row) row.title = title;
                })
              }
            />
            <AreaField
              id={`${post.id}-excerpt`}
              label="Excerpt"
              value={post.excerpt}
              onChange={(excerpt) =>
                updateDraft((d) => {
                  const row = d.blogPosts.find((entry) => entry.id === post.id);
                  if (row) row.excerpt = excerpt;
                })
              }
            />
            <AreaField
              id={`${post.id}-body`}
              label="Body (optional)"
              value={post.body ?? ""}
              onChange={(body) =>
                updateDraft((d) => {
                  const row = d.blogPosts.find((entry) => entry.id === post.id);
                  if (row) setOptionalString(row, "body", body);
                })
              }
            />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={post.published}
                onCheckedChange={(checked) =>
                  updateDraft((d) => {
                    const row = d.blogPosts.find((entry) => entry.id === post.id);
                    if (row) row.published = checked === true;
                  })
                }
              />
              Published
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => updateDraft((d) => { d.blogPosts = d.blogPosts.filter((entry) => entry.id !== post.id); })}
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
              d.blogPosts.push({
                id: newMarketingId("post"),
                slug: "",
                title: "",
                excerpt: "",
                order: nextOrder(d.blogPosts),
                published: false,
              });
            })
          }
        >
          Add blog post
        </Button>
      </SectionCard>
    </div>
  );
}

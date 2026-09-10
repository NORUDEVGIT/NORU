import { useMarketingEditor } from "@/core/components/admin/marketing-editor-provider";
import { AreaField, SectionCard, TextField } from "@/core/components/admin/marketing-form-fields";

export function MarketingPricingForm() {
  const { draft, updateDraft } = useMarketingEditor();

  return (
    <SectionCard
      title="Pricing presentation"
      description="Display-only copy. These fields never set a billed price or write a subscription."
    >
      <TextField
        id="pricing-eyebrow"
        label="Eyebrow"
        value={draft.pricing.eyebrow}
        onChange={(eyebrow) => updateDraft((d) => { d.pricing.eyebrow = eyebrow; })}
      />
      <TextField
        id="pricing-heading"
        label="Heading"
        value={draft.pricing.heading}
        onChange={(heading) => updateDraft((d) => { d.pricing.heading = heading; })}
      />
      <AreaField
        id="pricing-description"
        label="Description"
        value={draft.pricing.description}
        onChange={(description) => updateDraft((d) => { d.pricing.description = description; })}
      />
      <TextField
        id="pricing-display-note"
        label="Display note"
        value={draft.pricing.displayNote}
        onChange={(displayNote) => updateDraft((d) => { d.pricing.displayNote = displayNote; })}
        hint="Shown as presentation only — not a billed amount."
      />
      <TextField
        id="pricing-contact-note"
        label="Contact note"
        value={draft.pricing.contactNote}
        onChange={(contactNote) => updateDraft((d) => { d.pricing.contactNote = contactNote; })}
      />
    </SectionCard>
  );
}

import { toast } from "sonner";
import { useMarketingEditor } from "@/core/components/admin/marketing-editor-provider";
import {
  AreaField,
  Field,
  IconSelect,
  SectionCard,
  StatusSelect,
  TextField,
} from "@/core/components/admin/marketing-form-fields";
import { nextOrder } from "@/core/components/admin/marketing-optional";
import { Button } from "@/shared/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import {
  MARKETING_CARD_DISCLAIMER,
  MARKETING_ADMIN_STATUS_LABELS,
  newMarketingId,
  packageAvailableNowIssues,
  sortByOrder,
  type MarketingFeatureBullet,
  type MarketingPackageCard,
} from "@/core/lib/marketing";

export function MarketingPackagesForm() {
  const { draft, updateDraft } = useMarketingEditor();
  const packages = sortByOrder(draft.packages);

  function addPackage() {
    updateDraft((d) => {
      d.packages.push({
        id: newMarketingId("pkg"),
        title: "New marketing card",
        blurb: "",
        status: "coming_soon",
        icon: "restaurant",
        order: nextOrder(d.packages),
        features: [],
      });
    });
  }

  function patchPackage(id: string, mutator: (pkg: MarketingPackageCard) => void) {
    updateDraft((d) => {
      const pkg = d.packages.find((entry) => entry.id === id);
      if (pkg) mutator(pkg);
    });
  }

  return (
    <div className="space-y-5">
      <Alert>
        <AlertTitle>Marketing card ≠ product entitlement</AlertTitle>
        <AlertDescription>{MARKETING_CARD_DISCLAIMER}</AlertDescription>
      </Alert>

      <SectionCard
        title="Packages section copy"
        description="Heading shown above the marketing cards. This is not a package entitlement control."
      >
        <TextField
          id="pkg-eyebrow"
          label="Eyebrow"
          value={draft.packagesSection.eyebrow}
          onChange={(eyebrow) => updateDraft((d) => { d.packagesSection.eyebrow = eyebrow; })}
        />
        <TextField
          id="pkg-heading"
          label="Heading"
          value={draft.packagesSection.heading}
          onChange={(heading) => updateDraft((d) => { d.packagesSection.heading = heading; })}
        />
        <AreaField
          id="pkg-description"
          label="Description"
          value={draft.packagesSection.description}
          onChange={(description) => updateDraft((d) => { d.packagesSection.description = description; })}
        />
      </SectionCard>

      {packages.map((pkg) => {
        const issues = packageAvailableNowIssues(pkg);
        return (
          <SectionCard
            key={pkg.id}
            title={pkg.title || "Untitled card"}
            description={`Status: ${MARKETING_ADMIN_STATUS_LABELS[pkg.status]}. Hidden cards are omitted from the public site.`}
          >
            {issues.length > 0 ? (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                Available now is blocked for: {issues.map((hit) => hit.label).join("; ")}.
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                id={`${pkg.id}-title`}
                label="Title"
                value={pkg.title}
                onChange={(title) => patchPackage(pkg.id, (entry) => { entry.title = title; })}
              />
              <Field label="Card status">
                <StatusSelect
                  value={pkg.status}
                  onChange={(status) => patchPackage(pkg.id, (entry) => { entry.status = status; })}
                />
              </Field>
              <Field label="Icon">
                <IconSelect value={pkg.icon} onChange={(icon) => patchPackage(pkg.id, (entry) => { entry.icon = icon; })} />
              </Field>
              <TextField
                id={`${pkg.id}-order`}
                label="Order"
                value={String(pkg.order)}
                onChange={(order) =>
                  patchPackage(pkg.id, (entry) => {
                    entry.order = Number(order) || 0;
                  })
                }
              />
            </div>
            <AreaField
              id={`${pkg.id}-blurb`}
              label="Blurb"
              value={pkg.blurb}
              onChange={(blurb) => patchPackage(pkg.id, (entry) => { entry.blurb = blurb; })}
            />

            <div className="space-y-3">
              <p className="text-sm font-medium">Module bullets</p>
              {sortByOrder(pkg.features).map((feature) => (
                <div key={feature.id} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[1fr_10rem_6rem]">
                  <TextField
                    id={`${feature.id}-label`}
                    label="Bullet"
                    value={feature.label}
                    onChange={(label) =>
                      patchPackage(pkg.id, (entry) => {
                        const row = entry.features.find((f) => f.id === feature.id);
                        if (row) row.label = label;
                      })
                    }
                  />
                  <Field label="Status">
                    <StatusSelect
                      value={feature.status}
                      onChange={(status) =>
                        patchPackage(pkg.id, (entry) => {
                          const row = entry.features.find((f) => f.id === feature.id);
                          if (row) row.status = status;
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
                        patchPackage(pkg.id, (entry) => {
                          entry.features = entry.features.filter((f) => f.id !== feature.id);
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
                  patchPackage(pkg.id, (entry) => {
                    const bullet: MarketingFeatureBullet = {
                      id: newMarketingId("feat"),
                      label: "New capability",
                      status: "coming_soon",
                      order: nextOrder(entry.features),
                    };
                    entry.features.push(bullet);
                  })
                }
              >
                Add bullet
              </Button>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => {
                updateDraft((d) => {
                  d.packages = d.packages.filter((entry) => entry.id !== pkg.id);
                });
                toast.success("Marketing card removed. Entitlements were not changed.");
              }}
            >
              Delete marketing card
            </Button>
          </SectionCard>
        );
      })}

      <Button type="button" onClick={addPackage}>
        Add marketing card
      </Button>
    </div>
  );
}

import { Lock } from "lucide-react";
import { toast } from "sonner";
import { useMarketingEditor } from "@/core/components/admin/marketing-editor-provider";
import { Field, HrefSelect, PlacementSelect, SectionCard, TextField } from "@/core/components/admin/marketing-form-fields";
import { nextOrder } from "@/core/components/admin/marketing-optional";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  canHideOrUnpublishNavItem,
  canRemoveNavItem,
  isProtectedNavItem,
  newMarketingId,
  requireMarketingHref,
  sortByOrder,
  type MarketingNavHref,
  type MarketingNavItem,
} from "@/core/lib/marketing";

export function MarketingNavForm() {
  const { draft, updateDraft } = useMarketingEditor();
  const items = sortByOrder(draft.nav);

  function addItem() {
    updateDraft((d) => {
      d.nav.push({
        id: newMarketingId("nav"),
        label: "New link",
        href: "#packages",
        order: nextOrder(d.nav),
        visible: true,
        placement: "page",
      });
    });
  }

  function patch(id: string, mutator: (item: MarketingNavItem) => void) {
    updateDraft((d) => {
      const item = d.nav.find((entry) => entry.id === id);
      if (item) mutator(item);
    });
  }

  return (
    <SectionCard
      title="Public navigation"
      description="Targets are allowlist-only. Sign In, Sign Up, and Register cannot be removed or unpublished. Free-typed /admin paths are rejected."
    >
      <div className="space-y-4">
        {items.map((item) => {
          const locked = isProtectedNavItem(item);
          return (
            <div key={item.id} className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {item.label}
                  {locked ? (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      <Lock className="size-3" /> Protected {item.protectedRole?.replaceAll("_", " ")}
                    </span>
                  ) : null}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={locked}
                  onClick={() => {
                    const blocked = canRemoveNavItem(item);
                    if (blocked) {
                      toast.error(blocked.message);
                      return;
                    }
                    updateDraft((d) => {
                      d.nav = d.nav.filter((entry) => entry.id !== item.id);
                    });
                  }}
                >
                  Remove
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  id={`${item.id}-label`}
                  label="Label"
                  value={item.label}
                  onChange={(label) => patch(item.id, (entry) => { entry.label = label; })}
                />
                <Field label="Target">
                  <HrefSelect
                    value={item.href}
                    onChange={(href: MarketingNavHref) =>
                      patch(item.id, (entry) => {
                        entry.href = requireMarketingHref(href);
                      })
                    }
                  />
                </Field>
                <Field label="Placement">
                  <PlacementSelect
                    value={item.placement}
                    onChange={(placement) => patch(item.id, (entry) => { entry.placement = placement; })}
                  />
                </Field>
                <TextField
                  id={`${item.id}-order`}
                  label="Order"
                  value={String(item.order)}
                  onChange={(order) =>
                    patch(item.id, (entry) => {
                      entry.order = Number(order) || 0;
                    })
                  }
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={item.visible}
                  disabled={locked}
                  onCheckedChange={(checked) => {
                    const visible = checked === true;
                    if (!visible) {
                      const blocked = canHideOrUnpublishNavItem(item);
                      if (blocked) {
                        toast.error(blocked.message);
                        return;
                      }
                    }
                    patch(item.id, (entry) => { entry.visible = visible; });
                  }}
                />
                Visible on public site
              </label>
            </div>
          );
        })}
      </div>
      <Button type="button" variant="outline" onClick={addItem}>
        Add nav item
      </Button>
    </SectionCard>
  );
}

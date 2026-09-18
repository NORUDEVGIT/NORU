import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  INTEGRATION_CATALOG,
  type IntegrationCategory,
} from "@/packages/pms/lib/integrations-catalog";

/**
 * Step one of Add Integration. Choosing a type is what makes the setup drawer
 * render the right provider list and fields, so it is a separate decision.
 */
export function Card6IntegrationTypeDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (category: IntegrationCategory) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="card6-type-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-xl text-[#251605]">
            Choose integration type
          </DialogTitle>
          <DialogDescription>
            The type decides which providers and settings the next step asks for.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {INTEGRATION_CATALOG.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => onSelect(category.id)}
              className="rounded-xl border border-[#CCCCCC] bg-white p-4 text-left transition hover:border-[#C89933] hover:bg-[#C89933]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]"
              data-testid={`card6-type-${category.id}`}
            >
              <p className="font-medium text-[#251605]">{category.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{category.description}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {category.providers.length} provider{category.providers.length === 1 ? "" : "s"}
              </p>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

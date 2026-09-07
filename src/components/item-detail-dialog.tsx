import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { Label } from "@/shared/components/ui/label";
import { QuantityStepper } from "@/components/quantity-stepper";
import { DietaryBadges } from "@/components/dietary-badges";
import type { MenuItem } from "@/data/menu";
import { useMoney } from "@/core/state/restaurant-context";

export function ItemDetailDialog({
  item,
  open,
  onOpenChange,
  onAdd,
}: {
  item: MenuItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (item: MenuItem, quantity: number, notes: string) => void;
}) {
  const money = useMoney();
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setQuantity(1);
      setNotes("");
    }
  }, [open, item?.id]);

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] gap-0 overflow-y-auto rounded-t-3xl p-0 sm:max-w-lg sm:rounded-3xl">
        <img
          src={item.image ?? ""}
          alt={item.name}
          width={800}
          height={600}
          className="aspect-[4/3] w-full object-cover"
        />
        <div className="space-y-5 p-5">
          <div className="space-y-2">
            <DialogTitle className="font-display text-2xl">{item.name}</DialogTitle>
            <DialogDescription className="text-base text-muted-foreground">
              {item.description}
            </DialogDescription>
            <DietaryBadges tags={item.dietaryTags} />
            <p className="pt-1 text-xl font-semibold tabular-nums">{money(item.price)}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes" className="text-sm font-medium">
              Special instructions
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="No onions, extra sauce..."
              className="min-h-24 rounded-2xl bg-surface text-base"
            />
          </div>

          <div className="flex items-center gap-3">
            <QuantityStepper quantity={quantity} onChange={setQuantity} />
            <Button
              size="lg"
              className="h-14 flex-1 rounded-full text-base"
              onClick={() => {
                onAdd(item, quantity, notes.trim());
                onOpenChange(false);
              }}
            >
              Add to order · {money(item.price * quantity)}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

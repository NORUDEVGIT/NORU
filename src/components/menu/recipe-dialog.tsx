import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  getMenuItemRecipe,
  listRecipeIngredientOptions,
  removeRecipeComponent,
  saveRecipeComponent,
  updateRecipeComponent,
  type RecipeComponent,
} from "@/lib/recipes.functions";
import { useMoney } from "@/core/state/restaurant-context";

/** Derived recipe state, shown wherever a menu item appears in staff UI. */
export function RecipeStatusChip({ status }: { status: "no_recipe" | "incomplete" | "ready" }) {
  const label = status === "ready" ? "Ready" : status === "incomplete" ? "Incomplete" : "No Recipe";
  const tone =
    status === "ready"
      ? "bg-primary/10 text-primary"
      : status === "incomplete"
        ? "bg-destructive/10 text-destructive"
        : "bg-muted text-muted-foreground";
  return <span className={`rounded-full px-2 py-0.5 text-xs ${tone}`}>{label}</span>;
}

export function RecipeDialog({
  restaurantId,
  menuItemId,
  onClose,
}: {
  restaurantId: string;
  menuItemId: string | null;
  onClose: () => void;
}) {
  const money = useMoney();
  const queryClient = useQueryClient();
  const loadRecipe = useServerFn(getMenuItemRecipe);
  const loadOptions = useServerFn(listRecipeIngredientOptions);
  const addFn = useServerFn(saveRecipeComponent);
  const updateFn = useServerFn(updateRecipeComponent);
  const removeFn = useServerFn(removeRecipeComponent);

  const [ingredientId, setIngredientId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitId, setUnitId] = useState("");
  const [editing, setEditing] = useState<RecipeComponent | null>(null);
  const [editQuantity, setEditQuantity] = useState("");

  const recipe = useQuery({
    queryKey: ["recipe", restaurantId, menuItemId],
    queryFn: () => loadRecipe({ data: { restaurantId, menuItemId: menuItemId as string } }),
    enabled: !!menuItemId,
    retry: false,
  });

  const options = useQuery({
    queryKey: ["recipe-ingredients", restaurantId],
    queryFn: () => loadOptions({ data: { restaurantId } }),
    enabled: !!menuItemId,
    retry: false,
  });

  const selected = (options.data ?? []).find((o) => o.id === ingredientId) ?? null;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["recipe", restaurantId, menuItemId] });
    void queryClient.invalidateQueries({ queryKey: ["recipe-summaries", restaurantId] });
  };

  const mutate = useMutation({
    mutationFn: async (action: () => Promise<{ ok: boolean; message?: string }>) => action(),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message ?? "Something went wrong.");
        return;
      }
      invalidate();
      setEditing(null);
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Something went wrong."),
  });

  const data = recipe.data;
  const canManage = data?.permissions.canManage ?? false;

  return (
    <Dialog open={!!menuItemId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{data ? `Recipe — ${data.menuItem.name}` : "Recipe"}</DialogTitle>
        </DialogHeader>

        {recipe.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading recipe…</p>
        ) : recipe.isError || !data ? (
          <p className="text-sm text-destructive">We couldn't load this recipe.</p>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Selling price" value={money(data.menuItem.price)} />
              <Metric
                label="Recipe cost"
                value={data.costComplete ? money(data.recipeCost ?? 0) : "Cost incomplete"}
              />
              <Metric
                label="Food cost"
                value={data.foodCostPercent === null ? "—" : `${data.foodCostPercent}%`}
              />
              <div className="rounded-xl border border-border/70 p-3">
                <p className="text-xs text-muted-foreground">Status</p>
                <p className="mt-1">
                  <RecipeStatusChip status={data.status} />
                </p>
              </div>
            </div>

            {data.grossContribution !== null ? (
              <p className="text-xs text-muted-foreground">
                Estimated gross contribution {money(data.grossContribution)} — an operational estimate on
                ingredient cost only; it excludes labour, overheads, tax and fees.
              </p>
            ) : null}

            {data.missingCostIngredients.length > 0 ? (
              <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                Cost incomplete — no unit cost recorded for: {data.missingCostIngredients.join(", ")}.
              </p>
            ) : null}

            <section>
              <h3 className="font-display text-lg">Ingredients</h3>
              {data.components.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No ingredients mapped yet.</p>
              ) : (
                <ul className="mt-3 divide-y divide-border">
                  {data.components.map((component) => (
                    <li key={component.id} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{component.ingredientName}</p>
                        <p className="text-sm text-muted-foreground">
                          {component.displayQuantity} {component.displayUnitCode} ·{" "}
                          {component.unitCost === null
                            ? "no unit cost"
                            : `${money(component.unitCost)} / ${component.baseUnitCode}`}
                        </p>
                      </div>
                      <p className="text-sm font-medium">
                        {component.componentCost === null ? "—" : money(component.componentCost)}
                      </p>
                      {canManage ? (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditing(component);
                              setEditQuantity(String(component.displayQuantity));
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${component.ingredientName}`}
                            onClick={() =>
                              mutate.mutate(() =>
                                removeFn({ data: { restaurantId, componentId: component.id } }),
                              )
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {editing && canManage ? (
              <section className="rounded-xl border border-border/70 p-3">
                <p className="text-sm font-medium">Edit {editing.ingredientName}</p>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="edit-qty">Quantity</Label>
                    <Input
                      id="edit-qty"
                      type="number"
                      min={0}
                      step="0.001"
                      className="h-11 w-32"
                      value={editQuantity}
                      onChange={(e) => setEditQuantity(e.target.value)}
                    />
                  </div>
                  <p className="pb-3 text-sm text-muted-foreground">{editing.displayUnitCode}</p>
                  <Button
                    disabled={!(Number(editQuantity) > 0)}
                    onClick={() => {
                      const unit = (options.data ?? [])
                        .find((o) => o.id === editing.inventoryItemId)
                        ?.units.find((u) => u.code === editing.displayUnitCode);
                      if (!unit) {
                        toast.error("That unit is no longer available.");
                        return;
                      }
                      mutate.mutate(() =>
                        updateFn({
                          data: {
                            restaurantId,
                            componentId: editing.id,
                            quantity: Number(editQuantity),
                            unitId: unit.id,
                          },
                        }),
                      );
                    }}
                  >
                    Save quantity
                  </Button>
                  <Button variant="ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </div>
              </section>
            ) : null}

            {canManage ? (
              <section className="rounded-xl border border-border/70 p-3">
                <p className="text-sm font-medium">Add ingredient</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
                  <div className="space-y-1">
                    <Label>Ingredient</Label>
                    <Select
                      value={ingredientId}
                      onValueChange={(value) => {
                        setIngredientId(value);
                        const option = (options.data ?? []).find((o) => o.id === value);
                        setUnitId(option?.units[0]?.id ?? "");
                      }}
                    >
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Choose an ingredient" />
                      </SelectTrigger>
                      <SelectContent>
                        {(options.data ?? []).map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="add-qty">Quantity</Label>
                    <Input
                      id="add-qty"
                      type="number"
                      min={0}
                      step="0.001"
                      className="h-11"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Unit</Label>
                    <Select value={unitId} onValueChange={setUnitId} disabled={!selected}>
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Unit" />
                      </SelectTrigger>
                      <SelectContent>
                        {(selected?.units ?? []).map((unit) => (
                          <SelectItem key={unit.id} value={unit.id}>
                            {unit.code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    className="h-11"
                    disabled={!ingredientId || !unitId || !(Number(quantity) > 0)}
                    onClick={() =>
                      mutate.mutate(async () => {
                        const result = await addFn({
                          data: {
                            restaurantId,
                            menuItemId: menuItemId as string,
                            inventoryItemId: ingredientId,
                            quantity: Number(quantity),
                            unitId,
                          },
                        });
                        if (result.ok) {
                          setQuantity("");
                          setIngredientId("");
                          setUnitId("");
                        }
                        return result;
                      })
                    }
                  >
                    <Plus className="mr-1 size-4" /> Add
                  </Button>
                </div>
                {(options.data ?? []).length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    No active ingredients in inventory yet.
                  </p>
                ) : null}
              </section>
            ) : (
              <p className="text-xs text-muted-foreground">
                You have read-only access to recipes.
              </p>
            )}

            {data.components.length > 0 ? (
              <section className="rounded-xl bg-muted/40 p-4">
                <p className="font-display text-lg">{data.menuItem.name}</p>
                <ul className="mt-2 space-y-1 font-mono text-sm">
                  {data.components.map((component) => (
                    <li key={component.id} className="flex items-baseline gap-2">
                      <span>{component.ingredientName}</span>
                      <span className="flex-1 border-b border-dotted border-border" />
                      <span>
                        {component.displayQuantity} {component.displayUnitCode}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-sm">
                  Estimated recipe cost:{" "}
                  {data.costComplete ? money(data.recipeCost ?? 0) : "Cost incomplete"}
                </p>
                <p className="text-sm">Selling price: {money(data.menuItem.price)}</p>
                {data.foodCostPercent !== null ? (
                  <p className="text-sm">Food cost: {data.foodCostPercent}%</p>
                ) : null}
              </section>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

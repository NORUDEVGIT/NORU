import { useMemo, useRef, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ImagePlus, Pencil, Plus, Trash2 } from "lucide-react";

import { RestaurantShell } from "@/components/restaurant-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  createMenuImageUpload,
  deleteCategory,
  deleteMenuItem,
  getManagedMenu,
  moveCategory,
  saveCategory,
  saveMenuItem,
  setCategoryActive,
  setItemAvailability,
  type ManagedCategory,
  type ManagedItem,
} from "@/lib/menu.functions";
import type { RestaurantMembership } from "@/lib/restaurant.functions";
import { getMenuRecipeSummaries } from "@/lib/recipes.functions";
import { RecipeDialog, RecipeStatusChip } from "@/components/menu/recipe-dialog";
import { useMoney } from "@/state/restaurant-context";

/** Menu editing is limited to owners and managers. Kitchen/waiter cannot edit. */
const MANAGE_ROLES = ["owner", "manager"];

export const Route = createFileRoute("/restaurant/menu")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/menu" } });
    }
  },
  head: () => ({
    meta: [
      { title: "Menu Management — NORU" },
      {
        name: "description",
        content:
          "Create categories, add dishes, set prices and mark items out of stock for your restaurant menu.",
      },
      { property: "og:title", content: "Menu Management — NORU" },
      { property: "og:description", content: "Manage your restaurant's categories, dishes and availability." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MenuManagementPage,
});

function MenuManagementPage() {
  return (
    <RestaurantShell active="Menu">
      {(membership) =>
        MANAGE_ROLES.includes(membership.role) ? (
          <MenuManager membership={membership} />
        ) : (
          <div className="rounded-2xl border border-border bg-card p-6">
            <h1 className="font-display text-2xl">Menu management unavailable</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Only owners and managers can edit the menu. Your role is “{membership.role}”.
            </p>
          </div>
        )
      }
    </RestaurantShell>
  );
}

function MenuManager({ membership }: { membership: RestaurantMembership }) {
  const money = useMoney();
  const restaurantId = membership.restaurantId;
  const queryClient = useQueryClient();
  const load = useServerFn(getManagedMenu);
  const [categoryDraft, setCategoryDraft] = useState<Partial<ManagedCategory> | null>(null);
  const [itemDraft, setItemDraft] = useState<Partial<ManagedItem> | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["managed-menu", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
    retry: false,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["managed-menu", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["public-menu", membership.restaurant.slug] });
  };

  const run = <T,>(fn: (input: T) => Promise<{ ok: boolean; message?: string }>) =>
    async (input: T) => {
      try {
        const result = await fn(input);
        if (!result.ok) {
          toast.error(result.message ?? "Something went wrong.");
          return false;
        }
        invalidate();
        return true;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Something went wrong.");
        return false;
      }
    };

  const saveCategoryFn = useServerFn(saveCategory);
  const toggleCategoryFn = useServerFn(setCategoryActive);
  const moveCategoryFn = useServerFn(moveCategory);
  const deleteCategoryFn = useServerFn(deleteCategory);
  const saveItemFn = useServerFn(saveMenuItem);
  const toggleItemFn = useServerFn(setItemAvailability);
  const deleteItemFn = useServerFn(deleteMenuItem);
  const uploadFn = useServerFn(createMenuImageUpload);

  const categories = data?.categories ?? [];
  const items = data?.items ?? [];
  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c] as const)),
    [categories],
  );

  const availability = useMutation({
    mutationFn: run<{ restaurantId: string; id: string; available: boolean }>((input) =>
      toggleItemFn({ data: input }),
    ),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading your menu…</p>;
  if (isError) return <p className="text-sm text-destructive">We couldn't load your menu.</p>;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl">Menu</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {membership.restaurant.name} · {categories.length} categories · {items.length} items
        </p>
      </header>

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl">Categories</h2>
          <Button size="sm" onClick={() => setCategoryDraft({ active: true, sortOrder: (categories.at(-1)?.sortOrder ?? 0) + 10 })}>
            <Plus className="mr-1 size-4" /> Add category
          </Button>
        </div>
        {categories.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No categories yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {categories.map((category, index) => (
              <li key={category.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {category.name}
                    {!category.active ? (
                      <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        Hidden
                      </span>
                    ) : null}
                  </p>
                  {category.description ? (
                    <p className="truncate text-sm text-muted-foreground">{category.description}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${category.name} up`}
                    disabled={index === 0}
                    onClick={() =>
                      void run(moveCategoryFn as never)({ data: { restaurantId, id: category.id, direction: "up" } } as never)
                    }
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${category.name} down`}
                    disabled={index === categories.length - 1}
                    onClick={() =>
                      void run(moveCategoryFn as never)({ data: { restaurantId, id: category.id, direction: "down" } } as never)
                    }
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setCategoryDraft(category)}>
                    <Pencil className="mr-1 size-4" /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void run(toggleCategoryFn as never)({
                        data: { restaurantId, id: category.id, active: !category.active },
                      } as never)
                    }
                  >
                    {category.active ? "Deactivate" : "Activate"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${category.name}`}
                    onClick={() =>
                      void run(deleteCategoryFn as never)({ data: { restaurantId, id: category.id } } as never)
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl">Menu items</h2>
          <Button
            size="sm"
            disabled={categories.length === 0}
            onClick={() => setItemDraft({ available: true, price: 0, categoryId: categories[0]?.id ?? null })}
          >
            <Plus className="mr-1 size-4" /> Add item
          </Button>
        </div>
        {items.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {categories.length === 0 ? "Create a category first." : "No menu items yet."}
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-4 rounded-xl border border-border/70 p-3"
              >
                <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} className="size-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {categoryById.get(item.categoryId ?? "")?.name ?? "Uncategorised"} ·{" "}
                    {money(item.price)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={item.available}
                      onCheckedChange={(checked) =>
                        availability.mutate({ restaurantId, id: item.id, available: checked })
                      }
                      aria-label={`Toggle availability for ${item.name}`}
                    />
                    <span className={item.available ? "text-foreground" : "text-muted-foreground"}>
                      {item.available ? "Available" : "Out of stock"}
                    </span>
                  </label>
                  <Button variant="outline" size="sm" onClick={() => setItemDraft(item)}>
                    <Pencil className="mr-1 size-4" /> Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${item.name}`}
                    onClick={async () => {
                      const ok = await run(deleteItemFn as never)({ data: { restaurantId, id: item.id } } as never);
                      if (ok) toast.success(`${item.name} removed from the menu`);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CategoryDialog
        draft={categoryDraft}
        onClose={() => setCategoryDraft(null)}
        onSave={async (values) => {
          const ok = await run(saveCategoryFn as never)({
            data: { restaurantId, ...values },
          } as never);
          if (ok) {
            toast.success("Category saved");
            setCategoryDraft(null);
          }
        }}
      />

      <ItemDialog
        draft={itemDraft}
        categories={categories}
        restaurantId={restaurantId}
        uploadFn={uploadFn as never}
        onClose={() => setItemDraft(null)}
        onSave={async (values) => {
          const ok = await run(saveItemFn as never)({ data: { restaurantId, ...values } } as never);
          if (ok) {
            toast.success("Menu item saved");
            setItemDraft(null);
          }
        }}
      />
    </div>
  );
}

function CategoryDialog({
  draft,
  onClose,
  onSave,
}: {
  draft: Partial<ManagedCategory> | null;
  onClose: () => void;
  onSave: (values: {
    id?: string;
    name: string;
    description: string | null;
    sortOrder: number;
    active: boolean;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [active, setActive] = useState(true);
  const loadedFor = useRef<string | null>(null);

  const key = draft ? (draft.id ?? "new") : null;
  if (key && loadedFor.current !== key) {
    loadedFor.current = key;
    setName(draft?.name ?? "");
    setDescription(draft?.description ?? "");
    setSortOrder(draft?.sortOrder ?? 0);
    setActive(draft?.active ?? true);
  }
  if (!key) loadedFor.current = null;

  return (
    <Dialog open={!!draft} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{draft?.id ? "Edit category" : "New category"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cat-name">Name</Label>
            <Input id="cat-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className="h-12" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-desc">Description</Label>
            <Textarea
              id="cat-desc"
              value={description}
              maxLength={500}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-sort">Sort order</Label>
            <Input
              id="cat-sort"
              type="number"
              min={0}
              max={9999}
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              className="h-12"
            />
          </div>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={active} onCheckedChange={setActive} />
            Visible on the public menu
          </label>
          <Button
            size="lg"
            className="h-12 w-full"
            disabled={!name.trim()}
            onClick={() =>
              onSave({
                ...(draft?.id ? { id: draft.id } : {}),
                name: name.trim(),
                description: description.trim() || null,
                sortOrder,
                active,
              })
            }
          >
            Save category
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ItemDialog({
  draft,
  categories,
  restaurantId,
  uploadFn,
  onClose,
  onSave,
}: {
  draft: Partial<ManagedItem> | null;
  categories: ManagedCategory[];
  restaurantId: string;
  uploadFn: (opts: {
    data: { restaurantId: string; contentType: string; size: number };
  }) => Promise<any>;
  onClose: () => void;
  onSave: (values: {
    id?: string;
    name: string;
    description: string | null;
    price: number;
    categoryId: string;
    imageRef: string | null;
    available: boolean;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("0.00");
  const [categoryId, setCategoryId] = useState("");
  const [imageRef, setImageRef] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [available, setAvailable] = useState(true);
  const [uploading, setUploading] = useState(false);
  const loadedFor = useRef<string | null>(null);

  const key = draft ? (draft.id ?? "new") : null;
  if (key && loadedFor.current !== key) {
    loadedFor.current = key;
    setName(draft?.name ?? "");
    setDescription(draft?.description ?? "");
    setPrice((draft?.price ?? 0).toFixed(2));
    setCategoryId(draft?.categoryId ?? categories[0]?.id ?? "");
    setImageRef(draft?.imageRef ?? null);
    setPreview(draft?.imageUrl ?? null);
    setAvailable(draft?.available ?? true);
  }
  if (!key) loadedFor.current = null;

  async function handleFile(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Images must be 5 MB or smaller.");
      return;
    }
    setUploading(true);
    try {
      const ticket = await uploadFn({
        data: { restaurantId, contentType: file.type, size: file.size },
      });
      if (!ticket?.ok) {
        toast.error(ticket?.message ?? "Could not start the upload.");
        return;
      }
      const { error } = await supabase.storage
        .from("menu-images")
        .uploadToSignedUrl(ticket.path, ticket.token, file);
      if (error) {
        toast.error("Upload failed.");
        return;
      }
      setImageRef(ticket.imageRef);
      setPreview(URL.createObjectURL(file));
      toast.success("Image uploaded");
    } catch {
      toast.error("Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  const priceValue = Number(price);
  const valid = name.trim().length > 0 && categoryId && Number.isFinite(priceValue) && priceValue >= 0;

  return (
    <Dialog open={!!draft} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{draft?.id ? "Edit menu item" : "New menu item"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="item-name">Name</Label>
            <Input id="item-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className="h-12" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="item-desc">Description</Label>
            <Textarea
              id="item-desc"
              value={description}
              maxLength={500}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="item-price">Price (£)</Label>
              <Input
                id="item-price"
                type="number"
                min={0}
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="h-12"
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Choose a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="item-image">Image</Label>
            <div className="flex items-center gap-3">
              <div className="size-20 overflow-hidden rounded-xl bg-muted">
                {preview ? <img src={preview} alt="" className="size-full object-cover" /> : null}
              </div>
              <div>
                <input
                  id="item-image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFile(file);
                  }}
                />
                <Button asChild variant="outline" disabled={uploading}>
                  <label htmlFor="item-image" className="cursor-pointer">
                    <ImagePlus className="mr-2 size-4" />
                    {uploading ? "Uploading…" : "Upload image"}
                  </label>
                </Button>
                <p className="mt-1 text-xs text-muted-foreground">JPG, PNG, WebP or AVIF · max 5 MB</p>
              </div>
            </div>
          </div>

          <label className="flex items-center gap-3 text-sm">
            <Switch checked={available} onCheckedChange={setAvailable} />
            Available to order
          </label>

          <Button
            size="lg"
            className="h-12 w-full"
            disabled={!valid}
            onClick={() =>
              onSave({
                ...(draft?.id ? { id: draft.id } : {}),
                name: name.trim(),
                description: description.trim() || null,
                price: Number(priceValue.toFixed(2)),
                categoryId,
                imageRef,
                available,
              })
            }
          >
            Save item
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

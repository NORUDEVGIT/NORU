import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  PREFERENCE_OPTION_CATEGORIES,
  PREFERENCE_OPTION_CATEGORY_LABELS,
  WAVE2_MIGRATION_UNAVAILABLE,
  type PreferenceOptionCategory,
} from "@/packages/pms/lib/guest-profile-wave2";
import {
  listPmsPreferenceOptions,
  savePmsPreferenceOption,
  type PmsPreferenceOption,
} from "@/packages/pms/lib/pms-preference-options.functions";

export function PmsPreferenceOptionsEditor({
  restaurantId,
  canEdit,
}: {
  restaurantId: string;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(listPmsPreferenceOptions);
  const save = useServerFn(savePmsPreferenceOption);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<PreferenceOptionCategory>("bed");
  const [editing, setEditing] = useState<PmsPreferenceOption | null>(null);

  const query = useQuery({
    queryKey: ["pms-preference-options", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (input: {
      id?: string;
      category: PreferenceOptionCategory;
      code: string;
      name: string;
      active: boolean;
    }) => save({ data: { restaurantId, ...input } }),
    onSuccess: () => {
      toast.success("Preference option saved.");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["pms-preference-options", restaurantId] });
      void queryClient.invalidateQueries({
        queryKey: ["guest-preference-catalogues", restaurantId],
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-3 border-t border-border pt-4" data-testid="pms-preference-options">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-medium text-[#251605]">Guest preference options</h3>
          <p className="text-xs text-muted-foreground">
            Bed, view, food and communication lists for this property. Room types and floors stay on
            Structure / Rooms. Meal plans are not food preferences.
          </p>
        </div>
        {canEdit && query.data?.available ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditing(null);
              setCategory("bed");
              setOpen(true);
            }}
          >
            Add option
          </Button>
        ) : null}
      </div>

      {!query.data?.available ? (
        <p className="text-sm text-muted-foreground">{WAVE2_MIGRATION_UNAVAILABLE}</p>
      ) : (
        PREFERENCE_OPTION_CATEGORIES.map((item) => {
          const rows = (query.data?.options ?? []).filter((row) => row.category === item);
          return (
            <div key={item} className="space-y-2">
              <p className="text-sm font-medium">{PREFERENCE_OPTION_CATEGORY_LABELS[item]}</p>
              {rows.length === 0 ? (
                <p className="text-sm text-[#C89933]">
                  No {PREFERENCE_OPTION_CATEGORY_LABELS[item].toLowerCase()} options yet. Guest
                  fields stay gated until you add some.
                </p>
              ) : (
                <ul className="space-y-2">
                  {rows.map((row) => (
                    <li
                      key={row.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium">{row.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.code} · {row.active ? "Active" : "Inactive"}
                        </p>
                      </div>
                      {canEdit ? (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditing(row);
                              setCategory(row.category);
                              setOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              mutation.mutate({
                                id: row.id,
                                category: row.category,
                                code: row.code,
                                name: row.name,
                                active: !row.active,
                              })
                            }
                          >
                            {row.active ? "Deactivate" : "Reactivate"}
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })
      )}

      <PreferenceOptionDialog
        open={open}
        onOpenChange={setOpen}
        category={category}
        onCategoryChange={setCategory}
        row={editing}
        saving={mutation.isPending}
        onSubmit={(values) => mutation.mutate(values)}
      />
    </div>
  );
}

function PreferenceOptionDialog({
  open,
  onOpenChange,
  category,
  onCategoryChange,
  row,
  saving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: PreferenceOptionCategory;
  onCategoryChange: (value: PreferenceOptionCategory) => void;
  row: PmsPreferenceOption | null;
  saving: boolean;
  onSubmit: (values: {
    id?: string;
    category: PreferenceOptionCategory;
    code: string;
    name: string;
    active: boolean;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  useEffect(() => {
    if (!open) return;
    setName(row?.name ?? "");
    setCode(row?.code ?? "");
    if (row) onCategoryChange(row.category);
  }, [open, row, onCategoryChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row ? "Edit preference option" : "Add preference option"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="pref-opt-category">Category</Label>
            <select
              id="pref-opt-category"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={category}
              onChange={(event) => onCategoryChange(event.target.value as PreferenceOptionCategory)}
              disabled={Boolean(row)}
            >
              {PREFERENCE_OPTION_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {PREFERENCE_OPTION_CATEGORY_LABELS[item]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pref-opt-name">Name</Label>
            <Input
              id="pref-opt-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pref-opt-code">Code</Label>
            <Input
              id="pref-opt-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || !code.trim() || saving}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
            onClick={() =>
              onSubmit({
                ...(row?.id ? { id: row.id } : {}),
                category,
                name,
                code,
                active: row?.active ?? true,
              })
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

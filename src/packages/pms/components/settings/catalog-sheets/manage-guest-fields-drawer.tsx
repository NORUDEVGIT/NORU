import { useMemo, useState } from "react";
import { Check, Info, Lock, Search, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import {
  GUEST_CREATION_CATEGORIES,
  INDIVIDUAL_GUEST_CREATION_FIELDS,
  type GuestCreationFieldCategory,
  type GuestCreationFieldDefinition,
} from "@/packages/pms/lib/guest-creation-field-definitions";
import { GUEST_FIELD_TYPE_LABELS, type GuestFieldRecord } from "@/packages/pms/lib/required-fields-card4.server";
import { cn } from "@/shared/lib/utils";

export function ManageGuestFieldsDrawer({
  open,
  onOpenChange,
  canEdit,
  allFields,
  selectedCodes,
  onToggleCode,
  fieldDefinitions = INDIVIDUAL_GUEST_CREATION_FIELDS,
  categories = GUEST_CREATION_CATEGORIES,
  title = "Manage Guest Fields",
  description = "Select which creation fields appear in the configuration table for Individual Guests.",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canEdit: boolean;
  allFields: GuestFieldRecord[];
  selectedCodes: Set<string>;
  onToggleCode: (code: string, active: boolean) => void;
  fieldDefinitions?: GuestCreationFieldDefinition[];
  categories?: Array<{ id: GuestCreationFieldCategory; label: string; description: string }>;
  title?: string;
  description?: string;
}) {
  const [search, setSearch] = useState("");

  const filteredFields = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return fieldDefinitions;
    return fieldDefinitions.filter(
      (field) =>
        field.name.toLowerCase().includes(q) ||
        field.code.toLowerCase().includes(q) ||
        field.categoryLabel.toLowerCase().includes(q) ||
        field.description.toLowerCase().includes(q),
    );
  }, [search, fieldDefinitions]);

  const byCategory = useMemo(() => {
    const map = new Map<GuestCreationFieldCategory, GuestCreationFieldDefinition[]>();
    for (const cat of categories) {
      map.set(cat.id, []);
    }
    for (const field of filteredFields) {
      const list = map.get(field.category) ?? [];
      list.push(field);
      map.set(field.category, list);
    }
    return map;
  }, [filteredFields, categories]);

  const activeCount = useMemo(() => {
    return fieldDefinitions.filter(
      (f) => f.essential || selectedCodes.has(f.code),
    ).length;
  }, [fieldDefinitions, selectedCodes]);

  const totalCount = fieldDefinitions.length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-xl border-l border-[#DDD4C5] bg-[#FAF8F5]"
        data-testid="manage-guest-fields-drawer"
      >
        {/* Header */}
        <SheetHeader className="shrink-0 border-b border-[#DDD4C5] bg-white px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-[#F4E9D0] text-[#765719]">
              <SlidersHorizontal className="size-4" />
            </span>
            <div>
              <SheetTitle className="font-display text-lg font-semibold text-[#251605]">
                {title}
              </SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground">
                {description}
              </SheetDescription>
            </div>
          </div>

          {/* Search */}
          <div className="relative mt-3">
            <Search className="absolute left-2.5 top-2.5 size-4 text-[#756A5B]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter fields by name, code or category..."
              className="h-9 rounded-[6px] border-[#CCCCCC] bg-white pl-9 text-xs placeholder:text-muted-foreground"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-[#251605]"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
        </SheetHeader>

        {/* Scrollable list grouped by category */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {categories.map((category) => {
            const fields = byCategory.get(category.id) ?? [];
            if (fields.length === 0) return null;

            return (
              <div key={category.id} className="space-y-2.5">
                <div className="flex items-center justify-between border-b border-[#E8E4DC] pb-1.5">
                  <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-[#756A5B]">
                    {category.label}
                  </h3>
                  <span className="text-[11px] text-muted-foreground">
                    {fields.filter((f) => f.essential || selectedCodes.has(f.code)).length} of{" "}
                    {fields.length} active
                  </span>
                </div>

                <div className="space-y-2">
                  {fields.map((def) => {
                    const isEssential = def.essential;
                    const isChecked = isEssential || selectedCodes.has(def.code);

                    return (
                      <div
                        key={def.code}
                        onClick={(e) => {
                          if (isEssential || !canEdit) return;
                          const target = e.target as HTMLElement;
                          if (target.closest("button") || target.closest("label") || target.closest("[role='checkbox']")) {
                            return;
                          }
                          onToggleCode(def.code, !isChecked);
                        }}
                        className={cn(
                          "flex items-start gap-3 rounded-lg border p-3 transition-colors",
                          !isEssential && canEdit && "cursor-pointer select-none",
                          isChecked
                            ? "border-[#DDD4C5] bg-white shadow-sm"
                            : "border-transparent bg-white/60 hover:bg-white hover:border-[#DDD4C5]",
                          isEssential && "bg-[#FAF7F0]/90",
                        )}
                      >
                        <Checkbox
                          id={`drawer-field-${def.code}`}
                          checked={isChecked}
                          disabled={!canEdit || isEssential}
                          onCheckedChange={(checked) => {
                            if (isEssential) return;
                            onToggleCode(def.code, checked === true);
                          }}
                          className="mt-0.5"
                          data-testid={`drawer-check-${def.code}`}
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Label
                              htmlFor={`drawer-field-${def.code}`}
                              className={cn(
                                "cursor-pointer font-medium text-xs text-[#251605]",
                                isEssential && "cursor-default font-semibold",
                              )}
                            >
                              {def.name}
                            </Label>

                            <span className="rounded bg-[#FAF8F5] border border-[#DDD4C5] px-1.5 py-0.2 text-[10px] font-mono text-[#756A5B]">
                              {GUEST_FIELD_TYPE_LABELS[def.fieldType]}
                            </span>

                            {isEssential ? (
                              <span className="inline-flex items-center gap-1 rounded bg-amber-50 border border-amber-200 px-1.5 py-0.2 text-[10px] font-medium text-amber-800">
                                <Lock className="size-2.5" /> Essential
                              </span>
                            ) : null}
                          </div>

                          <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
                            {def.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <SheetFooter className="shrink-0 border-t border-[#DDD4C5] bg-white px-6 py-3 flex sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-[#756A5B]">
            <span className="font-semibold text-[#251605]">{activeCount}</span> of {totalCount} fields active
          </div>
          <Button
            type="button"
            className="bg-[#C89933] text-[#251605] text-xs font-semibold hover:bg-[#b5892c] h-8 px-4"
            onClick={() => onOpenChange(false)}
          >
            Done
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

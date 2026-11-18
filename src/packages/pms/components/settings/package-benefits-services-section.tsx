/**
 * Package Master → Section 3: Benefits & Services
 * Sources selectable services from Guest & Services → Service Types.
 */

import { useMemo, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  isPackageEligibleServiceCategoryCode,
  type Card3GuestServiceCategoryRef,
  type Card3GuestServiceTypeRef,
} from "@/packages/pms/lib/meals-card3.server";
import { PROPERTY_SETUP_CONTROL_CLASS } from "@/packages/pms/lib/pms-property-setup-ui";
import { cn } from "@/shared/lib/utils";

const CONTROL = cn(
  PROPERTY_SETUP_CONTROL_CLASS,
  "h-9 rounded-[6px] focus:border-[#C89933] focus:outline-none focus:ring-1 focus:ring-[#C89933]",
);

export function PackageBenefitsServicesSection({
  canEdit,
  categories,
  serviceTypes,
  selectedIds,
  onChange,
}: {
  canEdit: boolean;
  categories: readonly Card3GuestServiceCategoryRef[];
  serviceTypes: readonly Card3GuestServiceTypeRef[];
  selectedIds: readonly string[];
  onChange: (nextIds: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const eligibleCategories = useMemo(
    () =>
      categories
        .filter((row) => row.active && isPackageEligibleServiceCategoryCode(row.code))
        .slice()
        .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name)),
    [categories],
  );

  const eligibleTypes = useMemo(() => {
    const categoryIds = new Set(eligibleCategories.map((row) => row.id));
    return serviceTypes
      .filter((row) => {
        if (!row.active && !selectedIds.includes(row.id)) return false;
        if (!categoryIds.has(row.categoryId)) return false;
        if (!isPackageEligibleServiceCategoryCode(row.categoryCode)) return false;
        return true;
      })
      .slice()
      .sort(
        (a, b) =>
          a.categoryName.localeCompare(b.categoryName) ||
          a.displayOrder - b.displayOrder ||
          a.name.localeCompare(b.name),
      );
  }, [eligibleCategories, selectedIds, serviceTypes]);

  const filteredTypes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return eligibleTypes.filter((row) => {
      if (categoryFilter !== "all" && row.categoryId !== categoryFilter) return false;
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        row.categoryName.toLowerCase().includes(q) ||
        row.description.toLowerCase().includes(q) ||
        row.code.toLowerCase().includes(q)
      );
    });
  }, [categoryFilter, eligibleTypes, search]);

  const selectedRows = useMemo(() => {
    const byId = new Map(serviceTypes.map((row) => [row.id, row]));
    return selectedIds
      .map((id) => byId.get(id))
      .filter((row): row is Card3GuestServiceTypeRef => Boolean(row));
  }, [selectedIds, serviceTypes]);

  function toggle(id: string, checked: boolean) {
    if (!canEdit) return;
    if (checked) {
      if (selectedIds.includes(id)) return;
      onChange([...selectedIds, id]);
      return;
    }
    onChange(selectedIds.filter((rowId) => rowId !== id));
  }

  return (
    <div
      className="space-y-3 rounded-xl border border-[#E6D7B8] bg-[#FDFAF5] px-4 py-3"
      data-testid="package-master-section-includes"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#6B6458]">
          3. Benefits & Services
        </p>
        <p className="text-xs text-muted-foreground">
          Select the guest services and benefits included with this package.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_11rem_auto]">
        <div className="space-y-1">
          <Label htmlFor="pkg-service-search" className="text-[11px] text-[#5C5346]">
            Search
          </Label>
          <Input
            id="pkg-service-search"
            value={search}
            disabled={!canEdit}
            className={CONTROL}
            placeholder="Search services"
            onChange={(event) => setSearch(event.target.value)}
            data-testid="pkg-benefits-search"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pkg-service-category" className="text-[11px] text-[#5C5346]">
            Category
          </Label>
          <Select
            value={categoryFilter}
            disabled={!canEdit}
            onValueChange={setCategoryFilter}
          >
            <SelectTrigger id="pkg-service-category" className={CONTROL} data-testid="pkg-benefits-category">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent className="z-[120]">
              <SelectItem value="all">All categories</SelectItem>
              {eligibleCategories.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <p className="pb-2 text-[11px] text-[#756A5B]" data-testid="pkg-benefits-selected-count">
            {selectedIds.length} selected
          </p>
        </div>
      </div>

      <div
        className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-[#E6D7B8] bg-white p-2"
        data-testid="pkg-benefits-checklist"
      >
        {filteredTypes.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            {eligibleTypes.length === 0
              ? "No package-eligible guest services are configured yet."
              : "No services match this search."}
          </p>
        ) : (
          filteredTypes.map((row) => {
            const checked = selectedIds.includes(row.id);
            const inputId = `pkg-service-${row.id}`;
            return (
              <label
                key={row.id}
                htmlFor={inputId}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-[#FDFAF5]",
                  !canEdit && "cursor-default opacity-80",
                )}
              >
                <Checkbox
                  id={inputId}
                  checked={checked}
                  disabled={!canEdit}
                  className="mt-0.5"
                  onCheckedChange={(next) => toggle(row.id, next === true)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-[#251605]">{row.name}</span>
                  <span className="block text-[11px] text-[#8A641A]">{row.categoryName}</span>
                  {row.description ? (
                    <span className="block text-[11px] text-[#756A5B]">{row.description}</span>
                  ) : null}
                </span>
              </label>
            );
          })
        )}
      </div>

      <div className="space-y-2" data-testid="pkg-benefits-selected-summary">
        <p className="text-[11px] font-medium text-[#5C5346]">
          Selected services ({selectedIds.length})
        </p>
        {selectedRows.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No services selected yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {selectedRows.map((row) => (
              <span
                key={row.id}
                className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-[#E6D7B8] bg-white px-2 py-1 text-[11px] text-[#251605]"
              >
                <span className="truncate">
                  {row.name}
                  <span className="text-[#8A7963]"> · {row.categoryName}</span>
                </span>
                {canEdit ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 shrink-0 p-0 text-[#8A7963] hover:bg-[#F4EDE0] hover:text-[#251605]"
                    aria-label={`Remove ${row.name}`}
                    onClick={() => toggle(row.id, false)}
                  >
                    <X className="size-3" />
                  </Button>
                ) : null}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

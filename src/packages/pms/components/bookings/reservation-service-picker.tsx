import { useMemo } from "react";
import { Minus, Plus } from "lucide-react";

import type { GuestServiceTypeOption } from "@/packages/pms/lib/guests.functions";
import { PMS_OP_INPUT } from "@/packages/pms/lib/pms-operational-surface";
import {
  serviceLineDetail,
  serviceLineFigures,
  serviceQuantityEditable,
  serviceUnitQuantityLabel,
  seedServiceQuantity,
  type ServiceStayContext,
} from "@/packages/pms/lib/reservation-service-lines";
import {
  SERVICE_QUANTITY_MAX,
  clampServiceQuantity,
  serviceUnitLabel,
  type ServiceChargeRules,
  type ServicePricingUnit,
} from "@/packages/pms/lib/room-charge-guest-total";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { cn } from "@/shared/lib/utils";

export type CreateServiceSelection = {
  serviceTypeId: string;
  name: string;
  description: string;
  pricingUnit?: ServicePricingUnit | null;
  unitAmount?: number | null;
  departmentId?: string | null;
  quantity?: number;
  /** True once staff changed the quantity; stay changes then stop re-seeding it. */
  quantityEdited?: boolean;
};

export function selectionFromServiceType(
  row: GuestServiceTypeOption,
  stay: ServiceStayContext,
): CreateServiceSelection {
  return {
    serviceTypeId: row.id,
    name: row.name,
    description: "",
    pricingUnit: row.pricingUnit,
    unitAmount: row.amount,
    departmentId: row.departmentId,
    quantity: seedServiceQuantity(row.pricingUnit, stay),
    quantityEdited: false,
  };
}

/** Re-seed unit defaults when the stay changes, keeping quantities staff typed. */
export function reseedServiceSelections(
  selections: CreateServiceSelection[],
  stay: ServiceStayContext,
): CreateServiceSelection[] {
  let changed = false;
  const next = selections.map((row) => {
    if (row.quantityEdited) return row;
    const quantity = seedServiceQuantity(row.pricingUnit ?? null, stay);
    if (quantity === row.quantity) return row;
    changed = true;
    return { ...row, quantity };
  });
  return changed ? next : selections;
}

export function ServiceQuantityStepper({
  id,
  unit,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  unit: string | null | undefined;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  if (!serviceQuantityEditable(unit)) return null;
  const label = serviceUnitQuantityLabel(unit);
  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor={id} className="text-[11px] font-medium text-[#6B5E4E]">
        {label}
      </label>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-7 rounded-[4px] border-[#DDD4C5] hover:bg-[#F7F2EA]"
        aria-label={`Decrease ${label.toLowerCase()}`}
        disabled={disabled || value <= 1}
        onClick={() => onChange(clampServiceQuantity(value - 1))}
      >
        <Minus className="size-3 text-[#251605]" aria-hidden />
      </Button>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={SERVICE_QUANTITY_MAX}
        className={cn(PMS_OP_INPUT, "h-7 w-12 px-1 text-center text-xs font-semibold")}
        value={String(value)}
        disabled={disabled}
        data-testid="service-quantity-input"
        onChange={(event) => {
          const parsed = Number.parseInt(event.target.value, 10);
          onChange(Number.isFinite(parsed) ? clampServiceQuantity(parsed) : 1);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-7 rounded-[4px] border-[#DDD4C5] hover:bg-[#F7F2EA]"
        aria-label={`Increase ${label.toLowerCase()}`}
        disabled={disabled || value >= SERVICE_QUANTITY_MAX}
        onClick={() => onChange(clampServiceQuantity(value + 1))}
      >
        <Plus className="size-3 text-[#251605]" aria-hidden />
      </Button>
    </div>
  );
}

export function ServicePriceSummary({
  unitAmount,
  pricingUnit,
  quantity,
  departmentId,
  currency,
  rules,
  money,
}: {
  unitAmount: number | null;
  pricingUnit: ServicePricingUnit | null;
  quantity: number;
  departmentId?: string | null;
  currency?: string | null;
  rules?: ServiceChargeRules | null;
  money: (value: number) => string;
}) {
  if (unitAmount == null) {
    return (
      <span className="text-[11px] font-medium text-[#8A7A68]" data-testid="service-price-summary">
        Not priced
      </span>
    );
  }
  const line = { pricingUnit, unitAmount, quantity, departmentId };
  const figures = serviceLineFigures(line, rules);
  const detail = serviceLineDetail(line, money);
  const taxed = figures.net != null && figures.total != null && Math.abs(figures.total - figures.net) >= 0.005;

  return (
    <div className="flex flex-col items-end text-right" data-testid="service-price-summary">
      <span className="font-bold text-sm text-[#251605] tabular-nums" data-testid="service-line-total">
        {figures.total != null ? money(figures.total) : "—"}
      </span>
      <div className="flex flex-wrap items-center justify-end gap-1.5 mt-0.5">
        <span className="text-[11px] font-medium text-[#7A6A55]">
          {money(unitAmount)} / {serviceUnitLabel(pricingUnit)}
          {currency ? ` (${currency})` : ""}
        </span>
        {taxed && figures.net != null ? (
          <span
            className="inline-flex items-center rounded bg-[#F4EDE0] px-1.5 py-0.2 text-[9.5px] font-medium text-[#7A5A1A]"
            title={`Net ${money(figures.net)} · ${figures.taxLines.join(", ")}`}
          >
            Incl. tax
          </span>
        ) : null}
      </div>
      {detail ? (
        <span className="mt-0.5 text-[10px] tabular-nums text-[#8C7A64]">
          {detail}
        </span>
      ) : null}
    </div>
  );
}

export function CreateReservationServiceList({
  serviceTypes,
  selected,
  onChange,
  stay,
  rules,
  money,
}: {
  serviceTypes: GuestServiceTypeOption[];
  selected: CreateServiceSelection[];
  onChange: (next: CreateServiceSelection[]) => void;
  stay: ServiceStayContext;
  rules?: ServiceChargeRules | null;
  money: (value: number) => string;
}) {
  const selectedTotal = useMemo(() => {
    return selected.reduce((sum, item) => {
      const line = {
        pricingUnit: item.pricingUnit ?? null,
        unitAmount: item.unitAmount ?? null,
        quantity: item.quantity ?? 1,
        departmentId: item.departmentId,
      };
      const figures = serviceLineFigures(line, rules);
      return sum + (figures.total ?? (item.unitAmount ? item.unitAmount * (item.quantity ?? 1) : 0));
    }, 0);
  }, [selected, rules]);

  return (
    <div className="space-y-2.5">
      <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {serviceTypes.map((row) => {
          const current = selected.find((item) => item.serviceTypeId === row.id);
          const quantity = current?.quantity ?? seedServiceQuantity(row.pricingUnit, stay);
          const update = (patch: Partial<CreateServiceSelection>) =>
            onChange(
              selected.map((item) => (item.serviceTypeId === row.id ? { ...item, ...patch } : item)),
            );
          const isSelected = Boolean(current);

          return (
            <li
              key={row.id}
              className={cn(
                "rounded-lg border p-2.5 transition-all duration-150",
                isSelected
                  ? "border-[#C89933] bg-[#FCFBF8] shadow-xs ring-1 ring-[#C89933]/25"
                  : "border-[#E4DCCE] bg-white hover:border-[#C4B8A5] hover:bg-[#FAF8F5]/50",
              )}
              data-testid={`create-service-row-${row.id}`}
            >
              <div className="flex items-center justify-between gap-3">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked) => {
                      if (checked === true) {
                        onChange([...selected, selectionFromServiceType(row, stay)]);
                        return;
                      }
                      onChange(selected.filter((item) => item.serviceTypeId !== row.id));
                    }}
                    className="size-4 rounded-[3px] border-[#C4B8A5] data-[state=checked]:border-[#C89933] data-[state=checked]:bg-[#C89933]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-xs text-[#251605]">
                        {row.name}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-[#F3EDE3] px-2 py-0.5 text-[10px] font-medium text-[#6B5E4E]">
                        {row.categoryName}
                      </span>
                    </div>
                  </div>
                </label>

                <ServicePriceSummary
                  unitAmount={row.amount}
                  pricingUnit={row.pricingUnit}
                  quantity={quantity}
                  departmentId={row.departmentId}
                  rules={rules}
                  money={money}
                />
              </div>

              {current ? (
                <div className="mt-2.5 border-t border-[#EFE8DC] pt-2">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="shrink-0">
                      <ServiceQuantityStepper
                        id={`create-service-quantity-${row.id}`}
                        unit={row.pricingUnit}
                        value={quantity}
                        onChange={(next) => update({ quantity: next, quantityEdited: true })}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Input
                        className={cn(PMS_OP_INPUT, "h-7 text-xs")}
                        value={current.description}
                        placeholder={`Instructions / notes for ${row.name} (optional)...`}
                        aria-label={`Description for ${row.name}`}
                        data-testid="selected-service-description"
                        onChange={(event) => update({ description: event.target.value })}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {selected.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#E6E1D8] bg-[#F7F4EE]/70 px-3.5 py-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-5 items-center justify-center rounded-full bg-[#C89933] text-[10px] font-bold text-white">
              {selected.length}
            </span>
            <span className="font-medium text-[#6B5E4E]">
              {selected.length === 1 ? "Service" : "Services"} requested
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-bold text-sm text-[#251605] tabular-nums">
              {money(selectedTotal)}
            </span>
            <span className="text-[10px] text-[#8C7A64] font-medium">
              (incl. taxes & fees)
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

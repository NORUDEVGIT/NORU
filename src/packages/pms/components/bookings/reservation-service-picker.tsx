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
        className="size-7"
        aria-label={`Decrease ${label.toLowerCase()}`}
        disabled={disabled || value <= 1}
        onClick={() => onChange(clampServiceQuantity(value - 1))}
      >
        <Minus className="size-3" aria-hidden />
      </Button>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={SERVICE_QUANTITY_MAX}
        className={cn(PMS_OP_INPUT, "h-7 w-14 px-1 text-center text-xs")}
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
        className="size-7"
        aria-label={`Increase ${label.toLowerCase()}`}
        disabled={disabled || value >= SERVICE_QUANTITY_MAX}
        onClick={() => onChange(clampServiceQuantity(value + 1))}
      >
        <Plus className="size-3" aria-hidden />
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
    return <span className="text-[11px] text-[#8A7A68]">Not priced</span>;
  }
  const line = { pricingUnit, unitAmount, quantity, departmentId };
  const figures = serviceLineFigures(line, rules);
  const detail = serviceLineDetail(line, money);
  const taxed = figures.net != null && figures.total != null && Math.abs(figures.total - figures.net) >= 0.005;
  return (
    <span className="text-right text-[11px] text-[#6B5E4E]" data-testid="service-price-summary">
      <span className="block">
        {money(unitAmount)} · {serviceUnitLabel(pricingUnit)}
        {currency ? ` (${currency})` : ""}
      </span>
      {detail ? <span className="block">{detail}</span> : null}
      <span className="block font-semibold text-[#251605]" data-testid="service-line-total">
        {figures.total != null ? money(figures.total) : "—"}
      </span>
      {taxed && figures.net != null ? (
        <span className="block text-[10px] text-[#8A7A68]">
          Net {money(figures.net)} · {figures.taxLines.join(", ")}
        </span>
      ) : null}
    </span>
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
  return (
    <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
      {serviceTypes.map((row) => {
        const current = selected.find((item) => item.serviceTypeId === row.id);
        const quantity = current?.quantity ?? seedServiceQuantity(row.pricingUnit, stay);
        const update = (patch: Partial<CreateServiceSelection>) =>
          onChange(
            selected.map((item) => (item.serviceTypeId === row.id ? { ...item, ...patch } : item)),
          );
        return (
          <li
            key={row.id}
            className="grid gap-1 rounded-[6px] px-1 py-1 hover:bg-[#FAF8F5]"
            data-testid={`create-service-row-${row.id}`}
          >
            <div className="flex items-start gap-2 text-xs text-[#251605]">
              <label className="flex min-w-0 flex-1 items-center gap-2">
                <Checkbox
                  checked={Boolean(current)}
                  onCheckedChange={(checked) => {
                    if (checked === true) {
                      onChange([...selected, selectionFromServiceType(row, stay)]);
                      return;
                    }
                    onChange(selected.filter((item) => item.serviceTypeId !== row.id));
                  }}
                />
                <span className="min-w-0 flex-1 font-medium">{row.name}</span>
                <span className="shrink-0 rounded-full bg-[#F3EDE3] px-2 py-0.5 text-[11px] font-medium text-[#4A4034]">
                  {row.categoryName}
                </span>
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
              <div className="ml-6 grid gap-1.5">
                <ServiceQuantityStepper
                  id={`create-service-quantity-${row.id}`}
                  unit={row.pricingUnit}
                  value={quantity}
                  onChange={(next) => update({ quantity: next, quantityEdited: true })}
                />
                <Input
                  className={PMS_OP_INPUT}
                  value={current.description}
                  placeholder={row.name}
                  aria-label={`Description for ${row.name}`}
                  data-testid="selected-service-description"
                  onChange={(event) => update({ description: event.target.value })}
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

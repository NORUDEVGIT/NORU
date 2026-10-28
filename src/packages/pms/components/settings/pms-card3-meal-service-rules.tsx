import { useEffect, useState } from "react";
import { Baby, Coffee, Loader2, Moon, Save, SunMedium, type LucideIcon } from "lucide-react";

import { PropertySetupSectionHeader } from "@/packages/pms/components/settings/setup-kit";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { cn } from "@/shared/lib/utils";
import type {
  Card3DepartmentRef,
  MealApplicabilityCard3,
  MealServiceRuleCard3,
} from "@/packages/pms/lib/meals-card3.server";

const NONE = "none";

export function PmsCard3MealServiceRules({
  policy,
  departments,
  canEdit,
  pending,
  onSave,
}: {
  policy: MealApplicabilityCard3;
  departments: Card3DepartmentRef[];
  canEdit: boolean;
  pending: boolean;
  onSave: (policy: MealApplicabilityCard3) => void;
}) {
  const [draft, setDraft] = useState(policy);
  useEffect(() => setDraft(policy), [policy]);
  const activeDepartments = departments.filter((row) => row.active);

  function update(meal: "breakfast" | "lunch" | "dinner", patch: Partial<MealServiceRuleCard3>) {
    setDraft((current) => ({ ...current, [meal]: { ...current[meal], ...patch } }));
  }

  return (
    <section
      className="space-y-5 rounded-2xl border border-[#E6E1D8] bg-white p-5"
      data-testid="meal-service-rules"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PropertySetupSectionHeader
          icon="meal"
          title="Meal Service Rules"
          description="Configure when each included meal applies during a guest stay and assign responsible service departments."
        />
        {canEdit ? (
          <Button
            type="button"
            size="sm"
            className="h-9 rounded-[6px] bg-[#C89933] px-3.5 text-xs font-medium text-[#251605] shadow-none transition-colors hover:bg-[#B98B2D] disabled:opacity-50"
            disabled={pending}
            data-testid="meal-service-rules-save"
            onClick={() => onSave(draft)}
          >
            {pending ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="mr-1.5 size-3.5" />
                Save meal rules
              </>
            )}
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MealRule
          title="Breakfast"
          subtitle="Morning service window"
          icon={Coffee}
          testId="breakfast"
          rule={draft.breakfast}
          departments={activeDepartments}
          canEdit={canEdit}
          onChange={(patch) => update("breakfast", patch)}
        />
        <MealRule
          title="Lunch"
          subtitle="Midday dining service"
          icon={SunMedium}
          testId="lunch"
          rule={draft.lunch}
          departments={activeDepartments}
          canEdit={canEdit}
          onChange={(patch) => update("lunch", patch)}
        />
        <MealRule
          title="Dinner"
          subtitle="Evening dining service"
          icon={Moon}
          testId="dinner"
          rule={draft.dinner}
          departments={activeDepartments}
          canEdit={canEdit}
          onChange={(patch) => update("dinner", patch)}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#E6E1D8] bg-[#FAF8F5] p-3.5 sm:flex-nowrap">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-[6px] bg-[#F4EDE0] text-[#251605]">
            <Baby className="size-4" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="space-y-0.5">
            <Label htmlFor="meal-count-infants" className="cursor-pointer text-sm font-semibold text-[#251605]">
              Count infants in meal quantity
            </Label>
            <p className="text-xs text-muted-foreground">
              When enabled, infants are included in meal-service guest counts and kitchen preparation totals.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center pl-11 sm:pl-0">
          <Checkbox
            id="meal-count-infants"
            checked={draft.countInfants}
            disabled={!canEdit}
            data-testid="meal-count-infants"
            onCheckedChange={(next) =>
              setDraft((current) => ({ ...current, countInfants: next === true }))
            }
            className="size-5 rounded-[4px] border-[#CCCCCC] data-[state=checked]:border-[#C89933] data-[state=checked]:bg-[#C89933]"
          />
        </div>
      </div>
    </section>
  );
}

function MealRule({
  title,
  subtitle,
  icon: Icon,
  testId,
  rule,
  departments,
  canEdit,
  onChange,
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  testId: string;
  rule: MealServiceRuleCard3;
  departments: Card3DepartmentRef[];
  canEdit: boolean;
  onChange: (patch: Partial<MealServiceRuleCard3>) => void;
}) {
  return (
    <div
      className="flex flex-col justify-between rounded-[8px] border border-[#E6E1D8] bg-[#FAF8F5] p-4 transition-colors hover:border-[#C89933]/50"
      data-testid={`meal-rule-${testId}`}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 border-b border-[#E6E1D8] pb-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[6px] bg-[#F4EDE0] text-[#251605]">
            <Icon className="size-4" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-[#251605]">{title}</h4>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B6458]">
            Stay Schedule
          </span>
          <div className="space-y-1.5">
            <Flag
              id={`${testId}-arrival`}
              label="Arrival Date"
              sublabel="Check-in day"
              checked={rule.includeArrival}
              disabled={!canEdit}
              onChange={(includeArrival) => onChange({ includeArrival })}
            />
            <Flag
              id={`${testId}-stay`}
              label="Stay Days"
              sublabel="In-house nights"
              checked={rule.includeStay}
              disabled={!canEdit}
              onChange={(includeStay) => onChange({ includeStay })}
            />
            <Flag
              id={`${testId}-departure`}
              label="Departure Date"
              sublabel="Check-out day"
              checked={rule.includeDeparture}
              disabled={!canEdit}
              onChange={(includeDeparture) => onChange({ includeDeparture })}
            />
          </div>
        </div>

        <div className="space-y-1.5 pt-1">
          <Label htmlFor={`${testId}-department`} className="text-xs font-medium text-[#251605]">
            Responsible Department
          </Label>
          <Select
            value={rule.departmentId ?? NONE}
            disabled={!canEdit}
            onValueChange={(next) => onChange({ departmentId: next === NONE ? null : next })}
          >
            <SelectTrigger
              id={`${testId}-department`}
              data-testid={`${testId}-department`}
              className="h-9 w-full rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-xs text-[#251605] shadow-none hover:border-[#C89933]/70 focus:border-[#C89933] focus:ring-1 focus:ring-[#C89933]"
            >
              <SelectValue placeholder="No department" />
            </SelectTrigger>
            <SelectContent className="rounded-[6px] border border-[#E6E1D8]">
              <SelectItem value={NONE} className="text-xs">
                No department
              </SelectItem>
              {departments.map((row) => (
                <SelectItem key={row.id} value={row.id} className="text-xs">
                  {row.code} — {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

function Flag({
  id,
  label,
  sublabel,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  sublabel: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex items-center justify-between rounded-[6px] border px-3 py-2 transition-all cursor-pointer select-none",
        checked
          ? "border-[#C89933]/60 bg-[#F4EDE0]/60 text-[#251605]"
          : "border-[#E6E1D8] bg-white text-[#6B6458] hover:bg-[#FAF8F5]",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      <div className="min-w-0 pr-2">
        <span className="block text-xs font-medium text-[#251605]">{label}</span>
        <span className="block text-[11px] text-muted-foreground">{sublabel}</span>
      </div>
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        data-testid={id}
        onCheckedChange={(next) => onChange(next === true)}
        className="size-4 rounded-[3px] border-[#CCCCCC] data-[state=checked]:border-[#C89933] data-[state=checked]:bg-[#C89933]"
      />
    </label>
  );
}

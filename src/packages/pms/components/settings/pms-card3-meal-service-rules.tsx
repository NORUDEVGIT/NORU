import { useEffect, useState } from "react";

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
      className="space-y-4 rounded-2xl border border-[#E6E1D8] bg-white p-4"
      data-testid="meal-service-rules"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium text-[#251605]">Meal Service Rules</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure when each included meal applies during a guest stay.
          </p>
        </div>
        {canEdit ? (
          <Button
            type="button"
            size="sm"
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
            disabled={pending}
            data-testid="meal-service-rules-save"
            onClick={() => onSave(draft)}
          >
            {pending ? "Saving…" : "Save meal rules"}
          </Button>
        ) : null}
      </div>
      <MealRule
        title="Breakfast"
        testId="breakfast"
        rule={draft.breakfast}
        departments={activeDepartments}
        canEdit={canEdit}
        onChange={(patch) => update("breakfast", patch)}
      />
      <MealRule
        title="Lunch"
        testId="lunch"
        rule={draft.lunch}
        departments={activeDepartments}
        canEdit={canEdit}
        onChange={(patch) => update("lunch", patch)}
      />
      <MealRule
        title="Dinner"
        testId="dinner"
        rule={draft.dinner}
        departments={activeDepartments}
        canEdit={canEdit}
        onChange={(patch) => update("dinner", patch)}
      />
      <div className="flex items-start gap-2 rounded-xl border px-3 py-2">
        <Checkbox
          id="meal-count-infants"
          checked={draft.countInfants}
          disabled={!canEdit}
          data-testid="meal-count-infants"
          onCheckedChange={(next) =>
            setDraft((current) => ({ ...current, countInfants: next === true }))
          }
        />
        <div>
          <Label htmlFor="meal-count-infants">Count infants in meal quantity</Label>
          <p className="text-xs text-muted-foreground">
            When enabled, infants are included in meal-service pax totals.
          </p>
        </div>
      </div>
    </section>
  );
}

function MealRule({
  title,
  testId,
  rule,
  departments,
  canEdit,
  onChange,
}: {
  title: string;
  testId: string;
  rule: MealServiceRuleCard3;
  departments: Card3DepartmentRef[];
  canEdit: boolean;
  onChange: (patch: Partial<MealServiceRuleCard3>) => void;
}) {
  return (
    <fieldset className="space-y-3 rounded-xl border px-3 py-3" data-testid={`meal-rule-${testId}`}>
      <legend className="px-1 text-sm font-medium text-[#251605]">{title}</legend>
      <div className="flex flex-wrap gap-4">
        <Flag
          id={`${testId}-arrival`}
          label="Arrival Date"
          checked={rule.includeArrival}
          disabled={!canEdit}
          onChange={(includeArrival) => onChange({ includeArrival })}
        />
        <Flag
          id={`${testId}-stay`}
          label="Stay Days"
          checked={rule.includeStay}
          disabled={!canEdit}
          onChange={(includeStay) => onChange({ includeStay })}
        />
        <Flag
          id={`${testId}-departure`}
          label="Departure Date"
          checked={rule.includeDeparture}
          disabled={!canEdit}
          onChange={(includeDeparture) => onChange({ includeDeparture })}
        />
      </div>
      <div className="max-w-sm space-y-1">
        <Label htmlFor={`${testId}-department`}>Responsible Department</Label>
        <Select
          value={rule.departmentId ?? NONE}
          disabled={!canEdit}
          onValueChange={(next) => onChange({ departmentId: next === NONE ? null : next })}
        >
          <SelectTrigger id={`${testId}-department`} data-testid={`${testId}-department`}>
            <SelectValue placeholder="No department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No department</SelectItem>
            {departments.map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {row.code} — {row.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </fieldset>
  );
}

function Flag({
  id,
  label,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        data-testid={id}
        onCheckedChange={(next) => onChange(next === true)}
      />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
}

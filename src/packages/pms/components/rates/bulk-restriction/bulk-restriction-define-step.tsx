import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  BULK_RESTRICTION_CLEAR_COPY,
  type RestrictionBooleanTriState,
  type RestrictionStayTriState,
  type RestrictionTriStatePatch,
} from "@/packages/pms/lib/revenue/bulk-restriction-change";
import type { RevenueRatePlan } from "@/packages/pms/lib/revenue/revenue-config.types";

function StayControl({
  id,
  label,
  state,
  onChange,
}: {
  id: string;
  label: string;
  state: RestrictionStayTriState;
  onChange: (next: RestrictionStayTriState) => void;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-[11px] font-medium text-[#251605]">{label}</legend>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#251605]">
        {(["unchanged", "set", "clear"] as const).map((mode) => (
          <label key={mode} className="inline-flex items-center gap-1">
            <input
              type="radio"
              name={id}
              checked={state.mode === mode}
              onChange={() => onChange({ ...state, mode })}
            />
            <span>{mode === "unchanged" ? "Unchanged" : mode === "set" ? "Set" : "Clear"}</span>
          </label>
        ))}
        {state.mode === "set" ? (
          <Input
            id={`${id}-value`}
            type="number"
            min={1}
            max={365}
            value={state.value}
            onChange={(event) => onChange({ mode: "set", value: event.target.value })}
            className="h-8 w-20"
          />
        ) : null}
      </div>
    </fieldset>
  );
}

function BooleanControl({
  id,
  label,
  state,
  onChange,
}: {
  id: string;
  label: string;
  state: RestrictionBooleanTriState;
  onChange: (next: RestrictionBooleanTriState) => void;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-[11px] font-medium text-[#251605]">{label}</legend>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#251605]">
        {(["unchanged", "on", "off"] as const).map((mode) => (
          <label key={mode} className="inline-flex items-center gap-1">
            <input
              type="radio"
              name={id}
              checked={state.mode === mode}
              onChange={() => onChange({ mode })}
            />
            <span>{mode === "unchanged" ? "Unchanged" : mode === "on" ? "On" : "Off"}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function BulkRestrictionDefineStep({
  operationType,
  patch,
  reason,
  selectedPlans,
  fromDate,
  toDate,
  onChange,
}: {
  operationType: "SET_FIELDS" | "CLEAR_ALL";
  patch: RestrictionTriStatePatch;
  reason: string;
  selectedPlans: RevenueRatePlan[];
  fromDate: string;
  toDate: string;
  onChange: (next: {
    operationType?: "SET_FIELDS" | "CLEAR_ALL";
    patch?: RestrictionTriStatePatch;
    reason?: string;
  }) => void;
}) {
  const inactiveCount = selectedPlans.filter((plan) => !plan.active).length;
  const outsideValidity = selectedPlans.filter((plan) => {
    if (plan.validFrom && toDate < plan.validFrom) return true;
    if (plan.validTo && fromDate > plan.validTo) return true;
    return false;
  }).length;

  function updatePatch(partial: Partial<RestrictionTriStatePatch>) {
    onChange({ operationType: "SET_FIELDS", patch: { ...patch, ...partial } });
  }

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="bulk-restriction-operation">Change</Label>
        <select
          id="bulk-restriction-operation"
          className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          value={operationType}
          onChange={(event) =>
            onChange({ operationType: event.target.value as "SET_FIELDS" | "CLEAR_ALL" })
          }
        >
          <option value="SET_FIELDS">Set restriction fields</option>
          <option value="CLEAR_ALL">Clear all restrictions</option>
        </select>
      </div>

      {operationType === "CLEAR_ALL" ? (
        <p className="text-[10px] text-muted-foreground">{BULK_RESTRICTION_CLEAR_COPY}</p>
      ) : (
        <>
          <p className="text-[10px] text-muted-foreground">
            Unchanged leaves the current value. Set / On writes a new value. Clear / Off removes that field.
          </p>
          <StayControl
            id="bulk-restriction-min"
            label="Min stay"
            state={patch.minStay}
            onChange={(minStay) => updatePatch({ minStay })}
          />
          <StayControl
            id="bulk-restriction-max"
            label="Max stay"
            state={patch.maxStay}
            onChange={(maxStay) => updatePatch({ maxStay })}
          />
          <BooleanControl
            id="bulk-restriction-cta"
            label="Closed to arrival"
            state={patch.closedToArrival}
            onChange={(closedToArrival) => updatePatch({ closedToArrival })}
          />
          <BooleanControl
            id="bulk-restriction-ctd"
            label="Closed to departure"
            state={patch.closedToDeparture}
            onChange={(closedToDeparture) => updatePatch({ closedToDeparture })}
          />
          <BooleanControl
            id="bulk-restriction-stop"
            label="Stop sell"
            state={patch.stopSell}
            onChange={(stopSell) => updatePatch({ stopSell })}
          />
        </>
      )}

      <div>
        <Label htmlFor="bulk-restriction-reason">Reason for Change</Label>
        <Input
          id="bulk-restriction-reason"
          value={reason}
          onChange={(event) => onChange({ reason: event.target.value })}
          placeholder="Optional"
        />
      </div>

      {inactiveCount > 0 ? (
        <p className="text-[10px] text-[#6B4A0A]">
          {inactiveCount} selected plan{inactiveCount === 1 ? "" : "s"} {inactiveCount === 1 ? "is" : "are"}{" "}
          inactive. Inactive plans can still receive operational restrictions.
        </p>
      ) : null}
      {outsideValidity > 0 ? (
        <p className="text-[10px] text-[#6B4A0A]">
          {outsideValidity} selected plan{outsideValidity === 1 ? "" : "s"} {outsideValidity === 1 ? "is" : "are"}{" "}
          outside the plan validity window. Validity is not blocked here.
        </p>
      ) : null}
    </div>
  );
}

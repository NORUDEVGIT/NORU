import { useMemo, useState } from "react";

import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { cn } from "@/shared/lib/utils";
import {
  CRITICAL_CONFIRM,
  PERMISSION_OUTSIDE_ACTOR,
  STAFF_ACCESS_MODULES,
  actorCanGrantCode,
  applyModulePreset,
  criticalModuleCodes,
  modulePermissionCodes,
  moduleTriState,
  modulesMatchingSearch,
  nonCriticalModuleCodes,
  riskLabel,
  withPermissionDisabled,
  withPermissionEnabled,
  type StaffAccessModule,
  type StaffAccessPreset,
} from "@/packages/pms/lib/staff-access";
import { permissionRisk as riskOf, type PmsPermissionCode } from "@/packages/pms/lib/pms-permissions";

type Actor = { isOwner: boolean; codes: readonly string[] };

export function StaffAccessMatrix({
  selected,
  actor,
  readOnly,
  onChange,
}: {
  selected: ReadonlySet<PmsPermissionCode>;
  actor: Actor;
  readOnly: boolean;
  onChange: (next: Set<PmsPermissionCode>) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [pendingCritical, setPendingCritical] = useState<PmsPermissionCode | null>(null);
  const matches = useMemo(() => new Set(modulesMatchingSearch(query)), [query]);
  const searching = query.trim().length > 0;

  function expanded(id: string) {
    return searching ? matches.has(id) : open.has(id);
  }

  function toggleOpen(id: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function commit(next: Set<PmsPermissionCode>) {
    onChange(next);
  }

  function enable(code: PmsPermissionCode) {
    if (readOnly || !actorCanGrantCode(actor, code)) return;
    if (riskOf(code) === "CRITICAL" && !selected.has(code)) {
      setPendingCritical(code);
      return;
    }
    commit(applyChecked(selected, code, true));
  }

  return (
    <div className="space-y-3" data-testid="staff-access-matrix">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search permissions..."
          aria-label="Search permissions"
          className="h-9 max-w-sm border-[#DDD4C5] bg-white text-sm"
        />
        <button
          type="button"
          className="text-xs font-medium text-[#8A641A] underline-offset-2 hover:underline"
          onClick={() => setOpen(new Set(STAFF_ACCESS_MODULES.map((module) => module.id)))}
        >
          Expand All
        </button>
        <button
          type="button"
          className="text-xs font-medium text-[#8A641A] underline-offset-2 hover:underline"
          onClick={() => setOpen(new Set())}
        >
          Collapse All
        </button>
      </div>
      <div className="space-y-2">
        {STAFF_ACCESS_MODULES.map((module, index) => {
          const previous = STAFF_ACCESS_MODULES[index - 1];
          const showSection = module.section && module.section !== previous?.section;
          if (searching && !matches.has(module.id)) return null;
          return (
            <div key={module.id}>
              {showSection ? (
                <p className="px-1 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[#8A641A]">
                  {module.section}
                </p>
              ) : null}
              <ModuleCard
                module={module}
                selected={selected}
                actor={actor}
                readOnly={readOnly}
                open={expanded(module.id)}
                onToggleOpen={() => toggleOpen(module.id)}
                onPreset={(preset) => commit(applyModulePreset(selected, module, preset))}
                onEnable={enable}
                onDisable={(code) => commit(applyChecked(selected, code, false))}
              />
            </div>
          );
        })}
      </div>
      <Dialog open={pendingCritical !== null} onOpenChange={(open) => !open && setPendingCritical(null)}>
        <DialogContent data-testid="critical-permission-confirm">
          <DialogHeader>
            <DialogTitle id="critical-permission-title">Critical permission</DialogTitle>
            <DialogDescription>{CRITICAL_CONFIRM}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-md border border-[#DDD4C5] bg-white px-3 py-1.5 text-xs"
              onClick={() => setPendingCritical(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-md bg-[#251605] px-3 py-1.5 text-xs font-medium text-white"
              onClick={() => {
                if (!pendingCritical) return;
                commit(applyChecked(selected, pendingCritical, true));
                setPendingCritical(null);
              }}
            >
              Enable
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function applyChecked(
  selected: ReadonlySet<PmsPermissionCode>,
  code: PmsPermissionCode,
  on: boolean,
): Set<PmsPermissionCode> {
  return on ? withPermissionEnabled(selected, code) : withPermissionDisabled(selected, code);
}

function ModuleCard({
  module,
  selected,
  actor,
  readOnly,
  open,
  onToggleOpen,
  onPreset,
  onEnable,
  onDisable,
}: {
  module: StaffAccessModule;
  selected: ReadonlySet<PmsPermissionCode>;
  actor: Actor;
  readOnly: boolean;
  open: boolean;
  onToggleOpen: () => void;
  onPreset: (preset: StaffAccessPreset) => void;
  onEnable: (code: PmsPermissionCode) => void;
  onDisable: (code: PmsPermissionCode) => void;
}) {
  const state = moduleTriState(selected, module);
  const total = nonCriticalModuleCodes(module).length;
  const onCount = modulePermissionCodes(module).filter((code) => selected.has(code) && riskOf(code) !== "CRITICAL").length;
  const viewOn = selected.has(module.view);
  return (
    <section className="rounded-xl border border-[#DDD4C5] bg-white" data-testid={`permission-module-${module.id}`}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          aria-expanded={open}
          onClick={onToggleOpen}
        >
          <span className="block text-sm font-medium text-[#251605]">{module.label}</span>
          <span className="block text-xs text-[#756A5B]">
            {viewOn ? "View on" : "No access"} · {onCount} of {total} included
          </span>
        </button>
        <Checkbox
          checked={state === "all" ? true : state === "partial" ? "indeterminate" : false}
          disabled={readOnly}
          aria-label={`${module.label} selection`}
          onCheckedChange={(value) => onPreset(value === true ? "full" : "none")}
        />
      </div>
      {open ? (
        <div className="space-y-3 border-t border-[#EFE6D6] px-3 py-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={`${module.label} presets`}>
            <PresetButton label="No Access" disabled={readOnly} onClick={() => onPreset("none")} />
            <PresetButton label="View Only" disabled={readOnly} onClick={() => onPreset("view")} />
            <PresetButton label="Full Access" disabled={readOnly} onClick={() => onPreset("full")} />
          </div>
          <PermissionRow
            code={module.view}
            label={module.viewLabel}
            description={`Open ${module.label}.`}
            checked={viewOn}
            actor={actor}
            readOnly={readOnly}
            onEnable={onEnable}
            onDisable={onDisable}
          />
          {module.groups.map((group) => (
            <div key={group.id} className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#756A5B]">{group.label}</p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {group.permissions.map((permission) => (
                  <PermissionRow
                    key={permission.code}
                    code={permission.code}
                    label={permission.label}
                    description={permission.description}
                    checked={selected.has(permission.code)}
                    actor={actor}
                    readOnly={readOnly}
                    onEnable={onEnable}
                    onDisable={onDisable}
                  />
                ))}
              </div>
            </div>
          ))}
          {criticalModuleCodes(module).length > 0 ? (
            <p className="text-xs text-[#8A641A]">Critical permissions stay off until they are chosen one by one.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function PresetButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-full border border-[#DDD4C5] bg-[#F7F4EE] px-2.5 py-1 text-xs font-medium text-[#251605] disabled:opacity-50"
    >
      {label}
    </button>
  );
}

function PermissionRow({
  code,
  label,
  description,
  checked,
  actor,
  readOnly,
  onEnable,
  onDisable,
}: {
  code: PmsPermissionCode;
  label: string;
  description: string;
  checked: boolean;
  actor: Actor;
  readOnly: boolean;
  onEnable: (code: PmsPermissionCode) => void;
  onDisable: (code: PmsPermissionCode) => void;
}) {
  const risk = riskOf(code);
  const badge = riskLabel(risk);
  const blocked = !actorCanGrantCode(actor, code);
  const disabled = readOnly || (blocked && !checked);
  const id = `perm-${code}`;
  return (
    <label
      htmlFor={id}
      title={blocked ? PERMISSION_OUTSIDE_ACTOR : description}
      className={cn(
        "flex items-start gap-2 rounded-lg border border-transparent px-1 py-1",
        disabled && "opacity-60",
      )}
    >
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        aria-describedby={`${id}-hint`}
        onCheckedChange={(value) => (value === true ? onEnable(code) : onDisable(code))}
      />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-1 text-sm text-[#251605]">
          {label}
          {badge ? (
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                risk === "CRITICAL" ? "bg-[#F8E4E4] text-[#8C2F2F]" : "bg-[#F4E9D0] text-[#8A641A]",
              )}
            >
              {risk === "CRITICAL" ? "Critical" : badge}
            </span>
          ) : null}
        </span>
        <span id={`${id}-hint`} className="block text-xs text-[#756A5B]">
          {blocked ? PERMISSION_OUTSIDE_ACTOR : description}
        </span>
      </span>
    </label>
  );
}

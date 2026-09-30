import { Filter, Info, RotateCcw } from "lucide-react";

import {
  COMMERCIAL_ACTION_TYPES,
  COMMERCIAL_ENTITY_TYPES,
} from "@/packages/pms/lib/revenue/commercial-engine";
import {
  commercialHistoryActionLabel,
  commercialHistoryEntityTypeLabel,
} from "@/packages/pms/lib/revenue/commercial-history";
import type { CommercialHistoryActorOption } from "@/packages/pms/lib/revenue/commercial-history-ui";

export function CommercialHistoryFilters({
  fromDate,
  toDate,
  entityType,
  actionType,
  actorId,
  search,
  actors,
  onFromDateChange,
  onToDateChange,
  onEntityTypeChange,
  onActionTypeChange,
  onActorIdChange,
  onSearchChange,
  onClear,
  onApplyFilter,
}: {
  fromDate?: string;
  toDate?: string;
  entityType: (typeof COMMERCIAL_ENTITY_TYPES)[number] | "";
  actionType: (typeof COMMERCIAL_ACTION_TYPES)[number] | "";
  actorId: string;
  search: string;
  actors: CommercialHistoryActorOption[];
  onFromDateChange?: (value: string) => void;
  onToDateChange?: (value: string) => void;
  onEntityTypeChange: (value: (typeof COMMERCIAL_ENTITY_TYPES)[number] | "") => void;
  onActionTypeChange: (value: (typeof COMMERCIAL_ACTION_TYPES)[number] | "") => void;
  onActorIdChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onClear?: () => void;
  onApplyFilter?: () => void;
}) {
  const hasActiveFilters = Boolean(entityType || actionType || actorId || search.trim());

  return (
    <div className="space-y-2 rounded-xl border border-[#E8E1D7] bg-card px-3.5 py-3">
      <div className="flex flex-wrap items-end gap-2.5">
        {fromDate !== undefined && onFromDateChange ? (
          <div className="min-w-36">
            <label
              htmlFor="commercial-history-from"
              className="text-xs font-medium text-muted-foreground"
            >
              From
            </label>
            <input
              id="commercial-history-from"
              type="date"
              value={fromDate}
              onChange={(event) => onFromDateChange(event.target.value)}
              className="mt-1 flex h-9 w-full rounded-md border border-[#DED7CD] bg-white px-2.5 text-sm text-[#251605]"
            />
          </div>
        ) : null}
        {toDate !== undefined && onToDateChange ? (
          <div className="min-w-36">
            <label
              htmlFor="commercial-history-to"
              className="text-xs font-medium text-muted-foreground"
            >
              To
            </label>
            <input
              id="commercial-history-to"
              type="date"
              value={toDate}
              onChange={(event) => onToDateChange(event.target.value)}
              className="mt-1 flex h-9 w-full rounded-md border border-[#DED7CD] bg-white px-2.5 text-sm text-[#251605]"
            />
          </div>
        ) : null}
        <div className="min-w-40">
          <label
            htmlFor="commercial-history-entity"
            className="text-xs font-medium text-muted-foreground"
          >
            Commercial Type
          </label>
          <select
            id="commercial-history-entity"
            value={entityType}
            onChange={(event) => onEntityTypeChange(event.target.value as typeof entityType)}
            className="mt-1 flex h-9 w-full rounded-md border border-[#DED7CD] bg-white px-2.5 text-sm text-[#251605]"
          >
            <option value="">All entities</option>
            {COMMERCIAL_ENTITY_TYPES.map((value) => (
              <option key={value} value={value}>
                {commercialHistoryEntityTypeLabel(value)}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-40">
          <label
            htmlFor="commercial-history-action"
            className="text-xs font-medium text-muted-foreground"
          >
            Action
          </label>
          <select
            id="commercial-history-action"
            value={actionType}
            onChange={(event) => onActionTypeChange(event.target.value as typeof actionType)}
            className="mt-1 flex h-9 w-full rounded-md border border-[#DED7CD] bg-white px-2.5 text-sm text-[#251605]"
          >
            <option value="">All actions</option>
            {COMMERCIAL_ACTION_TYPES.map((value) => (
              <option key={value} value={value}>
                {commercialHistoryActionLabel(value)}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-40">
          <label
            htmlFor="commercial-history-actor"
            className="text-xs font-medium text-muted-foreground"
          >
            Changed By
          </label>
          <select
            id="commercial-history-actor"
            value={actorId}
            onChange={(event) => onActorIdChange(event.target.value)}
            className="mt-1 flex h-9 w-full rounded-md border border-[#DED7CD] bg-white px-2.5 text-sm text-[#251605]"
          >
            <option value="">Anyone</option>
            {actors.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-52 flex-1">
          <label
            htmlFor="commercial-history-search"
            className="text-xs font-medium text-muted-foreground"
          >
            Search
          </label>
          <input
            id="commercial-history-search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Name, code, reason, or operation"
            className="mt-1 flex h-9 w-full rounded-md border border-[#DED7CD] bg-white px-3 text-sm text-[#251605]"
          />
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters && onClear ? (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#DED7CD] bg-white px-3 text-xs font-semibold text-[#251605] transition-colors hover:bg-[#F7F4EE]"
            >
              <RotateCcw className="size-3.5" />
              Clear
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onApplyFilter?.()}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#D5A62B] px-3.5 text-xs font-semibold text-[#332303] shadow-xs transition-colors hover:bg-[#C89933]"
          >
            <Filter className="size-3.5" />
            Filter
          </button>
        </div>
      </div>
      <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Info className="size-3.5 text-[#6B4A0A]" />
        Date range filters <span className="font-semibold text-[#251605]">
          Changed Between
        </span>{" "}
        (when the commercial change was recorded).
      </p>
    </div>
  );
}

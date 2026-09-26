import { COMMERCIAL_ACTION_TYPES, COMMERCIAL_ENTITY_TYPES } from "@/packages/pms/lib/revenue/commercial-engine";
import { commercialHistoryActionLabel, commercialHistoryEntityTypeLabel } from "@/packages/pms/lib/revenue/commercial-history";
import type { CommercialHistoryActorOption } from "@/packages/pms/lib/revenue/commercial-history-ui";

export function CommercialHistoryFilters({
  entityType,
  actionType,
  actorId,
  search,
  actors,
  onEntityTypeChange,
  onActionTypeChange,
  onActorIdChange,
  onSearchChange,
}: {
  entityType: (typeof COMMERCIAL_ENTITY_TYPES)[number] | "";
  actionType: (typeof COMMERCIAL_ACTION_TYPES)[number] | "";
  actorId: string;
  search: string;
  actors: CommercialHistoryActorOption[];
  onEntityTypeChange: (value: (typeof COMMERCIAL_ENTITY_TYPES)[number] | "") => void;
  onActionTypeChange: (value: (typeof COMMERCIAL_ACTION_TYPES)[number] | "") => void;
  onActorIdChange: (value: string) => void;
  onSearchChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-[#E8E1D7] bg-card px-3 py-2">
      <div className="min-w-36">
        <label htmlFor="commercial-history-entity" className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          Entity Type
        </label>
        <select
          id="commercial-history-entity"
          value={entityType}
          onChange={(event) => onEntityTypeChange(event.target.value as typeof entityType)}
          className="mt-1 flex h-8 w-full rounded-md border border-[#DED7CD] bg-white px-2 text-[11px] text-[#251605]"
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
        <label htmlFor="commercial-history-action" className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          Action
        </label>
        <select
          id="commercial-history-action"
          value={actionType}
          onChange={(event) => onActionTypeChange(event.target.value as typeof actionType)}
          className="mt-1 flex h-8 w-full rounded-md border border-[#DED7CD] bg-white px-2 text-[11px] text-[#251605]"
        >
          <option value="">All actions</option>
          {COMMERCIAL_ACTION_TYPES.map((value) => (
            <option key={value} value={value}>
              {commercialHistoryActionLabel(value)}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-36">
        <label htmlFor="commercial-history-actor" className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          Changed By
        </label>
        <select
          id="commercial-history-actor"
          value={actorId}
          onChange={(event) => onActorIdChange(event.target.value)}
          className="mt-1 flex h-8 w-full rounded-md border border-[#DED7CD] bg-white px-2 text-[11px] text-[#251605]"
        >
          <option value="">Anyone</option>
          {actors.map((actor) => (
            <option key={actor.id} value={actor.id}>
              {actor.name}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-48 flex-1">
        <label htmlFor="commercial-history-search" className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          Search
        </label>
        <input
          id="commercial-history-search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Name, code, reason, or operation"
          className="mt-1 flex h-8 w-full rounded-md border border-[#DED7CD] bg-white px-2 text-[11px] text-[#251605]"
        />
      </div>
      <p className="pb-1 text-[10px] text-muted-foreground">
        The date range above is <span className="font-medium text-[#251605]">Changed Between</span> (when the
        change was recorded).
      </p>
    </div>
  );
}

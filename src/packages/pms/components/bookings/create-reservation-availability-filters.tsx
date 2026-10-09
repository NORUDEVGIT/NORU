export type AvailabilityFilterOption = {
  id: string;
  name: string;
  count?: number;
};

function FilterCheckbox({
  checked,
  label,
  count,
  testId,
  onChange,
}: {
  checked: boolean;
  label: string;
  count?: number;
  testId: string;
  onChange: () => void;
}) {
  return (
    <label className="flex items-start gap-2 text-sm text-[#251605]">
      <input
        type="checkbox"
        className="mt-0.5 size-3.5 accent-[#C89933]"
        checked={checked}
        data-testid={testId}
        onChange={onChange}
      />
      <span className="min-w-0">
        {label}
        {count != null ? <span className="text-muted-foreground"> ({count})</span> : null}
      </span>
    </label>
  );
}

export function AvailabilityFilterSidebar({
  roomTypes,
  ratePlans,
  amenities,
  excludedRoomTypeIds,
  excludedRatePlanIds,
  excludedAmenityLabels,
  onToggleRoomType,
  onToggleRatePlan,
  onToggleAmenity,
  onClear,
}: {
  roomTypes: AvailabilityFilterOption[];
  ratePlans: AvailabilityFilterOption[];
  amenities: string[];
  excludedRoomTypeIds: string[];
  excludedRatePlanIds: string[];
  excludedAmenityLabels: string[];
  onToggleRoomType: (id: string) => void;
  onToggleRatePlan: (id: string) => void;
  onToggleAmenity: (label: string) => void;
  onClear: () => void;
}) {
  const filtersActive =
    excludedRoomTypeIds.length > 0 ||
    excludedRatePlanIds.length > 0 ||
    excludedAmenityLabels.length > 0;

  return (
    <aside
      className="border-b border-[#E7E0D4] p-3 xl:border-b-0 xl:border-r"
      data-testid="availability-filters"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-[#251605]">Filters</h3>
        <button
          type="button"
          className="text-xs font-medium text-[#8B6914] disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="availability-filters-clear"
          disabled={!filtersActive}
          onClick={onClear}
        >
          Clear All
        </button>
      </div>
      <div className="mt-3 space-y-3">
        <fieldset className="min-w-0 space-y-1.5">
          <legend className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Room Type
          </legend>
          {roomTypes.length === 0 ? (
            <p className="text-xs text-muted-foreground">No room types in the current results.</p>
          ) : (
            roomTypes.map((type) => (
              <FilterCheckbox
                key={type.id}
                testId={`availability-room-filter-${type.id}`}
                checked={!excludedRoomTypeIds.includes(type.id)}
                label={type.name}
                count={type.count}
                onChange={() => onToggleRoomType(type.id)}
              />
            ))
          )}
        </fieldset>
        <fieldset className="min-w-0 space-y-1.5">
          <legend className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Rate Plan
          </legend>
          {ratePlans.length === 0 ? (
            <p className="text-xs text-muted-foreground">No rate plans in the current results.</p>
          ) : (
            ratePlans.map((plan) => (
              <FilterCheckbox
                key={plan.id}
                testId={`availability-rate-filter-${plan.id}`}
                checked={!excludedRatePlanIds.includes(plan.id)}
                label={plan.name}
                onChange={() => onToggleRatePlan(plan.id)}
              />
            ))
          )}
        </fieldset>
        {amenities.length > 0 ? (
          <fieldset className="min-w-0 space-y-1.5" data-testid="availability-amenity-filters">
            <legend className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Amenities
            </legend>
            {amenities.map((label) => (
              <FilterCheckbox
                key={label}
                testId={`availability-amenity-filter-${label}`}
                checked={!excludedAmenityLabels.includes(label)}
                label={label}
                onChange={() => onToggleAmenity(label)}
              />
            ))}
          </fieldset>
        ) : null}
      </div>
    </aside>
  );
}

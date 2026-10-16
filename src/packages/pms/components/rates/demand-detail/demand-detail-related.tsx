import { Link } from "@tanstack/react-router";

import { demandCalendarQuickSearch } from "@/packages/pms/lib/revenue/demand-calendar";

export function DemandDetailRelated({ stayDate, roomTypeId }: { stayDate: string; roomTypeId: string }) {
  const actions = [
    { label: "View Rate Calendar", search: demandCalendarQuickSearch("rate-calendar", stayDate, roomTypeId) },
    { label: "View Restrictions", search: demandCalendarQuickSearch("restrictions", stayDate, roomTypeId) },
    { label: "View Pickup & Pace", search: demandCalendarQuickSearch("pickup-pace", stayDate, roomTypeId) },
  ];

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">
        Open the matching Rate & Revenue view for this stay date and room type.
      </p>
      {actions.map((action) => (
        <Link
          key={action.label}
          to="/restaurant/pms/rates-revenue"
          search={action.search}
          className="flex h-9 items-center justify-between rounded-lg border border-[#DED7CD] bg-white px-3 text-[11px] text-[#251605] hover:bg-[#F8F1E5]"
        >
          {action.label}
        </Link>
      ))}
    </div>
  );
}

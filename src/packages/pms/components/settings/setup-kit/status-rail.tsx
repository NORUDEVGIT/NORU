import type { PropertySetupCardStatus } from "@/packages/pms/lib/pms-property-setup-card1";
import { propertySetupCardStatusPillLabel } from "@/packages/pms/lib/pms-property-setup-card-identity";
import { PROPERTY_SETUP_UI } from "@/packages/pms/lib/pms-property-setup-ui";
import { cn } from "@/shared/lib/utils";

export type PropertySetupRailSection = {
  id: string;
  title: string;
  status: PropertySetupCardStatus;
};

export function PropertySetupStatusRail({
  percent,
  sections = [],
  complete = 0,
  inProgress = 0,
  notStarted = 0,
  blockers,
  warnings,
}: {
  percent?: number;
  sections?: readonly PropertySetupRailSection[];
  complete?: number;
  inProgress?: number;
  notStarted?: number;
  blockers?: readonly string[];
  warnings?: readonly string[];
}) {
  const showDonut = typeof percent === "number" && Number.isFinite(percent);
  const clamped = showDonut ? Math.max(0, Math.min(100, Math.round(percent))) : 0;
  const readyDeg = (complete / Math.max(1, complete + inProgress + notStarted)) * 360;
  const attentionDeg = (inProgress / Math.max(1, complete + inProgress + notStarted)) * 360;
  const ring = `conic-gradient(#436436 0deg ${readyDeg}deg, #C89933 ${readyDeg}deg ${readyDeg + attentionDeg}deg, #E6E1D8 ${readyDeg + attentionDeg}deg 360deg)`;

  return (
    <aside
      className="w-full min-w-0 rounded-2xl border border-[#E6E1D8] bg-white p-4 @min-[56rem]:w-[min(17.5rem,34%)] @min-[72rem]:w-[17.5rem] @min-[72rem]:max-w-[17.5rem]"
      data-testid="property-setup-status-rail"
      aria-label="Card configuration status"
    >
      <p className="text-sm font-semibold text-[#251605]">Configuration status</p>
      <div className="mt-3 flex items-center gap-3">
        {showDonut ? (
          <div
            className="relative shrink-0 rounded-full"
            style={{
              width: PROPERTY_SETUP_UI.donutSize,
              height: PROPERTY_SETUP_UI.donutSize,
              background: ring,
            }}
            data-testid="property-setup-card-donut"
          >
            <div className="absolute inset-[11px] flex items-center justify-center rounded-full bg-white">
              <span className="text-xl font-extrabold tabular-nums text-[#251605]">{clamped}%</span>
            </div>
          </div>
        ) : null}
        <ul className="space-y-1 text-xs">
          <li className="text-[#436436]">{complete} ready</li>
          <li className="text-[#9A6A12]">{inProgress} attention</li>
          <li className="text-muted-foreground">{notStarted} not started</li>
        </ul>
      </div>
      {sections.length > 0 ? (
        <ol className="mt-4 space-y-2">
          {sections.map((section) => (
            <li key={section.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate text-[#251605]">{section.title}</span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                  section.status === "complete" && "bg-[#436436]/12 text-[#436436]",
                  section.status === "in_progress" && "bg-[#C89933]/15 text-[#9A6A12]",
                  section.status === "not_started" && "bg-[#ECEAE4] text-muted-foreground",
                )}
              >
                {propertySetupCardStatusPillLabel(section.status)}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      {blockers && blockers.length > 0 ? (
        <ul
          className="mt-3 space-y-1 text-xs text-red-700"
          data-testid="property-setup-rail-blockers"
        >
          {blockers.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {warnings && warnings.length > 0 ? (
        <ul
          className="mt-3 space-y-1 text-xs text-[#9A6A12]"
          data-testid="property-setup-rail-warnings"
        >
          {warnings.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}

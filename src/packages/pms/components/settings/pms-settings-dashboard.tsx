import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { RoomInventoryChrome } from "@/packages/pms/components/rooms/room-inventory-chrome";
import { propertySetupCardIcon } from "@/packages/pms/lib/pms-property-setup-card-identity";
import { SET1_HUB_HREF } from "@/packages/pms/lib/pms-set1-foundation";
import {
  evaluateSettingsDashboardProgress,
  settingsDashboardStatusLabel,
} from "@/packages/pms/lib/pms-settings-dashboard";
import {
  PROPERTY_SETUP_CARDS,
  type PropertySetupCardStatus,
} from "@/packages/pms/lib/pms-property-setup-card1";
import { cn } from "@/shared/lib/utils";

export function SettingsDashboardChrome({
  membership,
  children,
  contentClassName = "px-4 py-5 sm:px-6",
}: {
  membership: RestaurantMembership;
  children: ReactNode;
  contentClassName?: string;
}) {
  return (
    <RoomInventoryChrome
      membership={membership}
      activeModule="Settings"
      helpLabel="Help"
      shellTestId="settings-command-shell"
      contentClassName={contentClassName}
      suppressReturnButton
    >
      {children}
    </RoomInventoryChrome>
  );
}

export function SettingsSetupProgressPanel({
  statuses,
}: {
  statuses: readonly PropertySetupCardStatus[];
}) {
  const progress = evaluateSettingsDashboardProgress(statuses);

  return (
    <span
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-[11px] text-[#6B6458]"
      data-testid="settings-setup-progress"
      aria-label={`Setup ${progress.overallPercent}%`}
      title={`${progress.complete} complete · ${progress.inProgress} need attention · ${progress.notStarted} not started`}
    >
      <span className="font-medium text-[#251605]">Setup {progress.overallPercent}%</span>
      <span className="h-1 w-10 overflow-hidden rounded-full bg-[#E6E1D8]">
        <span
          className="block h-full rounded-full bg-[#C89933]"
          style={{ width: `${progress.overallPercent}%` }}
        />
      </span>
    </span>
  );
}

export function SettingsPropertySetupCards({
  statuses,
  summaries,
  visibleIds,
}: {
  statuses: readonly PropertySetupCardStatus[];
  summaries: readonly (readonly string[])[];
  visibleIds?: readonly string[];
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" data-testid="property-setup-cards">
      {PROPERTY_SETUP_CARDS.map((card, index) => {
        if (visibleIds && !visibleIds.includes(card.id)) return null;
        const status = statuses[index] ?? "not_started";
        const Icon = propertySetupCardIcon(card.number);
        const rows = (summaries[index] ?? []).slice(0, 2);
        return (
          <a
            key={card.id}
            href={`${SET1_HUB_HREF}#${card.hash}`}
            className="group relative flex min-h-[7.5rem] flex-col rounded-lg border border-[#DDD4C5] bg-white p-3 shadow-sm transition-colors hover:border-[#C89933]/70"
            data-testid={`property-setup-card-${card.number}`}
          >
            <div className="flex items-start gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#F4E9D0] text-[#8A6A24]">
                <Icon className="size-4" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-sm font-semibold leading-snug text-[#251605]">{card.title}</h2>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                      status === "complete" && "bg-emerald-50 text-emerald-800",
                      status === "in_progress" && "bg-amber-50 text-amber-800",
                      status === "not_started" && "bg-[#ECEAE4] text-[#756A5B]",
                    )}
                  >
                    {settingsDashboardStatusLabel(status)}
                  </span>
                </div>
                {rows.length > 0 ? (
                  <p className="mt-1 truncate text-[11px] text-[#756A5B]">{rows.join(" · ")}</p>
                ) : null}
              </div>
            </div>
            <ArrowRight className="absolute bottom-2.5 right-2.5 size-3.5 text-[#C89933] opacity-70 group-hover:opacity-100" />
          </a>
        );
      })}
    </div>
  );
}

export function SettingsDashboardFooter() {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-2 pt-6 text-xs text-muted-foreground">
      <p>NORU PMS</p>
      <p>People. Stays. A Better Tomorrow.</p>
    </footer>
  );
}

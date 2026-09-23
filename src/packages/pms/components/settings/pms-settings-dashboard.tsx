import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { FoHelpSheet } from "@/packages/pms/components/frontoffice/fo-help-sheet";
import { PmsCommandChrome } from "@/packages/pms/components/pms-command-chrome";
import { propertySetupCardIcon } from "@/packages/pms/lib/pms-property-setup-card-identity";
import { SET1_HUB_HREF } from "@/packages/pms/lib/pms-set1-foundation";
import {
  SETTINGS_DASHBOARD_NAV,
  evaluateSettingsDashboardProgress,
  settingsDashboardStatusLabel,
  type SettingsDashboardProgress,
} from "@/packages/pms/lib/pms-settings-dashboard";
import {
  PROPERTY_SETUP_CARDS,
  type PropertySetupCardStatus,
} from "@/packages/pms/lib/pms-property-setup-card1";
import { cn } from "@/shared/lib/utils";

export function SettingsDashboardChrome({
  helpOpen,
  onHelpOpenChange,
  children,
  contentClassName = "px-4 py-5 sm:px-6",
}: {
  helpOpen: boolean;
  onHelpOpenChange: (open: boolean) => void;
  children: ReactNode;
  contentClassName?: string;
}) {
  const navigate = useNavigate();

  function goFrontOffice() {
    void navigate({ to: "/restaurant/pms/front-office" });
  }

  return (
    <PmsCommandChrome
      shellTestId="settings-command-shell"
      contentClassName={contentClassName}
      onGuestSearch={() => {
        void navigate({ to: "/restaurant/pms/guests" });
      }}
      notificationsComingSoon
      onQuickAction={goFrontOffice}
      onHelpOpenChange={onHelpOpenChange}
      onActivity={goFrontOffice}
      helpSheet={
        <FoHelpSheet
          open={helpOpen}
          onOpenChange={onHelpOpenChange}
          onNavigate={goFrontOffice}
          canOpenCashiering={false}
        />
      }
      nav={
        <nav
          className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto md:flex"
          aria-label="PMS"
          data-testid="settings-top-nav"
        >
          {SETTINGS_DASHBOARD_NAV.map((item) => {
            const active = item.href === SET1_HUB_HREF;
            return (
              <a
                key={item.id}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex shrink-0 items-center whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-[#C89933] text-[#251605]"
                    : "text-white/75 hover:bg-white/10 hover:text-white",
                )}
              >
                {item.label}
              </a>
            );
          })}
        </nav>
      }
      mobile={
        <div className="border-b border-[#CCCCCC] px-3 py-2 md:hidden">
          <label className="sr-only" htmlFor="settings-mobile-nav">
            PMS
          </label>
          <select
            id="settings-mobile-nav"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
            defaultValue={SET1_HUB_HREF}
            onChange={(event) => {
              window.location.assign(event.target.value);
            }}
          >
            {SETTINGS_DASHBOARD_NAV.map((item) => (
              <option key={item.id} value={item.href}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      }
    >
      {children}
    </PmsCommandChrome>
  );
}

export function SettingsSetupProgressPanel({
  statuses,
}: {
  statuses: readonly PropertySetupCardStatus[];
}) {
  const progress = evaluateSettingsDashboardProgress(statuses);
  const readyDeg = progress.readyShare * 360;
  const attentionDeg = progress.attentionShare * 360;
  const ring = `conic-gradient(#436436 0deg ${readyDeg}deg, #C89933 ${readyDeg}deg ${readyDeg + attentionDeg}deg, #E6E1D8 ${readyDeg + attentionDeg}deg 360deg)`;

  return (
    <section
      className="flex flex-col gap-4 rounded-2xl border border-[#E6E1D8] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5"
      data-testid="settings-setup-progress"
      aria-label="Overall setup progress"
    >
      <div className="flex min-w-0 items-center gap-4">
        <div>
          <p className="text-sm font-semibold text-[#251605]">Overall Setup Progress</p>
          <p className="mt-1 text-sm text-muted-foreground">{progressCopy(progress)}</p>
        </div>
        <div
          className="relative size-[88px] shrink-0 rounded-full"
          style={{ background: ring }}
          data-testid="settings-setup-donut"
        >
          <div className="absolute inset-[11px] flex items-center justify-center rounded-full bg-white">
            <span className="text-xl font-extrabold tabular-nums text-[#251605]">
              {progress.overallPercent}%
            </span>
          </div>
        </div>
      </div>
      <ul className="grid shrink-0 gap-1.5 text-sm sm:min-w-[13rem]">
        <li className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-[#436436]" />
          <span className="text-[#436436]">{progress.complete} areas completed</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-[#C89933]" />
          <span className="text-[#9A6A12]">
            {progress.inProgress} {progress.inProgress === 1 ? "item needs" : "items need"}{" "}
            attention
          </span>
        </li>
        <li className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-[#C4C0B6]" />
          <span className="text-muted-foreground">{progress.notStarted} areas not started</span>
        </li>
      </ul>
    </section>
  );
}

function progressCopy(progress: SettingsDashboardProgress): string {
  if (progress.overallPercent >= 100) return "Setup is complete.";
  if (progress.overallPercent >= 50) return "Almost there!";
  if (progress.inProgress > 0) return "Keep going — a few areas still need attention.";
  return "Start with the first incomplete card.";
}

export function SettingsPropertySetupCards({
  statuses,
  summaries,
}: {
  statuses: readonly PropertySetupCardStatus[];
  summaries: readonly (readonly string[])[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="property-setup-cards">
      {PROPERTY_SETUP_CARDS.map((card, index) => {
        const status = statuses[index] ?? "not_started";
        const Icon = propertySetupCardIcon(card.number);
        const rows = summaries[index] ?? [];
        return (
          <article
            key={card.id}
            className="flex min-h-[248px] flex-col rounded-2xl border border-[#E6E1D8] bg-white p-4"
            data-testid={`property-setup-card-${card.number}`}
          >
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#F4EDE0] text-[#251605]">
                <Icon className="size-5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-[15px] font-semibold leading-snug text-[#251605]">
                    {card.title}
                  </h2>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                      status === "complete" && "bg-[#436436]/12 text-[#436436]",
                      status === "in_progress" && "bg-[#C89933]/15 text-[#9A6A12]",
                      status === "not_started" && "bg-[#ECEAE4] text-muted-foreground",
                    )}
                  >
                    {settingsDashboardStatusLabel(status)}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{card.purpose}</p>
              </div>
            </div>
            {rows.length > 0 ? (
              <>
                <div className="my-3 h-px bg-[#EDE8DE]" />
                <ul className="space-y-1.5 text-xs text-[#4B4338]">
                  {rows.map((row) => (
                    <li key={row} className="truncate">
                      {row}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="my-3 h-px bg-[#EDE8DE]" />
            )}
            <a
              href={`${SET1_HUB_HREF}#${card.hash}`}
              className="mt-auto inline-flex h-8 w-fit items-center gap-1 rounded-lg bg-[#F4EDE0] px-3 text-xs font-medium text-[#251605]"
            >
              Manage
              <ArrowRight className="size-3.5" />
            </a>
          </article>
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

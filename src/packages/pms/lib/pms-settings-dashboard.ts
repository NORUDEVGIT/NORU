/**
 * Settings dashboard presentation only.
 * Does not change stored Property Setup status semantics.
 */
import {
  CARD1_PMS_NAV,
  PROPERTY_SETUP_CARDS,
  propertySetupStatusLabel,
  type PropertySetupCardStatus,
} from "./pms-property-setup-card1.ts";
import { SET1_HUB_HREF } from "./pms-set1-foundation.ts";

export const SETTINGS_DASHBOARD_STATUS_WEIGHTS = {
  complete: 1,
  in_progress: 0.5,
  not_started: 0,
} as const;

export const SETTINGS_DASHBOARD_NAV = CARD1_PMS_NAV;

export type SettingsDashboardProgress = {
  overallPercent: number;
  complete: number;
  inProgress: number;
  notStarted: number;
  blocked: number;
  readyShare: number;
  attentionShare: number;
  notStartedShare: number;
};

export function settingsDashboardStatusWeight(status: PropertySetupCardStatus): number {
  return SETTINGS_DASHBOARD_STATUS_WEIGHTS[status];
}

export function settingsDashboardStatusLabel(status: PropertySetupCardStatus): string {
  if (status === "complete") return "Ready";
  return propertySetupStatusLabel(status);
}

export function evaluateSettingsDashboardProgress(
  statuses: readonly PropertySetupCardStatus[],
): SettingsDashboardProgress {
  const complete = statuses.filter((status) => status === "complete").length;
  const inProgress = statuses.filter((status) => status === "in_progress").length;
  const notStarted = statuses.filter((status) => status === "not_started").length;
  const total = statuses.length || PROPERTY_SETUP_CARDS.length;
  const overallPercent = Math.round(
    (statuses.reduce((sum, status) => sum + settingsDashboardStatusWeight(status), 0) / total) *
      100,
  );
  return {
    overallPercent,
    complete,
    inProgress,
    notStarted,
    blocked: 0,
    readyShare: complete / total,
    attentionShare: inProgress / total,
    notStartedShare: notStarted / total,
  };
}

export function settingsDashboardNavHrefs(): string[] {
  return SETTINGS_DASHBOARD_NAV.map((item) => item.href);
}

export function card1PmsNavIsUnchanged(): boolean {
  return CARD1_PMS_NAV.length === 7 && CARD1_PMS_NAV[6]?.href === SET1_HUB_HREF;
}

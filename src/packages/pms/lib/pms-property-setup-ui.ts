import type { PropertySetupCardStatus } from "./pms-property-setup-card1.ts";

/** Shared NORU Property Setup presentation tokens. Do not fork a second palette. */
export const PROPERTY_SETUP_UI = {
  canvas: "#F7F4EE",
  ink: "#251605",
  gold: "#C89933",
  goldMuted: "#9A6A12",
  green: "#436436",
  cream: "#F4EDE0",
  border: "#E6E1D8",
  trim: "#CCCCCC",
  railWidth: "17.5rem",
  donutSize: 88,
  controlRadius: "6px",
} as const;

export const PROPERTY_SETUP_CONTROL_CLASS =
  "h-11 w-full rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-sm text-[#251605] shadow-none transition-colors hover:border-[#C89933]/70 focus-visible:border-[#C89933] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C89933] disabled:cursor-not-allowed disabled:bg-[#F7F4EE] disabled:opacity-70 read-only:bg-[#F7F4EE] aria-[invalid=true]:border-red-500";

export const PROPERTY_SETUP_TEXTAREA_CLASS =
  "min-h-[5.5rem] w-full rounded-[6px] border border-[#CCCCCC] bg-white px-3 py-2 text-sm text-[#251605] shadow-none transition-colors hover:border-[#C89933]/70 focus-visible:border-[#C89933] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C89933] disabled:cursor-not-allowed disabled:bg-[#F7F4EE] disabled:opacity-70 read-only:bg-[#F7F4EE] aria-[invalid=true]:border-red-500";

export const PROPERTY_SETUP_COMPACT_TEXTAREA_CLASS =
  "min-h-[3.25rem] w-full rounded-[6px] border border-[#CCCCCC] bg-white px-3 py-2 text-sm text-[#251605] shadow-none transition-colors hover:border-[#C89933]/70 focus-visible:border-[#C89933] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C89933] disabled:cursor-not-allowed disabled:bg-[#F7F4EE] disabled:opacity-70 read-only:bg-[#F7F4EE] aria-[invalid=true]:border-red-500";

export const PROPERTY_SETUP_STATUS_WEIGHTS = {
  complete: 1,
  in_progress: 0.5,
  not_started: 0,
} as const;

export const PROPERTY_SETUP_SHORT_DESCRIPTION_UI_MAX = 80;
export const PROPERTY_SETUP_SHORT_DESCRIPTION_STORAGE_MAX = 500;

export function propertySetupStatusesPercent(statuses: readonly PropertySetupCardStatus[]): number {
  if (statuses.length === 0) return 0;
  const sum = statuses.reduce((total, status) => total + PROPERTY_SETUP_STATUS_WEIGHTS[status], 0);
  return Math.round((sum / statuses.length) * 100);
}

export function propertySetupRailCounts(statuses: readonly PropertySetupCardStatus[]): {
  complete: number;
  inProgress: number;
  notStarted: number;
} {
  return {
    complete: statuses.filter((status) => status === "complete").length,
    inProgress: statuses.filter((status) => status === "in_progress").length,
    notStarted: statuses.filter((status) => status === "not_started").length,
  };
}

export function isShortDescriptionOverLimit(value: string): boolean {
  return value.length > PROPERTY_SETUP_SHORT_DESCRIPTION_UI_MAX;
}

/** Keep previous text when new input would exceed the 80-character UI gate. Legacy over-limit values can only shrink. */
export function acceptShortDescriptionInput(previous: string, next: string): string {
  if (next.length <= previous.length) {
    return next.length > PROPERTY_SETUP_SHORT_DESCRIPTION_STORAGE_MAX
      ? next.slice(0, PROPERTY_SETUP_SHORT_DESCRIPTION_STORAGE_MAX)
      : next;
  }
  if (next.length > PROPERTY_SETUP_SHORT_DESCRIPTION_STORAGE_MAX) return previous;
  if (next.length > PROPERTY_SETUP_SHORT_DESCRIPTION_UI_MAX) return previous;
  return next;
}

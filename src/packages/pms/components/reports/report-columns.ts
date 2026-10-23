/** Class hooks for later report columns. Each report defines its own columns. */
export const reportCellClass = {
  text: "px-4 py-3 text-left align-middle",
  date: "px-4 py-3 text-left align-middle whitespace-nowrap",
  numeric: "px-4 py-3 text-right align-middle tabular-nums",
  currency: "px-4 py-3 text-right align-middle tabular-nums",
  status: "px-4 py-3 text-left align-middle",
} as const;

export type ReportCellKind = keyof typeof reportCellClass;

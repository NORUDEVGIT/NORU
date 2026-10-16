export const FISCAL_INVOICE_LIST_STATUSES = [
  "registered",
  "error",
  "queued",
  "not_registered",
] as const;

export type FiscalInvoiceListStatus = (typeof FISCAL_INVOICE_LIST_STATUSES)[number];

export const FISCAL_INVOICE_LIST_LABEL: Record<FiscalInvoiceListStatus, string> = {
  registered: "Registered",
  error: "Error",
  queued: "Queued",
  not_registered: "Not registered",
};

/** One invoice fiscal document. Cancelled attempts do not count. */
export function fiscalInvoiceListStatus(statuses: readonly string[]): FiscalInvoiceListStatus {
  const active = statuses.filter((status) => status !== "CANCELLED");
  if (active.includes("REGISTERED")) return "registered";
  if (active.some((status) => status === "FAILED" || status === "BLOCKED")) return "error";
  if (active.includes("PENDING")) return "queued";
  return "not_registered";
}

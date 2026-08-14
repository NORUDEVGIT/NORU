export const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  new: "Order placed",
  placed: "Order placed",
  accepted: "Kitchen accepted",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
  cancelled: "Cancelled",
};

export const CUSTOMER_STATUS_FLOW = [
  "placed",
  "accepted",
  "preparing",
  "ready",
  "served",
] as const;

export function normaliseStatus(status: string): string {
  return status === "new" ? "placed" : status;
}

export function statusLabel(status: string): string {
  return CUSTOMER_STATUS_LABELS[status] ?? "Order placed";
}

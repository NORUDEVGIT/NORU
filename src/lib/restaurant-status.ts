export type RestaurantStatus = "pending" | "approved" | "suspended" | "rejected";

export function deriveStatus(approved: boolean, active: boolean): RestaurantStatus {
  if (approved && active) return "approved";
  if (approved && !active) return "suspended";
  if (!approved && active) return "pending";
  return "rejected";
}

export const STATUS_LABEL: Record<RestaurantStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  suspended: "Suspended",
  rejected: "Rejected",
};

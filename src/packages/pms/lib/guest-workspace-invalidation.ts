/**
 * Centralized Query Invalidation for Guest Profile & Property Setup
 * Phase 1 Foundation
 *
 * Clearly separates configuration invalidation from operational record invalidation.
 */
import type { QueryClient } from "@tanstack/react-query";

export const GUEST_WORKSPACE_CONFIG_QUERY_KEYS = [
  "guest-workspace-config",
  "guest-create-context",
  "pms-card4-profile-types",
  "pms-card4-required-fields",
  "pms-card4-identity-documents",
  "pms-card4-preferences",
  "pms-preference-options",
  "guest-preference-catalogues",
  "pms-card4-company-business",
  "pms-card4-group-types",
  "pms-card4-communication-channels",
  "pms-card4-communication-defaults",
  "pms-company-document-types",
  "company-contract-create-config",
  "travel-agency-step4-config",
  "guest-company-create-context",
  "company-create-context",
  "pms-guest-travel-agent-create-context",
  "pms-corporate-contracts-context",
] as const;

export const GUEST_OPERATIONAL_QUERY_KEYS = [
  "guests",
  "guest",
  "guest-directory-stats",
  "guest-accounts",
  "guest-account",
  "guest-companies",
  "guest-account-links",
] as const;

/**
 * Invalidates all Property Setup Card 4 configuration reads and the operational
 * GuestWorkspaceConfig adapter cache when setup rules are modified.
 */
export function invalidateGuestWorkspaceConfigQueries(
  queryClient: QueryClient,
  restaurantId: string,
): void {
  for (const key of GUEST_WORKSPACE_CONFIG_QUERY_KEYS) {
    void queryClient.invalidateQueries({ queryKey: [key, restaurantId] });
  }
}

/**
 * Invalidates operational guest records, account masters, and directory listings.
 * Does not flush setup configuration caches unnecessarily.
 */
export function invalidateGuestOperationalQueries(
  queryClient: QueryClient,
  restaurantId: string,
  guestId?: string,
): void {
  void queryClient.invalidateQueries({ queryKey: ["guests", restaurantId] });
  void queryClient.invalidateQueries({ queryKey: ["guest", restaurantId] });
  void queryClient.invalidateQueries({ queryKey: ["guest-directory-stats", restaurantId] });
  void queryClient.invalidateQueries({ queryKey: ["guest-accounts", restaurantId] });
  void queryClient.invalidateQueries({ queryKey: ["guest-account", restaurantId] });
  void queryClient.invalidateQueries({ queryKey: ["guest-companies", restaurantId] });
  void queryClient.invalidateQueries({ queryKey: ["guest-account-links", restaurantId] });
  if (guestId) {
    void queryClient.invalidateQueries({ queryKey: ["guest", restaurantId, guestId] });
    void queryClient.invalidateQueries({ queryKey: ["guest-account", restaurantId, guestId] });
    void queryClient.invalidateQueries({ queryKey: ["company-detail", restaurantId, guestId] });
    void queryClient.invalidateQueries({
      queryKey: ["travel-agent-detail", restaurantId, guestId],
    });
    void queryClient.invalidateQueries({ queryKey: ["group-detail", restaurantId, guestId] });
    void queryClient.invalidateQueries({
      queryKey: ["guest-preferences-workspace", restaurantId, guestId],
    });
  }
}

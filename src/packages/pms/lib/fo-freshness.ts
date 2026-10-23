/**
 * FO-07 freshness bounds for screens that read Housekeeping, Inventory,
 * Cashiering, and Guest Profile.
 *
 * There is no Front Office realtime channel and no copied owner table.
 * A focused desk refetches on window focus. While it stays open it polls
 * on the interval below and does not poll in a background tab.
 * An explicit Refresh invalidates the same reads immediately.
 * Owner-module writes in this session invalidate the Front Office reads
 * they can change.
 */
export const FO_OPERATIONAL_POLL_MS = 30_000;
export const FO_CHECK_IN_POLL_MS = 20_000;

export const FO_FRESHNESS_BOUNDS = {
  rack: "30 seconds while the rack is open, plus window focus and Refresh.",
  arrivals: "30 seconds while Arrivals is open, plus window focus and Refresh.",
  inHouse: "30 seconds while In-House is open, plus window focus and Refresh.",
  departures: "30 seconds while Departures is open, plus window focus and Refresh.",
  exceptions: "30 seconds while Exceptions is open, plus window focus and Refresh.",
  checkIn: "20 seconds while Check-In is open, plus window focus and Refresh.",
} as const;

export function foOperationalQueryOptions(pollMs = FO_OPERATIONAL_POLL_MS) {
  return {
    refetchOnWindowFocus: true as const,
    refetchInterval: pollMs,
    refetchIntervalInBackground: false as const,
    staleTime: 0,
  };
}

type FoQueryClient = {
  invalidateQueries: (filters: { queryKey: readonly unknown[] }) => unknown;
};

const FRONT_OFFICE_OWNER_KEYS = [
  ["front-office"],
  ["fo-ci-v2-unit"],
  ["fo-ci-v2-readiness"],
  ["fo-ci-v2-cashiering"],
  ["fo-ci-v2-guest"],
  ["fo-ci-v2-reservation"],
  ["assignable-rooms"],
  ["fo-arrival-qv"],
  ["reservation-folio"],
] as const;

/** Same-session owner writes: HK, room status/blocks, folio money, guest identity. */
export function invalidateFrontOfficeOwnerReads(queryClient: FoQueryClient) {
  for (const queryKey of FRONT_OFFICE_OWNER_KEYS) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy run URL. Detail now opens on the canonical Night Audit history tab.
 */
export const Route = createFileRoute("/restaurant/cashiering/night-audit/$runId")({
  ssr: false,
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/restaurant/pms/night-audit",
      search: { tab: "history", run: params.runId },
      replace: true,
    });
  },
  component: () => null,
});

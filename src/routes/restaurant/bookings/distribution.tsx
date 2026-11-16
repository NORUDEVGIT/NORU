import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  CARD6_HASH,
  requestCard6DistributionTab,
} from "@/packages/pms/lib/pms-property-setup-card6";

/**
 * Legacy URL kept for backward compatibility.
 * Distribution lives in Settings → Connectivity & Distribution.
 */
export const Route = createFileRoute("/restaurant/bookings/distribution")({
  ssr: false,
  beforeLoad: () => {
    requestCard6DistributionTab();
    throw redirect({ to: "/restaurant/settings", hash: CARD6_HASH, replace: true });
  },
  head: () => ({
    meta: [
      { title: "Redirecting — NORU PMS" },
      { name: "description", content: "This page has moved into NORU Settings." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => null,
});

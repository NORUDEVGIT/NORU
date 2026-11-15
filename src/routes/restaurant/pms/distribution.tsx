import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  CARD6_HASH,
  requestCard6DistributionTab,
} from "@/packages/pms/lib/pms-property-setup-card6";

/** Backward-compatible URL. Distribution lives in Settings → Connectivity & Distribution. */
export const Route = createFileRoute("/restaurant/pms/distribution")({
  ssr: false,
  beforeLoad: () => {
    requestCard6DistributionTab();
    throw redirect({ to: "/restaurant/settings", hash: CARD6_HASH, replace: true });
  },
  component: () => null,
});

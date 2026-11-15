import { createFileRoute, redirect } from "@tanstack/react-router";

const OPEN_GUEST_AGREEMENT_TAB = "noru-open-guest-agreement";

export const Route = createFileRoute("/restaurant/pms/guest-services/agreement")({
  ssr: false,
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(OPEN_GUEST_AGREEMENT_TAB, "1");
    }
    // GuestAgreementWorkspace renders inside Settings → Guest & Services.
    throw redirect({
      to: "/restaurant/settings",
      hash: "guest-services",
    });
  },
});

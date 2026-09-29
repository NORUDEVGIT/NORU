import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { propertySetupRedirectHref } from "@/packages/pms/lib/pms-set1-foundation";

interface SetupSearch {
  card?: string;
  step?: string;
}

export const Route = createFileRoute("/restaurant/pms/setup")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): SetupSearch => ({
    card: typeof search.card === "string" ? search.card : undefined,
    step: typeof search.step === "string" ? search.step : undefined,
  }),
  beforeLoad: async ({ location, search }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/pms/setup" },
      });
    }

    await requireRoutePackage("pms");
    const hashCandidate = search.card ? `#${search.card}` : location.hash;
    const target = propertySetupRedirectHref(hashCandidate);
    const hash = target.includes("#") ? target.split("#")[1] : undefined;
    throw redirect(hash ? { to: "/restaurant/settings", hash } : { to: "/restaurant/settings" });
  },
  component: function SetupRedirect() {
    return null;
  },
});

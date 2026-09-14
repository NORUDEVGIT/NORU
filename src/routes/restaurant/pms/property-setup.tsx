import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { propertySetupRedirectHref } from "@/packages/pms/lib/pms-set1-foundation";

export const Route = createFileRoute("/restaurant/pms/property-setup")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/pms/property-setup" },
      });
    }

    await requireRoutePackage("pms");
    const target = propertySetupRedirectHref(location.hash);
    const hash = target.includes("#") ? target.split("#")[1] : undefined;
    throw redirect(hash ? { to: "/restaurant/settings", hash } : { to: "/restaurant/settings" });
  },
  component: function PropertySetupRedirect() {
    return null;
  },
});

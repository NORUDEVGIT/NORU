import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { SET5_INTEGRATIONS_HREF } from "@/packages/pms/lib/pms-set5-depts-guestsvc";

export const Route = createFileRoute("/restaurant/pms/integrations")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: SET5_INTEGRATIONS_HREF },
      });
    }

    await requireRoutePackage("pms");
    throw redirect({ href: SET5_INTEGRATIONS_HREF });
  },
  head: () => ({
    meta: [
      { title: "Integrations — NORU PMS" },
      { name: "description", content: "Connection status lives in Settings." },
      { property: "og:title", content: "Integrations — NORU PMS" },
      { property: "og:description", content: "Connection status lives in Settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: IntegrationsPmsRedirect,
});

function IntegrationsPmsRedirect() {
  return null;
}

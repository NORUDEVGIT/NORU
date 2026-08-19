import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy compatibility route — the kitchen now lives at /restaurant/kitchen. */
export const Route = createFileRoute("/kitchen/")({
  ssr: false,
  beforeLoad: async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/kitchen" } });
    }
    throw redirect({ to: "/restaurant/kitchen", replace: true });
  },
  component: () => null,
});
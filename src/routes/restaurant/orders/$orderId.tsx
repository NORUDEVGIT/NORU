/**
 * Phase 8F5 — deprecated address. Kept working for bookmarks; redirects to the
 * canonical Restaurant Management order detail, preserving the order id.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/restaurant/orders/$orderId")({
  ssr: false,
  beforeLoad: async ({ params }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: `/restaurant/restaurant-management/orders/${params.orderId}` },
      });
    }
    throw redirect({
      to: "/restaurant/restaurant-management/orders/$orderId",
      params: { orderId: params.orderId },
      replace: true,
    });
  },
  component: () => null,
});

import { createFileRoute, redirect } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin-shell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/settings")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/admin/login" });
  },
  head: () => ({
    meta: [
      { title: "Admin Settings — Garden Table Platform" },
      { name: "description", content: "Platform administration settings and provisioning notes." },
      { property: "og:title", content: "Admin Settings — Garden Table Platform" },
      { property: "og:description", content: "Platform administration settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <AdminShell active="Settings">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Administrator provisioning</p>
          <p className="mt-2">
            There is no public administrator registration. New platform administrators are provisioned only by a
            trusted service-role operation that sets the account type on an existing user account.
          </p>
        </div>
      </div>
    </AdminShell>
  ),
});

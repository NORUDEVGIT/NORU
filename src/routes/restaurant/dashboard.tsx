import { createFileRoute, redirect } from "@tanstack/react-router";
import { CheckCircle2, Clock, CircleDashed } from "lucide-react";
import { RestaurantShell } from "@/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/restaurant/dashboard")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/restaurant/login" });
  },
  head: () => ({
    meta: [
      { title: "Restaurant Dashboard — Garden Table Platform" },
      { name: "description", content: "Manage your restaurant setup and approval status on the Garden Table platform." },
      { property: "og:title", content: "Restaurant Dashboard — Garden Table Platform" },
      { property: "og:description", content: "Your restaurant setup overview." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RestaurantDashboard,
});

function RestaurantDashboard() {
  return (
    <RestaurantShell active="Dashboard">
      {(membership) => {
        const r = membership.restaurant;
        const hasProfile = Boolean(r.address && r.city && r.country);
        return (
          <div className="space-y-6">
            <div className="rounded-2xl border border-border bg-card p-6">
              <h1 className="font-display text-3xl">{r.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">Your role: {membership.role}</p>
              <div className="mt-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
                {r.approved ? (
                  <p className="mt-1 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                    <CheckCircle2 className="size-4" /> Approved
                  </p>
                ) : (
                  <p className="mt-1 inline-flex items-center gap-2 rounded-full bg-amber-500/15 px-3 py-1 text-sm font-semibold text-amber-700 dark:text-amber-400">
                    <Clock className="size-4" /> Pending Approval
                  </p>
                )}
              </div>
              {!r.approved ? (
                <p className="mt-4 rounded-xl bg-muted p-4 text-sm text-muted-foreground">
                  Your restaurant is pending approval. You can keep setting things up, but your restaurant and menu
                  won't be publicly visible to customers until our team approves it.
                </p>
              ) : null}
            </div>

            <section>
              <h2 className="font-display text-xl">Setup</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <SetupCard title="Restaurant Profile" done={hasProfile} note={hasProfile ? "Details saved" : "Add your address details in Settings"} />
                <SetupCard title="Menu Setup" done={false} note="Coming in the next setup phase" />
                <SetupCard title="Tables Setup" done={false} note="Coming in the next setup phase" />
                <SetupCard title="Staff Setup" done={false} note="Coming in the next setup phase" />
              </div>
            </section>
          </div>
        );
      }}
    </RestaurantShell>
  );
}

function SetupCard({ title, done, note }: { title: string; done: boolean; note: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        {done ? <CheckCircle2 className="size-4 text-primary" /> : <CircleDashed className="size-4 text-muted-foreground" />}
        <p className="font-medium">{title}</p>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{note}</p>
    </div>
  );
}
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminShell } from "@/components/admin-shell";
import { supabase } from "@/integrations/supabase/client";
import { getAdminOverview, listAuditLog } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/admin/login" });
  },
  head: () => ({
    meta: [
      { title: "Admin Dashboard — NORU" },
      { name: "description", content: "Platform operations overview: restaurants, approvals and customer totals." },
      { property: "og:title", content: "Admin Dashboard — NORU" },
      { property: "og:description", content: "Platform operations overview." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminDashboard,
});

function AdminDashboard() {
  return (
    <AdminShell active="Dashboard">
      <Metrics />
    </AdminShell>
  );
}

function Metrics() {
  const overview = useServerFn(getAdminOverview);
  const audit = useServerFn(listAuditLog);
  const { data, isLoading } = useQuery({ queryKey: ["admin-overview"], queryFn: () => overview(), retry: false });
  const { data: log } = useQuery({ queryKey: ["admin-audit"], queryFn: () => audit(), retry: false });

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Loading metrics…</p>;

  const cards = [
    { label: "Total restaurants", value: data.totalRestaurants },
    { label: "Pending", value: data.pending },
    { label: "Approved", value: data.approved },
    { label: "Suspended", value: data.suspended },
    { label: "Rejected", value: data.rejected },
    { label: "Total customers", value: data.totalCustomers },
    { label: "Total orders", value: data.totalOrders },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Live platform figures.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{card.label}</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{card.value}</p>
          </div>
        ))}
      </div>

      {data.pending > 0 ? (
        <Link to="/admin/restaurants" search={{ status: "pending" }} className="inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Review {data.pending} pending application{data.pending === 1 ? "" : "s"}
        </Link>
      ) : null}

      <section>
        <h2 className="text-lg font-semibold">Recent admin activity</h2>
        <div className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {(log ?? []).length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No admin actions recorded yet.</p>
          ) : (
            (log ?? []).map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span className="font-medium">{row.action.replace(/_/g, " ")}</span>
                <span className="text-muted-foreground">{row.restaurantName ?? "—"}</span>
                <span className="text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleString()}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

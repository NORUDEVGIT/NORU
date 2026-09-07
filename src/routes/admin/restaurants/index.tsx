import { useState } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminShell, StatusBadge } from "@/core/components/admin-shell";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { listRestaurantsAdmin } from "@/core/lib/admin.functions";
import type { RestaurantStatus } from "@/core/lib/restaurant-status";

const FILTERS = ["all", "pending", "approved", "suspended", "rejected"] as const;
type Filter = (typeof FILTERS)[number];

export const Route = createFileRoute("/admin/restaurants/")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    status: (FILTERS as readonly string[]).includes(String(search['status']))
      ? (search['status'] as Filter)
      : ("all" as Filter),
  }),
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/admin/login" });
  },
  head: () => ({
    meta: [
      { title: "Restaurants — NORU Admin" },
      { name: "description", content: "Review, approve, reject and suspend restaurants registered on the platform." },
      { property: "og:title", content: "Restaurants — NORU Admin" },
      { property: "og:description", content: "Restaurant applications and approvals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <AdminShell active="Restaurants">
      <RestaurantList />
    </AdminShell>
  ),
});

function RestaurantList() {
  const { status } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [query, setQuery] = useState("");
  const fetchAll = useServerFn(listRestaurantsAdmin);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-restaurants"],
    queryFn: () => fetchAll(),
    retry: false,
  });

  const needle = query.trim().toLowerCase();
  const rows = (data ?? [])
    .filter((r) => status === "all" || r.status === (status as RestaurantStatus))
    .filter((r) =>
      !needle ||
      [r.name, r.email, r.city, r.ownerEmail].some((v) => (v ?? "").toLowerCase().includes(needle)),
    );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Restaurants</h1>
        <p className="text-sm text-muted-foreground">All registered restaurants and their operational status.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f}
            size="sm"
            variant={status === f ? "default" : "outline"}
            onClick={() => void navigate({ search: { status: f } })}
            className="capitalize"
          >
            {f}
          </Button>
        ))}
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, email, city or owner"
          className="h-9 w-full sm:w-72"
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading restaurants…</p>
      ) : error ? (
        <p className="text-sm text-destructive">Administrator access required.</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">No restaurants match.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">Restaurant</th>
                <th className="p-3">Contact</th>
                <th className="p-3">Location</th>
                <th className="p-3">Registered</th>
                <th className="p-3">Status</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="p-3">
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.ownerEmail ?? "No owner email"}</p>
                  </td>
                  <td className="p-3">
                    <p>{r.email ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{r.phone ?? "—"}</p>
                  </td>
                  <td className="p-3">{[r.city, r.country].filter(Boolean).join(", ") || "—"}</td>
                  <td className="p-3 whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td className="p-3"><StatusBadge status={r.status} /></td>
                  <td className="p-3 text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link to="/admin/restaurants/$restaurantId" params={{ restaurantId: r.id }}>View</Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

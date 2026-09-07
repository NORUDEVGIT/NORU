import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminShell } from "@/core/components/admin-shell";
import { supabase } from "@/integrations/supabase/client";
import { listCustomersAdmin } from "@/core/lib/admin.functions";

export const Route = createFileRoute("/admin/customers")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/admin/login" });
  },
  head: () => ({
    meta: [
      { title: "Customers — NORU Admin" },
      { name: "description", content: "Read-only directory of customers registered on the NORU platform." },
      { property: "og:title", content: "Customers — NORU Admin" },
      { property: "og:description", content: "Customer directory." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <AdminShell active="Customers">
      <CustomerList />
    </AdminShell>
  ),
});

function CustomerList() {
  const fetchCustomers = useServerFn(listCustomersAdmin);
  const { data, isLoading, error } = useQuery({ queryKey: ["admin-customers"], queryFn: () => fetchCustomers(), retry: false });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
        <p className="text-sm text-muted-foreground">Read-only directory. No authentication data is shown.</p>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading customers…</p>
      ) : error ? (
        <p className="text-sm text-destructive">Administrator access required.</p>
      ) : (data ?? []).length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">No customers yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Phone</th><th className="p-3">Joined</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(data ?? []).map((c) => (
                <tr key={c.id}>
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3">{c.email ?? "—"}</td>
                  <td className="p-3">{c.phone ?? "—"}</td>
                  <td className="p-3 whitespace-nowrap">{new Date(c.joinedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

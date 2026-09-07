import { useState } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminShell, StatusBadge } from "@/components/admin-shell";
import { PackageEntitlementsPanel } from "@/components/admin/package-entitlements-panel";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  approveRestaurant,
  getRestaurantAdmin,
  reactivateRestaurant,
  rejectRestaurant,
  suspendRestaurant,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/restaurants/$restaurantId")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/admin/login" });
  },
  head: () => ({
    meta: [
      { title: "Restaurant Review — NORU Admin" },
      { name: "description", content: "Review a restaurant application and approve, reject, suspend or reactivate it." },
      { property: "og:title", content: "Restaurant Review — NORU Admin" },
      { property: "og:description", content: "Restaurant application review." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <AdminShell active="Restaurants">
      <RestaurantDetail />
    </AdminShell>
  ),
});

function RestaurantDetail() {
  const { restaurantId } = Route.useParams();
  const queryClient = useQueryClient();
  const fetchDetail = useServerFn(getRestaurantAdmin);
  const approve = useServerFn(approveRestaurant);
  const reject = useServerFn(rejectRestaurant);
  const suspend = useServerFn(suspendRestaurant);
  const reactivate = useServerFn(reactivateRestaurant);

  const [reason, setReason] = useState("");
  const [pendingAction, setPendingAction] = useState<null | "approve" | "reject" | "suspend" | "reactivate">(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-restaurant", restaurantId],
    queryFn: () => fetchDetail({ data: { restaurantId } }),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: async (action: "approve" | "reject" | "suspend" | "reactivate") => {
      if (action === "approve") return approve({ data: { restaurantId } });
      if (action === "reject") return reject({ data: { restaurantId, reason } });
      if (action === "suspend") return suspend({ data: { restaurantId, reason } });
      return reactivate({ data: { restaurantId, reason: reason.trim() || null } });
    },
    onSuccess: () => {
      setReason("");
      setPendingAction(null);
      toast.success("Restaurant updated.");
      void queryClient.invalidateQueries({ queryKey: ["admin-restaurant", restaurantId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-audit"] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "That action could not be completed.");
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading restaurant…</p>;
  if (error || !data)
    return (
      <p className="text-sm text-destructive">
        {error instanceof Error ? error.message : "Administrator access required."}
      </p>
    );

  const r = data.restaurant;
  const needsReason = pendingAction === "reject" || pendingAction === "suspend";
  const reasonTooShort = needsReason && reason.trim().length < 5;

  const fields: [string, string | null][] = [
    ["Slug", r.slug],
    ["Email", r.email],
    ["Phone", r.phone],
    ["Address", r.address],
    ["City", r.city],
    ["Postcode", r.postcode],
    ["Country", r.country],
    ["Registered", new Date(r.createdAt).toLocaleString()],
    ["Approved", r.approved ? "Yes" : "No"],
    ["Active", r.active ? "Yes" : "No"],
    ["Approved at", r.approvedAt ? new Date(r.approvedAt).toLocaleString() : null],
    ["Last status change", r.statusUpdatedAt ? new Date(r.statusUpdatedAt).toLocaleString() : null],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/admin/restaurants" search={{ status: "all" }} className="text-sm text-muted-foreground underline underline-offset-4">
            ← Back to restaurants
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{r.name}</h1>
        </div>
        <StatusBadge status={r.status} />
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label}>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="text-sm">{value ?? "—"}</p>
          </div>
        ))}
      </div>

      {r.rejectionReason ? (
        <p className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">Rejection reason: {r.rejectionReason}</p>
      ) : null}
      {r.suspensionReason ? (
        <p className="rounded-xl bg-orange-500/10 p-4 text-sm text-orange-700 dark:text-orange-400">Suspension reason: {r.suspensionReason}</p>
      ) : null}

      <section>
        <h2 className="text-lg font-semibold">Team</h2>
        <div className="mt-2 divide-y divide-border rounded-xl border border-border bg-card">
          {data.team.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No team members.</p>
          ) : (
            data.team.map((m, i) => (
              <div key={i} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span className="font-medium capitalize">{m.role}{m.active ? "" : " (inactive)"}</span>
                <span>{m.name ?? "—"}</span>
                <span className="text-muted-foreground">{m.email ?? "—"}</span>
                <span className="text-muted-foreground">{m.phone ?? "—"}</span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">Actions</h2>
        {pendingAction ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm">
              Confirm: <span className="font-semibold capitalize">{pendingAction}</span> {r.name}?
            </p>
            {pendingAction !== "approve" ? (
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={pendingAction === "reactivate" ? "Optional note" : "Reason (required, min 5 characters)"}
                className="min-h-24"
              />
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={mutation.isPending || reasonTooShort}
                onClick={() => mutation.mutate(pendingAction)}
              >
                {mutation.isPending ? "Working…" : "Confirm"}
              </Button>
              <Button variant="outline" onClick={() => { setPendingAction(null); setReason(""); }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {r.status === "pending" ? (
              <>
                <Button onClick={() => setPendingAction("approve")}>Approve restaurant</Button>
                <Button variant="destructive" onClick={() => setPendingAction("reject")}>Reject application</Button>
              </>
            ) : null}
            {r.status === "approved" ? (
              <Button variant="destructive" onClick={() => setPendingAction("suspend")}>Suspend restaurant</Button>
            ) : null}
            {r.status === "suspended" ? (
              <Button onClick={() => setPendingAction("reactivate")}>Reactivate restaurant</Button>
            ) : null}
            {r.status === "rejected" ? (
              <p className="text-sm text-muted-foreground">
                This application was rejected. Reinstating a rejected application isn't supported in this phase.
              </p>
            ) : null}
          </div>
        )}
      </section>

      <PackageEntitlementsPanel restaurantId={restaurantId} />

      <section>

        <h2 className="text-lg font-semibold">Audit history</h2>
        <div className="mt-2 divide-y divide-border rounded-xl border border-border bg-card">
          {data.audit.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No admin actions recorded for this restaurant.</p>
          ) : (
            data.audit.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span className="font-medium">{a.action.replace(/_/g, " ")}</span>
                <span className="text-muted-foreground">{a.reason ?? "—"}</span>
                <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

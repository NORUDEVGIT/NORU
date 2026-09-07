import { useState } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Search, Star } from "lucide-react";

import { RestaurantShell } from "@/components/restaurant-shell";
import { GuestFormDialog } from "@/components/guests/guest-form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { getGuestsAccess, listGuests, type GuestSummary } from "@/lib/guests.functions";
import type { RestaurantMembership } from "@/lib/restaurant.functions";
import { useRestaurantTime } from "@/state/restaurant-context";

export const Route = createFileRoute("/restaurant/guests/")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/guests" } });
    }
  },
  head: () => ({
    meta: [
      { title: "Guests — Front Office — NORU" },
      {
        name: "description",
        content: "Create and manage guest profiles, contact details, preferences and guest history in NORU.",
      },
      { property: "og:title", content: "Guests — NORU" },
      { property: "og:description", content: "Guest profiles and preferences for your property." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GuestsRoute,
});

function GuestsRoute() {
  return <RestaurantShell active="Guests">{(m) => <GuestsPage membership={m} />}</RestaurantShell>;
}

const ALL = "all";

function GuestsPage({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const { date } = useRestaurantTime();

  const fetchAccess = useServerFn(getGuestsAccess);
  const fetchGuests = useServerFn(listGuests);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(ALL);
  const [vipOnly, setVipOnly] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const accessQuery = useQuery({
    queryKey: ["guests-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });

  const canManage = accessQuery.data?.canManage ?? false;

  const guestsQuery = useQuery({
    queryKey: ["guests", restaurantId, search, status, vipOnly],
    queryFn: () =>
      fetchGuests({
        data: {
          restaurantId,
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(status !== ALL ? { status: status as "active" | "inactive" } : {}),
          ...(vipOnly ? { vipOnly: true } : {}),
        },
      }),
    enabled: canManage,
  });

  function openGuest(id: string) {
    void navigate({ to: "/restaurant/guests/$guestId", params: { guestId: id } });
  }

  if (accessQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading guests…</p>;
  if (!canManage) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl">Front Office</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only owners and managers can access guest profiles for this property.
        </p>
      </div>
    );
  }

  const guests = guestsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Guests</h1>
          <p className="text-sm text-muted-foreground">
            Guest profiles, preferences and history for {membership.restaurant.name}.
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="size-4 sm:mr-2" />
          <span className="hidden sm:inline">New Guest</span>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search name, phone or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Button variant={vipOnly ? "default" : "outline"} onClick={() => setVipOnly((v) => !v)}>
          <Star className="size-4 sm:mr-2" />
          <span className="hidden sm:inline">VIP only</span>
        </Button>
      </div>

      {guestsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading guests…</p>
      ) : guests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No guests match this view yet.
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border border-border md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Guest</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Nationality</th>
                  <th className="px-4 py-3">VIP</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last updated</th>
                </tr>
              </thead>
              <tbody>
                {guests.map((g) => (
                  <tr
                    key={g.id}
                    tabIndex={0}
                    onClick={() => openGuest(g.id)}
                    onKeyDown={(e) => e.key === "Enter" && openGuest(g.id)}
                    className="cursor-pointer border-t border-border transition-colors hover:bg-accent/40"
                  >
                    <td className="px-4 py-3 font-medium">{g.fullName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{g.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{g.email ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{g.nationality ?? "—"}</td>
                    <td className="px-4 py-3">{g.vipStatus ? <VipBadge /> : "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={g.guestStatus} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{date(g.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 md:hidden">
            {guests.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => openGuest(g.id)}
                  className="w-full rounded-2xl border border-border bg-card p-4 text-left"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{g.fullName}</p>
                    <div className="flex items-center gap-1">
                      {g.vipStatus ? <VipBadge /> : null}
                      <StatusBadge status={g.guestStatus} />
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {[g.phone, g.email].filter(Boolean).join(" · ") || "No contact details"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {g.nationality ?? "—"} · updated {date(g.updatedAt)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <GuestFormDialog
        restaurantId={restaurantId}
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={openGuest}
        onOpenExisting={openGuest}
      />
    </div>
  );
}

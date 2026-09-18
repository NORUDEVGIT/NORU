import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Search, Star } from "lucide-react";

import { GuestFormDialog } from "@/packages/pms/components/guests/guest-form-dialog";
import { GuestMergeDialog } from "@/packages/pms/components/guests/guest-merge-dialog";
import { MaskedIdNumber } from "@/packages/pms/components/guests/guest-id-mask";
import {
  GuestRestrictionBadges,
  StatusBadge,
  VipBadge,
} from "@/packages/pms/components/guests/guest-bits";
import {
  GUEST_PROFILE_DETAIL_PATH,
  guestProfileCardSearch,
  type GuestProfileCardId,
} from "@/packages/pms/lib/guest-profile-wave1";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  getGuestDirectoryStats,
  getGuestsAccess,
  listGuests,
} from "@/packages/pms/lib/guests.functions";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { useRestaurantTime } from "@/packages/restaurant-management/state/restaurant-context";

const ALL = "all";

export function GuestDirectoryWorkspace({
  membership,
  compact = false,
  returnCard,
  typeSwitcher,
}: {
  membership: RestaurantMembership;
  compact?: boolean;
  /** Reopen this guest-required card after staff pick another guest. */
  returnCard?: GuestProfileCardId | undefined;
  typeSwitcher?: React.ReactNode;
}) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const { date } = useRestaurantTime();

  const fetchAccess = useServerFn(getGuestsAccess);
  const fetchGuests = useServerFn(listGuests);
  const fetchStats = useServerFn(getGuestDirectoryStats);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(ALL);
  const [vipOnly, setVipOnly] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);

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
  const statsQuery = useQuery({
    queryKey: ["guest-directory-stats", restaurantId],
    queryFn: () => fetchStats({ data: { restaurantId } }),
    enabled: canManage,
    retry: false,
  });

  function openGuest(id: string) {
    void navigate({
      to: GUEST_PROFILE_DETAIL_PATH,
      params: { guestId: id },
      search: guestProfileCardSearch(returnCard),
    });
  }

  if (accessQuery.isLoading)
    return <p className="text-sm text-muted-foreground">Loading guests…</p>;
  if (!canManage) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl">Guest Profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only owners and managers can access guest profiles for this property.
        </p>
      </div>
    );
  }

  const guests = guestsQuery.data ?? [];

  return (
    <div className="space-y-6" data-testid="guest-profile-directory">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {compact ? (
            <h1 className="font-display text-2xl">Guest Profiles</h1>
          ) : (
            <h1 className="font-display text-2xl">Directory</h1>
          )}
          <p className="text-sm text-muted-foreground">
            {compact
              ? "Search, manage and open guest profiles."
              : `Search and open individual guest profiles for ${membership.restaurant.name}.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setMergeOpen(true)}>
            Merge Guests
          </Button>
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="size-4 sm:mr-2" />
            <span className="hidden sm:inline">New Guest</span>
          </Button>
        </div>
      </div>

      {typeSwitcher}

      <div
        className="overflow-x-auto rounded-2xl border border-border bg-card"
        data-testid="guest-directory-kpis"
      >
        <div className="grid min-w-[680px] grid-cols-5 divide-x divide-border">
          <DirectoryKpi label="Total guests" value={statsQuery.data?.totalGuests} />
          <DirectoryKpi label="Active guests" value={statsQuery.data?.activeGuests} />
          <DirectoryKpi label="VIP guests" value={statsQuery.data?.vipGuests} />
          <DirectoryKpi label="Returning guests" value={statsQuery.data?.returningGuests} />
          <DirectoryKpi label="In-house guests" value={statsQuery.data?.inHouseGuests} />
        </div>
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
                  <th className="px-4 py-3">ID number</th>
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
                    <td className="px-4 py-3 font-medium">
                      <span className="flex flex-wrap items-center gap-2">
                        {g.fullName}
                        <GuestRestrictionBadges guest={g} />
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{g.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{g.email ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{g.nationality ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <MaskedIdNumber value={g.idDocumentNumber} />
                    </td>
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
                      <GuestRestrictionBadges guest={g} />
                      <StatusBadge status={g.guestStatus} />
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {[g.phone, g.email].filter(Boolean).join(" · ") || "No contact details"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {g.nationality ?? "—"} · ID <MaskedIdNumber value={g.idDocumentNumber} /> ·
                    updated {date(g.updatedAt)}
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

      <GuestMergeDialog
        restaurantId={restaurantId}
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        onMerged={openGuest}
      />
    </div>
  );
}

function DirectoryKpi({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-xl">{value ?? "—"}</p>
    </div>
  );
}

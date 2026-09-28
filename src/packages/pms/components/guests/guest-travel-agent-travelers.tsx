import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, useNavigate } from "@tanstack/react-router";
import { ExternalLink, Link2, Plus, Search, Trash2, UserCheck, Users, X } from "lucide-react";
import { toast } from "sonner";

import {
  GUEST_PROFILE_DETAIL_PATH,
  guestProfileSearch,
} from "@/packages/pms/lib/guest-profile-wave1";
import {
  TA_LINK_ROLES,
  type TaLinkRole,
} from "@/packages/pms/lib/guest-profile-travel-agency";
import {
  GUEST_RELATIONSHIP_ROLE_LABELS,
  type GuestAccountLink,
} from "@/packages/pms/lib/guest-profile-wave4";
import {
  linkGuestAccountsBulk,
  listGuestAccountLinks,
  unlinkGuestAccount,
} from "@/packages/pms/lib/guest-accounts.functions";
import { guestListItems, listGuests } from "@/packages/pms/lib/guests.functions";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";

export function GuestTravelAgentTravelers({
  restaurantId,
  agencyId,
}: {
  restaurantId: string;
  agencyId: string;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fetchLinks = useServerFn(listGuestAccountLinks);
  const fetchGuests = useServerFn(listGuests);
  const submitBulk = useServerFn(linkGuestAccountsBulk);
  const submitUnlink = useServerFn(unlinkGuestAccount);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [guestSearch, setGuestSearch] = useState("");
  const [selectedGuests, setSelectedGuests] = useState<string[]>([]);
  const [assignRole, setAssignRole] = useState<TaLinkRole>("booker_ta");

  const [selectedLink, setSelectedLink] = useState<GuestAccountLink | null>(null);

  const linksQuery = useQuery({
    queryKey: ["guest-account-links", restaurantId, agencyId],
    queryFn: () => fetchLinks({ data: { restaurantId, accountId: agencyId } }),
    retry: false,
  });

  const guestsQuery = useQuery({
    queryKey: ["guests-pick", restaurantId, guestSearch, "ta-travelers"],
    queryFn: () =>
      fetchGuests({
        data: {
          restaurantId,
          ...(guestSearch.trim() ? { search: guestSearch.trim() } : {}),
          limit: 50,
        },
      }),
    enabled: pickerOpen,
    retry: false,
  });

  const links = linksQuery.data ?? [];

  const linkedGuestKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const link of links) {
      keys.add(`${link.guestId}:${link.role}`);
    }
    return keys;
  }, [links]);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["guest-account-links", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["travel-agent-detail", restaurantId, agencyId] });
  }

  const linkMutation = useMutation({
    mutationFn: () =>
      submitBulk({
        data: { restaurantId, accountId: agencyId, guestIds: selectedGuests, role: assignRole },
      }),
    onSuccess: (result) => {
      if (result.linked === 0 && result.skipped > 0) {
        toast.message("Those guests were already linked with this role.");
      } else {
        toast.success(
          result.skipped > 0
            ? `Linked ${result.linked} guest${result.linked === 1 ? "" : "s"}. ${result.skipped} already linked.`
            : `Linked ${result.linked} guest${result.linked === 1 ? "" : "s"}.`,
        );
      }
      setSelectedGuests([]);
      setPickerOpen(false);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const unlinkMutation = useMutation({
    mutationFn: (linkId: string) =>
      submitUnlink({
        data: { restaurantId, linkId },
      }),
    onSuccess: () => {
      toast.success("Guest unlinked.");
      setSelectedLink(null);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Filtered rows
  const filteredLinks = links.filter((l) => {
    if (roleFilter !== "all" && l.role !== roleFilter) return false;
    if (search.trim()) {
      const term = search.toLowerCase();
      const match =
        l.guestName.toLowerCase().includes(term) ||
        (l.guestEmail && l.guestEmail.toLowerCase().includes(term)) ||
        (l.guestPhone && l.guestPhone.toLowerCase().includes(term));
      if (!match) return false;
    }
    return true;
  });

  // Summary Metrics
  const totalLinked = links.length;
  const activeLinked = links.filter((l) => l.accountStatus === "active").length;
  const bookerTaCount = links.filter((l) => l.role === "booker_ta").length;

  const candidateGuests = guestListItems(guestsQuery.data);

  return (
    <div className="space-y-4" data-testid="travel-agent-travelers">
      {/* Summary Band */}
      <div className="grid grid-cols-2 divide-y divide-[#DDD4C5] rounded-xl border border-[#DDD4C5] bg-white p-2.5 sm:grid-cols-4 sm:divide-y-0 sm:divide-x shadow-sm">
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">Total Linked</span>
          <span className="mt-1 font-mono text-sm font-bold text-[#251605]">{totalLinked}</span>
        </div>
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">Active</span>
          <span className="mt-1 font-mono text-sm font-bold text-[#2E7D32]">{activeLinked}</span>
        </div>
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">Booker TA Role</span>
          <span className="mt-1 font-mono text-sm font-bold text-[#8A641A]">{bookerTaCount}</span>
        </div>
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">Relationship</span>
          <span className="mt-1 text-xs text-[#756A5B]">Guest Account Links</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[#DDD4C5] bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative min-w-48 flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#756A5B]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search linked travelers…"
              className="h-8 pl-8 border-[#DDD4C5] text-xs bg-[#FAF8F5]"
              data-testid="travel-agent-travelers-search"
            />
          </div>

          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="h-8 w-36 border-[#DDD4C5] text-xs bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Roles</SelectItem>
              {TA_LINK_ROLES.map((r) => (
                <SelectItem key={r} value={r} className="text-xs">
                  {GUEST_RELATIONSHIP_ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(search || roleFilter !== "all") && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setRoleFilter("all");
              }}
              className="h-8 text-xs text-[#756A5B]"
            >
              Clear
            </Button>
          )}
        </div>

        <Button
          type="button"
          size="sm"
          onClick={() => setPickerOpen(true)}
          className="bg-[#C89933] text-[#251605] hover:bg-[#B88928] text-xs font-medium"
          data-testid="travel-agent-link-guest-button"
        >
          <Link2 className="mr-1 size-3.5" />
          Link Existing Guest
        </Button>
      </div>

      {/* Dense Table */}
      <div className="overflow-hidden rounded-xl border border-[#DDD4C5] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" data-testid="travel-agent-travelers-table">
            <thead>
              <tr className="border-b border-[#DDD4C5] bg-[#FAF8F5] text-[11px] font-semibold text-[#756A5B] uppercase tracking-wider">
                <th className="px-3.5 py-2.5">Guest</th>
                <th className="px-3 py-2.5">Relationship Role</th>
                <th className="px-3 py-2.5">Email</th>
                <th className="px-3 py-2.5">Phone</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3.5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0EAE1]">
              {linksQuery.isLoading ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-[#756A5B]">
                    Loading linked travelers…
                  </td>
                </tr>
              ) : filteredLinks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[#8C827A] italic">
                    {search || roleFilter !== "all"
                      ? "No travelers match these filters."
                      : "No linked travelers on file."}
                  </td>
                </tr>
              ) : (
                filteredLinks.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelectedLink(row)}
                    className="cursor-pointer transition-colors hover:bg-[#FAF8F5]/80"
                    data-testid={`travel-agent-traveler-row-${row.id}`}
                  >
                    <td className="px-3.5 py-2.5 font-medium text-[#251605]">
                      {row.guestName}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center rounded-full bg-[#F4E9D0] px-2 py-0.5 text-[10px] font-medium text-[#8A641A]">
                        {GUEST_RELATIONSHIP_ROLE_LABELS[row.role as TaLinkRole] ?? row.role}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[#756A5B]">{row.guestEmail ?? "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-[#251605]">{row.guestPhone ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center rounded-full bg-[#E8F5E9] px-2 py-0.5 text-[10px] font-medium text-[#2E7D32]">
                        {row.accountStatus ?? "Active"}
                      </span>
                    </td>
                    <td
                      className="px-3.5 py-2.5 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          asChild
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-[#8A641A] hover:text-[#251605]"
                          title="Open Full Guest Profile"
                        >
                          <Link
                            to={GUEST_PROFILE_DETAIL_PATH}
                            params={{ guestId: row.guestId }}
                            search={guestProfileSearch({ type: "individual" })}
                          >
                            <ExternalLink className="size-3.5" />
                          </Link>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => unlinkMutation.mutate(row.id)}
                          className="h-7 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          title="Unlink Guest"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right-Side Traveler Drawer */}
      <Sheet open={Boolean(selectedLink)} onOpenChange={(open) => { if (!open) setSelectedLink(null); }}>
        <SheetContent side="right" className="border-l border-[#DDD4C5] bg-[#FCFBF9] p-5 sm:max-w-md">
          <SheetHeader className="border-b border-[#DDD4C5] pb-3">
            <SheetTitle className="font-display text-lg font-bold text-[#251605]">
              {selectedLink?.guestName ?? "Traveler Details"}
            </SheetTitle>
            <p className="text-xs text-[#756A5B]">
              Role: {selectedLink ? (GUEST_RELATIONSHIP_ROLE_LABELS[selectedLink.role as TaLinkRole] ?? selectedLink.role) : ""}
            </p>
          </SheetHeader>

          {selectedLink && (
            <div className="mt-4 space-y-4 text-xs">
              <div className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[#756A5B]">Full Name:</span>
                  <span className="font-medium text-[#251605]">{selectedLink.guestName}</span>
                </div>
                {selectedLink.guestEmail && (
                  <div className="flex items-center justify-between">
                    <span className="text-[#756A5B]">Email:</span>
                    <span className="text-[#251605]">{selectedLink.guestEmail}</span>
                  </div>
                )}
                {selectedLink.guestPhone && (
                  <div className="flex items-center justify-between">
                    <span className="text-[#756A5B]">Phone:</span>
                    <span className="font-mono text-[#251605]">{selectedLink.guestPhone}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-[#756A5B]">Status:</span>
                  <span className="capitalize text-[#2E7D32] font-semibold">{selectedLink.accountStatus ?? "Active"}</span>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <Button
                  asChild
                  className="w-full bg-[#C89933] text-[#251605] hover:bg-[#B88928] text-xs font-medium"
                >
                  <Link
                    to={GUEST_PROFILE_DETAIL_PATH}
                    params={{ guestId: selectedLink.guestId }}
                    search={guestProfileSearch({ type: "individual" })}
                  >
                    <ExternalLink className="mr-1.5 size-3.5" />
                    Open Full Guest Profile
                  </Link>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => unlinkMutation.mutate(selectedLink.id)}
                  className="w-full border-rose-200 text-rose-600 hover:bg-rose-50 text-xs"
                >
                  <Trash2 className="mr-1.5 size-3.5" />
                  Unlink from this Travel Agency
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Link Existing Guest Dialog */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">Link Guests to Agency</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div>
              <Label className="text-xs">Relationship Role</Label>
              <Select value={assignRole} onValueChange={(val) => setAssignRole(val as TaLinkRole)}>
                <SelectTrigger className="mt-1 h-8 text-xs border-[#DDD4C5]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TA_LINK_ROLES.map((r) => (
                    <SelectItem key={r} value={r} className="text-xs">
                      {GUEST_RELATIONSHIP_ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Search Guests</Label>
              <Input
                value={guestSearch}
                onChange={(e) => setGuestSearch(e.target.value)}
                placeholder="Search by guest name, email, phone…"
                className="mt-1 h-8 text-xs border-[#DDD4C5]"
              />
            </div>

            <div className="max-h-56 overflow-y-auto rounded-lg border border-[#DDD4C5] divide-y divide-[#F0EAE1]">
              {guestsQuery.isLoading ? (
                <div className="p-4 text-center text-[#756A5B]">Loading guests…</div>
              ) : candidateGuests.length === 0 ? (
                <div className="p-4 text-center text-[#8C827A] italic">No guests match search.</div>
              ) : (
                candidateGuests.map((g) => {
                  const isLinked = linkedGuestKeys.has(`${g.id}:${assignRole}`);
                  const isSelected = selectedGuests.includes(g.id);
                  return (
                    <label
                      key={g.id}
                      className={cn(
                        "flex items-center gap-3 p-2.5 cursor-pointer hover:bg-[#FAF8F5]",
                        isLinked && "opacity-50 cursor-not-allowed",
                      )}
                    >
                      <Checkbox
                        checked={isSelected}
                        disabled={isLinked}
                        onCheckedChange={(checked) => {
                          if (checked) setSelectedGuests((s) => [...s, g.id]);
                          else setSelectedGuests((s) => s.filter((id) => id !== g.id));
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-[#251605]">{g.firstName} {g.lastName}</div>
                        <div className="text-[11px] text-[#756A5B]">
                          {[g.email, g.phone].filter(Boolean).join(" · ") || "No contact info"}
                        </div>
                      </div>
                      {isLinked && (
                        <span className="text-[10px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded">
                          Already linked
                        </span>
                      )}
                    </label>
                  );
                })
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPickerOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={selectedGuests.length === 0 || linkMutation.isPending}
              onClick={() => linkMutation.mutate()}
              className="bg-[#C89933] text-[#251605] hover:bg-[#B88928]"
            >
              Link {selectedGuests.length} Guest{selectedGuests.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const GuestTravelAgentGuestLinks = GuestTravelAgentTravelers;

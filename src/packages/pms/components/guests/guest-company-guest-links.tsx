import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, Crown, ExternalLink, Plus, Search, UserCheck, Users, X } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

import {
  GUEST_PROFILE_DETAIL_PATH,
  guestProfileSearch,
} from "@/packages/pms/lib/guest-profile-wave1";
import {
  COMPANY_LINK_ROLES,
  COMPANY_MULTI_LINK_COPY,
  type CompanyLinkRole,
} from "@/packages/pms/lib/guest-profile-company";
import {
  GUEST_RELATIONSHIP_ROLE_LABELS,
  WAVE4_MIGRATION_UNAVAILABLE,
  WAVE4_UNLINK_COPY,
} from "@/packages/pms/lib/guest-profile-wave4";
import {
  linkGuestAccountsBulk,
  listGuestAccountLinks,
  unlinkGuestAccount,
} from "@/packages/pms/lib/guest-accounts.functions";
import { guestListItems, listGuests } from "@/packages/pms/lib/guests.functions";
import { displayProfileNumber } from "@/packages/pms/lib/guest-profile-listing";
import { StatusBadge } from "@/packages/pms/components/guests/guest-bits";
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
import { cn } from "@/shared/lib/utils";

export function GuestCompanyGuestLinks({
  restaurantId,
  accountId,
  autoOpenPicker = true,
  onClose,
  onLinked,
}: {
  restaurantId: string;
  accountId: string;
  autoOpenPicker?: boolean;
  onClose?: () => void;
  onLinked?: () => void;
}) {
  const queryClient = useQueryClient();
  const fetchLinks = useServerFn(listGuestAccountLinks);
  const fetchGuests = useServerFn(listGuests);
  const submitBulk = useServerFn(linkGuestAccountsBulk);
  const submitUnlink = useServerFn(unlinkGuestAccount);

  const [pickerOpen, setPickerOpen] = useState(autoOpenPicker);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [vipOnly, setVipOnly] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [role, setRole] = useState<CompanyLinkRole>("employer");

  const linksQuery = useQuery({
    queryKey: ["guest-account-links", restaurantId, null, accountId],
    queryFn: () => fetchLinks({ data: { restaurantId, accountId } }),
    retry: false,
  });

  const guestsQuery = useQuery({
    queryKey: ["guests-pick", restaurantId, search, statusFilter, vipOnly, "company-multi"],
    queryFn: () =>
      fetchGuests({
        data: {
          restaurantId,
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(statusFilter !== "all" ? { status: statusFilter } : {}),
          ...(vipOnly ? { vipOnly: true } : {}),
          limit: 50,
        },
      }),
    enabled: pickerOpen,
    retry: false,
  });

  const linkedGuestKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const link of linksQuery.data ?? []) {
      keys.add(`${link.guestId}:${link.role}`);
    }
    return keys;
  }, [linksQuery.data]);

  const linkedGuestIdMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const link of linksQuery.data ?? []) {
      map.set(link.guestId, link.id);
    }
    return map;
  }, [linksQuery.data]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["guest-account-links", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["company-travelers", restaurantId, accountId] });
    void queryClient.invalidateQueries({ queryKey: ["company-detail", restaurantId, accountId] });
  }

  const linkMutation = useMutation({
    mutationFn: () =>
      submitBulk({
        data: { restaurantId, accountId, guestIds: selected, role },
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
      setSelected([]);
      invalidate();
      onLinked?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const linkSingleMutation = useMutation({
    mutationFn: (param: string | { guestId: string; role?: CompanyLinkRole }) => {
      const targetGuestId = typeof param === "string" ? param : param.guestId;
      const targetRole = typeof param === "object" && param.role ? param.role : role;
      return submitBulk({
        data: { restaurantId, accountId, guestIds: [targetGuestId], role: targetRole },
      });
    },
    onSuccess: (result) => {
      if (result.linked > 0) {
        toast.success("Guest linked to this company.");
      } else {
        toast.message("Guest was already linked.");
      }
      invalidate();
      onLinked?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unlinkMutation = useMutation({
    mutationFn: (linkId: string) => submitUnlink({ data: { restaurantId, linkId } }),
    onSuccess: (result) => {
      if (!result.guestRemaining || !result.masterRemaining) {
        toast.error("Unlink should not delete the guest or the master.");
        return;
      }
      toast.success("Guest unlinked. Both parties remain.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unavailable =
    linksQuery.isError &&
    linksQuery.error instanceof Error &&
    linksQuery.error.message === WAVE4_MIGRATION_UNAVAILABLE;

  function toggleGuest(id: string, already: boolean) {
    if (already) return;
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  const guests = guestListItems(guestsQuery.data);

  return (
    <div className="space-y-4" data-testid="company-guest-links">
      {/* Header section with controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DDD4C5] pb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <UserCheck className="size-4 text-[#8A641A]" />
            <h3 className="font-display text-base font-bold text-[#251605]">
              Link Guests from Directory
            </h3>
          </div>
          <p className="text-xs text-[#756A5B]">
            Search individual guests from the directory to directly link or unlink them with this company.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Relationship Role Selector */}
          <div className="flex items-center gap-1.5 text-xs text-[#756A5B]">
            <span className="hidden sm:inline">Role:</span>
            <Select value={role} onValueChange={(value) => setRole(value as CompanyLinkRole)}>
              <SelectTrigger
                data-testid="company-link-role"
                className="h-8 text-xs border-[#DDD4C5] bg-white w-32"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMPANY_LINK_ROLES.map((item) => (
                  <SelectItem key={item} value={item} className="text-xs">
                    {GUEST_RELATIONSHIP_ROLE_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="company-link-guests"
            onClick={() => {
              if (onClose) {
                onClose();
              } else {
                setPickerOpen((open) => !open);
              }
            }}
            className="h-8 border-[#DDD4C5] text-[#251605] hover:bg-[#F7F4EE] text-xs"
          >
            {onClose ? "Done" : pickerOpen ? "Hide Directory" : "Link guests"}
          </Button>
        </div>
      </div>

      {unavailable ? (
        <p className="text-sm text-muted-foreground">{WAVE4_MIGRATION_UNAVAILABLE}</p>
      ) : null}

      {/* Direct Guest Directory Linking Experience */}
      {pickerOpen ? (
        <div className="space-y-3" data-testid="company-link-picker">
          {/* Search & Filter Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#756A5B]" />
              <Input
                data-testid="company-link-guest-search"
                placeholder="Search guest by name, email, phone, profile no., nationality…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs border-[#DDD4C5] bg-white w-full"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#756A5B] hover:text-[#251605]"
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </div>

            <Select
              value={statusFilter}
              onValueChange={(val) => setStatusFilter(val as typeof statusFilter)}
            >
              <SelectTrigger className="h-8 text-xs border-[#DDD4C5] bg-white w-28">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant={vipOnly ? "secondary" : "outline"}
              size="sm"
              onClick={() => setVipOnly((v) => !v)}
              className={cn(
                "h-8 text-xs border-[#DDD4C5]",
                vipOnly ? "bg-amber-100 text-amber-900 border-amber-300 font-semibold" : "bg-white text-[#251605]",
              )}
            >
              <Crown className="mr-1 size-3 text-[#8A641A]" />
              VIP Only
            </Button>

            {selected.length > 0 ? (
              <Button
                type="button"
                size="sm"
                data-testid="company-link-confirm"
                disabled={linkMutation.isPending}
                onClick={() => linkMutation.mutate()}
                className="h-8 text-xs bg-[#C89933] text-[#251605] hover:bg-[#B88928] font-medium"
              >
                {linkMutation.isPending ? "Linking…" : `Link Selected (${selected.length})`}
              </Button>
            ) : null}
          </div>

          {/* Guest Directory Table */}
          <div className="overflow-x-auto rounded-xl border border-[#DDD4C5] bg-white shadow-sm">
            <table className="w-full min-w-[700px] text-xs text-left" data-testid="company-link-guest-table">
              <thead className="border-b border-[#DDD4C5] bg-[#FAF8F5] text-[11px] font-semibold uppercase tracking-wider text-[#756A5B]">
                <tr>
                  <th className="w-8 px-3 py-2.5">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="px-3 py-2.5">Profile No.</th>
                  <th className="px-3 py-2.5">Guest Name</th>
                  <th className="px-3 py-2.5">Contact Details</th>
                  <th className="px-3 py-2.5">Nationality</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="w-36 px-3 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFE9DF]/60">
                {guestsQuery.isLoading ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-xs text-[#756A5B]">
                      Searching guests…
                    </td>
                  </tr>
                ) : guests.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-xs text-[#756A5B]">
                      {search ? `No guests found matching "${search}".` : "No individual guests found."}
                    </td>
                  </tr>
                ) : (
                  guests.map((guest) => {
                    const isLinked = linkedGuestKeys.has(`${guest.id}:${role}`) || linkedGuestIdMap.has(guest.id);
                    const linkId = linkedGuestIdMap.get(guest.id);
                    const checked = selected.includes(guest.id);

                    return (
                      <tr
                        key={guest.id}
                        className={cn(
                          "hover:bg-[#FAF8F5]/80 transition-colors",
                          isLinked && "bg-[#FAF8F5]/40",
                        )}
                        data-testid="company-link-guest-row"
                      >
                        <td className="px-3 py-2.5">
                          <Checkbox
                            data-testid="company-link-guest-checkbox"
                            checked={isLinked || checked}
                            disabled={isLinked}
                            onCheckedChange={() => toggleGuest(guest.id, isLinked)}
                            aria-label={`Select ${guest.fullName}`}
                          />
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-[#756A5B]">
                          {displayProfileNumber(guest.id, guest.profileNumber)}
                        </td>
                        <td className="px-3 py-2.5 font-medium text-[#251605]">
                          <div className="flex items-center gap-2">
                            <div className="flex size-6 items-center justify-center rounded-full bg-[#F4E9D0] text-[10px] font-bold text-[#8A641A]">
                              {guest.fullName.slice(0, 2).toUpperCase()}
                            </div>
                            <span className="font-semibold">{guest.fullName}</span>
                            {guest.vipStatus ? (
                              <Crown
                                className="size-3 fill-[#8C6D23] text-[#8C6D23]"
                                title="VIP Guest"
                              />
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-[#756A5B]">
                          <div className="space-y-0.5">
                            {guest.phone ? <span className="block font-mono text-[11px] text-[#251605]">{guest.phone}</span> : null}
                            {guest.email ? <span className="block text-[10px] text-[#756A5B] truncate max-w-[140px]">{guest.email}</span> : null}
                            {!guest.phone && !guest.email ? <span className="text-[#8C827A]">—</span> : null}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-[#251605]">{guest.nationality ?? "—"}</td>
                        <td className="px-3 py-2.5">
                          <StatusBadge status={guest.guestStatus} />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {isLinked ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                <Check className="size-2.5" /> Linked
                              </span>
                              {linkId ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  data-testid="company-unlink-guest"
                                  disabled={unlinkMutation.isPending}
                                  onClick={() => unlinkMutation.mutate(linkId)}
                                  className="h-6 px-2 text-[11px] border-[#DDD4C5] text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                                >
                                  Unlink
                                </Button>
                              ) : null}
                            </div>
                          ) : (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  size="sm"
                                  data-testid="company-link-guest-btn"
                                  disabled={linkSingleMutation.isPending}
                                  className="h-6 px-2 text-[11px] bg-[#C89933] text-[#251605] hover:bg-[#B88928] font-medium inline-flex items-center gap-1"
                                >
                                  <Plus className="size-3" /> Link
                                  <ChevronDown className="size-3 opacity-75" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem
                                  data-testid="company-link-option-employer"
                                  onClick={() => linkSingleMutation.mutate({ guestId: guest.id, role: "employer" })}
                                  className="text-xs cursor-pointer flex items-center justify-between"
                                >
                                  <span className="font-medium">Employer</span>
                                  {role === "employer" ? (
                                    <span className="text-[10px] text-muted-foreground font-normal">(Default)</span>
                                  ) : null}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  data-testid="company-link-option-bill-to"
                                  onClick={() => linkSingleMutation.mutate({ guestId: guest.id, role: "bill_to" })}
                                  className="text-xs cursor-pointer flex items-center justify-between"
                                >
                                  <span className="font-medium">Bill To</span>
                                  {role === "bill_to" ? (
                                    <span className="text-[10px] text-muted-foreground font-normal">(Default)</span>
                                  ) : null}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Collapsed / Summary of Linked Guests */
        <div className="space-y-2">
          {linksQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading linked guests…</p>
          ) : (linksQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="company-linked-empty">
              No guests linked yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {(linksQuery.data ?? []).map((link) => (
                <li
                  key={link.id}
                  data-testid="company-linked-guest-row"
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 bg-[#FAF8F5]/60"
                >
                  <div>
                    <p className="text-sm font-medium">
                      <Link
                        to={GUEST_PROFILE_DETAIL_PATH}
                        params={{ guestId: link.guestId }}
                        search={guestProfileSearch({ card: "relationships" })}
                        className="hover:underline text-[#251605]"
                      >
                        {link.guestName}
                      </Link>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {GUEST_RELATIONSHIP_ROLE_LABELS[link.role]}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="company-unlink-guest"
                    disabled={unlinkMutation.isPending}
                    onClick={() => unlinkMutation.mutate(link.id)}
                    className="h-7 text-xs border-[#DDD4C5] text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                  >
                    Unlink
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="text-[11px] text-[#756A5B] italic">{WAVE4_UNLINK_COPY}</p>
    </div>
  );
}

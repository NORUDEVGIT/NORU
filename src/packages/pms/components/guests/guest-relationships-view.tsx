import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Building2,
  Check,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserCheck,
  Users,
  X,
} from "lucide-react";

import {
  GUEST_ACCOUNT_TYPE_LABELS,
  GUEST_RELATIONSHIP_ROLE_LABELS,
  GUEST_RELATIONSHIP_ROLES,
  ROLE_ACCOUNT_TYPE,
  WAVE4_UNLINK_COPY,
  accountListItems,
  accountTypeToProfileType,
  rolesForAccountType,
  type GuestAccountType,
  type GuestRelationshipRole,
} from "@/packages/pms/lib/guest-profile-wave4";
import {
  GUEST_PROFILE_DETAIL_PATH,
  guestProfileSearch,
} from "@/packages/pms/lib/guest-profile-wave1";
import {
  linkGuestAccount,
  listGuestAccountLinks,
  listGuestAccounts,
  unlinkGuestAccount,
  type GuestAccountLinkItem,
} from "@/packages/pms/lib/guest-accounts.functions";
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";

export function GuestRelationshipsView({
  restaurantId,
  guestId,
  accountId,
  accountType,
}: {
  restaurantId: string;
  guestId?: string | undefined;
  accountId?: string | undefined;
  accountType?: GuestAccountType | undefined;
}) {
  const queryClient = useQueryClient();
  const fetchLinks = useServerFn(listGuestAccountLinks);
  const fetchAccounts = useServerFn(listGuestAccounts);
  const submitLink = useServerFn(linkGuestAccount);
  const submitUnlink = useServerFn(unlinkGuestAccount);

  const [role, setRole] = useState<GuestRelationshipRole>(
    accountType ? (rolesForAccountType(accountType)[0] ?? "employer") : "employer",
  );
  const [targetId, setTargetId] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [unlinkLinkId, setUnlinkLinkId] = useState<string | null>(null);

  const sideType: GuestAccountType = accountType ?? ROLE_ACCOUNT_TYPE[role];

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(search);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [search]);

  function handleRoleChange(newRole: GuestRelationshipRole) {
    setRole(newRole);
    setTargetId("");
    setSearch("");
    setDebouncedSearch("");
  }

  function handleDrawerOpenChange(open: boolean) {
    setDrawerOpen(open);
    if (!open) {
      setTargetId("");
      setSearch("");
      setDebouncedSearch("");
    }
  }

  const linksQuery = useQuery({
    queryKey: ["guest-account-links", restaurantId, guestId ?? null, accountId ?? null],
    queryFn: () =>
      fetchLinks({
        data: {
          restaurantId,
          ...(guestId ? { guestId } : {}),
          ...(accountId ? { accountId } : {}),
        },
      }),
    retry: false,
  });

  const accountsQuery = useQuery({
    queryKey: ["guest-accounts-pick", restaurantId, sideType, debouncedSearch],
    queryFn: () =>
      fetchAccounts({
        data: {
          restaurantId,
          accountType: sideType,
          ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
          limit: 25,
        },
      }),
    enabled: Boolean(guestId && drawerOpen),
    retry: false,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["guest-account-links", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["guest", restaurantId, guestId] });
  }

  const linkMutation = useMutation({
    mutationFn: async () => {
      if (!targetId) throw new Error("Please select an account to link.");
      if (guestId) {
        return submitLink({ data: { restaurantId, guestId, accountId: targetId, role } });
      }
      if (accountId) {
        return submitLink({ data: { restaurantId, guestId: targetId, accountId, role } });
      }
      throw new Error("Missing active profile context.");
    },
    onSuccess: () => {
      toast.success("Relationship linked successfully.");
      setTargetId("");
      setDrawerOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unlinkMutation = useMutation({
    mutationFn: (linkId: string) => submitUnlink({ data: { restaurantId, linkId } }),
    onSuccess: (result) => {
      if (!result.guestRemaining || !result.masterRemaining) {
        toast.error("Unlink error: profiles could not be preserved.");
        return;
      }
      toast.success("Relationship unlinked. Both profiles remain intact.");
      setUnlinkLinkId(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const links = linksQuery.data ?? [];
  const companyCount = links.filter((l) => (l.masterType ?? l.accountType) === "company").length;
  const agencyCount = links.filter((l) => (l.masterType ?? l.accountType) === "travel_agent").length;
  const groupCount = links.filter((l) => (l.masterType ?? l.accountType) === "group").length;

  const selectableAccounts = accountListItems(accountsQuery.data ?? []);
  const existingMasterIds = useMemo(() => {
    return new Set(links.map((l) => l.masterId ?? l.accountId).filter(Boolean));
  }, [links]);
  const selectedAccount = useMemo(() => {
    if (!targetId) return null;
    return selectableAccounts.find((acc) => acc.id === targetId) ?? null;
  }, [targetId, selectableAccounts]);

  return (
    <div className="space-y-4" data-testid="guest-relationships">
      {/* Top Summary Bar & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#DDD4C5] bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-[#251605]">Relationships</h2>
            <p className="text-[11px] text-[#756A5B]">
              Manage connections to corporate accounts, travel agencies, and groups.
            </p>
          </div>
          <div className="h-6 w-px bg-[#DDD4C5]" />
          {/* Summary Strip */}
          <div className="flex items-center gap-3 text-xs text-[#251605]" data-testid="guest-relationships-summary">
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="size-3.5 text-[#756A5B]" />
              <span className="text-[#756A5B]">Company:</span>
              <span className="font-semibold">{companyCount}</span>
            </span>
            <span className="text-[#DDD4C5]">·</span>
            <span className="inline-flex items-center gap-1.5">
              <UserCheck className="size-3.5 text-[#756A5B]" />
              <span className="text-[#756A5B]">Travel Agency:</span>
              <span className="font-semibold">{agencyCount}</span>
            </span>
            <span className="text-[#DDD4C5]">·</span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-3.5 text-[#756A5B]" />
              <span className="text-[#756A5B]">Group:</span>
              <span className="font-semibold">{groupCount}</span>
            </span>
          </div>
        </div>

        <Button
          size="sm"
          onClick={() => {
            setSearch("");
            setTargetId("");
            setDrawerOpen(true);
          }}
          className="h-8 text-xs bg-[#8A641A] hover:bg-[#725215] text-white shadow-sm font-medium transition-colors"
          data-testid="guest-relationships-link-button"
        >
          <Plus className="mr-1.5 size-3.5" /> + Link Relationship
        </Button>
      </div>

      {/* Dense Relationships Table */}
      <div className="rounded-xl border border-[#DDD4C5] bg-white shadow-sm overflow-hidden">
        {linksQuery.isLoading ? (
          <div className="p-8 text-center text-xs text-[#756A5B] flex items-center justify-center gap-2">
            <RefreshCw className="size-3.5 animate-spin text-[#8A641A]" />
            <span>Loading relationships…</span>
          </div>
        ) : links.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <p className="text-xs font-medium text-[#251605]">No relationships linked yet.</p>
            <p className="text-[11px] text-[#756A5B]">
              Link this guest to an employer company, travel agency booker, or event group.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" data-testid="guest-relationships-table">
              <thead className="bg-[#FAF8F5] text-[11px] font-semibold text-[#756A5B] border-b border-[#DDD4C5]">
                <tr>
                  <th className="px-3.5 py-2.5">Account Name</th>
                  <th className="px-3.5 py-2.5">Type</th>
                  <th className="px-3.5 py-2.5">Relationship / Role</th>
                  <th className="px-3.5 py-2.5">Billing & Settlement</th>
                  <th className="px-3.5 py-2.5">Contact Details</th>
                  <th className="px-3.5 py-2.5">Linked Date</th>
                  <th className="px-3.5 py-2.5">Status</th>
                  <th className="px-3.5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDD4C5]">
                {links.map((link) => {
                  const accountType = link.masterType ?? link.accountType ?? "company";
                  const accountId = link.masterId ?? link.accountId;
                  const accountName = link.masterName ?? link.accountName ?? "Account";
                  const targetProfileType = accountTypeToProfileType(accountType);

                  return (
                    <tr
                      key={link.id}
                      className="bg-white hover:bg-[#F7F4EE]/50 transition-colors"
                      data-testid="guest-relationship-row"
                    >
                      {/* Connected Account */}
                      <td className="px-3.5 py-2.5 font-medium text-[#251605]">
                        <div className="flex flex-col gap-0.5">
                          {targetProfileType && accountId ? (
                            <Link
                              to={GUEST_PROFILE_DETAIL_PATH}
                              search={guestProfileSearch({
                                type: targetProfileType,
                                id: accountId,
                              })}
                              className="inline-flex items-center gap-1 font-semibold text-[#8A641A] hover:underline"
                            >
                              <span>{accountName}</span>
                              <ExternalLink className="size-3" />
                            </Link>
                          ) : (
                            <span className="font-semibold text-[#251605]">{accountName}</span>
                          )}
                          {link.masterCode && (
                            <span className="font-mono text-[10px] text-[#756A5B]">
                              Code: {link.masterCode}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Account Type */}
                      <td className="px-3.5 py-2.5">
                        <Badge
                          variant="outline"
                          className="border-[#DDD4C5] bg-[#FAF8F5] text-[10px] text-[#756A5B] inline-flex items-center gap-1 font-normal"
                        >
                          {accountType === "company" ? (
                            <Building2 className="size-2.5" />
                          ) : accountType === "travel_agent" ? (
                            <UserCheck className="size-2.5" />
                          ) : (
                            <Users className="size-2.5" />
                          )}
                          {GUEST_ACCOUNT_TYPE_LABELS[accountType] ?? accountType}
                        </Badge>
                      </td>

                      {/* Relationship / Role */}
                      <td className="px-3.5 py-2.5">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border",
                            link.role === "bill_to"
                              ? "bg-blue-50 text-blue-800 border-blue-200"
                              : link.role === "employer"
                                ? "bg-amber-50 text-amber-800 border-amber-200"
                                : "bg-purple-50 text-purple-800 border-purple-200",
                          )}
                        >
                          {GUEST_RELATIONSHIP_ROLE_LABELS[link.role] ?? link.role}
                        </span>
                      </td>

                      {/* Billing & Settlement */}
                      <td className="px-3.5 py-2.5">
                        {link.creditAccountEnabled ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 border border-emerald-200">
                              Direct Bill
                            </span>
                            {link.paymentTerms && (
                              <p className="text-[10px] text-[#756A5B]">{link.paymentTerms}</p>
                            )}
                          </div>
                        ) : link.paymentTerms ? (
                          <span className="text-[11px] text-[#251605]">{link.paymentTerms}</span>
                        ) : (
                          <span className="text-[11px] text-[#756A5B] italic">Folio Settlement</span>
                        )}
                      </td>

                      {/* Contact Details */}
                      <td className="px-3.5 py-2.5">
                        {link.primaryContactName ? (
                          <div>
                            <p className="font-medium text-[#251605]">{link.primaryContactName}</p>
                            <p className="text-[10px] text-[#756A5B]">{link.masterEmail || link.masterPhone || ""}</p>
                          </div>
                        ) : link.masterEmail || link.masterPhone ? (
                          <div className="text-[11px] text-[#756A5B]">
                            {link.masterEmail && <p>{link.masterEmail}</p>}
                            {link.masterPhone && <p className="font-mono text-[10px]">{link.masterPhone}</p>}
                          </div>
                        ) : (
                          <span className="text-[#756A5B]">—</span>
                        )}
                      </td>

                      {/* Linked Date */}
                      <td className="px-3.5 py-2.5 text-[#756A5B]">
                        {link.createdAt ? formatStayDate(link.createdAt) : "—"}
                      </td>

                      {/* Status */}
                      <td className="px-3.5 py-2.5">
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                          <span className="size-1.5 rounded-full bg-emerald-600" />
                          <span className="capitalize">{link.masterStatus ?? "Active"}</span>
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-3.5 py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setUnlinkLinkId(link.id)}
                          className="h-7 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                        >
                          <Trash2 className="mr-1 size-3" /> Unlink
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Right-Side Drawer for Link Relationship */}
      <Sheet open={drawerOpen} onOpenChange={handleDrawerOpenChange}>
        <SheetContent className="w-full sm:max-w-md border-l border-[#DDD4C5] bg-white p-0 text-[#251605]">
          <div className="flex h-full flex-col">
            <SheetHeader className="border-b border-[#DDD4C5] p-4 text-left bg-[#FAF8F5]">
              <SheetTitle className="font-display text-base font-semibold text-[#251605]">
                Link Relationship
              </SheetTitle>
              <SheetDescription className="text-xs text-[#756A5B]">
                Connect this profile to an employer, booking agency, or group.
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {/* Role Selection */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-[#251605]">1. Relationship Role</Label>
                <Select value={role} onValueChange={(val) => handleRoleChange(val as GuestRelationshipRole)}>
                  <SelectTrigger className="h-8 text-xs border-[#DDD4C5] bg-white text-[#251605]">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent className="border-[#DDD4C5] bg-white text-xs">
                    {GUEST_RELATIONSHIP_ROLES.map((r) => {
                      const accType = ROLE_ACCOUNT_TYPE[r];
                      return (
                        <SelectItem key={r} value={r}>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-[#251605]">{GUEST_RELATIONSHIP_ROLE_LABELS[r]}</span>
                            <span className="text-[10px] text-[#756A5B]">({GUEST_ACCOUNT_TYPE_LABELS[accType]})</span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1.5 text-[11px] text-[#756A5B] bg-[#FAF8F5] px-2.5 py-1.5 rounded border border-[#DDD4C5]/60">
                  {sideType === "company" ? (
                    <Building2 className="size-3.5 text-[#8A641A] shrink-0" />
                  ) : sideType === "travel_agent" ? (
                    <UserCheck className="size-3.5 text-[#8A641A] shrink-0" />
                  ) : (
                    <Users className="size-3.5 text-[#8A641A] shrink-0" />
                  )}
                  <span>
                    Role <strong>{GUEST_RELATIONSHIP_ROLE_LABELS[role]}</strong> searches{" "}
                    <strong>{GUEST_ACCOUNT_TYPE_LABELS[sideType]}</strong> master records.
                  </span>
                </div>
              </div>

              {/* Merged Search & Pick Account */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-[#251605]">
                    2. Select {GUEST_ACCOUNT_TYPE_LABELS[sideType]}
                  </Label>
                  {accountsQuery.isFetching && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-[#756A5B]">
                      <Loader2 className="size-3 animate-spin text-[#8A641A]" />
                      Searching...
                    </span>
                  )}
                </div>

                {/* Unified Search & Limited List Box */}
                <div className="overflow-hidden rounded-lg border border-[#DDD4C5] bg-white shadow-xs">
                  {/* Search Input Bar */}
                  <div className="relative border-b border-[#DDD4C5] bg-[#FAF8F5]/80 p-2">
                    <Search className="absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-[#756A5B]" />
                    <Input
                      placeholder={`Search ${GUEST_ACCOUNT_TYPE_LABELS[sideType].toLowerCase()}s by name, code, email...`}
                      className="h-8 pl-8 pr-8 text-xs border-[#DDD4C5] bg-white text-[#251605] placeholder:text-[#9B9183]"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearch("");
                          setDebouncedSearch("");
                        }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-[#756A5B] hover:text-[#251605]"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Scrollable Accounts List */}
                  <div className="max-h-60 overflow-y-auto divide-y divide-[#DDD4C5]/60 p-1">
                    {accountsQuery.isLoading ? (
                      <div className="flex items-center justify-center p-6 text-xs text-[#756A5B] gap-2">
                        <Loader2 className="size-4 animate-spin text-[#8A641A]" />
                        Loading {GUEST_ACCOUNT_TYPE_LABELS[sideType].toLowerCase()}s...
                      </div>
                    ) : selectableAccounts.length === 0 ? (
                      <div className="p-6 text-center text-xs text-[#756A5B]">
                        {debouncedSearch ? (
                          <>
                            <p className="font-medium text-[#251605]">No matches found</p>
                            <p className="text-[11px] mt-0.5">
                              No {GUEST_ACCOUNT_TYPE_LABELS[sideType].toLowerCase()}s match &ldquo;{debouncedSearch}&rdquo;.
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="font-medium text-[#251605]">
                              No {GUEST_ACCOUNT_TYPE_LABELS[sideType].toLowerCase()}s available
                            </p>
                            <p className="text-[11px] mt-0.5">
                              Create a new {GUEST_ACCOUNT_TYPE_LABELS[sideType].toLowerCase()} first to link it.
                            </p>
                          </>
                        )}
                      </div>
                    ) : (
                      selectableAccounts.map((acc) => {
                        const isSelected = targetId === acc.id;
                        const isAlreadyLinked = existingMasterIds.has(acc.id);

                        return (
                          <div
                            key={acc.id}
                            onClick={() => {
                              if (!isAlreadyLinked) {
                                setTargetId(acc.id);
                              }
                            }}
                            className={cn(
                              "flex items-center justify-between gap-2.5 p-2 rounded-md text-xs transition-colors",
                              isAlreadyLinked
                                ? "opacity-50 cursor-not-allowed bg-gray-50/50"
                                : isSelected
                                  ? "bg-[#8A641A]/10 border border-[#8A641A]/40 cursor-pointer"
                                  : "hover:bg-[#FAF8F5] cursor-pointer",
                            )}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <div
                                className={cn(
                                  "size-4 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                                  isSelected
                                    ? "border-[#8A641A] bg-[#8A641A] text-white"
                                    : "border-[#DDD4C5] bg-white",
                                )}
                              >
                                {isSelected && <Check className="size-2.5 stroke-[3]" />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-medium text-[#251605] truncate">{acc.name}</span>
                                  {acc.code && (
                                    <span className="font-mono text-[9px] text-[#756A5B] bg-[#FAF8F5] px-1 py-0.2 rounded border border-[#DDD4C5]">
                                      {acc.code}
                                    </span>
                                  )}
                                </div>
                                {(acc.email || acc.phone || acc.tradeName) && (
                                  <p className="text-[10px] text-[#756A5B] truncate mt-0.5">
                                    {acc.tradeName ? `(${acc.tradeName}) ` : ""}
                                    {acc.email || acc.phone || ""}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="shrink-0 text-right">
                              {isAlreadyLinked ? (
                                <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-600">
                                  Already linked
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 capitalize">
                                  <span className="size-1.5 rounded-full bg-emerald-600" />
                                  {acc.accountStatus}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* List Footer Count */}
                  <div className="border-t border-[#DDD4C5] bg-[#FAF8F5] px-3 py-1.5 text-[10px] text-[#756A5B] flex items-center justify-between">
                    <span>
                      Showing {selectableAccounts.length}
                      {accountsQuery.data?.total !== undefined && accountsQuery.data.total > selectableAccounts.length
                        ? ` of ${accountsQuery.data.total}`
                        : ""}{" "}
                      {GUEST_ACCOUNT_TYPE_LABELS[sideType].toLowerCase()}s
                    </span>
                    {debouncedSearch && (
                      <span className="text-[#8A641A] font-medium">Filtered</span>
                    )}
                  </div>
                </div>

                {/* Selected Confirmation Banner */}
                {selectedAccount && (
                  <div className="rounded-lg border border-[#8A641A]/30 bg-[#FAF8F5] p-2.5 flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] uppercase font-semibold text-[#8A641A] tracking-wider">
                        Ready to link
                      </p>
                      <p className="font-medium text-xs text-[#251605] truncate">
                        {selectedAccount.name} {selectedAccount.code ? `(${selectedAccount.code})` : ""}
                      </p>
                      <p className="text-[10px] text-[#756A5B]">
                        As {GUEST_RELATIONSHIP_ROLE_LABELS[role]} ({GUEST_ACCOUNT_TYPE_LABELS[sideType]})
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setTargetId("")}
                      className="h-6 text-[10px] text-[#756A5B] hover:text-rose-600 px-2"
                    >
                      Clear
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-[#DDD4C5] p-4 bg-[#FAF8F5] flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDrawerOpenChange(false)}
                className="h-8 text-xs border-[#DDD4C5] bg-white text-[#756A5B]"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!targetId || linkMutation.isPending}
                onClick={() => linkMutation.mutate()}
                className="h-8 text-xs bg-[#8A641A] hover:bg-[#725215] text-white font-medium"
              >
                {linkMutation.isPending ? "Linking…" : "Link Relationship"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Confirmation Dialog for Unlink */}
      <AlertDialog open={unlinkLinkId !== null} onOpenChange={(open) => !open && setUnlinkLinkId(null)}>
        <AlertDialogContent className="border-[#DDD4C5] bg-white text-[#251605]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-base font-semibold text-[#251605]">
              Unlink Relationship?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-[#756A5B]">
              {WAVE4_UNLINK_COPY} Both the guest profile and the linked master account will remain in the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs border-[#DDD4C5] bg-white text-[#756A5B]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (unlinkLinkId) unlinkMutation.mutate(unlinkLinkId);
              }}
              className="h-8 text-xs bg-rose-600 hover:bg-rose-700 text-white font-medium"
            >
              Unlink
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

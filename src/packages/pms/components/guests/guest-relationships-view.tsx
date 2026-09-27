import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Building2,
  ExternalLink,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserCheck,
  Users,
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [unlinkLinkId, setUnlinkLinkId] = useState<string | null>(null);

  const sideType: GuestAccountType = accountType ?? ROLE_ACCOUNT_TYPE[role];

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
    queryKey: ["guest-accounts-pick", restaurantId, sideType, search],
    queryFn: () =>
      fetchAccounts({
        data: {
          restaurantId,
          accountType: sideType,
          ...(search.trim() ? { search: search.trim() } : {}),
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
  const companyCount = links.filter((l) => l.accountType === "company").length;
  const agencyCount = links.filter((l) => l.accountType === "travel_agent").length;
  const groupCount = links.filter((l) => l.accountType === "group").length;

  const selectableAccounts = accountListItems(accountsQuery.data ?? []);

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
                  <th className="px-3.5 py-2.5">Relationship</th>
                  <th className="px-3.5 py-2.5">Type</th>
                  <th className="px-3.5 py-2.5">Account Name</th>
                  <th className="px-3.5 py-2.5">Role</th>
                  <th className="px-3.5 py-2.5">Linked Date</th>
                  <th className="px-3.5 py-2.5">Status</th>
                  <th className="px-3.5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDD4C5]">
                {links.map((link) => {
                  const targetProfileType = accountTypeToProfileType(link.accountType);
                  const isAccount = link.accountName != null;
                  const displayName = isAccount ? link.accountName : link.guestFullName;
                  return (
                    <tr
                      key={link.id}
                      className="bg-white hover:bg-[#F7F4EE]/50 transition-colors"
                      data-testid="guest-relationship-row"
                    >
                      <td className="px-3.5 py-2.5 font-medium text-[#251605]">
                        {GUEST_RELATIONSHIP_ROLE_LABELS[link.role] ?? link.role}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <Badge
                          variant="outline"
                          className="border-[#DDD4C5] bg-[#FAF8F5] text-[10px] text-[#756A5B]"
                        >
                          {GUEST_ACCOUNT_TYPE_LABELS[link.accountType] ?? link.accountType}
                        </Badge>
                      </td>
                      <td className="px-3.5 py-2.5 font-medium text-[#251605]">
                        {targetProfileType && link.accountId ? (
                          <Link
                            to={GUEST_PROFILE_DETAIL_PATH}
                            search={guestProfileSearch({
                              type: targetProfileType,
                              id: link.accountId,
                            })}
                            className="inline-flex items-center gap-1 text-[#8A641A] hover:underline"
                          >
                            <span>{displayName}</span>
                            <ExternalLink className="size-3" />
                          </Link>
                        ) : (
                          displayName
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 text-[#756A5B]">
                        {GUEST_RELATIONSHIP_ROLE_LABELS[link.role] ?? link.role}
                      </td>
                      <td className="px-3.5 py-2.5 text-[#756A5B]">
                        {link.createdAt ? formatStayDate(link.createdAt) : "—"}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                          <span className="size-1.5 rounded-full bg-emerald-600" /> Active
                        </span>
                      </td>
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
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
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
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-[#756A5B]">Relationship Role</Label>
                <Select
                  value={role}
                  onValueChange={(val) => {
                    setRole(val as GuestRelationshipRole);
                    setTargetId("");
                  }}
                >
                  <SelectTrigger className="h-8 text-xs border-[#DDD4C5] bg-white text-[#251605]">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent className="border-[#DDD4C5] bg-white text-xs">
                    {GUEST_RELATIONSHIP_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {GUEST_RELATIONSHIP_ROLE_LABELS[r]} ({GUEST_ACCOUNT_TYPE_LABELS[ROLE_ACCOUNT_TYPE[r]]})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-[#756A5B]">
                  Search {GUEST_ACCOUNT_TYPE_LABELS[sideType]}
                </Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#756A5B]" />
                  <Input
                    placeholder={`Search ${GUEST_ACCOUNT_TYPE_LABELS[sideType].toLowerCase()} name…`}
                    className="h-8 pl-8 text-xs border-[#DDD4C5] bg-white text-[#251605]"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-[#756A5B]">Select Account</Label>
                <Select value={targetId} onValueChange={setTargetId}>
                  <SelectTrigger className="h-8 text-xs border-[#DDD4C5] bg-white text-[#251605]">
                    <SelectValue placeholder={`Select a ${GUEST_ACCOUNT_TYPE_LABELS[sideType]}`} />
                  </SelectTrigger>
                  <SelectContent className="border-[#DDD4C5] bg-white text-xs max-h-56">
                    {selectableAccounts.length === 0 ? (
                      <div className="p-2 text-center text-[11px] text-[#756A5B]">
                        No matching accounts found.
                      </div>
                    ) : (
                      selectableAccounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border-t border-[#DDD4C5] p-4 bg-[#FAF8F5] flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDrawerOpen(false)}
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

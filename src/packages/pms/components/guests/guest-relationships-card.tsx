import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

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
  GUEST_PROFILE_DETAIL_PATH,
  guestProfileSearch,
} from "@/packages/pms/lib/guest-profile-wave1";
import {
  GUEST_ACCOUNT_TYPE_LABELS,
  GUEST_RELATIONSHIP_ROLE_LABELS,
  GUEST_RELATIONSHIP_ROLES,
  ROLE_ACCOUNT_TYPE,
  WAVE4_BILL_TO_COPY,
  WAVE4_MIGRATION_UNAVAILABLE,
  WAVE4_UNLINK_COPY,
  accountTypeToProfileType,
  accountListItems,
  rolesForAccountType,
  type GuestAccountType,
  type GuestRelationshipRole,
} from "@/packages/pms/lib/guest-profile-wave4";
import {
  linkGuestAccount,
  listGuestAccountLinks,
  listGuestAccounts,
  unlinkGuestAccount,
} from "@/packages/pms/lib/guest-accounts.functions";
import { guestListItems, listGuests } from "@/packages/pms/lib/guests.functions";

export function GuestRelationshipsCard({
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
  const fetchGuests = useServerFn(listGuests);
  const submitLink = useServerFn(linkGuestAccount);
  const submitUnlink = useServerFn(unlinkGuestAccount);

  const [role, setRole] = useState<GuestRelationshipRole>(
    accountType ? (rolesForAccountType(accountType)[0] ?? "employer") : "employer",
  );
  const [targetId, setTargetId] = useState("");
  const [search, setSearch] = useState("");

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
    enabled: Boolean(guestId),
    retry: false,
  });

  const guestsQuery = useQuery({
    queryKey: ["guests-pick", restaurantId, search],
    queryFn: () =>
      fetchGuests({
        data: {
          restaurantId,
          ...(search.trim() ? { search: search.trim() } : {}),
          limit: 25,
        },
      }),
    enabled: Boolean(accountId),
    retry: false,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["guest-account-links", restaurantId] });
  }

  const linkMutation = useMutation({
    mutationFn: async () => {
      if (!targetId) throw new Error("Choose who to link.");
      if (guestId) {
        return submitLink({ data: { restaurantId, guestId, accountId: targetId, role } });
      }
      if (accountId) {
        return submitLink({ data: { restaurantId, guestId: targetId, accountId, role } });
      }
      throw new Error("Open a guest or a master first.");
    },
    onSuccess: () => {
      toast.success("Relationship linked.");
      setTargetId("");
      invalidate();
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
      toast.success("Relationship unlinked. Both parties remain.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unavailable =
    linksQuery.isError &&
    linksQuery.error instanceof Error &&
    linksQuery.error.message === WAVE4_MIGRATION_UNAVAILABLE;

  const roleOptions = accountType ? rolesForAccountType(accountType) : [...GUEST_RELATIONSHIP_ROLES];

  return (
    <div className="space-y-4" data-testid="guest-relationships">
      <div>
        <h2 className="font-display text-xl">Relationships</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Links are visible from both the individual and the master. {WAVE4_UNLINK_COPY} {WAVE4_BILL_TO_COPY}
        </p>
      </div>

      {unavailable ? (
        <p className="text-sm text-muted-foreground">{WAVE4_MIGRATION_UNAVAILABLE}</p>
      ) : linksQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading relationships…</p>
      ) : (linksQuery.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="guest-relationships-empty">
          No relationships linked yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {(linksQuery.data ?? []).map((link) => (
            <li
              key={link.id}
              data-testid="guest-relationship-row"
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium">{GUEST_RELATIONSHIP_ROLE_LABELS[link.role]}</p>
                <p className="text-xs text-muted-foreground">
                  {guestId ? (
                    <Link
                      to={GUEST_PROFILE_DETAIL_PATH}
                      params={{ guestId: link.masterId }}
                      search={guestProfileSearch({
                        card: "relationships",
                        type: accountTypeToProfileType(link.masterType),
                      })}
                    >
                      {link.masterName} · {GUEST_ACCOUNT_TYPE_LABELS[link.masterType]}
                    </Link>
                  ) : (
                    <Link
                      to={GUEST_PROFILE_DETAIL_PATH}
                      params={{ guestId: link.guestId }}
                      search={guestProfileSearch({ card: "relationships" })}
                    >
                      {link.guestName}
                    </Link>
                  )}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                data-testid="guest-relationship-unlink"
                disabled={unlinkMutation.isPending}
                onClick={() => unlinkMutation.mutate(link.id)}
              >
                Unlink
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-3">
        <Select
          value={role}
          onValueChange={(value) => {
            setRole(value as GuestRelationshipRole);
            setTargetId("");
          }}
        >
          <SelectTrigger data-testid="guest-relationship-role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roleOptions.map((item) => (
              <SelectItem key={item} value={item}>
                {GUEST_RELATIONSHIP_ROLE_LABELS[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder={guestId ? "Search masters" : "Search guests"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={targetId || "__none"} onValueChange={(value) => setTargetId(value === "__none" ? "" : value)}>
          <SelectTrigger data-testid="guest-relationship-target">
            <SelectValue placeholder={guestId ? "Choose master" : "Choose guest"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">Choose…</SelectItem>
            {guestId
              ? accountListItems(accountsQuery.data).map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))
              : guestListItems(guestsQuery.data).map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.fullName}
                  </SelectItem>
                ))}
          </SelectContent>
        </Select>
        <div className="sm:col-span-3">
          <Button
            data-testid="guest-relationship-link"
            disabled={linkMutation.isPending}
            onClick={() => linkMutation.mutate()}
          >
            {linkMutation.isPending ? "Linking…" : "Link relationship"}
          </Button>
        </div>
      </div>
    </div>
  );
}

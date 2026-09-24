import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

import {
  GUEST_PROFILE_DETAIL_PATH,
  guestProfileSearch,
} from "@/packages/pms/lib/guest-profile-wave1";
import {
  INDIVIDUAL_LINKING_COPY,
  INDIVIDUAL_LINK_ROLES,
  type IndividualLinkRole,
} from "@/packages/pms/lib/guest-profile-individual";
import {
  GUEST_ACCOUNT_TYPE_LABELS,
  GUEST_RELATIONSHIP_ROLE_LABELS,
  ROLE_ACCOUNT_TYPE,
  WAVE4_MIGRATION_UNAVAILABLE,
  WAVE4_UNLINK_COPY,
  accountListItems,
  accountTypeToProfileType,
} from "@/packages/pms/lib/guest-profile-wave4";
import {
  linkGuestAccount,
  listGuestAccountLinks,
  listGuestAccounts,
  unlinkGuestAccount,
} from "@/packages/pms/lib/guest-accounts.functions";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";

export function GuestIndividualLinks({
  restaurantId,
  guestId,
}: {
  restaurantId: string;
  guestId: string;
}) {
  const queryClient = useQueryClient();
  const fetchLinks = useServerFn(listGuestAccountLinks);
  const fetchAccounts = useServerFn(listGuestAccounts);
  const submitLink = useServerFn(linkGuestAccount);
  const submitUnlink = useServerFn(unlinkGuestAccount);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [targetId, setTargetId] = useState("");
  const [role, setRole] = useState<IndividualLinkRole>("employer");
  const accountType = ROLE_ACCOUNT_TYPE[role];

  const linksQuery = useQuery({
    queryKey: ["guest-account-links", restaurantId, guestId, null],
    queryFn: () => fetchLinks({ data: { restaurantId, guestId } }),
    retry: false,
  });

  const accountsQuery = useQuery({
    queryKey: ["guest-accounts-pick", restaurantId, accountType, search, "individual-link"],
    queryFn: () =>
      fetchAccounts({
        data: {
          restaurantId,
          accountType,
          ...(search.trim() ? { search: search.trim() } : {}),
          limit: 50,
        },
      }),
    enabled: pickerOpen,
    retry: false,
  });

  const linkedKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const link of linksQuery.data ?? []) {
      keys.add(`${link.masterId}:${link.role}`);
    }
    return keys;
  }, [linksQuery.data]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["guest-account-links", restaurantId] });
  }

  const linkMutation = useMutation({
    mutationFn: () => submitLink({ data: { restaurantId, guestId, accountId: targetId, role } }),
    onSuccess: () => {
      toast.success("Master linked.");
      setTargetId("");
      setPickerOpen(false);
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
      toast.success("Master unlinked. Both parties remain.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unavailable =
    linksQuery.isError &&
    linksQuery.error instanceof Error &&
    linksQuery.error.message === WAVE4_MIGRATION_UNAVAILABLE;

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4" data-testid="individual-guest-links">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Linking</p>
          <p className="mt-1 text-sm text-muted-foreground">{INDIVIDUAL_LINKING_COPY}</p>
        </div>
        <Button
          variant="outline"
          data-testid="individual-link-masters"
          onClick={() => setPickerOpen((open) => !open)}
        >
          {pickerOpen ? "Cancel" : "Link master"}
        </Button>
      </div>

      {unavailable ? (
        <p className="text-sm text-muted-foreground">{WAVE4_MIGRATION_UNAVAILABLE}</p>
      ) : linksQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading linked masters…</p>
      ) : (linksQuery.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="individual-linked-empty">
          No Company, Group or Travel Agent masters linked yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {(linksQuery.data ?? []).map((link) => (
            <li
              key={link.id}
              data-testid="individual-linked-master-row"
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium">
                  <Link
                    to={GUEST_PROFILE_DETAIL_PATH}
                    params={{ guestId: link.masterId }}
                    search={guestProfileSearch({
                      card: "relationships",
                      type: accountTypeToProfileType(link.masterType),
                    })}
                  >
                    {link.masterName}
                  </Link>
                </p>
                <p className="text-xs text-muted-foreground">
                  {GUEST_RELATIONSHIP_ROLE_LABELS[link.role]} · {GUEST_ACCOUNT_TYPE_LABELS[link.masterType]}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                data-testid="individual-unlink-master"
                disabled={unlinkMutation.isPending}
                onClick={() => unlinkMutation.mutate(link.id)}
              >
                Unlink
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{WAVE4_UNLINK_COPY}</p>

      {pickerOpen ? (
        <div className="grid gap-3 rounded-xl border border-dashed border-border p-3" data-testid="individual-link-picker">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              value={role}
              onValueChange={(value) => {
                setRole(value as IndividualLinkRole);
                setTargetId("");
              }}
            >
              <SelectTrigger data-testid="individual-link-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INDIVIDUAL_LINK_ROLES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {GUEST_RELATIONSHIP_ROLE_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              data-testid="individual-link-master-search"
              placeholder="Search Company / Group / TA masters"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={targetId || "__none"} onValueChange={(value) => setTargetId(value === "__none" ? "" : value)}>
            <SelectTrigger data-testid="individual-link-master-target">
              <SelectValue placeholder="Choose master" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Choose…</SelectItem>
              {accountListItems(accountsQuery.data).map((row) => {
                const already = linkedKeys.has(`${row.id}:${role}`);
                return (
                  <SelectItem key={row.id} value={row.id} disabled={already}>
                    {row.name}
                    {already ? " · already linked" : ""}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <Button
            data-testid="individual-link-confirm"
            disabled={linkMutation.isPending || !targetId}
            onClick={() => linkMutation.mutate()}
          >
            {linkMutation.isPending ? "Linking…" : "Confirm link"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

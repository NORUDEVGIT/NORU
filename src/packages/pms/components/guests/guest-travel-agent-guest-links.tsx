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
  TA_LINK_ROLES,
  TA_MULTI_LINK_COPY,
  type TaLinkRole,
} from "@/packages/pms/lib/guest-profile-travel-agency";
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
import { listGuests } from "@/packages/pms/lib/guests.functions";
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

export function GuestTravelAgentGuestLinks({
  restaurantId,
  accountId,
}: {
  restaurantId: string;
  accountId: string;
}) {
  const queryClient = useQueryClient();
  const fetchLinks = useServerFn(listGuestAccountLinks);
  const fetchGuests = useServerFn(listGuests);
  const submitBulk = useServerFn(linkGuestAccountsBulk);
  const submitUnlink = useServerFn(unlinkGuestAccount);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [role, setRole] = useState<TaLinkRole>("booker_ta");

  const linksQuery = useQuery({
    queryKey: ["guest-account-links", restaurantId, null, accountId],
    queryFn: () => fetchLinks({ data: { restaurantId, accountId } }),
    retry: false,
  });

  const guestsQuery = useQuery({
    queryKey: ["guests-pick", restaurantId, search, "ta-multi"],
    queryFn: () =>
      fetchGuests({
        data: {
          restaurantId,
          ...(search.trim() ? { search: search.trim() } : {}),
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

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["guest-account-links", restaurantId] });
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

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4" data-testid="ta-guest-links">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Linked guests</p>
          <p className="mt-1 text-sm text-muted-foreground">{TA_MULTI_LINK_COPY}</p>
        </div>
        <Button
          variant="outline"
          data-testid="ta-link-guests"
          onClick={() => setPickerOpen((open) => !open)}
        >
          {pickerOpen ? "Cancel" : "Link guests"}
        </Button>
      </div>

      {unavailable ? (
        <p className="text-sm text-muted-foreground">{WAVE4_MIGRATION_UNAVAILABLE}</p>
      ) : linksQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading linked guests…</p>
      ) : (linksQuery.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="ta-linked-empty">
          No guests linked yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {(linksQuery.data ?? []).map((link) => (
            <li
              key={link.id}
              data-testid="ta-linked-guest-row"
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium">
                  <Link
                    to={GUEST_PROFILE_DETAIL_PATH}
                    params={{ guestId: link.guestId }}
                    search={guestProfileSearch({ card: "relationships" })}
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
                data-testid="ta-unlink-guest"
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
        <div className="grid gap-3 rounded-xl border border-dashed border-border p-3" data-testid="ta-link-picker">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select value={role} onValueChange={(value) => setRole(value as TaLinkRole)}>
              <SelectTrigger data-testid="ta-link-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TA_LINK_ROLES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {GUEST_RELATIONSHIP_ROLE_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              data-testid="ta-link-guest-search"
              placeholder="Search Directory guests"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {guestsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading guests…</p>
            ) : (guestsQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No guests match this search.</p>
            ) : (
              (guestsQuery.data ?? []).map((guest) => {
                const already = linkedGuestKeys.has(`${guest.id}:${role}`);
                const checked = already || selected.includes(guest.id);
                return (
                  <label
                    key={guest.id}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent/40"
                    data-testid="ta-link-guest-row"
                  >
                    <Checkbox
                      data-testid="ta-link-guest-checkbox"
                      checked={checked}
                      disabled={already}
                      onCheckedChange={() => toggleGuest(guest.id, already)}
                    />
                    <span className={already ? "text-muted-foreground" : ""}>
                      {guest.fullName}
                      {already ? " · already linked" : ""}
                    </span>
                  </label>
                );
              })
            )}
          </div>
          <Button
            data-testid="ta-link-confirm"
            disabled={linkMutation.isPending || selected.length === 0}
            onClick={() => linkMutation.mutate()}
          >
            {linkMutation.isPending ? "Linking…" : `Confirm ${selected.length || ""}`.trim()}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

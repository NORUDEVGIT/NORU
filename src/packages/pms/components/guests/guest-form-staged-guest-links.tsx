import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

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
  TA_LINK_ROLES,
  TA_STAGED_LINKING_COPY,
  type StagedGuestLink,
  type TaLinkRole,
} from "@/packages/pms/lib/guest-profile-travel-agency";
import { GUEST_RELATIONSHIP_ROLE_LABELS } from "@/packages/pms/lib/guest-profile-wave4";
import { listGuests } from "@/packages/pms/lib/guests.functions";

export function GuestFormStagedGuestLinks({
  restaurantId,
  links,
  onChange,
}: {
  restaurantId: string;
  links: StagedGuestLink[];
  onChange: (links: StagedGuestLink[]) => void;
}) {
  const fetchGuests = useServerFn(listGuests);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<TaLinkRole>("booker_ta");

  const guestsQuery = useQuery({
    queryKey: ["guests-pick", restaurantId, search, "ta-staged-link"],
    queryFn: () =>
      fetchGuests({
        data: {
          restaurantId,
          ...(search.trim() ? { search: search.trim() } : {}),
          limit: 50,
        },
      }),
    retry: false,
  });

  function toggleGuest(id: string, name: string) {
    const key = `${id}:${role}`;
    if (links.some((link) => link.key === key)) {
      onChange(links.filter((link) => link.key !== key));
      return;
    }
    onChange([...links, { key, guestId: id, guestName: name, role }]);
  }

  return (
    <div className="space-y-3" data-testid="ta-linking-staged">
      <p className="text-xs text-muted-foreground">{TA_STAGED_LINKING_COPY}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          value={role}
          onValueChange={(value) => setRole(value as TaLinkRole)}
        >
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
            const key = `${guest.id}:${role}`;
            const checked = links.some((link) => link.key === key);
            return (
              <label
                key={guest.id}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent/40"
                data-testid="ta-link-guest-row"
              >
                <Checkbox
                  data-testid="ta-link-guest-checkbox"
                  checked={checked}
                  onCheckedChange={() => toggleGuest(guest.id, guest.fullName)}
                />
                <span>{guest.fullName}</span>
              </label>
            );
          })
        )}
      </div>
      {links.length > 0 ? (
        <ul className="space-y-1 text-sm" data-testid="ta-staged-link-list">
          {links.map((link) => (
            <li key={link.key} className="flex items-center justify-between gap-2">
              <span>
                {link.guestName} · {GUEST_RELATIONSHIP_ROLE_LABELS[link.role]}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="ta-staged-link-remove"
                onClick={() => onChange(links.filter((item) => item.key !== link.key))}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

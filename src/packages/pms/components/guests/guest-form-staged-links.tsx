import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

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
  INDIVIDUAL_LINKING_COPY,
  INDIVIDUAL_LINK_ROLES,
  INDIVIDUAL_STAGED_LINKING_COPY,
  type IndividualLinkRole,
} from "@/packages/pms/lib/guest-profile-individual";
import {
  GUEST_ACCOUNT_TYPE_LABELS,
  GUEST_RELATIONSHIP_ROLE_LABELS,
  ROLE_ACCOUNT_TYPE,
} from "@/packages/pms/lib/guest-profile-wave4";
import { listGuestAccounts } from "@/packages/pms/lib/guest-accounts.functions";

export type StagedMasterLink = {
  key: string;
  masterId: string;
  masterName: string;
  role: IndividualLinkRole;
};

export function GuestFormStagedLinks({
  restaurantId,
  links,
  onChange,
}: {
  restaurantId: string;
  links: StagedMasterLink[];
  onChange: (links: StagedMasterLink[]) => void;
}) {
  const fetchAccounts = useServerFn(listGuestAccounts);
  const [search, setSearch] = useState("");
  const [targetId, setTargetId] = useState("");
  const [role, setRole] = useState<IndividualLinkRole>("employer");
  const accountType = ROLE_ACCOUNT_TYPE[role];

  const accountsQuery = useQuery({
    queryKey: ["guest-accounts-pick", restaurantId, accountType, search, "individual-staged-link"],
    queryFn: () =>
      fetchAccounts({
        data: {
          restaurantId,
          accountType,
          ...(search.trim() ? { search: search.trim() } : {}),
          limit: 50,
        },
      }),
    retry: false,
  });

  const chosen = accountsQuery.data?.find((row) => row.id === targetId);

  function add() {
    if (!targetId || !chosen) return;
    const key = `${targetId}:${role}`;
    if (links.some((link) => link.key === key)) return;
    onChange([...links, { key, masterId: targetId, masterName: chosen.name, role }]);
    setTargetId("");
  }

  return (
    <div className="space-y-3" data-testid="individual-linking-staged">
      <p className="text-xs text-muted-foreground">{INDIVIDUAL_STAGED_LINKING_COPY}</p>
      <p className="text-xs text-muted-foreground">{INDIVIDUAL_LINKING_COPY}</p>
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
          {(accountsQuery.data ?? []).map((row) => {
            const already = links.some((link) => link.key === `${row.id}:${role}`);
            return (
              <SelectItem key={row.id} value={row.id} disabled={already}>
                {row.name}
                {already ? " · already staged" : ""}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      <Button type="button" data-testid="individual-link-confirm" disabled={!targetId} onClick={add}>
        Add to Create
      </Button>
      {links.length > 0 ? (
        <ul className="space-y-1">
          {links.map((link) => (
            <li
              key={link.key}
              data-testid="individual-staged-link-row"
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span>
                {link.masterName} · {GUEST_RELATIONSHIP_ROLE_LABELS[link.role]} ·{" "}
                {GUEST_ACCOUNT_TYPE_LABELS[ROLE_ACCOUNT_TYPE[link.role]]}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="individual-staged-link-remove"
                onClick={() => onChange(links.filter((row) => row.key !== link.key))}
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

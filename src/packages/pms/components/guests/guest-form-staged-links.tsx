import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/shared/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { cn } from "@/shared/lib/utils";
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
  accountListItems,
} from "@/packages/pms/lib/guest-profile-wave4";
import { listGuestAccounts } from "@/packages/pms/lib/guest-accounts.functions";

const MASTER_SEARCH_DEBOUNCE_MS = 300;

const SQUARE_TRIGGER_CLASS =
  "h-10 w-full rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-xs text-[#251605] shadow-none transition-colors hover:border-[#C89933]/70 focus:border-[#C89933] focus:ring-1 focus:ring-[#C89933] justify-between";

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
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [targetName, setTargetName] = useState("");
  const [role, setRole] = useState<IndividualLinkRole>("employer");
  const accountType = ROLE_ACCOUNT_TYPE[role];

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(search), MASTER_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [search]);

  const accountsQuery = useQuery({
    queryKey: ["guest-accounts-pick", restaurantId, accountType, debouncedSearch, "individual-staged-link"],
    queryFn: () =>
      fetchAccounts({
        data: {
          restaurantId,
          accountType,
          ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
          limit: 50,
        },
      }),
    retry: false,
  });

  const items = accountListItems(accountsQuery.data);
  const chosen = items.find((row) => row.id === targetId);
  const selectedLabel = chosen?.name || targetName;
  const total = Array.isArray(accountsQuery.data) ? items.length : (accountsQuery.data?.total ?? items.length);

  function add() {
    const name = chosen?.name || targetName;
    if (!targetId || !name) return;
    const key = `${targetId}:${role}`;
    if (links.some((link) => link.key === key)) return;
    onChange([...links, { key, masterId: targetId, masterName: name, role }]);
    setTargetId("");
    setTargetName("");
    setSearch("");
    setDebouncedSearch("");
  }

  return (
    <div className="space-y-3" data-testid="individual-linking-staged">
      <p className="text-xs text-muted-foreground">{INDIVIDUAL_STAGED_LINKING_COPY}</p>
      <p className="text-xs text-muted-foreground">{INDIVIDUAL_LINKING_COPY}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-[#251605]">Relationship Role</label>
          <Select
            value={role}
            onValueChange={(value) => {
              setRole(value as IndividualLinkRole);
              setTargetId("");
              setTargetName("");
              setSearch("");
              setDebouncedSearch("");
            }}
          >
            <SelectTrigger data-testid="individual-link-role" className={SQUARE_TRIGGER_CLASS}>
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
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[#251605]">
            {GUEST_ACCOUNT_TYPE_LABELS[accountType]} Account
          </label>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={open}
                data-testid="individual-link-master-target"
                className="h-10 w-full justify-between rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-xs font-normal text-[#251605] shadow-none transition-colors hover:border-[#C89933]/70 focus-visible:border-[#C89933] focus-visible:ring-1 focus-visible:ring-[#C89933]"
              >
                <span className={cn("truncate", !selectedLabel && "text-muted-foreground")}>
                  {selectedLabel || `Search ${GUEST_ACCOUNT_TYPE_LABELS[accountType].toLowerCase()}`}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[min(36rem,calc(100vw-2rem))] rounded-[6px] border border-[#DDD4C5] p-0 shadow-lg" align="start">
              <Command shouldFilter={false}>
                <CommandInput
                  data-testid="individual-link-master-search"
                  placeholder="Search by name, code, email or phone"
                  value={search}
                  onValueChange={setSearch}
                />
                <CommandList>
                  {accountsQuery.isError ? (
                    <p className="px-3 py-4 text-sm text-destructive">
                      {accountsQuery.error instanceof Error
                        ? accountsQuery.error.message
                        : "Could not load companies."}
                    </p>
                  ) : items.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-muted-foreground">
                      {accountsQuery.isFetching
                        ? "Searching…"
                        : `No matching ${GUEST_ACCOUNT_TYPE_LABELS[accountType].toLowerCase()} records.`}
                    </p>
                  ) : (
                    <CommandGroup>
                      <div className="sticky top-0 z-10 mb-1 grid grid-cols-[minmax(0,1fr)_7rem_5rem] gap-2 border-b border-border bg-popover px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        <span>Name</span>
                        <span>Code</span>
                        <span>Status</span>
                      </div>
                      {items.map((row) => {
                        const already = links.some((link) => link.key === `${row.id}:${role}`);
                        return (
                          <CommandItem
                            key={row.id}
                            value={row.id}
                            disabled={already}
                            onSelect={() => {
                              if (already) return;
                              setTargetId(row.id);
                              setTargetName(row.name);
                              setOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4 shrink-0", targetId === row.id ? "opacity-100" : "opacity-0")} />
                            <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_7rem_5rem] items-center gap-2">
                              <span className="truncate font-medium">
                                {row.name}
                                {already ? " · already staged" : ""}
                              </span>
                              <span className="truncate text-xs text-muted-foreground">{row.code || "—"}</span>
                              <span className="truncate text-xs capitalize text-muted-foreground">{row.accountStatus}</span>
                            </span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
              {total > items.length ? (
                <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                  Showing {items.length} of {total}. Type in the search bar to find a company that is not listed.
                </p>
              ) : null}
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <Button
        type="button"
        data-testid="individual-link-confirm"
        disabled={!targetId}
        onClick={add}
        className="h-9 rounded-[6px] bg-[#251605] px-4 text-xs font-medium text-[#F7F4EE] shadow-sm hover:bg-[#251605]/90 disabled:opacity-50"
      >
        Add to Create
      </Button>
      {links.length > 0 ? (
        <ul className="space-y-2">
          {links.map((link) => (
            <li
              key={link.key}
              data-testid="individual-staged-link-row"
              className="flex items-center justify-between gap-2 rounded-[6px] border border-[#DDD4C5] bg-[#FAF8F5] p-2.5 text-xs text-[#251605]"
            >
              <span className="font-medium">
                {link.masterName} · <span className="text-[#756A5B]">{GUEST_RELATIONSHIP_ROLE_LABELS[link.role]}</span> ·{" "}
                <span className="text-[#756A5B]">{GUEST_ACCOUNT_TYPE_LABELS[ROLE_ACCOUNT_TYPE[link.role]]}</span>
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="individual-staged-link-remove"
                className="h-7 rounded-[6px] border-[#DDD4C5] text-xs hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
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

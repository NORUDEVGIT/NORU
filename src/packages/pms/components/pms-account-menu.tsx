import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { HelpCircle, LogOut, Sun } from "lucide-react";

import { ensureLightAppearance } from "@/core/lib/appearance";
import { clearRoutePackageCache } from "@/core/lib/route-package-guard";
import { useAuth } from "@/core/state/auth-store";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

function displayNameFromUser(user: { email?: string | null; user_metadata?: Record<string, unknown> } | null) {
  const meta = user?.user_metadata ?? {};
  const first = typeof meta.first_name === "string" ? meta.first_name.trim() : "";
  const last = typeof meta.last_name === "string" ? meta.last_name.trim() : "";
  const full = typeof meta.full_name === "string" ? meta.full_name.trim() : "";
  const joined = [first, last].filter(Boolean).join(" ");
  return joined || full || user?.email?.trim() || "Signed in";
}

function initialsFromName(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  return (parts[0]?.slice(0, 2) ?? "P").toUpperCase();
}

function formatRole(role: string | undefined) {
  const value = role?.trim();
  if (!value) return null;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function PmsAccountMenu({
  membership,
  businessDateLabel,
  open,
  onOpenChange,
  onOpenHelp,
}: {
  membership: RestaurantMembership;
  businessDateLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenHelp: () => void;
}) {
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  useEffect(() => {
    ensureLightAppearance();
  }, []);
  const name = displayNameFromUser(user);
  const role = formatRole(membership.role);
  const initials = initialsFromName(name === "Signed in" ? membership.restaurant.name : name);
  const sessionActive = Boolean(user);

  async function onLogOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    clearRoutePackageCache();
    await signOut();
    void navigate({ to: "/restaurant/login", replace: true });
  }

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          data-testid="pms-account-menu"
          className="flex size-8 items-center justify-center rounded-full bg-[#F4E9D0] text-[11px] font-semibold text-[#251605] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]"
        >
          {initials}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-1.5">
        <DropdownMenuLabel className="space-y-0.5 px-2 py-2">
          <p className="truncate text-sm font-medium text-[#251605]">{name}</p>
          {role ? <p className="text-xs font-normal capitalize text-muted-foreground">{role}</p> : null}
          <p className="truncate text-xs font-normal text-muted-foreground">{membership.restaurant.name}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Session
        </DropdownMenuLabel>
        <div className="px-2 pb-1.5 text-xs text-[#5C5346]">
          <p className="flex items-center justify-between gap-2 py-0.5">
            <span>Account Status</span>
            <span className="font-medium text-[#251605]">{sessionActive ? "Active" : "Signed in"}</span>
          </p>
          <p className="flex items-center justify-between gap-2 py-0.5">
            <span>Property</span>
            <span className="max-w-[9rem] truncate text-right font-medium text-[#251605]">
              {membership.restaurant.name}
            </span>
          </p>
          <p className="flex items-center justify-between gap-2 py-0.5">
            <span>Business Date</span>
            <span className="text-right font-medium text-[#251605]">{businessDateLabel}</span>
          </p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Preferences
        </DropdownMenuLabel>
        <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-[#251605]">
          <Sun className="size-4 shrink-0" aria-hidden="true" />
          Appearance
          <span className="ml-auto text-xs text-muted-foreground">Light</span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Support
        </DropdownMenuLabel>
        <DropdownMenuItem
          className="gap-2"
          onSelect={() => {
            onOpenHelp();
          }}
        >
          <HelpCircle className="size-4" />
          Help & Support
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => void onLogOut()}
          className="gap-2 text-[#9B2C2C] focus:bg-[#FDECEC] focus:text-[#9B2C2C]"
        >
          <LogOut className="size-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

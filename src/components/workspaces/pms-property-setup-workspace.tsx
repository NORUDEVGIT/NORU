/**
 * Phase 7D.2F2 — PMS Property Setup.
 *
 * Property/PMS configuration only. Food & Beverage configuration (menu,
 * tables & QR) belongs to the F&B domain, and Rate & Revenue Management and
 * Distribution keep their own PMS submodules — none of them are duplicated
 * here.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight, BedDouble, DoorOpen, type LucideIcon } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FoundationPanel } from "@/components/pms/foundation-panel";
import { SettingsWorkspace } from "@/components/workspaces/settings-workspace";
import type { RestaurantMembership } from "@/lib/restaurant.functions";
import { PageHeading } from "@/state/pms-context";

export function PmsPropertySetupWorkspace({ membership }: { membership: RestaurantMembership }) {
  const canManageRooms = membership.role === "owner" || membership.role === "manager";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl">
          <PageHeading fallback="Property Setup" />
        </h1>
        <p className="text-sm text-muted-foreground">
          Property configuration for {membership.restaurant.name}: property details, room
          configuration, outlets, policies, taxes and general PMS settings.
        </p>
      </div>

      <Tabs defaultValue="property">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="property">Property information</TabsTrigger>
          <TabsTrigger value="rooms">Room configuration</TabsTrigger>
          <TabsTrigger value="operations">Operational settings</TabsTrigger>
          <TabsTrigger value="outlets">Outlets</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
          <TabsTrigger value="taxes">Taxes & charges</TabsTrigger>
        </TabsList>

        <TabsContent value="property" className="mt-6">
          <SettingsWorkspace membership={membership} embedded />
        </TabsContent>

        <TabsContent value="rooms" className="mt-6 space-y-4">
          {canManageRooms ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <ConfigCard
                icon={BedDouble}
                title="Room types"
                description="Room types, occupancy, amenities and imagery."
                to="/restaurant/pms/room-inventory"
                tab="room-types"
              />
              <ConfigCard
                icon={DoorOpen}
                title="Rooms"
                description="Physical rooms, numbering and their room type."
                to="/restaurant/pms/room-inventory"
                tab="rooms"
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Only owners and managers can change room configuration.
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Day-to-day room availability, out of order and out of service rooms are handled in Room
            & Inventory.
          </p>
        </TabsContent>

        <TabsContent value="operations" className="mt-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            Timezone and currency are set with your property details; they drive business dates,
            check-in times and all posted amounts.
          </p>
          <FoundationPanel
            title="Further hotel operational settings"
            description="Check-in and check-out times, business date rules and default room assignment behaviour aren't configurable yet."
          />
        </TabsContent>

        <TabsContent value="outlets" className="mt-6">
          <FoundationPanel
            title="Outlets"
            description="Property outlet configuration — the hotel's revenue outlets and how their postings reach guest folios. There is no outlet record yet, and restaurant menus and tables stay in the Food & Beverage module."
          />
        </TabsContent>

        <TabsContent value="policies" className="mt-6">
          <FoundationPanel
            title="Policies & business rules"
            description="Cancellation, deposit, guarantee and no-show rules aren't configurable yet. Rate-level stay restrictions live in Rate & Revenue Management."
          />
        </TabsContent>

        <TabsContent value="taxes" className="mt-6">
          <FoundationPanel
            title="Taxes & charges"
            description="Property taxes, service charges and city levies aren't configurable yet; amounts currently post at the rates you set per rate plan."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ConfigCard({
  icon: Icon,
  title,
  description,
  to,
  tab,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  to: string;
  tab?: string;
}) {
  return (
    <Link
      to={to}
      {...(tab ? { search: { tab } } : {})}
      className="group flex flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50 hover:bg-accent/40"
    >
      <Icon className="size-5 text-primary" />
      <p className="mt-3 font-display text-lg">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <span className="mt-auto inline-flex items-center gap-1 pt-3 text-sm font-medium text-primary">
        Open <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

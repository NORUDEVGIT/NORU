/**
 * Phase 7D.2F2 — PMS Integrations.
 *
 * Configuration of how the PMS connects to other systems: POS, payment
 * gateways, accounting, APIs and third-party systems. Nothing here operates
 * another module (the POS terminal stays its own top-level module) and no
 * integration is ever shown as connected unless it genuinely is.
 */
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { FoundationPanel } from "@/components/pms/foundation-panel";
import { SettingsWorkspace } from "@/components/workspaces/settings-workspace";
import type { RestaurantMembership } from "@/lib/restaurant.functions";
import { PageHeading } from "@/state/pms-context";

export function PmsIntegrationsWorkspace({ membership }: { membership: RestaurantMembership }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl">
          <PageHeading fallback="Integrations" />
        </h1>
        <p className="text-sm text-muted-foreground">
          How {membership.restaurant.name}'s PMS connects to other systems. Nothing is connected
          until you set it up here.
        </p>
      </div>

      <Tabs defaultValue="pos">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="pos">POS</TabsTrigger>
          <TabsTrigger value="payments">Payment gateways</TabsTrigger>
          <TabsTrigger value="accounting">Accounting</TabsTrigger>
          <TabsTrigger value="api">APIs</TabsTrigger>
          <TabsTrigger value="third-party">Third-party systems</TabsTrigger>
        </TabsList>

        <TabsContent value="pos" className="mt-6 space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="font-medium">Charge to room is live</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Restaurant and POS sales can be posted straight onto a guest folio for an in-house
              stay, and reversed if posted in error. Selling and taking payment happen in the POS
              module; this page only covers the link between the two.
            </p>
          </div>
          <FoundationPanel
            title="External POS connections"
            description="Connecting a third-party point of sale to the PMS isn't available yet."
          />
        </TabsContent>

        <TabsContent value="payments" className="mt-6">
          <FoundationPanel
            title="Payment gateways"
            description="Card and online payment providers can't be connected yet. Payments recorded in Cashiering today are entered by your team against a payment method."
          />
        </TabsContent>

        <TabsContent value="accounting" className="mt-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            PMS finance — room revenue, folio charges, payments, deposits, refunds and night audit
            totals — is the data that will feed a property accounting system. The PMS does not keep
            a second set of books.
          </p>
          <FoundationPanel
            title="Accounting export"
            description="Exporting or posting PMS financial totals to an accounting system isn't available yet."
          />
        </TabsContent>

        <TabsContent value="api" className="mt-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            Your direct booking pages are already published for this property; their web address and
            visibility are shown with your property details below.
          </p>
          <SettingsWorkspace membership={membership} embedded />
          <FoundationPanel
            title="API keys & webhooks"
            description="Issuing API credentials and sending webhooks to your own systems isn't available yet."
          />
        </TabsContent>

        <TabsContent value="third-party" className="mt-6">
          <FoundationPanel
            title="Third-party systems"
            description="Channel managers, door locks, telephone systems and other property systems can't be connected yet. Your direct booking channel is managed in Distribution."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

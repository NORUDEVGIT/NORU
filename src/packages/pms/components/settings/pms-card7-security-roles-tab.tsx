import { Button } from "@/shared/components/ui/button";
import { STAFF_ACCESS_HREF } from "@/packages/pms/lib/pms-property-setup-card5";
import { CARD7_EMPTY_CATALOGUE_COPY } from "@/packages/pms/lib/security-roles-card7.server";

/**
 * Card 7 no longer edits roles. Staff & Access is the only role editor.
 * Catalogue seed copy stays so an empty permission list is still explained.
 */
export function Card7SecurityRolesTab({
  restaurantId: _restaurantId,
  canEdit: _canEdit,
}: {
  restaurantId: string;
  canEdit: boolean;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-[#DDD4C5] bg-white p-5" data-testid="card7-security-moved">
      <h3 className="font-display text-lg text-[#251605]">Roles & Permissions have moved</h3>
      <p className="text-sm text-[#5A4833]">
        Roles and permissions are managed in Settings, under Staff & Access.
      </p>
      <p className="text-sm text-[#756A5B]">{CARD7_EMPTY_CATALOGUE_COPY}</p>
      <Button type="button" asChild>
        <a href={STAFF_ACCESS_HREF}>Open Staff & Access</a>
      </Button>
    </section>
  );
}

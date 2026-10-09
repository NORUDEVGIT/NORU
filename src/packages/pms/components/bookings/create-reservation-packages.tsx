import { ReservationPackageMerchandiseGrid } from "@/packages/pms/components/bookings/reservation-package-merchandise";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { cn } from "@/shared/lib/utils";
import {
  CREATE_RESERVATION_PACKAGES_GATE_BADGE,
  CREATE_RESERVATION_PACKAGES_NOT_ATTACHED,
  CREATE_RESERVATION_PACKAGES_SETTINGS_HREF,
  CREATE_RESERVATION_PACKAGES_SETTINGS_LINK,
  canShowPackagesSettingsLink,
  packagesGateCopy,
  resolveCreatePackagesGateView,
} from "@/packages/pms/lib/create-reservation-phase1-section8";
import {
  canBindCreatePackage,
  createPackageUnselectableReason,
  type AvailablePackageCard,
} from "@/packages/pms/lib/reservation-detail-packages";

export function CreateReservationPackages({
  loading,
  error,
  packagesAvailable,
  activePackageCount,
  canEditSet3,
  operational = false,
  merchandiseCards,
  merchandiseCurrency = "ETB",
  money,
  merchandiseContextReady = false,
  selectedActivationIds = [],
  onToggleActivation,
}: {
  loading: boolean;
  error: boolean;
  packagesAvailable: boolean;
  activePackageCount: number;
  canEditSet3: boolean;
  operational?: boolean;
  merchandiseCards?: AvailablePackageCard[];
  merchandiseCurrency?: string;
  money?: (value: number) => string;
  merchandiseContextReady?: boolean;
  selectedActivationIds?: string[];
  onToggleActivation?: (activationId: string) => void;
}) {
  const view = resolveCreatePackagesGateView({
    loading,
    error,
    packagesAvailable,
    activePackageCount,
  });
  const showSettings = !operational && canShowPackagesSettingsLink(canEditSet3);
  const detectKind = view.kind;
  const visibleCards = merchandiseCards ?? [];

  return (
    <section
      className={operational ? "space-y-2" : "rounded-2xl border border-border bg-card p-4"}
      data-testid="create-reservation-packages-gate"
      data-packages-detect={detectKind}
    >
      {operational ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-lg">Packages</h2>
          <span
            data-testid="packages-gate-badge"
            className="inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800"
          >
            {CREATE_RESERVATION_PACKAGES_GATE_BADGE}
          </span>
        </div>
      )}
      {/* CREATE_RESERVATION_SECTION8_SCOPE */}
      <p
        className={
          operational ? "text-xs text-muted-foreground" : "mt-3 text-sm text-muted-foreground"
        }
        data-testid="packages-gate-copy"
      >
        {operational && view.kind === "active_not_attached"
          ? "Select optional packages for this reservation."
          : packagesGateCopy(view)}
      </p>
      {showSettings ? (
        <div className="mt-3">
          <Button asChild variant="outline" size="sm">
            <a
              href={CREATE_RESERVATION_PACKAGES_SETTINGS_HREF}
              data-testid="packages-settings-link"
            >
              {CREATE_RESERVATION_PACKAGES_SETTINGS_LINK}
            </a>
          </Button>
        </div>
      ) : null}
      {view.kind === "active_not_attached" &&
      merchandiseContextReady &&
      money &&
      merchandiseCards ? (
        <div
          className="mt-4 border-t border-border pt-4"
          data-testid="create-reservation-package-merch"
        >
          <p className="text-xs font-medium text-[#251605]">
            Available packages configured for the selected room and rate.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {operational
              ? "Package prices stay separate from the room quote."
              : CREATE_RESERVATION_PACKAGES_NOT_ATTACHED}
          </p>
          {operational ? (
            <PackageCatalogueTable
              cards={visibleCards}
              currency={merchandiseCurrency}
              money={money}
              selectedActivationIds={selectedActivationIds}
              onToggleActivation={onToggleActivation}
            />
          ) : (
            <div className="mt-3">
              <ReservationPackageMerchandiseGrid
                cards={merchandiseCards}
                currency={merchandiseCurrency}
                money={money}
                emptyCopy="No packages match this room type and rate plan."
              />
            </div>
          )}
        </div>
      ) : view.kind === "active_not_attached" && !merchandiseContextReady ? (
        <p
          className="mt-3 text-xs text-muted-foreground"
          data-testid="create-reservation-package-merch-wait"
        >
          Select room type and rate plan to preview package catalogue details.
        </p>
      ) : null}
    </section>
  );
}

function PackageCatalogueTable({
  cards,
  currency,
  money,
  selectedActivationIds,
  onToggleActivation,
}: {
  cards: AvailablePackageCard[];
  currency: string;
  money: (value: number) => string;
  selectedActivationIds: string[];
  onToggleActivation?: (activationId: string) => void;
}) {
  if (cards.length === 0) {
    return (
      <div className="space-y-1" data-testid="create-reservation-packages-empty">
        <p className="text-sm text-[#251605]">
          No packages are available for the selected room and rate.
        </p>
        <p className="text-xs text-muted-foreground">
          Packages are configured in Property Setup → Meal Plans & Packages.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto" data-testid="create-reservation-packages-readonly">
      <table className="w-full border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-[#CCCCCC] text-[10px] uppercase tracking-wide text-[#6B5E4E]">
            <th className="w-8 py-1 font-medium" />
            <th className="py-1 pr-2 font-medium">Package</th>
            <th className="py-1 pr-2 font-medium">Description</th>
            <th className="py-1 pr-2 font-medium">Price ({currency})</th>
            <th className="w-10 py-1 pr-2 font-medium">Qty</th>
            <th className="py-1 font-medium">Total ({currency})</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((card) => {
            const activationId = card.activationId;
            const bindable = canBindCreatePackage(card) && activationId != null;
            const selected = activationId != null && selectedActivationIds.includes(activationId);
            const unavailable = createPackageUnselectableReason(card);
            const amount = card.price == null ? "—" : money(card.price);
            return (
              <tr
                key={card.id}
                className={cn("border-b border-[#CCCCCC]", selected && "bg-[#FBF6EC]")}
                data-testid={`create-package-${card.id}`}
                data-selected={selected ? "true" : "false"}
                data-bindable={bindable ? "true" : "false"}
              >
                <td className="py-1 pr-1 align-middle">
                  <Checkbox
                    checked={selected}
                    disabled={!bindable || !onToggleActivation || !activationId}
                    aria-label={`Select ${card.name}`}
                    data-testid={activationId ? `create-package-toggle-${activationId}` : undefined}
                    onCheckedChange={() => {
                      if (bindable && activationId && onToggleActivation) {
                        onToggleActivation(activationId);
                      }
                    }}
                  />
                </td>
                <td className="py-1 pr-2 align-middle font-medium text-[#251605]">
                  {card.name}
                  <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">
                    {card.chargeType}
                  </span>
                </td>
                <td className="max-w-40 py-1 pr-2 align-middle text-muted-foreground">
                  <span className="line-clamp-2">{card.description.trim() || "—"}</span>
                  {card.chargeBasisHonesty ? (
                    <span className="mt-0.5 block text-[10px] text-amber-900/80">
                      {card.chargeBasisHonesty}
                    </span>
                  ) : null}
                  {unavailable ? (
                    <span
                      className="mt-0.5 block text-[10px] font-medium text-[#6B5E4E]"
                      data-testid={`create-package-unavailable-${card.id}`}
                    >
                      {unavailable}
                    </span>
                  ) : null}
                </td>
                <td className="py-1 pr-2 align-middle tabular-nums text-[#251605]">{amount}</td>
                <td className="py-1 pr-2 align-middle tabular-nums text-[#251605]">1</td>
                <td className="py-1 align-middle tabular-nums text-[#251605]">{amount}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

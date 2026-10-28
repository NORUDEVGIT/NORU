import {
  PackageCoverThumb,
  ReservationPackageMerchandiseGrid,
} from "@/packages/pms/components/bookings/reservation-package-merchandise";
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
import {
  packageChargeFigures,
  type RoomChargeRules,
} from "@/packages/pms/lib/room-charge-guest-total";

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
  bookingScopeNote = null,
  packageRules = null,
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
  bookingScopeNote?: string | null;
  packageRules?: RoomChargeRules | null;
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
      {bookingScopeNote ? (
        <p className="text-xs text-[#6B5E4E]" data-testid="package-booking-scope">
          {bookingScopeNote}
        </p>
      ) : null}
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
              packageRules={packageRules}
            />
          ) : (
            <div className="mt-3">
              <ReservationPackageMerchandiseGrid
                cards={merchandiseCards}
                currency={merchandiseCurrency}
                money={money}
                packageRules={packageRules}
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
  packageRules = null,
}: {
  cards: AvailablePackageCard[];
  currency: string;
  money: (value: number) => string;
  selectedActivationIds: string[];
  onToggleActivation?: (activationId: string) => void;
  packageRules?: RoomChargeRules | null;
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
    <div className="min-w-0" data-testid="create-reservation-packages-readonly">
      <table className="w-full table-fixed border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-[#CCCCCC] text-[10px] uppercase tracking-wide text-[#6B5E4E]">
            <th className="w-7 py-1 font-medium" />
            <th className="w-[42%] py-1 pr-2 font-medium">Package</th>
            <th className="py-1 pr-2 font-medium">Description</th>
            <th className="w-20 py-1 pr-2 text-right font-medium">Net ({currency})</th>
            <th className="w-9 py-1 pr-2 text-center font-medium">Qty</th>
            <th className="w-20 py-1 text-right font-medium">Total ({currency})</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((card) => {
            const activationId = card.activationId;
            const bindable = canBindCreatePackage(card) && activationId != null;
            const selected = activationId != null && selectedActivationIds.includes(activationId);
            const unavailable = createPackageUnselectableReason(card);
            const figures = card.price == null ? null : packageChargeFigures(card.price, packageRules);
            const net = figures == null ? "—" : money(figures.netAmount);
            const total = figures == null ? "—" : money(figures.total);
            return (
              <tr
                key={card.id}
                className={cn(
                  "border-b border-[#E7E0D4]",
                  selected && "bg-[#FBF6EE] shadow-[inset_3px_0_0_#C89933]",
                )}
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
                <td className="py-1.5 pr-2 align-middle font-medium text-[#251605]">
                  <div className="flex min-w-0 items-center gap-2">
                    <div
                      className="h-16 w-20 shrink-0 overflow-hidden rounded-[6px]"
                      data-testid={card.coverUrl ? "package-cover-image" : "package-cover-fallback"}
                    >
                      <PackageCoverThumb
                        coverUrl={card.coverUrl}
                        name={card.name}
                        className="!h-16 !rounded-[6px] object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <span className="block break-words leading-snug">{card.name}</span>
                      <span className="mt-0.5 block text-[10px] font-normal text-[#6B5E4E]">
                        {card.chargeType}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="py-1.5 pr-2 align-middle text-[#6B5E4E]">
                  <span className="line-clamp-2">{card.description.trim() || "—"}</span>
                  {card.chargeBasisHonesty ? (
                    <span className="mt-0.5 block text-[10px] text-[#6B5E4E]">
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
                <td className="py-1 pr-2 text-right align-middle tabular-nums text-[#251605]">
                  {net}
                </td>
                <td className="py-1 pr-2 text-center align-middle tabular-nums text-[#251605]">
                  1
                </td>
                <td
                  className="py-1 text-right align-middle font-medium tabular-nums text-[#251605]"
                  data-testid={`create-package-total-${card.id}`}
                >
                  {total}
                  {figures && figures.lines.length > 0 ? (
                    <span className="mt-0.5 block text-[10px] font-normal text-[#6B5E4E]">
                      {figures.lines.map((line) => line.name).join(", ")}
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

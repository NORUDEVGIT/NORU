import { Package } from "lucide-react";
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
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-[#251605]">
                Available packages configured for the selected room and rate.
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {operational
                  ? "Package prices stay separate from the room quote."
                  : CREATE_RESERVATION_PACKAGES_NOT_ATTACHED}
              </p>
            </div>
            {operational && selectedActivationIds.length > 0 ? (
              <span className="inline-flex items-center rounded-full bg-[#F4EDE0] px-2.5 py-0.5 text-xs font-medium text-[#7A5A1A]">
                {selectedActivationIds.length} {selectedActivationIds.length === 1 ? "package" : "packages"} selected
              </span>
            ) : null}
          </div>
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
      <div className="space-y-1 py-2" data-testid="create-reservation-packages-empty">
        <p className="text-sm font-medium text-[#251605]">
          No packages are available for the selected room and rate.
        </p>
        <p className="text-xs text-muted-foreground">
          Packages are configured in Property Setup → Meal Plans & Packages.
        </p>
      </div>
    );
  }

  const selectedCards = cards.filter(
    (card) => card.activationId && selectedActivationIds.includes(card.activationId),
  );

  return (
    <div
      className="min-w-0 overflow-hidden rounded-[8px] border border-[#CCCCCC] bg-white shadow-xs"
      data-testid="create-reservation-packages-readonly"
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[#E6E1D8] bg-[#F7F4EE] text-[10px] uppercase tracking-wide text-[#6B5E4E]">
              <th className="w-10 px-3 py-3 text-center font-medium" />
              <th className="w-[28%] min-w-[200px] px-3.5 py-3 font-medium">Package</th>
              <th className="min-w-[170px] px-3.5 py-3 font-medium">Description</th>
              <th className="w-28 px-3.5 py-3 text-right font-medium">Price ({currency})</th>
              <th className="w-12 px-2 py-3 text-center font-medium">Qty</th>
              <th className="w-56 min-w-[220px] px-4 py-3 text-right font-medium">Total ({currency})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E6E1D8]">
            {cards.map((card) => {
              const activationId = card.activationId;
              const bindable = canBindCreatePackage(card) && activationId != null;
              const selected = activationId != null && selectedActivationIds.includes(activationId);
              const unavailable = createPackageUnselectableReason(card);
              const amount = card.price == null ? "—" : money(card.price);
              const figures =
                card.price == null ? null : packageChargeFigures(card.price, packageRules);
              const hasTax = figures != null && figures.total !== figures.netAmount;
              const total = figures == null ? amount : money(figures.total);
              const taxAndFee = figures ? figures.tax + figures.serviceCharge : 0;

              return (
                <tr
                  key={card.id}
                  className={cn(
                    "transition-colors hover:bg-[#FAF8F5]/70",
                    selected && "bg-[#FBF6EE] shadow-[inset_3px_0_0_#C89933]",
                  )}
                  data-testid={`create-package-${card.id}`}
                  data-selected={selected ? "true" : "false"}
                  data-bindable={bindable ? "true" : "false"}
                >
                  <td className="px-3 py-3 text-center align-middle">
                    <div className="flex justify-center">
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
                        className="size-4 rounded-[3px] border-[#CCCCCC] data-[state=checked]:border-[#C89933] data-[state=checked]:bg-[#C89933]"
                      />
                    </div>
                  </td>
                  <td className="px-3.5 py-3 align-middle">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className="h-12 w-14 shrink-0 overflow-hidden rounded-[4px] border border-[#E6E1D8] bg-[#FAF8F5]"
                        data-testid={card.coverUrl ? "package-cover-image" : "package-cover-fallback"}
                      >
                        <PackageCoverThumb
                          coverUrl={card.coverUrl}
                          name={card.name}
                          className="!h-12 !w-14 !rounded-[4px] object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="block break-words font-semibold text-xs text-[#251605] leading-snug">
                          {card.name}
                        </span>
                        <span className="mt-0.5 inline-block text-[10px] font-medium text-[#7A5A1A]">
                          {card.chargeType}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-3.5 py-3 align-middle text-[#6B5E4E]">
                    <span className="line-clamp-2 leading-relaxed">{card.description.trim() || "—"}</span>
                    {card.chargeBasisHonesty ? (
                      <span className="mt-0.5 block text-[10px] text-[#8C7A64]">
                        {card.chargeBasisHonesty}
                      </span>
                    ) : null}
                    {unavailable ? (
                      <span
                        className="mt-0.5 inline-flex items-center rounded-[3px] bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700"
                        data-testid={`create-package-unavailable-${card.id}`}
                      >
                        {unavailable}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3.5 py-3 text-right align-middle text-xs tabular-nums text-[#6B5E4E]">
                    {amount}
                  </td>
                  <td className="px-2 py-3 text-center align-middle text-xs tabular-nums font-medium text-[#6B5E4E]">
                    1
                  </td>
                  <td
                    className="px-4 py-3 text-right align-middle"
                    data-testid={`create-package-total-${card.id}`}
                  >
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-bold text-sm text-[#251605] tabular-nums tracking-tight">
                        {total}
                      </span>
                      {hasTax ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="inline-flex items-center rounded bg-[#F4EDE0] px-1.5 py-0.5 text-[9.5px] font-medium text-[#7A5A1A]">
                            Incl. tax & fees
                          </span>
                          <span
                            className="text-[10px] text-[#8C7A64] tabular-nums"
                            title={figures.lines.map((l) => `${l.name}: ${money(l.amount)}`).join(", ")}
                          >
                            +{money(taxAndFee)} ({figures.lines.map((l) => l.name).join(", ")})
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedCards.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#E6E1D8] bg-[#FAF7F2] px-4 py-3.5 sm:px-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EFE8DC] px-3 py-1 text-xs font-semibold text-[#5A4515]">
              <Package className="size-3.5 text-[#C89933]" aria-hidden />
              {selectedCards.length} {selectedCards.length === 1 ? "package" : "packages"} selected
            </span>
            <div className="hidden sm:flex flex-wrap items-center gap-1.5">
              {selectedCards.map((c) => (
                <span
                  key={c.id}
                  className="rounded-md border border-[#E6E1D8] bg-white px-2 py-0.5 text-[11px] font-medium text-[#6B5E4E]"
                >
                  {c.name}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-medium text-[#6B5E4E]">
              Total Packages:
            </span>
            <span className="font-bold text-base text-[#251605] tabular-nums">
              {money(
                selectedCards.reduce((sum, c) => {
                  const f = c.price == null ? null : packageChargeFigures(c.price, packageRules);
                  return sum + (f?.total ?? c.price ?? 0);
                }, 0),
              )}
            </span>
            <span className="text-[10.5px] text-[#8C7A64] font-medium">
              (incl. taxes & fees)
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}


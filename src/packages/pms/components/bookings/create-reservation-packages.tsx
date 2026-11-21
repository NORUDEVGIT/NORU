import { useState, type ReactNode } from "react";

import {
  PackageCoverThumb,
  ReservationPackageMerchandiseGrid,
} from "@/packages/pms/components/bookings/reservation-package-merchandise";
import { reservationAddOnPresentation } from "@/packages/pms/lib/reservation-booking-separation";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
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
import { type RoomChargeRules } from "@/packages/pms/lib/room-charge-guest-total";

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
  mealPlanId = null,
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
  mealPlanId?: string | null;
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
          ? "Commercial extras for this rate. Included items stay on the rate."
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
          {operational ? (
            <p className="mb-2 text-xs text-[#6B5E4E]">
              Package prices stay separate from the room quote.
            </p>
          ) : (
            <div className="mb-3">
              <p className="text-xs font-medium text-[#251605]">
                Available packages configured for the selected room and rate.
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {CREATE_RESERVATION_PACKAGES_NOT_ATTACHED}
              </p>
            </div>
          )}
          {operational ? (
            <AddOnRows
              cards={visibleCards}
              mealPlanId={mealPlanId}
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

function chargeBasisSuffix(basis: AvailablePackageCard["chargeBasis"]): string {
  if (basis === "per_night") return "night";
  if (basis === "per_person") return "person";
  if (basis === "per_room") return "room";
  if (basis === "per_unit") return "unit";
  return "stay";
}

function packagePriceLine(card: AvailablePackageCard, money: (value: number) => string): string | null {
  if (card.price == null) return null;
  return `${money(card.price)} / ${chargeBasisSuffix(card.chargeBasis)}`;
}

function packageBenefitLines(card: AvailablePackageCard): string[] {
  const labels = card.benefitLabels ?? card.components;
  return labels.map((label) => label.trim()).filter(Boolean);
}

function AddOnRows({
  cards,
  mealPlanId,
  money,
  selectedActivationIds,
  onToggleActivation,
}: {
  cards: AvailablePackageCard[];
  mealPlanId: string | null;
  money: (value: number) => string;
  selectedActivationIds: string[];
  onToggleActivation?: (activationId: string) => void;
  packageRules?: RoomChargeRules | null;
}) {
  const { included, optional } = reservationAddOnPresentation(cards, mealPlanId);
  const [detailId, setDetailId] = useState<string | null>(null);
  const presented = [...included, ...optional];
  const detail = presented.find((card) => card.id === detailId) ?? null;

  if (included.length === 0 && optional.length === 0) {
    return (
      <p className="py-1 text-sm text-[#6B5E4E]" data-testid="create-reservation-packages-empty">
        No add-ons for this rate.
      </p>
    );
  }

  return (
    <>
      <ul className="space-y-2" data-testid="create-reservation-addons">
        {included.map((card) => (
          <AddOnCard
            key={card.id}
            card={card}
            money={money}
            treatment="included"
            onViewDetails={() => setDetailId(card.id)}
          />
        ))}
        {optional.map((card) => {
          const activationId = card.activationId;
          const bindable = canBindCreatePackage(card) && activationId != null;
          const selected = activationId != null && selectedActivationIds.includes(activationId);
          const unavailable = createPackageUnselectableReason(card);
          return (
            <AddOnCard
              key={card.id}
              card={card}
              money={money}
              treatment="optional"
              selected={selected}
              unavailable={unavailable}
              onViewDetails={() => setDetailId(card.id)}
              action={
                bindable && activationId && onToggleActivation ? (
                  selected ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs font-medium text-[#3D6B4F]">Added ✓</span>
                      <button
                        type="button"
                        className="rounded-[6px] border border-[#E4D3A8] bg-white px-2.5 py-1 text-xs font-medium text-[#8A6A24]"
                        data-testid={`create-package-toggle-${activationId}`}
                        aria-pressed={selected}
                        onClick={() => onToggleActivation(activationId)}
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="shrink-0 rounded-[6px] border border-[#E4D3A8] bg-white px-2.5 py-1 text-xs font-medium text-[#8A6A24]"
                      data-testid={`create-package-toggle-${activationId}`}
                      aria-pressed={selected}
                      onClick={() => onToggleActivation(activationId)}
                    >
                      {"Add"}
                    </button>
                  )
                ) : null
              }
            />
          );
        })}
      </ul>
      <PackageDetailsDialog
        card={detail}
        money={money}
        included={detail != null && included.some((card) => card.id === detail.id)}
        onClose={() => setDetailId(null)}
      />
    </>
  );
}

function AddOnCard({
  card,
  money,
  treatment,
  selected = false,
  unavailable = null,
  action,
  onViewDetails,
}: {
  card: AvailablePackageCard;
  money: (value: number) => string;
  treatment: "included" | "optional";
  selected?: boolean;
  unavailable?: string | null;
  action?: ReactNode;
  onViewDetails: () => void;
}) {
  const included = treatment === "included";
  const price = packagePriceLine(card, money);
  const categories = [
    card.category.trim(),
    ...(card.serviceCategoryLabels ?? []).filter(
      (label) => label.trim().toLowerCase() !== card.category.trim().toLowerCase(),
    ),
  ].filter(Boolean);

  return (
    <li
      className={cn(
        "flex gap-3 rounded-lg border px-3 py-2.5",
        included || selected ? "border-[#C89933]/70 bg-[#FBF6EE]" : "border-[#E7E0D4] bg-white",
      )}
      data-testid={`create-package-${card.id}`}
      data-selected={selected ? "true" : "false"}
      data-inclusion={treatment}
    >
      <PackageCoverThumb
        coverUrl={card.coverUrl}
        name={card.name}
        className="size-16 shrink-0 object-cover"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[#251605]">{card.name}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {categories.slice(0, 2).map((label) => (
                <span
                  key={label}
                  className="rounded-full bg-[#F4E9D0] px-1.5 py-0.5 text-[10px] font-medium text-[#765719]"
                >
                  {label}
                </span>
              ))}
              <span className="rounded-full bg-[#EFE8DC] px-1.5 py-0.5 text-[10px] font-medium text-[#5C5346]">
                {card.chargeType}
              </span>
            </div>
          </div>
          {included ? (
            <span className="shrink-0 text-xs font-medium text-[#3D6B4F]">Included with rate ✓</span>
          ) : (
            action
          )}
        </div>
        {card.description.trim() ? (
          <p className="mt-1 line-clamp-2 text-xs text-[#6B5E4E]">{card.description.trim()}</p>
        ) : null}
        {price ? (
          <p className={cn("mt-1 text-xs", included ? "text-[#6B5E4E]" : "font-medium text-[#251605]")}>
            {included ? `Catalogue price ${price}` : price}
          </p>
        ) : null}
        {included ? (
          <p className="mt-0.5 text-[11px] text-[#6B5E4E]">
            Included in the selected rate — no additional charge.
          </p>
        ) : null}
        {unavailable ? (
          <p className="mt-0.5 text-[11px] text-[#9B3A3A]" data-testid={`create-package-unavailable-${card.id}`}>
            {unavailable}
          </p>
        ) : null}
        <button
          type="button"
          className="mt-1 text-[11px] font-medium text-[#8A6A24] underline-offset-2 hover:underline"
          data-testid={`create-package-details-${card.id}`}
          onClick={onViewDetails}
        >
          View details
        </button>
      </div>
    </li>
  );
}

function PackageDetailsDialog({
  card,
  money,
  included,
  onClose,
}: {
  card: AvailablePackageCard | null;
  money: (value: number) => string;
  included: boolean;
  onClose: () => void;
}) {
  const price = card ? packagePriceLine(card, money) : null;
  const benefits = card ? packageBenefitLines(card) : [];
  return (
    <Dialog open={card != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        overlayClassName="bg-[#1F140A]/60"
        className="z-[80] max-h-[85vh] overflow-y-auto border-[#DDD4C5] bg-[#F7F4EE] sm:max-w-md"
      >
        {card ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-base text-[#251605]">{card.name}</DialogTitle>
              <DialogDescription className="text-xs text-[#756A5B]">
                Package details from Package Master. Read only on this reservation.
              </DialogDescription>
            </DialogHeader>
            <PackageCoverThumb
              coverUrl={card.coverUrl}
              name={card.name}
              className="h-44 object-cover"
            />
            <div className="flex flex-wrap gap-1">
              {card.category.trim() ? (
                <span className="rounded-full bg-[#F4E9D0] px-2 py-0.5 text-[10px] font-medium text-[#765719]">
                  {card.category.trim()}
                </span>
              ) : null}
              {(card.serviceCategoryLabels ?? [])
                .filter(
                  (label) => label.trim().toLowerCase() !== card.category.trim().toLowerCase(),
                )
                .map((label) => (
                <span
                  key={label}
                  className="rounded-full bg-[#EFE8DC] px-2 py-0.5 text-[10px] font-medium text-[#5C5346]"
                >
                  {label}
                </span>
              ))}
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-[#5C5346]">
                {card.active === false ? "Inactive" : "Active"}
              </span>
            </div>
            {card.description.trim() ? (
              <p className="text-sm leading-relaxed text-[#251605]">{card.description.trim()}</p>
            ) : (
              <p className="text-sm text-[#6B5E4E]">No description on this package.</p>
            )}
            <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-[#6B5E4E]">Charge basis</dt>
              <dd className="text-[#251605]">{card.chargeType}</dd>
              {price ? (
                <>
                  <dt className="text-[#6B5E4E]">{included ? "Catalogue price" : "Price"}</dt>
                  <dd className="text-[#251605]">{price}</dd>
                </>
              ) : null}
              <dt className="text-[#6B5E4E]">Treatment</dt>
              <dd className="text-[#251605]">
                {included ? "Included with rate ✓" : "Optional add-on"}
              </dd>
            </dl>
            {included ? (
              <p className="text-xs text-[#6B5E4E]">
                Included in the selected rate — no additional charge.
              </p>
            ) : null}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B6458]">
                Benefits
              </p>
              {benefits.length === 0 ? (
                <p className="mt-1 text-xs text-[#6B5E4E]">No benefits listed on this package.</p>
              ) : (
                <ul className="mt-1 space-y-0.5 text-sm text-[#251605]">
                  {benefits.map((label) => (
                    <li key={label}>• {label}</li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

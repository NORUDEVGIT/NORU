import { ReservationPackageMerchandiseGrid } from "@/packages/pms/components/bookings/reservation-package-merchandise";
import { Button } from "@/shared/components/ui/button";
import {
  CREATE_RESERVATION_PACKAGES_GATE_BADGE,
  CREATE_RESERVATION_PACKAGES_NOT_ATTACHED,
  CREATE_RESERVATION_PACKAGES_SETTINGS_HREF,
  CREATE_RESERVATION_PACKAGES_SETTINGS_LINK,
  canShowPackagesSettingsLink,
  packagesGateCopy,
  resolveCreatePackagesGateView,
} from "@/packages/pms/lib/create-reservation-phase1-section8";
import type { AvailablePackageCard } from "@/packages/pms/lib/reservation-detail-packages";

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
}) {
  const view = resolveCreatePackagesGateView({
    loading,
    error,
    packagesAvailable,
    activePackageCount,
  });
  const showSettings = !operational && canShowPackagesSettingsLink(canEditSet3);
  const detectKind = view.kind;

  return (
    <section
      className="rounded-2xl border border-border bg-card p-4"
      data-testid="create-reservation-packages-gate"
      data-packages-detect={detectKind}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-lg">Packages</h2>
        <span
          data-testid="packages-gate-badge"
          className="inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800"
        >
          {CREATE_RESERVATION_PACKAGES_GATE_BADGE}
        </span>
      </div>
      {/* CREATE_RESERVATION_SECTION8_SCOPE */}
      <p className="mt-3 text-sm text-muted-foreground" data-testid="packages-gate-copy">
        {packagesGateCopy(view)}
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
          <p className="text-xs font-medium text-[#251605]">Stay packages (information only)</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {CREATE_RESERVATION_PACKAGES_NOT_ATTACHED}
          </p>
          <div className="mt-3">
            <ReservationPackageMerchandiseGrid
              cards={merchandiseCards}
              currency={merchandiseCurrency}
              money={money}
              emptyCopy="No packages match this room type and rate plan."
            />
          </div>
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

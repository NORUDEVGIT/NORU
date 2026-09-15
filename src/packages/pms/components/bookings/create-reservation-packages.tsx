import { Button } from "@/shared/components/ui/button";
import {
  CREATE_RESERVATION_PACKAGES_GATE_BADGE,
  CREATE_RESERVATION_PACKAGES_SETTINGS_HREF,
  CREATE_RESERVATION_PACKAGES_SETTINGS_LINK,
  CREATE_RESERVATION_SECTION8_SCOPE,
  canShowPackagesSettingsLink,
  packagesGateCopy,
  resolveCreatePackagesGateView,
} from "@/packages/pms/lib/create-reservation-phase1-section8";

export function CreateReservationPackages({
  loading,
  error,
  packagesAvailable,
  activePackageCount,
  canEditSet3,
}: {
  loading: boolean;
  error: boolean;
  packagesAvailable: boolean;
  activePackageCount: number;
  canEditSet3: boolean;
}) {
  const view = resolveCreatePackagesGateView({
    loading,
    error,
    packagesAvailable,
    activePackageCount,
  });
  const showSettings = canShowPackagesSettingsLink(canEditSet3);
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
      <p className="mt-1 text-xs text-muted-foreground">{CREATE_RESERVATION_SECTION8_SCOPE}</p>
      <p className="mt-3 text-sm text-muted-foreground" data-testid="packages-gate-copy">
        {packagesGateCopy(view)}
      </p>
      {showSettings ? (
        <div className="mt-3">
          <Button asChild variant="outline" size="sm">
            <a href={CREATE_RESERVATION_PACKAGES_SETTINGS_HREF} data-testid="packages-settings-link">
              {CREATE_RESERVATION_PACKAGES_SETTINGS_LINK}
            </a>
          </Button>
        </div>
      ) : null}
    </section>
  );
}

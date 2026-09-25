import { CARD3_HREF } from "@/packages/pms/lib/pms-property-setup-card3";
import { COMMERCIAL_ACTIVATION_FOUNDATION_COPY } from "@/packages/pms/lib/revenue/commercial-overview";
import {
  packageTypeLabel,
  type PackageWorkspaceMaster,
} from "@/packages/pms/lib/revenue/commercial-packages-ui";
import { formatHistoryMoney } from "@/packages/pms/lib/revenue/rate-history";
import { Sheet, SheetContent } from "@/shared/components/ui/sheet";
import { commercialGoldButton, commercialOutlineButton } from "./commercial-ui";

export function CommercialActivationIntentSheet({
  open,
  title,
  canManage,
  entity = "chooser",
  masters = [],
  currency = "ETB",
  selectedPackageId = null,
  onSelectPackage,
  onClose,
  onChoosePromotion,
  onChoosePackage,
}: {
  open: boolean;
  title: string;
  canManage: boolean;
  entity?: "chooser" | "promotion" | "package";
  masters?: PackageWorkspaceMaster[];
  currency?: string;
  selectedPackageId?: string | null;
  onSelectPackage?: (packageId: string) => void;
  onClose: () => void;
  onChoosePromotion: () => void;
  onChoosePackage?: () => void;
}) {
  const money = (value: number) => formatHistoryMoney(value, currency);
  const selected = masters.find((row) => row.id === selectedPackageId) ?? null;

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="right" className="w-[92vw] max-w-md p-0">
        <div className="flex h-full flex-col bg-[#F7F4EE]">
          <div className="border-b border-[#E8E1D7] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Commercial
            </p>
            <h3 className="mt-1 font-display text-lg font-semibold text-[#251605]">{title}</h3>
          </div>
          <div className="space-y-3 p-4">
            {entity === "chooser" ? (
              <>
                <p className="text-xs leading-5 text-muted-foreground">{COMMERCIAL_ACTIVATION_FOUNDATION_COPY}</p>
                <button
                  type="button"
                  className={`${commercialGoldButton(!canManage)} w-full justify-center`}
                  disabled={!canManage}
                  onClick={onChoosePromotion}
                >
                  Promotion
                </button>
                <button
                  type="button"
                  className={`${commercialOutlineButton()} w-full justify-center`}
                  disabled={!canManage}
                  onClick={onChoosePackage}
                >
                  Package
                </button>
              </>
            ) : null}
            {entity === "package" ? (
              <>
                <p className="text-xs leading-5 text-muted-foreground">{COMMERCIAL_ACTIVATION_FOUNDATION_COPY}</p>
                {masters.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No packages are configured in Property Setup.</p>
                ) : (
                  <ul className="max-h-64 space-y-1 overflow-y-auto">
                    {masters.map((master) => (
                      <li key={master.id}>
                        <button
                          type="button"
                          className={[
                            "w-full rounded-lg border px-3 py-2 text-left",
                            selectedPackageId === master.id
                              ? "border-[#C89933] bg-[#F8F1E5]"
                              : "border-[#E8E1D7] bg-white hover:bg-[#F8F1E5]",
                          ].join(" ")}
                          onClick={() => onSelectPackage?.(master.id)}
                        >
                          <p className="text-[11px] font-medium text-[#251605]">{master.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {master.code} · {packageTypeLabel(master.type)} · {money(master.packagePrice)}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {selected ? (
                  <p className="text-[10px] text-muted-foreground">
                    Selected {selected.code}. The activation workflow comes next and will use this package.
                  </p>
                ) : null}
              </>
            ) : null}
            {entity === "promotion" ? (
              <p className="text-xs leading-5 text-muted-foreground">{COMMERCIAL_ACTIVATION_FOUNDATION_COPY}</p>
            ) : null}
            <a href={CARD3_HREF} className={`${commercialOutlineButton()} w-full justify-center`}>
              View Property Setup
            </a>
            {!canManage ? (
              <p className="text-[10px] text-[#6B4A0A]">You do not have permission to manage activations.</p>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

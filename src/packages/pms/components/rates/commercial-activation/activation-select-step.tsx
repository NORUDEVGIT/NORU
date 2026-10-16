import { CARD3_PACKAGES_HREF, CARD3_PROMOTIONS_HREF } from "@/packages/pms/lib/pms-property-setup-card3";
import {
  ACTIVATION_FREE_NIGHT_COPY,
  promotionSelectCanAdvance,
} from "@/packages/pms/lib/revenue/commercial-activation-workflow";
import {
  commercialKindLabel,
  commercialValueLabel,
  type PromotionWorkspaceMaster,
} from "@/packages/pms/lib/revenue/commercial-overview";
import {
  packageTypeLabel,
  type PackageWorkspaceMaster,
} from "@/packages/pms/lib/revenue/commercial-packages-ui";
import { formatHistoryMoney } from "@/packages/pms/lib/revenue/rate-history";
import { commercialOutlineButton } from "../commercial/commercial-ui";

export function PromotionSelectStep({
  masters,
  selectedId,
  currency,
  onSelect,
}: {
  masters: PromotionWorkspaceMaster[];
  selectedId: string | null;
  currency: string;
  onSelect: (id: string) => void;
}) {
  const money = (value: number) => formatHistoryMoney(value, currency);
  const selected = masters.find((row) => row.id === selectedId) ?? null;
  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-[#251605]">Select Promotion Master</h4>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Selection is read-only. Master terms stay in Property Setup.
        </p>
      </div>
      {masters.length === 0 ? (
        <p className="text-xs text-muted-foreground">No promotions are configured in Property Setup.</p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {masters.map((master) => {
            const selectable = promotionSelectCanAdvance(master);
            return (
              <li key={master.id}>
                <button
                  type="button"
                  disabled={!selectable && master.kind !== "free_night" && !master.active}
                  className={[
                    "w-full rounded-lg border px-3 py-2 text-left",
                    selectedId === master.id ? "border-[#C89933] bg-[#F8F1E5]" : "border-[#E8E1D7] bg-white hover:bg-[#F8F1E5]",
                    !selectable ? "opacity-70" : "",
                  ].join(" ")}
                  onClick={() => onSelect(master.id)}
                >
                  <p className="text-[11px] font-medium text-[#251605]">{master.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {master.code} · {commercialKindLabel(master.kind)} · {commercialValueLabel(master.kind, master.value, money)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Master validity {master.validFrom} – {master.validTo} · {master.active ? "Active master" : "Inactive master"}
                  </p>
                  {master.kind === "free_night" ? (
                    <p className="mt-1 text-[10px] text-[#6B4A0A]">{ACTIVATION_FREE_NIGHT_COPY}</p>
                  ) : null}
                  {!master.active ? (
                    <p className="mt-1 text-[10px] text-[#6B4A0A]">Inactive masters cannot be activated.</p>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {selected ? (
        <p className="text-[10px] text-muted-foreground">
          Selected {selected.code}. Master value and terms cannot be edited here.
        </p>
      ) : null}
      <a href={CARD3_PROMOTIONS_HREF} className={`${commercialOutlineButton()} w-full justify-center`}>
        View in Property Setup
      </a>
    </div>
  );
}

export function PackageSelectStep({
  masters,
  selectedId,
  currency,
  onSelect,
}: {
  masters: PackageWorkspaceMaster[];
  selectedId: string | null;
  currency: string;
  onSelect: (id: string) => void;
}) {
  const money = (value: number) => formatHistoryMoney(value, currency);
  const selected = masters.find((row) => row.id === selectedId) ?? null;
  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-[#251605]">Select Package Master</h4>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Selection is read-only. Package price and components stay in Property Setup.
        </p>
      </div>
      {masters.length === 0 ? (
        <p className="text-xs text-muted-foreground">No packages are configured in Property Setup.</p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {masters.map((master) => (
            <li key={master.id}>
              <button
                type="button"
                className={[
                  "w-full rounded-lg border px-3 py-2 text-left",
                  selectedId === master.id ? "border-[#C89933] bg-[#F8F1E5]" : "border-[#E8E1D7] bg-white hover:bg-[#F8F1E5]",
                  !master.active ? "opacity-70" : "",
                ].join(" ")}
                onClick={() => onSelect(master.id)}
              >
                <p className="text-[11px] font-medium text-[#251605]">{master.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {master.code} · {packageTypeLabel(master.type)} · {money(master.packagePrice)} · {master.componentCount} components
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {master.active ? "Active master" : "Inactive master"}
                </p>
                {!master.active ? (
                  <p className="mt-1 text-[10px] text-[#6B4A0A]">Inactive masters cannot be activated.</p>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected ? (
        <p className="text-[10px] text-muted-foreground">
          Selected {selected.code}. Price and components cannot be edited here.
        </p>
      ) : null}
      <a href={CARD3_PACKAGES_HREF} className={`${commercialOutlineButton()} w-full justify-center`}>
        View in Property Setup
      </a>
    </div>
  );
}

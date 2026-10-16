import type { ReactNode } from "react";
import { Package } from "lucide-react";

import { reviewDash } from "@/packages/pms/lib/create-reservation-review";
import { DETAIL_DASH } from "@/packages/pms/lib/reservation-detail-overview";
import type { AvailablePackageCard } from "@/packages/pms/lib/reservation-detail-packages";

export function PackageCoverThumb({
  coverUrl,
  name,
  className = "h-16",
}: {
  coverUrl: string | null;
  name: string;
  className?: string;
}) {
  if (coverUrl) {
    return (
      <img
        src={coverUrl}
        alt=""
        className={`w-full rounded-md object-cover ${className}`}
        loading="lazy"
      />
    );
  }
  return (
    <div
      className={`flex w-full items-center justify-center rounded-md bg-[#EFE8DC] text-[#8A7B68] ${className}`}
      aria-hidden
    >
      <Package className="size-7" />
    </div>
  );
}

function packageEligibilityBadge(card: AvailablePackageCard): string | null {
  if (card.eligibilityStatus === "unevaluated") return "Select a rate plan to evaluate";
  if (card.eligibilityStatus === "activation_eligible") return "Available (activation)";
  if (card.eligibilityStatus === "catalogue_only") return "Catalogue only";
  return null;
}

export function ReservationPackageMerchandiseCard({
  card,
  currency,
  money,
  footer,
}: {
  card: AvailablePackageCard;
  currency: string;
  money: (value: number) => string;
  footer?: ReactNode;
}) {
  const status = packageEligibilityBadge(card);
  const componentOverflow = card.components.length > 3 ? card.components.length - 3 : 0;

  return (
    <article
      className="rounded-xl border border-[#EEE6D8] bg-[#FFFcf7] p-3"
      data-testid={`package-merchandise-${card.code}`}
    >
      <PackageCoverThumb coverUrl={card.coverUrl} name={card.name} />
      <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-[#251605]">{card.name}</p>
          <p className="text-[11px] text-muted-foreground">{reviewDash(card.code)}</p>
        </div>
        <span className="shrink-0 rounded-full bg-[#F4E9D0] px-2 py-0.5 text-[10px] font-semibold text-[#765719]">
          {card.category}
        </span>
      </div>
      {card.inclusionLabel ? (
        <p className="mt-1 text-[11px] font-medium text-[#5C4A2A]">{card.inclusionLabel}</p>
      ) : null}
      {status ? (
        <p
          className="mt-1 text-[10px] text-muted-foreground"
          data-testid="package-eligibility-hint"
        >
          {status}
        </p>
      ) : null}
      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
        {reviewDash(card.description)}
      </p>
      <ul className="mt-2 space-y-0.5 text-xs text-[#251605]">
        {card.components.length === 0 ? (
          <li className="text-muted-foreground">{DETAIL_DASH}</li>
        ) : (
          <>
            {card.components.slice(0, 3).map((item) => (
              <li key={item}>• {item}</li>
            ))}
            {componentOverflow > 0 ? (
              <li className="text-muted-foreground">+ {componentOverflow} more</li>
            ) : null}
          </>
        )}
      </ul>
      <p className="mt-2 text-[10px] text-muted-foreground">
        {card.applicabilityRoom} · {card.applicabilityRate}
      </p>
      <div className="mt-3">
        <p className="text-sm font-medium text-[#251605]">
          {card.price == null ? DETAIL_DASH : money(card.price)}
          <span className="ml-1 text-[11px] font-normal text-muted-foreground">
            {currency}
            {card.chargeType ? ` · ${card.chargeType}` : ""}
          </span>
        </p>
        {card.chargeBasisHonesty ? (
          <p className="mt-1 text-[10px] leading-snug text-amber-900/80">
            {card.chargeBasisHonesty}
          </p>
        ) : null}
      </div>
      {footer ? <div className="mt-3 flex justify-end">{footer}</div> : null}
    </article>
  );
}

export function ReservationPackageMerchandiseGrid({
  cards,
  currency,
  money,
  emptyCopy,
  renderFooter,
}: {
  cards: AvailablePackageCard[];
  currency: string;
  money: (value: number) => string;
  emptyCopy: string;
  renderFooter?: (card: AvailablePackageCard) => ReactNode;
}) {
  if (cards.length === 0) {
    return (
      <p
        className="py-4 text-center text-sm text-muted-foreground"
        data-testid="package-merchandise-empty"
      >
        {emptyCopy}
      </p>
    );
  }
  return (
    <div
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      data-testid="package-merchandise-grid"
    >
      {cards.map((card) => (
        <ReservationPackageMerchandiseCard
          key={card.id}
          card={card}
          currency={currency}
          money={money}
          footer={renderFooter?.(card)}
        />
      ))}
    </div>
  );
}

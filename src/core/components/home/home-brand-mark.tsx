import { NoruLogo } from "@/core/components/noru-logo";
import type { BrandContent } from "@/core/lib/marketing";

export function HomeBrandMark({ brand, size = "sm" }: { brand: BrandContent; size?: "sm" | "md" }) {
  if (!brand.logoUrl) {
    return <NoruLogo size={size} />;
  }

  const imgSize = size === "sm" ? "size-7" : "size-9";
  const textSize = size === "sm" ? "text-base" : "text-lg";

  return (
    <span className="inline-flex items-center gap-2">
      <img
        src={brand.logoUrl}
        alt=""
        className={`${imgSize} shrink-0 rounded-full object-cover`}
        draggable={false}
      />
      <span className={`font-display font-semibold tracking-wide ${textSize}`}>{brand.siteName}</span>
    </span>
  );
}

import noruLogoAsset from "@/assets/noru-logo.png.asset.json";
import { cn } from "@/shared/lib/utils";

/**
 * Official NORU mark (circular white-on-brown disc) with optional wordmark.
 * On dark sidebar surfaces the disc is kept as-is; the wordmark adapts.
 */
export function NoruLogo({
  size = "md",
  withWordmark = true,
  className,
  wordmarkClassName,
}: {
  size?: "sm" | "md" | "lg";
  withWordmark?: boolean;
  className?: string;
  wordmarkClassName?: string;
}) {
  const imgSize = { sm: "size-7", md: "size-9", lg: "size-16" }[size];
  const textSize = { sm: "text-base", md: "text-lg", lg: "text-2xl" }[size];
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <img
        src={noruLogoAsset.url}
        alt="NORU logo"
        className={cn(imgSize, "shrink-0 rounded-full object-cover")}
        draggable={false}
      />
      {withWordmark ? (
        <span className={cn("font-display font-semibold tracking-wide", textSize, wordmarkClassName)}>
          NORU
        </span>
      ) : null}
    </span>
  );
}

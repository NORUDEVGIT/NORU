import type { CSSProperties } from "react";
import { Building2, Crown, MessageSquare, Users } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { FO_BRAND } from "@/packages/pms/lib/front-office-shell";
import { type LiveStayBadge, type StayBadgeId } from "@/packages/pms/lib/fo-rack-power";

const ICONS: Record<StayBadgeId, typeof Crown> = {
  vip_badge: Crown,
  group_badge: Users,
  corporate_badge: Building2,
  special_request_badge: MessageSquare,
};

function badgeStyle(tone: LiveStayBadge["tone"]): { className: string; style: CSSProperties } {
  if (tone === "gold") {
    return {
      className: "border-transparent text-[#251605]",
      style: { backgroundColor: FO_BRAND.gold },
    };
  }
  if (tone === "green") {
    return {
      className: "border-transparent text-white",
      style: { backgroundColor: FO_BRAND.green },
    };
  }
  return {
    className: "bg-transparent text-[#251605]",
    style: { borderColor: FO_BRAND.chrome },
  };
}

export function StayBadgeStrip({
  badges,
  mode,
}: {
  badges: LiveStayBadge[];
  mode: "full" | "compact";
}) {
  if (badges.length === 0) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5" data-testid="fo-stay-badges">
      {badges.map((badge) => (
        <StayBadge key={badge.id} badge={badge} mode={mode} />
      ))}
    </span>
  );
}

export function StayBadge({ badge, mode }: { badge: LiveStayBadge; mode: "full" | "compact" }) {
  const Icon = ICONS[badge.id];
  const look = badgeStyle(badge.tone);
  const inner = (
    <span
      data-testid={badge.id}
      className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${look.className}`}
      style={look.style}
    >
      <Icon className="size-3" aria-hidden />
      {mode === "full" ? badge.label : <span className="sr-only">{badge.label}</span>}
    </span>
  );
  if (mode === "compact") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{inner}</TooltipTrigger>
        <TooltipContent>{badge.label}</TooltipContent>
      </Tooltip>
    );
  }
  return inner;
}

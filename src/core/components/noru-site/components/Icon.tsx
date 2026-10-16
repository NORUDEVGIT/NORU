import type { ReactElement } from "react";
import type { NoruSiteIcon } from "@/core/lib/marketing/types";

export type IconName = NoruSiteIcon;

const SHAPES: Record<IconName, ReactElement> = {
  pms: <path d="M3 20V9l9-5 9 5v11M9 20v-6h6v6" />,
  rms: <path d="M6 3v8M9 3v8M6 7h3M7.5 11v10M17 3c-2 2-2 6 0 8v10" />,
  pos: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" />,
  back: <path d="M4 20h16M7 16v-5M12 16V6M17 16v-8" />,
  guest: <path d="M3 11l9-7 9 7M5 10v10h14V10M10 20v-5h4v5" />,
  resorts: (
    <>
      <circle cx="12" cy="9" r="4" />
      <path d="M3 20c3-3 6-3 9 0s6 3 9 0M12 1v2M4 9H2M22 9h-2" />
    </>
  ),
  about: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01M11 12h1v5h1" />
    </>
  ),
  blogs: <path d="M5 4h14v16H5zM8 9h8M8 13h8M8 17h5" />,
  testimonials: <path d="M4 5h16v11H9l-5 4z" />,
  contact: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </>
  ),
};

export function Icon({ name }: { name: IconName }) {
  return (
    <span className="ic" aria-hidden="true">
      <svg viewBox="0 0 24 24">{SHAPES[name]}</svg>
    </span>
  );
}

export function ArrowIcon() {
  return (
    <svg className="ar" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

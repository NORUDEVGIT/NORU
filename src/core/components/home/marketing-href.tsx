import { forwardRef, type MouseEventHandler, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { FileRouteTypes } from "@/routeTree.gen";
import { isExternalHttpHref, isHashHref } from "@/core/lib/marketing";

type AppTo = FileRouteTypes["to"];

function isAppTo(href: string): href is AppTo {
  return href.startsWith("/") && !href.startsWith("//");
}

type MarketingHrefProps = {
  href: string;
  children?: ReactNode;
  className?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
};

/** Allowlisted marketing target: hash/external use <a>, app routes use TanStack Link. */
export const MarketingHref = forwardRef<HTMLAnchorElement, MarketingHrefProps>(
  function MarketingHref({ href, children, className, onClick }, ref) {
    if (isHashHref(href) || isExternalHttpHref(href) || !isAppTo(href)) {
      return (
        <a
          ref={ref}
          href={href}
          className={className}
          onClick={onClick}
          {...(isExternalHttpHref(href) ? { target: "_blank" as const, rel: "noopener noreferrer" } : {})}
        >
          {children}
        </a>
      );
    }

    return (
      <Link ref={ref} to={href} className={className} onClick={onClick}>
        {children}
      </Link>
    );
  },
);

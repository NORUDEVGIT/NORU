import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useOrder } from "@/packages/restaurant-management/state/order-store";

type OrderPage = "cart" | "table" | "review" | "confirmation" | "status";

const PAGE_ROUTES = {
  cart: "/r/$restaurantSlug/cart",
  table: "/r/$restaurantSlug/table",
  review: "/r/$restaurantSlug/review",
  confirmation: "/r/$restaurantSlug/confirmation",
  status: "/r/$restaurantSlug/status",
} as const;

interface BaseProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  "aria-label"?: string;
}

/**
 * Links back to the menu of the restaurant currently being ordered from.
 * Falls back to the platform homepage when no tenant is selected yet.
 */
export function MenuLink({ children, className, onClick, ...rest }: BaseProps) {
  const { restaurantSlug } = useOrder();
  if (restaurantSlug) {
    return (
      <Link
        to="/r/$restaurantSlug"
        params={{ restaurantSlug }}
        className={className}
        onClick={onClick}
        {...rest}
      >
        {children}
      </Link>
    );
  }
  return (
    <Link to="/" className={className} onClick={onClick} {...rest}>
      {children}
    </Link>
  );
}

/**
 * Tenant-aware link to a nested ordering page. Without a tenant in context the
 * link points at the platform homepage — never at a default restaurant.
 */
export function OrderLink({
  page,
  children,
  className,
  onClick,
  ...rest
}: BaseProps & { page: OrderPage }) {
  const { restaurantSlug } = useOrder();
  if (!restaurantSlug) {
    return (
      <Link to="/" className={className} onClick={onClick} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <Link
      to={PAGE_ROUTES[page]}
      params={{ restaurantSlug }}
      className={className}
      onClick={onClick}
      {...rest}
    >
      {children}
    </Link>
  );
}

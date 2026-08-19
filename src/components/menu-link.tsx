import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useOrder } from "@/state/order-store";

/**
 * Links back to the menu of the restaurant currently being ordered from.
 * Falls back to the platform homepage when no tenant is selected yet.
 */
export function MenuLink({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const { restaurantSlug } = useOrder();
  if (restaurantSlug) {
    return (
      <Link
        to="/r/$restaurantSlug"
        params={{ restaurantSlug }}
        className={className}
        onClick={onClick}
      >
        {children}
      </Link>
    );
  }
  return (
    <Link to="/" className={className} onClick={onClick}>
      {children}
    </Link>
  );
}

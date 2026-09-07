import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Search, ShoppingBag, Menu, X } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/components/ui/sheet";
import { MenuLink, OrderLink } from "@/components/menu-link";
import { useOrder } from "@/core/state/order-store";
import { useAuth } from "@/core/state/auth-store";
import { useMoney } from "@/core/state/restaurant-context";

interface SiteHeaderProps {
  /** Category names come from the restaurant's database menu. */
  categories?: string[];
  restaurantName?: string;
  search?: string;
  onSearchChange?: (value: string) => void;
  onSelectCategory?: (category: string) => void;
}

export function SiteHeader({ categories = [], restaurantName = "Order to your table", search, onSearchChange, onSelectCategory }: SiteHeaderProps) {
  const money = useMoney();
  const { itemCount, total } = useOrder();
  const { user, loading: authLoading } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const searchable = typeof onSearchChange === "function";

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto grid max-w-6xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-4 py-3">
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="size-11 rounded-full" aria-label="Open menu">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[85vw] max-w-sm">
            <SheetHeader>
              <SheetTitle className="font-display text-2xl">{restaurantName}</SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 px-4 pb-6">
              {categories.map((category) => (
                <MenuLink
                  key={category}
                  onClick={() => {
                    onSelectCategory?.(category);
                    setNavOpen(false);
                  }}
                  className="rounded-xl px-3 py-3 text-base font-medium transition-colors hover:bg-secondary"
                >
                  {category}
                </MenuLink>
              ))}
              <div className="my-3 h-px bg-border" />
              <OrderLink page="cart" onClick={() => setNavOpen(false)} className="rounded-xl px-3 py-3 text-base font-medium hover:bg-secondary">
                Your order
              </OrderLink>
              <OrderLink page="status" onClick={() => setNavOpen(false)} className="rounded-xl px-3 py-3 text-base font-medium hover:bg-secondary">
                Order status
              </OrderLink>
              <div className="my-3 h-px bg-border" />
              {authLoading ? null : user ? (
                <>
                  <Link to="/account" onClick={() => setNavOpen(false)} className="rounded-xl px-3 py-3 text-base font-medium hover:bg-secondary">
                    Account
                  </Link>
                  <Link to="/account/orders" onClick={() => setNavOpen(false)} className="rounded-xl px-3 py-3 text-base font-medium hover:bg-secondary">
                    Your orders
                  </Link>
                </>
              ) : (
                <>
                  <Link to="/login" onClick={() => setNavOpen(false)} className="rounded-xl px-3 py-3 text-sm text-muted-foreground hover:bg-secondary">
                    Log in (optional — for order history)
                  </Link>
                  <Link to="/register" onClick={() => setNavOpen(false)} className="rounded-xl px-3 py-3 text-sm text-muted-foreground hover:bg-secondary">
                    Create an account (optional)
                  </Link>
                </>
              )}
            </nav>
          </SheetContent>
        </Sheet>

        <MenuLink className="flex min-w-0 items-center justify-center gap-2">
          <span className="truncate font-display text-lg font-semibold sm:text-xl">
            {restaurantName}
          </span>
        </MenuLink>

        <div className="flex items-center gap-1">
          {searchable ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-11 rounded-full"
              aria-label={searchOpen ? "Close search" : "Search menu"}
              onClick={() => {
                setSearchOpen((prev) => !prev);
                if (searchOpen) onSearchChange?.("");
              }}
            >
              {searchOpen ? <X className="size-5" /> : <Search className="size-5" />}
            </Button>
          ) : null}
          <Button asChild size="lg" className="h-11 rounded-full px-3 sm:px-4">
            <OrderLink page="cart" aria-label="View your order">
              <ShoppingBag className="size-5" />
              <span className="ml-1 text-sm font-semibold tabular-nums">{itemCount}</span>
              <span className="ml-2 hidden text-sm font-semibold tabular-nums sm:inline">
                {money(total)}
              </span>
            </OrderLink>
          </Button>
        </div>
      </div>

      {searchable && searchOpen ? (
        <div className="mx-auto max-w-6xl px-4 pb-3">
          <Input
            autoFocus
            value={search ?? ""}
            onChange={(event) => onSearchChange?.(event.target.value)}
            placeholder="Search the menu..."
            className="h-12 rounded-full bg-card px-5 text-base"
          />
        </div>
      ) : null}
    </header>
  );
}

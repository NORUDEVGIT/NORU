import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Leaf, Search, ShoppingBag, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { CATEGORIES, RESTAURANT, formatPrice } from "@/data/menu";
import { useOrder } from "@/state/order-store";

interface SiteHeaderProps {
  search?: string;
  onSearchChange?: (value: string) => void;
  onSelectCategory?: (category: string) => void;
}

export function SiteHeader({ search, onSearchChange, onSelectCategory }: SiteHeaderProps) {
  const { itemCount, total } = useOrder();
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
              <SheetTitle className="font-display text-2xl">{RESTAURANT.name}</SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 px-4 pb-6">
              {CATEGORIES.map((category) => (
                <Link
                  key={category}
                  to="/"
                  onClick={() => {
                    onSelectCategory?.(category);
                    setNavOpen(false);
                  }}
                  className="rounded-xl px-3 py-3 text-base font-medium transition-colors hover:bg-secondary"
                >
                  {category}
                </Link>
              ))}
              <div className="my-3 h-px bg-border" />
              <Link to="/cart" onClick={() => setNavOpen(false)} className="rounded-xl px-3 py-3 text-base font-medium hover:bg-secondary">
                Your order
              </Link>
              <Link to="/status" onClick={() => setNavOpen(false)} className="rounded-xl px-3 py-3 text-base font-medium hover:bg-secondary">
                Order status
              </Link>
            </nav>
          </SheetContent>
        </Sheet>

        <Link to="/" className="flex min-w-0 items-center justify-center gap-2">
          <Leaf className="size-5 shrink-0 text-accent" />
          <span className="truncate font-display text-lg font-semibold sm:text-xl">
            {RESTAURANT.name}
          </span>
        </Link>

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
            <Link to="/cart" aria-label="View your order">
              <ShoppingBag className="size-5" />
              <span className="ml-1 text-sm font-semibold tabular-nums">{itemCount}</span>
              <span className="ml-2 hidden text-sm font-semibold tabular-nums sm:inline">
                {formatPrice(total)}
              </span>
            </Link>
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

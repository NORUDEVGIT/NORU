import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { NoruLogo } from "@/components/noru-logo";
import { Button } from "@/shared/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/shared/components/ui/sheet";
import { cn } from "@/shared/lib/utils";

const NAV_LINKS = [
  { label: "Home", href: "#top" },
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "For Restaurants", href: "#for-restaurants" },
  { label: "Contact", href: "#contact" },
];

export function HomeNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b transition-colors",
        scrolled
          ? "border-border bg-background/90 backdrop-blur-md"
          : "border-transparent bg-background",
      )}
    >
      <div className="mx-auto grid max-w-6xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
        <a href="#top" className="flex min-w-0 items-center" aria-label="NORU home">
          <NoruLogo size="sm" />
        </a>

        <nav className="hidden justify-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" className="hidden h-11 rounded-full px-4 sm:inline-flex">
            <Link to="/restaurant/login">Sign In</Link>
          </Button>
          <Button
            asChild
            className="hidden h-11 rounded-full bg-accent px-5 font-semibold text-accent-foreground hover:bg-accent/90 sm:inline-flex"
          >
            <Link to="/restaurant/register">Get Started</Link>
          </Button>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="size-11 rounded-full lg:hidden" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[85vw] max-w-sm">
              <SheetHeader>
                <SheetTitle className="text-left">
                  <NoruLogo size="sm" />
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-4 pb-6">
                {NAV_LINKS.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="rounded-xl px-3 py-3 text-base font-medium hover:bg-secondary"
                  >
                    {link.label}
                  </a>
                ))}
                <div className="my-3 h-px bg-border" />
                <Button asChild variant="outline" className="h-12 rounded-full">
                  <Link to="/restaurant/login" onClick={() => setOpen(false)}>
                    Sign In
                  </Link>
                </Button>
                <Button
                  asChild
                  className="mt-2 h-12 rounded-full bg-accent font-semibold text-accent-foreground hover:bg-accent/90"
                >
                  <Link to="/restaurant/register" onClick={() => setOpen(false)}>
                    Get Started
                  </Link>
                </Button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

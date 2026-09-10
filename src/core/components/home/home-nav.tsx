import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { HomeBrandMark } from "@/core/components/home/home-brand-mark";
import { MarketingHref } from "@/core/components/home/marketing-href";
import { Button } from "@/shared/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/shared/components/ui/sheet";
import { cn } from "@/shared/lib/utils";
import { visibleNav } from "@/core/lib/marketing";
import { usePublicMarketing } from "@/core/components/home/marketing-content-context";

export function HomeNav() {
  const marketing = usePublicMarketing();
  const pageLinks = visibleNav(marketing, "page");
  const authLinks = visibleNav(marketing, "auth");
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
        <a href="#top" className="flex min-w-0 items-center" aria-label={`${marketing.brand.siteName} home`}>
          <HomeBrandMark brand={marketing.brand} />
        </a>

        <nav className="hidden justify-center gap-1 lg:flex" aria-label="Page">
          {pageLinks.map((link) => (
            <MarketingHref
              key={link.id}
              href={link.href}
              className="rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {link.label}
            </MarketingHref>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {authLinks.map((item) => (
            <Button
              key={item.id}
              asChild
              variant={item.protectedRole === "sign_up" ? "default" : "ghost"}
              className={
                item.protectedRole === "sign_up"
                  ? "hidden h-11 rounded-full bg-accent px-5 font-semibold text-accent-foreground hover:bg-accent/90 sm:inline-flex"
                  : "hidden h-11 rounded-full px-4 sm:inline-flex"
              }
            >
              <MarketingHref href={item.href}>{item.label}</MarketingHref>
            </Button>
          ))}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="size-11 rounded-full lg:hidden" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[85vw] max-w-sm">
              <SheetHeader>
                <SheetTitle className="text-left">
                  <HomeBrandMark brand={marketing.brand} />
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-4 pb-6" aria-label="Page">
                {pageLinks.map((link) => (
                  <MarketingHref
                    key={link.id}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="rounded-xl px-3 py-3 text-base font-medium hover:bg-secondary"
                  >
                    {link.label}
                  </MarketingHref>
                ))}
                <div className="my-3 h-px bg-border" />
                {authLinks.map((item) => (
                  <Button
                    key={item.id}
                    asChild
                    variant={item.protectedRole === "sign_up" ? "default" : "outline"}
                    className={
                      item.protectedRole === "sign_up"
                        ? "mt-2 h-12 rounded-full bg-accent font-semibold text-accent-foreground hover:bg-accent/90"
                        : "h-12 rounded-full"
                    }
                  >
                    <MarketingHref href={item.href} onClick={() => setOpen(false)}>
                      {item.label}
                    </MarketingHref>
                  </Button>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/shared/components/ui/button";
import { HomeNav } from "@/core/components/home/home-nav";
import { HomeHero } from "@/core/components/home/home-hero";
import { HomePackages } from "@/core/components/home/home-packages";
import { HomeFeatures } from "@/core/components/home/home-features";
import { HomeSteps } from "@/core/components/home/home-steps";
import { HomeShowcase } from "@/core/components/home/home-showcase";
import { HomeBenefits } from "@/core/components/home/home-benefits";
import { HomePricing } from "@/core/components/home/home-pricing";
import { HomeCta } from "@/core/components/home/home-cta";
import { HomeFooter } from "@/core/components/home/home-footer";
import { useAuth } from "@/core/state/auth-store";
import { getMyRestaurants } from "@/core/lib/restaurant.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NORU — Hospitality management platform" },
      {
        name: "description",
        content:
          "NORU is a hospitality management platform for Restaurant Management, PMS, Standalone POS and Back Office Management.",
      },
      { property: "og:title", content: "NORU — Hospitality management platform" },
      {
        property: "og:description",
        content:
          "Four commercial packages for hotels and restaurants: Restaurant Management, PMS, Standalone POS and Back Office Management.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PlatformHome,
});

function PlatformHome() {
  const { session, user } = useAuth();
  const signedIn = Boolean(session);

  // Privileged entry points are only shown after the backend confirms the
  // caller's membership/role; the UI never assumes access from being signed in.
  const restaurants = useQuery({
    queryKey: ["home", "my-restaurants", user?.id],
    queryFn: () => getMyRestaurants(),
    enabled: signedIn,
    retry: false,
  });

  const hasRestaurant = Array.isArray(restaurants.data) && restaurants.data.length > 0;

  const shortcuts = signedIn ? (
    <>
      {hasRestaurant ? (
        <Button
          asChild
          variant="ghost"
          className="h-11 rounded-full px-4 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
        >
          <Link to="/restaurant/restaurant-management/dashboard">Restaurant Dashboard</Link>
        </Button>
      ) : null}
      <Button
        asChild
        variant="ghost"
        className="h-11 rounded-full px-4 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
      >
        <Link to="/account">My Account</Link>
      </Button>
    </>
  ) : null;

  return (
    <div className="min-h-dvh overflow-x-hidden bg-background">
      <HomeNav />
      <main>
        <HomeHero shortcuts={shortcuts} />
        <HomePackages />
        <HomeFeatures />
        <HomeSteps />
        <HomeShowcase />
        <HomeBenefits />
        <HomePricing />
        <HomeCta />
      </main>
      <HomeFooter />
    </div>
  );
}

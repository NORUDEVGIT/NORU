import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/shared/components/ui/button";
import { HomeNav } from "@/core/components/home/home-nav";
import { HomeHero } from "@/core/components/home/home-hero";
import { HomePartners } from "@/core/components/home/home-partners";
import { HomeFeatures } from "@/core/components/home/home-features";
import { HomeSteps } from "@/core/components/home/home-steps";
import { HomeShowcase } from "@/core/components/home/home-showcase";
import { HomeBenefits } from "@/core/components/home/home-benefits";
import { HomeTestimonials } from "@/core/components/home/home-testimonials";
import { HomeCta } from "@/core/components/home/home-cta";
import { HomeFooter } from "@/core/components/home/home-footer";
import { useAuth } from "@/core/state/auth-store";
import { getMyRestaurants } from "@/core/lib/restaurant.functions";
import { amIPlatformAdmin } from "@/core/lib/admin.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NORU — Run Your Restaurant Smarter" },
      {
        name: "description",
        content:
          "NORU is one platform for QR ordering, kitchen operations, staff management, table service and real-time restaurant insights.",
      },
      { property: "og:title", content: "NORU — Run Your Restaurant Smarter" },
      {
        property: "og:description",
        content:
          "QR ordering, kitchen operations, staff management and restaurant analytics in one platform.",
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
  const admin = useQuery({
    queryKey: ["home", "am-i-admin", user?.id],
    queryFn: () => amIPlatformAdmin(),
    enabled: signedIn,
    retry: false,
  });

  const hasRestaurant = Array.isArray(restaurants.data) && restaurants.data.length > 0;
  const isAdmin = admin.data?.isAdmin === true;

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
      {isAdmin ? (
        <Button
          asChild
          variant="ghost"
          className="h-11 rounded-full px-4 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
        >
          <Link to="/admin">Admin Dashboard</Link>
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
        <HomePartners />
        <HomeFeatures />
        <HomeSteps />
        <HomeShowcase />
        <HomeBenefits />
        <HomeTestimonials />
        <HomeCta />
      </main>
      <HomeFooter />
    </div>
  );
}

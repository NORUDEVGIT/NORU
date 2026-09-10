import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/shared/components/ui/button";
import { HomeNav } from "@/core/components/home/home-nav";
import { HomePromoBanners } from "@/core/components/home/home-promo-banners";
import { HomeHero } from "@/core/components/home/home-hero";
import { HomePackages } from "@/core/components/home/home-packages";
import { HomePartners } from "@/core/components/home/home-partners";
import { HomeFeatures } from "@/core/components/home/home-features";
import { HomeSteps } from "@/core/components/home/home-steps";
import { HomeShowcase } from "@/core/components/home/home-showcase";
import { HomeBenefits } from "@/core/components/home/home-benefits";
import { HomeTestimonials } from "@/core/components/home/home-testimonials";
import { HomeCaseStudies } from "@/core/components/home/home-case-studies";
import { HomeBlog } from "@/core/components/home/home-blog";
import { HomePricing } from "@/core/components/home/home-pricing";
import { HomeFaq } from "@/core/components/home/home-faq";
import { HomeCta } from "@/core/components/home/home-cta";
import { HomeFooter } from "@/core/components/home/home-footer";
import { useAuth } from "@/core/state/auth-store";
import { getMyRestaurants } from "@/core/lib/restaurant.functions";
import { getMarketingContent } from "@/core/lib/marketing";
import { getPublishedMarketingContent } from "@/core/lib/marketing.functions";
import { PublicMarketingProvider } from "@/core/components/home/marketing-content-context";

export const Route = createFileRoute("/")({
  loader: async () => {
    try {
      return { marketing: await getPublishedMarketingContent() };
    } catch {
      return { marketing: getMarketingContent() };
    }
  },
  head: ({ loaderData }) => {
    const marketing = loaderData?.marketing ?? getMarketingContent();
    return {
      meta: [
        { title: marketing.brand.seoTitle },
        { name: "description", content: marketing.brand.seoDescription },
        { property: "og:title", content: marketing.brand.seoTitle },
        { property: "og:description", content: marketing.brand.ogDescription },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: PlatformHome,
});

function PlatformHome() {
  const { marketing } = Route.useLoaderData();
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
    <PublicMarketingProvider content={marketing}>
      <div className="min-h-dvh overflow-x-hidden bg-background">
        <HomeNav />
        <main>
          <HomePromoBanners />
          <HomeHero shortcuts={shortcuts} />
          <HomePackages />
          <HomePartners />
          <HomeFeatures />
          <HomeSteps />
          <HomeShowcase />
          <HomeBenefits />
          <HomeTestimonials />
          <HomeCaseStudies />
          <HomeBlog />
          <HomePricing />
          <HomeFaq />
          <HomeCta />
        </main>
        <HomeFooter />
      </div>
    </PublicMarketingProvider>
  );
}

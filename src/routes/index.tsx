import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { NoruSite } from "@/core/components/noru-site/NoruSite";
import { useAuth } from "@/core/state/auth-store";
import { getMyRestaurants } from "@/core/lib/restaurant.functions";
import { getMarketingContent } from "@/core/lib/marketing";
import { getPublishedMarketingContent } from "@/core/lib/marketing.functions";

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
      // Fonts used by the Noru Digital Solutions public site.
      links: [
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&family=Noto+Sans+Ethiopic:wght@600;700;800&family=Quicksand:wght@600&display=swap",
        },
      ],
    };
  },
  component: PlatformHome,
});

function PlatformHome() {
  const { session, user, signOut } = useAuth();
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

  return (
    <NoruSite
      account={{
        signedIn,
        dashboardHref: hasRestaurant ? "/restaurant/restaurant-management/dashboard" : undefined,
        onSignOut: () => {
          void signOut();
        },
      }}
    />
  );
}

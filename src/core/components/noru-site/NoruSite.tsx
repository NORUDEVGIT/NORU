import "./noru-site.css";
import type { NoruSiteContent } from "@/core/lib/marketing/types";
import { CtaBand, Footer } from "./components/Footer";
import { Header, type SiteAccount } from "./components/Header";
import { Home } from "./pages/Home";
import { Pricing } from "./pages/Pricing";
import { Product } from "./pages/Product";
import { Resources } from "./pages/Resources";
import { Solutions } from "./pages/Solutions";
import { useRoute, useScrollToTop, type Route } from "./lib/router";
import { NoruSiteProvider } from "./site-context";

export type { SiteAccount } from "./components/Header";

function renderPage(route: Route) {
  switch (route.page) {
    case "home":
      return <Home />;
    case "product":
      return <Product anchor={route.anchor} />;
    case "solutions":
      return <Solutions anchor={route.anchor} />;
    case "pricing":
      return <Pricing />;
    case "resources":
      return <Resources anchor={route.anchor} detail={route.detail} />;
  }
}

/**
 * The public Noru Digital Solutions website (home, product features, solutions, pricing, resources).
 * Sign in and sign up go to the app's real /login and /register routes; the header only needs to know
 * whether someone is signed in (see `account`).
 */
export function NoruSite({ account, site }: { account: SiteAccount; site: NoruSiteContent }) {
  const route = useRoute();
  useScrollToTop(route);

  return (
    <NoruSiteProvider value={site}>
      <div className={route.page === "home" ? "noru-site onhome" : "noru-site"}>
        <Header route={route} account={account} />
        <main>{renderPage(route)}</main>
        <CtaBand />
        <Footer />
      </div>
    </NoruSiteProvider>
  );
}

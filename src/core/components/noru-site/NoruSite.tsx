import "./noru-site.css";
import { CtaBand, Footer } from "./components/Footer";
import { Header, type SiteAccount } from "./components/Header";
import { Home } from "./pages/Home";
import { Pricing } from "./pages/Pricing";
import { Product } from "./pages/Product";
import { Resources } from "./pages/Resources";
import { Solutions } from "./pages/Solutions";
import { useRoute, useScrollToTop, type Route } from "./lib/router";

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
      return <Resources anchor={route.anchor} />;
  }
}

/**
 * The public Noru Digital Solutions website (home, product features, solutions, pricing, resources).
 * Sign in and sign up go to the app's real /login and /register routes; the header only needs to know
 * whether someone is signed in (see `account`).
 */
export function NoruSite({ account }: { account: SiteAccount }) {
  const route = useRoute();
  useScrollToTop(route);

  return (
    <div className={route.page === "home" ? "noru-site onhome" : "noru-site"}>
      <Header route={route} account={account} />
      <main>{renderPage(route)}</main>
      <CtaBand />
      <Footer />
    </div>
  );
}

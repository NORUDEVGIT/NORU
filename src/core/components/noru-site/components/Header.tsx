
import { useEffect, useState } from "react";
import logo from "../assets/logo.png";
import { PRODUCTS, SOLUTIONS } from "../data/content";
import {
  hrefFor,
  useRequestDemo,
  type PageId,
  type Route,
} from "../lib/router";

const PRODUCT_MENU_ORDER = ["back", "rms", "pos", "pms"] as const;

type NavKey = "product" | "solutions" | "pricing" | "resources";

export interface SiteAccount {
  signedIn: boolean;
  dashboardHref?: string | undefined;
  onSignOut: () => void;
}

const RESOURCE_LINKS = [
  { id: "about", label: "About Us" },
  { id: "blogs", label: "Blogs" },
  { id: "testimonials", label: "Testimonials" },
  { id: "contact", label: "Contact Us" },
] as const;

function activeNav(page: PageId): NavKey | null {
  if (
    page === "product" ||
    page === "solutions" ||
    page === "pricing" ||
    page === "resources"
  ) {
    return page;
  }

  return null;
}

export function Header({
  route,
  account,
}: {
  route: Route;
  account: SiteAccount;
}) {
  const requestDemo = useRequestDemo();

  const [menuOpen, setMenuOpen] = useState(false);
  const [openNav, setOpenNav] = useState<NavKey | null>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = (): void => {
      setScrolled(window.scrollY > 20);
    };

    onScroll();

    window.addEventListener("scroll", onScroll, {
      passive: true,
    });

    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Close menus whenever the page or anchor changes.
  useEffect(() => {
    setMenuOpen(false);
    setOpenNav(null);
  }, [route.page, route.anchor]);

  const active = activeNav(route.page);

  const itemClass = (key: NavKey): string =>
    [
      "nav-i",
      openNav === key ? "open" : "",
      active === key ? "act" : "",
    ]
      .filter(Boolean)
      .join(" ");

  const toggle = (key: NavKey): void => {
    setOpenNav((current) => (current === key ? null : key));
  };

  return (
    <header className={scrolled ? "sc" : undefined}>
      <div className="w">
        <nav>
          {/* Logo and Home */}
          <a
            className="logo"
            href={hrefFor("home")}
            aria-label="Noru Digital Solutions – Home"
          >
            <img
              src={logo}
              alt=""
              width={42}
              height={42}
            />
            Noru Digital Solutions
          </a>

          {/* Mobile Menu Button */}
          <button
            className="burger"
            type="button"
            aria-label="Menu"
            aria-expanded={menuOpen}
            aria-controls="menu"
            onClick={() => setMenuOpen((current) => !current)}
          >
            ☰
          </button>

          {/* Navigation Menu */}
          <div
            className={menuOpen ? "menu show" : "menu"}
            id="menu"
          >
            {/* Product Features Dropdown */}
            <div className={itemClass("product")}>
              <button
                type="button"
                aria-expanded={openNav === "product"}
                onClick={() => toggle("product")}
              >
                Product Features ▾
              </button>

              <div className="dd">
                {PRODUCT_MENU_ORDER.map((id) => {
                  const product = PRODUCTS.find(
                    (item) => item.id === id
                  );

                  return product ? (
                    <a
                      key={product.id}
                      href={hrefFor("product", product.id)}
                    >
                      {product.title}
                    </a>
                  ) : null;
                })}
              </div>
            </div>

            {/* Solutions Dropdown */}
            <div className={itemClass("solutions")}>
              <button
                type="button"
                aria-expanded={openNav === "solutions"}
                onClick={() => toggle("solutions")}
              >
                Solutions ▾
              </button>

              <div className="dd">
                {SOLUTIONS.map((solution) => (
                  <a
                    key={solution.id}
                    href={hrefFor("solutions", solution.id)}
                  >
                    {solution.title}
                  </a>
                ))}
              </div>
            </div>

            {/* Pricing */}
            <div className={itemClass("pricing")}>
              <a href={hrefFor("pricing")}>
                Pricing
              </a>
            </div>

            {/* Resources Dropdown */}
            <div className={itemClass("resources")}>
              <button
                type="button"
                aria-expanded={openNav === "resources"}
                onClick={() => toggle("resources")}
              >
                Resources ▾
              </button>

              <div className="dd">
                {RESOURCE_LINKS.map((resource) => (
                  <a
                    key={resource.id}
                    href={hrefFor("resources", resource.id)}
                  >
                    {resource.label}
                  </a>
                ))}
              </div>
            </div>

            {/* Sign In Only: No Account or Dashboard Menu */}
            <div className="nav-i">
              <a href="/restaurant/login">
                Sign In
              </a>
            </div>

            {/* Request Demo */}
            <a
              className="btn"
              href="#resources/contact"
              onClick={(event) => {
                event.preventDefault();
                requestDemo();
              }}
            >
              Request Demo
            </a>
          </div>
        </nav>
      </div>
    </header>
  );
}
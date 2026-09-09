import { Link } from "@tanstack/react-router";
import { NoruLogo } from "@/core/components/noru-logo";

export function HomeFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <NoruLogo size="sm" />
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Hospitality management platform for Restaurant Management, PMS, Standalone POS and Back
              Office Management.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Product</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>
                <a href="#packages" className="hover:text-foreground">
                  Packages
                </a>
              </li>
              <li>
                <a href="#pricing" className="hover:text-foreground">
                  Pricing
                </a>
              </li>
              <li>
                <a href="#contact" className="hover:text-foreground">
                  Contact Us
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Restaurants</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>
                <Link to="/restaurant/login" className="hover:text-foreground">
                  Sign In
                </Link>
              </li>
              <li>
                <Link to="/restaurant/register" className="hover:text-foreground">
                  Register Your Company
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Customers</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>
                <Link to="/scan" className="hover:text-foreground">
                  Scan QR Code
                </Link>
              </li>
              <li>
                <Link to="/login" className="hover:text-foreground">
                  Sign In
                </Link>
              </li>
              <li>
                <Link to="/register" className="hover:text-foreground">
                  Create Account
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <p className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
          © 2026 NORU. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

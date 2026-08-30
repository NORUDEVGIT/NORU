import { Link } from "@tanstack/react-router";
import { NoruLogo } from "@/components/noru-logo";

export function HomeFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <NoruLogo size="sm" />
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              One platform for restaurant ordering, kitchen operations and staff management.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Product</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>
                <a href="#features" className="hover:text-foreground">
                  Features
                </a>
              </li>
              <li>
                <a href="#how-it-works" className="hover:text-foreground">
                  How It Works
                </a>
              </li>
              <li>
                <a href="#for-restaurants" className="hover:text-foreground">
                  For Restaurants
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
                  Register
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

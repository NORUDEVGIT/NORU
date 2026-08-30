import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { UtensilsCrossed, Store, ShieldCheck, QrCode } from "lucide-react";
import { NoruLogo } from "@/components/noru-logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/state/auth-store";
import { getMyRestaurants } from "@/lib/restaurant.functions";
import { amIPlatformAdmin } from "@/lib/admin.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NORU — Order. Manage. Serve." },
      {
        name: "description",
        content:
          "NORU connects customers and restaurants: order to your table, manage your restaurant, and run the kitchen.",
      },
      { property: "og:title", content: "NORU — Order. Manage. Serve." },
      {
        property: "og:description",
        content: "One platform connecting customers and restaurants.",
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

  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-5">
        <NoruLogo size="sm" />
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-20">
        <section className="pt-6 sm:pt-12">
          <h1 className="font-display text-4xl leading-tight sm:text-6xl">Order. Manage. Serve.</h1>
          <p className="mt-3 max-w-xl text-base text-muted-foreground sm:text-lg">
            One platform connecting customers and restaurants.
          </p>
        </section>

        <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <article className="flex flex-col rounded-3xl border border-border bg-card p-6">
            <UtensilsCrossed className="size-6 text-accent" />
            <h2 className="mt-4 font-display text-2xl">Customer</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Scan the QR code on your table to view the restaurant menu and order directly. No
              account needed.
            </p>
            <ol className="mt-4 flex-1 space-y-2 text-sm">
              {["Scan the QR code on your table", "Choose your items", "Place your order", "Track your order"].map(
                (step, index) => (
                  <li key={step} className="flex items-start gap-3">
                    <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
                      {index + 1}
                    </span>
                    <span className="text-muted-foreground">{step}</span>
                  </li>
                ),
              )}
            </ol>
            <div className="mt-6 flex flex-col gap-2">
              <Button asChild size="lg" className="h-12 rounded-full">
                <Link to="/scan">
                  <QrCode className="mr-2 size-5" />
                  Scan QR Code
                </Link>
              </Button>
              {signedIn ? (
                <Button asChild size="lg" variant="outline" className="h-12 rounded-full">
                  <Link to="/account">My Account</Link>
                </Button>
              ) : (
                <Button asChild size="lg" variant="outline" className="h-12 rounded-full">
                  <Link to="/login">Sign in for order history</Link>
                </Button>
              )}
            </div>
          </article>

          <article className="flex flex-col rounded-3xl border border-border bg-card p-6">
            <Store className="size-6 text-accent" />
            <h2 className="mt-4 font-display text-2xl">Restaurant</h2>
            <p className="mt-2 flex-1 text-sm text-muted-foreground">
              Manage your restaurant, menu, orders, kitchen and operations.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              {hasRestaurant ? (
                <Button asChild size="lg" className="h-12 rounded-full">
                  <Link to="/restaurant/dashboard">Restaurant Dashboard</Link>
                </Button>
              ) : null}
              <Button
                asChild
                size="lg"
                variant={hasRestaurant ? "outline" : "default"}
                className="h-12 rounded-full"
              >
                <Link to="/restaurant/login">Restaurant Sign In</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 rounded-full">
                <Link to="/restaurant/register">Register Your Restaurant</Link>
              </Button>
            </div>
          </article>

          <article className="flex flex-col rounded-3xl border border-border bg-card p-6">
            <ShieldCheck className="size-6 text-accent" />
            <h2 className="mt-4 font-display text-2xl">Platform Admin</h2>
            <p className="mt-2 flex-1 text-sm text-muted-foreground">
              Platform administration and restaurant approvals.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              {isAdmin ? (
                <Button asChild size="lg" className="h-12 rounded-full">
                  <Link to="/admin">Admin Dashboard</Link>
                </Button>
              ) : null}
              <Button
                asChild
                size="lg"
                variant={isAdmin ? "outline" : "default"}
                className="h-12 rounded-full"
              >
                <Link to="/admin/login">Admin Sign In</Link>
              </Button>
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}

import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/restaurant/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Restaurant Log In — Garden Table Platform" },
      { name: "description", content: "Restaurant owners and managers: sign in to manage your restaurant on the Garden Table platform." },
      { property: "og:title", content: "Restaurant Log In — Garden Table Platform" },
      { property: "og:description", content: "Sign in to your restaurant portal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RestaurantLogin,
});

function RestaurantLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError || !data.user) {
      setBusy(false);
      setError(
        /confirm/i.test(signInError?.message ?? "")
          ? "Please verify your email address before logging in."
          : "That email or password isn't right.",
      );
      return;
    }

    // Membership decides where this account belongs; customers stay out.
    const { data: membership } = await supabase
      .from("restaurant_users")
      .select("restaurant_id")
      .eq("user_id", data.user.id)
      .eq("active", true)
      .limit(1)
      .maybeSingle();

    setBusy(false);
    if (!membership) {
      await supabase.auth.signOut();
      setError("This account isn't linked to a restaurant. Customers can log in from the main site.");
      return;
    }
    void navigate({ to: "/restaurant/dashboard", replace: true });
  }

  return (
    <div className="min-h-dvh bg-muted/30">
      <main className="mx-auto w-full max-w-md px-4 py-12">
        <h1 className="font-display text-3xl">Restaurant log in</h1>
        <p className="mt-2 text-sm text-muted-foreground">Manage your restaurant on the Garden Table platform.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-5">
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 rounded-xl text-base" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 rounded-xl text-base" />
          </div>
          {error ? (
            <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">{error}</p>
          ) : null}
          <Button type="submit" size="lg" disabled={busy} className="h-13 w-full rounded-full text-base">
            {busy ? "Logging in…" : "Log in"}
          </Button>
        </form>

        <div className="mt-6 space-y-2 text-center text-sm text-muted-foreground">
          <p>
            <Link to="/forgot-password" className="font-semibold text-foreground underline underline-offset-4">Forgot password?</Link>
          </p>
          <p>
            <Link to="/restaurant/register" className="font-semibold text-foreground underline underline-offset-4">Register your restaurant</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
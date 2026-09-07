import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { SiteHeader } from "@/packages/restaurant-management/components/site-header";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  ssr: false,
  validateSearch: z.object({ redirect: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Log In — NORU" },
      { name: "description", content: "Log in to your NORU account to order and view your order history." },
      { property: "og:title", content: "Log In — NORU" },
      { property: "og:description", content: "Log in to order faster and track your orders." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (signInError) {
      setError(
        /confirm/i.test(signInError.message)
          ? "Please verify your email address before logging in."
          : "That email or password isn't right.",
      );
      return;
    }
    const target = search.redirect && search.redirect.startsWith("/") ? search.redirect : "/account";
    void navigate({ to: target, replace: true });
  }

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-md px-4 py-8">
        <h1 className="font-display text-3xl">Log in</h1>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <Input id="email" type="email" autoComplete="email" required value={email}
              onChange={(e) => setEmail(e.target.value)} className="h-12 rounded-xl text-base" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" required value={password}
              onChange={(e) => setPassword(e.target.value)} className="h-12 rounded-xl text-base" />
          </div>

          {error ? (
            <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" size="lg" disabled={busy} className="h-14 w-full rounded-full text-base">
            {busy ? "Logging in…" : "Log in"}
          </Button>
        </form>

        <div className="mt-6 space-y-2 text-center text-sm text-muted-foreground">
          <p>
            <Link to="/forgot-password" className="underline underline-offset-4">Forgot password?</Link>
          </p>
          <p>
            Don't have an account?{" "}
            <Link to="/register" className="font-semibold text-foreground underline underline-offset-4">
              Create account
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

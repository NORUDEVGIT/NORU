import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/kitchen/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Kitchen Login — The Garden Table" },
      {
        name: "description",
        content: "Staff sign-in for The Garden Table kitchen order display.",
      },
      { property: "og:title", content: "Kitchen Login — The Garden Table" },
      {
        property: "og:description",
        content: "Staff sign-in for The Garden Table kitchen order display.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: KitchenLogin,
});

function KitchenLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError || !data.user) {
      setBusy(false);
      setError(signInError?.message ?? "Unable to sign in. Please try again.");
      return;
    }
    const { data: staff } = await supabase
      .from("staff_users")
      .select("id")
      .eq("user_id", data.user.id)
      .eq("active", true)
      .maybeSingle();
    if (!staff) {
      await supabase.auth.signOut();
      setBusy(false);
      setError("This account is not an active staff member.");
      return;
    }
    void navigate({ to: "/kitchen", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <p className="font-serif text-3xl font-semibold tracking-tight text-foreground">THE GARDEN</p>
        <h1 className="mt-1 text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Kitchen Login
        </h1>

        <form onSubmit={onSubmit} className="mt-8 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 text-base"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 text-base"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" disabled={busy} className="h-14 w-full text-lg font-bold">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
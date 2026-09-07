import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { NoruLogo } from "@/core/components/noru-logo";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Administrator Sign In — NORU" },
      { name: "description", content: "Internal platform administration sign in for the NORU ordering platform." },
      { property: "og:title", content: "Administrator Sign In — NORU" },
      { property: "og:description", content: "Internal platform administration access." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminLogin,
});

function AdminLogin() {
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
      setError("Administrator access required.");
      return;
    }

    // Authorization is a separate step from authentication: only a
    // platform_admin profile may continue, everyone else is signed straight out.
    const { data: profile } = await supabase
      .from("profiles")
      .select("account_type")
      .eq("id", data.user.id)
      .maybeSingle();

    if (profile?.account_type !== "platform_admin") {
      await supabase.auth.signOut();
      setBusy(false);
      setError("Administrator access required.");
      return;
    }

    setBusy(false);
    void navigate({ to: "/admin", replace: true });
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/30 px-4">
      <main className="w-full max-w-sm">
        <NoruLogo size="md" className="mb-6" />
        <h1 className="text-2xl font-semibold tracking-tight">Platform administration</h1>
        <p className="mt-1 text-sm text-muted-foreground">Authorized personnel only.</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-xl border border-border bg-card p-5">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
          </div>
          {error ? (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">{error}</p>
          ) : null}
          <Button type="submit" disabled={busy} className="h-11 w-full">{busy ? "Signing in…" : "Sign in"}</Button>
        </form>
      </main>
    </div>
  );
}

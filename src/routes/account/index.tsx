import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { SiteHeader } from "@/core/components/site-header";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { getMyProfile, updateMyProfile } from "@/core/lib/customer.functions";
import { useAuth } from "@/core/state/auth-store";

export const Route = createFileRoute("/account/")({
  head: () => ({
    meta: [
      { title: "Your Account — NORU" },
      { name: "description", content: "Manage your name, phone number and account details at NORU." },
      { property: "og:title", content: "Your Account — NORU" },
      { property: "og:description", content: "Manage your NORU customer account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session, signOut } = useAuth();
  const fetchProfile = useServerFn(getMyProfile);
  const saveProfile = useServerFn(updateMyProfile);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => fetchProfile(),
    enabled: !!session,
    retry: false,
  });

  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        firstName: profile.first_name ?? "",
        lastName: profile.last_name ?? "",
        phone: profile.phone ?? "",
      });
    }
  }, [profile]);

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast.error("Please enter your first and last name.");
      return;
    }
    setBusy(true);
    try {
      await saveProfile({ data: { ...form, phone: form.phone || null } });
      await queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      toast.success("Your details are saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We couldn't save your details.");
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut();
    void navigate({ to: "/login", replace: true });
  }

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-md px-4 py-8">
        <h1 className="font-display text-3xl">Your account</h1>

        {isLoading ? (
          <p className="mt-6 text-sm text-muted-foreground">Loading your details…</p>
        ) : (
          <>
            <form onSubmit={onSave} className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First name</Label>
                <Input id="firstName" value={form.firstName} className="h-12 rounded-xl text-base"
                  onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last name</Label>
                <Input id="lastName" value={form.lastName} className="h-12 rounded-xl text-base"
                  onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={profile?.email ?? ""} disabled className="h-12 rounded-xl text-base" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone number</Label>
                <Input id="phone" type="tel" value={form.phone} className="h-12 rounded-xl text-base"
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
              </div>
              <Button type="submit" size="lg" disabled={busy} className="h-14 w-full rounded-full text-base">
                {busy ? "Saving…" : "Save changes"}
              </Button>
            </form>

            <div className="mt-6 space-y-3">
              <Button asChild variant="outline" size="lg" className="h-12 w-full rounded-full">
                <Link to="/account/orders">Your orders</Link>
              </Button>
              <Button variant="ghost" size="lg" className="h-12 w-full rounded-full" onClick={onSignOut}>
                Log out
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

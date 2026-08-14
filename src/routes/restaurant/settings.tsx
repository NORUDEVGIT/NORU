import { useEffect, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RestaurantShell } from "@/components/restaurant-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { updateMyRestaurant, type RestaurantMembership } from "@/lib/restaurant.functions";

export const Route = createFileRoute("/restaurant/settings")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/restaurant/login" });
  },
  head: () => ({
    meta: [
      { title: "Restaurant Settings — Garden Table Platform" },
      { name: "description", content: "Update your restaurant name, contact details and address on the Garden Table platform." },
      { property: "og:title", content: "Restaurant Settings — Garden Table Platform" },
      { property: "og:description", content: "Update your restaurant details." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RestaurantSettings,
});

function RestaurantSettings() {
  return (
    <RestaurantShell active="Settings">
      {(membership) => <SettingsForm membership={membership} />}
    </RestaurantShell>
  );
}

function SettingsForm({ membership }: { membership: RestaurantMembership }) {
  const r = membership.restaurant;
  const queryClient = useQueryClient();
  const save = useServerFn(updateMyRestaurant);
  const canEdit = membership.role === "owner" || membership.role === "manager";
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: r.name,
    email: r.email ?? "",
    phone: r.phone ?? "",
    address: r.address ?? "",
    city: r.city ?? "",
    postcode: r.postcode ?? "",
    country: r.country ?? "",
    logoUrl: r.logoUrl ?? "",
  });

  useEffect(() => {
    setForm({
      name: r.name,
      email: r.email ?? "",
      phone: r.phone ?? "",
      address: r.address ?? "",
      city: r.city ?? "",
      postcode: r.postcode ?? "",
      country: r.country ?? "",
      logoUrl: r.logoUrl ?? "",
    });
  }, [r]);

  const set = (key: keyof typeof form) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    if (form.name.trim().length < 2) {
      toast.error("Please enter your restaurant name.");
      return;
    }
    setBusy(true);
    try {
      await save({
        data: {
          restaurantId: r.id,
          name: form.name,
          email: form.email || null,
          phone: form.phone || null,
          address: form.address || null,
          city: form.city || null,
          postcode: form.postcode || null,
          country: form.country || null,
          logoUrl: form.logoUrl || null,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["my-restaurants"] });
      toast.success("Restaurant details saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We couldn't save those details.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Web address: <span className="font-mono">/{r.slug}</span> · Status: {r.approved ? "Approved" : "Pending approval"}
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <Field id="name" label="Restaurant name" value={form.name} onChange={set("name")} disabled={!canEdit} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="email" label="Email" type="email" value={form.email} onChange={set("email")} disabled={!canEdit} />
          <Field id="phone" label="Phone" type="tel" value={form.phone} onChange={set("phone")} disabled={!canEdit} />
        </div>
        <Field id="address" label="Address" value={form.address} onChange={set("address")} disabled={!canEdit} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="city" label="City" value={form.city} onChange={set("city")} disabled={!canEdit} />
          <Field id="postcode" label="Postcode" value={form.postcode} onChange={set("postcode")} disabled={!canEdit} />
          <Field id="country" label="Country" value={form.country} onChange={set("country")} disabled={!canEdit} />
        </div>
        <Field id="logoUrl" label="Logo URL (optional)" value={form.logoUrl} onChange={set("logoUrl")} disabled={!canEdit} />

        <p className="text-xs text-muted-foreground">
          Approval status, visibility and your web address are managed by the platform and can't be changed here.
        </p>

        {canEdit ? (
          <Button type="submit" size="lg" disabled={busy} className="h-12 rounded-full">
            {busy ? "Saving…" : "Save changes"}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">Only owners and managers can edit these details.</p>
        )}
      </form>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        disabled={disabled ?? false}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 rounded-xl text-base"
      />
    </div>
  );
}
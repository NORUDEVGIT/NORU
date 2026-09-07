import { cloneElement, useEffect, useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  createGuest,
  findGuestDuplicates,
  updateGuest,
  type GuestProfile,
  type GuestSummary,
} from "@/packages/pms/lib/guests.functions";

export interface GuestFormValues {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  nationality: string;
  language: string;
  dateOfBirth: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  country: string;
  postalCode: string;
  vipStatus: boolean;
  notes: string;
}

const EMPTY: GuestFormValues = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  nationality: "",
  language: "",
  dateOfBirth: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  region: "",
  country: "",
  postalCode: "",
  vipStatus: false,
  notes: "",
};

function fromProfile(guest: GuestProfile): GuestFormValues {
  return {
    firstName: guest.firstName,
    lastName: guest.lastName ?? "",
    phone: guest.phone ?? "",
    email: guest.email ?? "",
    nationality: guest.nationality ?? "",
    language: guest.language ?? "",
    dateOfBirth: guest.dateOfBirth ?? "",
    addressLine1: guest.addressLine1 ?? "",
    addressLine2: guest.addressLine2 ?? "",
    city: guest.city ?? "",
    region: guest.region ?? "",
    country: guest.country ?? "",
    postalCode: guest.postalCode ?? "",
    vipStatus: guest.vipStatus,
    notes: guest.notes ?? "",
  };
}

export function GuestFormDialog({
  restaurantId,
  open,
  onOpenChange,
  guest,
  onSaved,
  onOpenExisting,
}: {
  restaurantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing an existing guest. */
  guest?: GuestProfile | null;
  onSaved?: (guestId: string) => void;
  /** Called when staff choose an existing duplicate instead of creating a new guest. */
  onOpenExisting?: (guestId: string) => void;
}) {
  const queryClient = useQueryClient();
  const create = useServerFn(createGuest);
  const update = useServerFn(updateGuest);
  const checkDuplicates = useServerFn(findGuestDuplicates);

  const [form, setForm] = useState<GuestFormValues>(EMPTY);
  const [duplicates, setDuplicates] = useState<GuestSummary[] | null>(null);

  useEffect(() => {
    if (open) {
      setForm(guest ? fromProfile(guest) : EMPTY);
      setDuplicates(null);
    }
  }, [open, guest]);

  function set<K extends keyof GuestFormValues>(key: K, value: GuestFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const payload = {
    firstName: form.firstName,
    lastName: form.lastName,
    phone: form.phone,
    email: form.email,
    nationality: form.nationality,
    language: form.language,
    dateOfBirth: form.dateOfBirth,
    addressLine1: form.addressLine1,
    addressLine2: form.addressLine2,
    city: form.city,
    region: form.region,
    country: form.country,
    postalCode: form.postalCode,
    vipStatus: form.vipStatus,
    notes: form.notes,
  };

  const save = useMutation({
    mutationFn: async () => {
      if (guest) {
        await update({ data: { restaurantId, guestId: guest.id, guest: payload } });
        return guest.id;
      }
      const res = await create({ data: { restaurantId, guest: payload } });
      return res.id;
    },
    onSuccess: (id) => {
      toast.success(guest ? "Guest updated." : "Guest created.");
      void queryClient.invalidateQueries({ queryKey: ["guests", restaurantId] });
      void queryClient.invalidateQueries({ queryKey: ["guest", restaurantId] });
      onOpenChange(false);
      onSaved?.(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (form.firstName.trim() === "") throw new Error("First name is required.");
      const matches = await checkDuplicates({
        data: {
          restaurantId,
          email: form.email,
          phone: form.phone,
          ...(guest ? { excludeGuestId: guest.id } : {}),
        },
      });
      return matches;
    },
    onSuccess: (matches) => {
      if (matches.length > 0) {
        setDuplicates(matches);
        return;
      }
      save.mutate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = submit.isPending || save.isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{guest ? "Edit guest" : "New guest"}</DialogTitle>
          <DialogDescription>
            Only a first name is required — walk-in guests often have incomplete details.
          </DialogDescription>
        </DialogHeader>

        {duplicates && duplicates.length > 0 ? (
          <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="size-4" /> Possible existing guest
            </p>
            <p className="text-sm text-muted-foreground">
              A guest with this email or phone already exists at this property. Nothing is merged
              automatically — open the existing guest, or continue and create a separate profile.
            </p>
            <ul className="space-y-2">
              {duplicates.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{d.fullName}</span>{" "}
                    <span className="text-muted-foreground">
                      {[d.phone, d.email].filter(Boolean).join(" · ") || "No contact details"}
                    </span>
                  </span>
                  {onOpenExisting ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        onOpenChange(false);
                        onOpenExisting(d.id);
                      }}
                    >
                      Open existing guest
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setDuplicates(null)}>
                Back to form
              </Button>
              <Button size="sm" onClick={() => save.mutate()} disabled={busy}>
                Create anyway
              </Button>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" required>
            <Input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
          </Field>
          <Field label="Last name">
            <Input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Nationality">
            <Input value={form.nationality} onChange={(e) => set("nationality", e.target.value)} />
          </Field>
          <Field label="Language">
            <Input value={form.language} onChange={(e) => set("language", e.target.value)} />
          </Field>
          <Field label="Date of birth">
            <Input type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} />
          </Field>
          <Field label="Country">
            <Input value={form.country} onChange={(e) => set("country", e.target.value)} />
          </Field>
          <Field label="Address line 1">
            <Input value={form.addressLine1} onChange={(e) => set("addressLine1", e.target.value)} />
          </Field>
          <Field label="Address line 2">
            <Input value={form.addressLine2} onChange={(e) => set("addressLine2", e.target.value)} />
          </Field>
          <Field label="City">
            <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
          </Field>
          <Field label="Region / state">
            <Input value={form.region} onChange={(e) => set("region", e.target.value)} />
          </Field>
          <Field label="Postal code">
            <Input value={form.postalCode} onChange={(e) => set("postalCode", e.target.value)} />
          </Field>
          <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
            <Label htmlFor="guest-vip">VIP guest</Label>
            <Switch
              id="guest-vip"
              checked={form.vipStatus}
              onCheckedChange={(v) => set("vipStatus", v)}
            />
          </div>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <Textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </Field>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => submit.mutate()} disabled={busy}>
            {busy ? "Saving…" : guest ? "Save changes" : "Create guest"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactElement<{ id?: string }>;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {cloneElement(children, { id })}
    </div>
  );
}

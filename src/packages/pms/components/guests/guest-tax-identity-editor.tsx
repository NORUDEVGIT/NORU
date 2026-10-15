import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  createGuestTaxIdentity,
  updateGuestTaxIdentity,
  type GuestTaxIdentityView,
} from "@/packages/pms/lib/guest-tax-identities.functions";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";

export type GuestTaxIdentityPrefill = {
  legalName: string;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  region?: string | null;
};

export function GuestTaxIdentityDialog({
  open,
  onOpenChange,
  restaurantId,
  guestId,
  identity,
  prefill,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurantId: string;
  guestId: string;
  identity?: GuestTaxIdentityView | null;
  prefill?: GuestTaxIdentityPrefill | null;
  onSaved: (id: string) => void;
}) {
  const createIdentity = useServerFn(createGuestTaxIdentity);
  const updateIdentity = useServerFn(updateGuestTaxIdentity);
  const [legalName, setLegalName] = useState("");
  const [tin, setTin] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  const formKey = [
    identity?.id ?? "new",
    identity?.legalName ?? prefill?.legalName ?? "",
    identity?.tin ?? "",
    prefill?.phone ?? "",
    prefill?.email ?? "",
    prefill?.city ?? "",
    prefill?.region ?? "",
  ].join("|");
  useEffect(() => {
    if (!open) return;
    setLegalName(identity?.legalName ?? prefill?.legalName ?? "");
    setTin(identity?.tin ?? "");
    setRegistrationNumber(identity?.registrationNumber ?? "");
    setPhone(identity?.phone ?? prefill?.phone ?? "");
    setEmail(identity?.email ?? prefill?.email ?? "");
    setCity(identity?.city ?? prefill?.city ?? "");
    setRegion(identity?.region ?? prefill?.region ?? "");
    setIsDefault(identity?.isDefault ?? false);
  }, [
    open,
    formKey,
    identity?.city,
    identity?.email,
    identity?.id,
    identity?.isDefault,
    identity?.legalName,
    identity?.phone,
    identity?.region,
    identity?.registrationNumber,
    identity?.tin,
    prefill?.city,
    prefill?.email,
    prefill?.legalName,
    prefill?.phone,
    prefill?.region,
  ]);

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        restaurantId,
        guestId,
        legalName,
        tin,
        registrationNumber,
        phone,
        email,
        city,
        region,
        isDefault,
      };
      return identity
        ? updateIdentity({ data: { ...body, identityId: identity.id } })
        : createIdentity({ data: body });
    },
    onSuccess: (result) => {
      toast.success(identity ? "Tax identity updated." : "Tax identity saved.");
      onOpenChange(false);
      onSaved(result.id);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{identity ? "Edit tax identity" : "Add tax identity"}</DialogTitle>
          <DialogDescription>
            This is a fiscal buyer identity for this guest. It does not create a company account.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-1">
          <Field label="Legal name" value={legalName} onChange={setLegalName} required />
          <Field label="TIN" value={tin} onChange={setTin} required />
          <label className="flex items-center gap-2 text-xs text-[#251605] pt-1">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(event) => setIsDefault(event.target.checked)}
              className="accent-[#8A641A]"
            />
            Set as default B2B identity for this guest
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={
              mutation.isPending || legalName.trim().length === 0 || tin.trim().length === 0
            }
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Saving..." : "Save identity"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const id = label.toLowerCase().replaceAll(" ", "-");
  return (
    <div className="grid gap-1">
      <Label htmlFor={id}>
        {label}
        {required ? " *" : ""}
      </Label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

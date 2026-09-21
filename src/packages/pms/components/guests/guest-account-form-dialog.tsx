import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { GuestCompanyFormDialog } from "@/packages/pms/components/guests/guest-company-form-dialog";
import { GuestTravelAgentFormDialog } from "@/packages/pms/components/guests/guest-travel-agent-form-dialog";
import { createGuestAccount, updateGuestAccount } from "@/packages/pms/lib/guest-accounts.functions";
import {
  GUEST_ACCOUNT_TYPE_LABELS,
  WAVE4_GROUP_ACCOUNT_COPY,
  type GuestAccountProfile,
  type GuestAccountStatus,
  type GuestAccountType,
} from "@/packages/pms/lib/guest-profile-wave4";
import { invalidateGuestWorkspaceQueries } from "@/packages/pms/lib/guest-profile-listing";

type FormValues = {
  name: string;
  code: string;
  email: string;
  phone: string;
  addressLine1: string;
  city: string;
  country: string;
  notes: string;
  accountStatus: GuestAccountStatus;
};

const EMPTY: FormValues = {
  name: "",
  code: "",
  email: "",
  phone: "",
  addressLine1: "",
  city: "",
  country: "",
  notes: "",
  accountStatus: "active",
};

function fromProfile(account: GuestAccountProfile): FormValues {
  return {
    name: account.name,
    code: account.code ?? "",
    email: account.email ?? "",
    phone: account.phone ?? "",
    addressLine1: account.addressLine1 ?? "",
    city: account.city ?? "",
    country: account.country ?? "",
    notes: account.notes ?? "",
    accountStatus: account.accountStatus,
  };
}

export function GuestAccountFormDialog({
  restaurantId,
  accountType,
  open,
  onOpenChange,
  account,
  onSaved,
}: {
  restaurantId: string;
  accountType: GuestAccountType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: GuestAccountProfile | null | undefined;
  onSaved?: ((accountId: string) => void) | undefined;
}) {
  const queryClient = useQueryClient();
  const create = useServerFn(createGuestAccount);
  const update = useServerFn(updateGuestAccount);
  const [form, setForm] = useState<FormValues>(EMPTY);
  const title = GUEST_ACCOUNT_TYPE_LABELS[accountType];

  useEffect(() => {
    if (open) setForm(account ? fromProfile(account) : EMPTY);
  }, [open, account]);

  const save = useMutation({
    mutationFn: async () => {
      if (form.name.trim() === "") throw new Error("Name is required.");
      const payload = {
        name: form.name,
        code: form.code,
        email: form.email,
        phone: form.phone,
        addressLine1: form.addressLine1,
        city: form.city,
        country: form.country,
        notes: form.notes,
        accountStatus: form.accountStatus,
      };
      if (account) {
        await update({ data: { restaurantId, accountId: account.id, account: payload } });
        return account.id;
      }
      const res = await create({ data: { restaurantId, accountType, account: payload } });
      return res.id;
    },
    onSuccess: (id) => {
      toast.success(account ? `${title} updated.` : `${title} created.`);
      invalidateGuestWorkspaceQueries(queryClient, restaurantId);
      void queryClient.invalidateQueries({ queryKey: ["guest-account", restaurantId] });
      onOpenChange(false);
      onSaved?.(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (accountType === "company") {
    return (
      <GuestCompanyFormDialog
        restaurantId={restaurantId}
        open={open}
        onOpenChange={onOpenChange}
        account={account}
        onSaved={onSaved}
      />
    );
  }

  if (accountType === "travel_agent") {
    return (
      <GuestTravelAgentFormDialog
        restaurantId={restaurantId}
        open={open}
        onOpenChange={onOpenChange}
        account={account}
        onSaved={onSaved}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="guest-account-form">
        <DialogHeader>
          <DialogTitle>{account ? `Edit ${title}` : `New ${title}`}</DialogTitle>
          <DialogDescription>
            {accountType === "group"
              ? WAVE4_GROUP_ACCOUNT_COPY
              : `Create once in Guest. Reservations and Front Office consume this ${title} master.`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label htmlFor="guest-account-name">Name</Label>
            <Input
              id="guest-account-name"
              data-testid="guest-account-name"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="guest-account-code">Code</Label>
              <Input
                id="guest-account-code"
                value={form.code}
                onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={form.accountStatus}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, accountStatus: value as GuestAccountStatus }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="guest-account-email">Email</Label>
              <Input
                id="guest-account-email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="guest-account-phone">Phone</Label>
              <Input
                id="guest-account-phone"
                value={form.phone}
                onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="guest-account-address">Address</Label>
            <Input
              id="guest-account-address"
              value={form.addressLine1}
              onChange={(e) => setForm((prev) => ({ ...prev, addressLine1: e.target.value }))}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="guest-account-city">City</Label>
              <Input
                id="guest-account-city"
                value={form.city}
                onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="guest-account-country">Country</Label>
              <Input
                id="guest-account-country"
                value={form.country}
                onChange={(e) => setForm((prev) => ({ ...prev, country: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="guest-account-notes">Notes</Label>
            <Textarea
              id="guest-account-notes"
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button data-testid="guest-account-save" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : account ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

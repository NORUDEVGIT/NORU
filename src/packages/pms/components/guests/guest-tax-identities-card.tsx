import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal, Plus, Receipt } from "lucide-react";
import { toast } from "sonner";

import { GuestTaxIdentityDialog } from "@/packages/pms/components/guests/guest-tax-identity-editor";
import { useOptionalGuestProfileActions } from "@/packages/pms/components/guests/guest-profile-actions";
import { guestLegalNamePrefill } from "@/packages/pms/lib/guest-tax-identities";
import {
  deactivateGuestTaxIdentity,
  listGuestTaxIdentities,
  reactivateGuestTaxIdentity,
  setDefaultGuestTaxIdentity,
  type GuestTaxIdentityView,
} from "@/packages/pms/lib/guest-tax-identities.functions";
import type { GuestProfile } from "@/packages/pms/lib/guests.functions";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

export function GuestTaxIdentitiesCard({
  restaurantId,
  guest,
}: {
  restaurantId: string;
  guest: GuestProfile;
}) {
  const actions = useOptionalGuestProfileActions();
  const canManage = actions?.canManage ?? false;
  const queryClient = useQueryClient();
  const load = useServerFn(listGuestTaxIdentities);
  const setDefault = useServerFn(setDefaultGuestTaxIdentity);
  const deactivate = useServerFn(deactivateGuestTaxIdentity);
  const reactivate = useServerFn(reactivateGuestTaxIdentity);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<GuestTaxIdentityView | null>(null);
  const query = useQuery({
    queryKey: ["guest-tax-identities", restaurantId, guest.id],
    queryFn: () => load({ data: { restaurantId, guestId: guest.id } }),
  });

  function refresh() {
    void queryClient.invalidateQueries({
      queryKey: ["guest-tax-identities", restaurantId, guest.id],
    });
  }

  const action = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onSuccess: () => refresh(),
    onError: (error: Error) => toast.error(error.message),
  });
  const identities = query.data ?? [];
  const active = identities.filter((identity) => identity.isActive);
  const inactive = identities.filter((identity) => !identity.isActive);

  return (
    <section
      className="rounded-xl border border-[#E8E1D7] bg-white p-4"
      data-testid="guest-tax-identities"
    >
      <div className="mb-3 flex items-center gap-2">
        <Receipt className="size-4 text-[#8A641A]" />
        <h3 className="text-sm font-semibold text-[#251605]">Tax Identities</h3>
      </div>
      {query.isLoading ? <p className="text-xs text-[#756A5B]">Loading tax identities...</p> : null}
      {query.isError ? (
        <p className="text-xs text-destructive">Tax identities could not be loaded.</p>
      ) : null}
      {!query.isLoading && identities.length === 0 ? (
        <p className="text-xs text-[#756A5B]">No tax identities saved for this guest.</p>
      ) : null}
      <div className="space-y-2">
        {active.map((identity) => (
          <IdentityRow
            key={identity.id}
            identity={identity}
            canManage={canManage}
            pending={action.isPending}
            onEdit={() => {
              setEditing(identity);
              setEditorOpen(true);
            }}
            onSetDefault={() =>
              action.mutate(() =>
                setDefault({
                  data: { restaurantId, guestId: guest.id, identityId: identity.id },
                }),
              )
            }
            onDeactivate={() =>
              action.mutate(() =>
                deactivate({
                  data: { restaurantId, guestId: guest.id, identityId: identity.id },
                }),
              )
            }
          />
        ))}
      </div>
      {inactive.length > 0 ? (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8C827A]">
            Inactive
          </p>
          {inactive.map((identity) => (
            <IdentityRow
              key={identity.id}
              identity={identity}
              canManage={canManage}
              pending={action.isPending}
              onEdit={() => {
                setEditing(identity);
                setEditorOpen(true);
              }}
              onReactivate={() =>
                action.mutate(() =>
                  reactivate({
                    data: { restaurantId, guestId: guest.id, identityId: identity.id },
                  }),
                )
              }
            />
          ))}
        </div>
      ) : null}
      {canManage ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={() => {
            setEditing(null);
            setEditorOpen(true);
          }}
        >
          <Plus className="mr-1.5 size-3.5" /> Add Tax Identity
        </Button>
      ) : null}
      <GuestTaxIdentityDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        restaurantId={restaurantId}
        guestId={guest.id}
        identity={editing}
        prefill={{
          legalName: guestLegalNamePrefill(guest),
          phone: guest.phone,
          email: guest.email,
          city: guest.city,
          region: guest.region,
        }}
        onSaved={() => refresh()}
      />
    </section>
  );
}

function IdentityRow({
  identity,
  canManage,
  pending,
  onEdit,
  onSetDefault,
  onDeactivate,
  onReactivate,
}: {
  identity: GuestTaxIdentityView;
  canManage: boolean;
  pending: boolean;
  onEdit: () => void;
  onSetDefault?: () => void;
  onDeactivate?: () => void;
  onReactivate?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-[#E8E1D7] px-3 py-2">
      <div>
        <p className="text-sm font-medium text-[#251605]">{identity.legalName}</p>
        <p className="text-xs text-[#756A5B]">
          TIN {identity.tin}
          {identity.registrationNumber ? ` · ${identity.registrationNumber}` : ""}
        </p>
        <div className="mt-1 flex gap-1">
          {identity.isDefault ? <Badge variant="secondary">Default</Badge> : null}
          {!identity.isActive ? <Badge variant="outline">Inactive</Badge> : null}
        </div>
      </div>
      {canManage ? (
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" variant="ghost" onClick={onEdit}>
            Edit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8"
                disabled={pending}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {identity.isActive && !identity.isDefault && onSetDefault ? (
                <DropdownMenuItem onClick={onSetDefault}>Set default</DropdownMenuItem>
              ) : null}
              {identity.isActive && onDeactivate ? (
                <DropdownMenuItem onClick={onDeactivate}>Deactivate</DropdownMenuItem>
              ) : null}
              {!identity.isActive && onReactivate ? (
                <DropdownMenuItem onClick={onReactivate}>Reactivate</DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
    </div>
  );
}

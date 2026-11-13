import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { GuestFormDialog } from "@/packages/pms/components/guests/guest-form-dialog";
import { GuestFormIdentityUpload } from "@/packages/pms/components/guests/guest-form-identity-upload";
import { GuestPrintProfile } from "@/packages/pms/components/guests/guest-print-profile";
import { invalidateGuestWorkspaceQueries } from "@/packages/pms/lib/guest-profile-listing";
import {
  addGuestNote,
  getGuestsAccess,
  setGuestStatus,
  type GuestProfile,
} from "@/packages/pms/lib/guests.functions";
import { pmsPropertyOwnerRole } from "@/packages/pms/lib/pms-client-access";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Textarea } from "@/shared/components/ui/textarea";

type GuestProfileActionsValue = {
  restaurantId: string;
  guest: GuestProfile;
  /** @deprecated Use canView — kept for callers that still read canManage */
  canManage: boolean;
  canView: boolean;
  canEdit: boolean;
  canCreateReservation: boolean;
  canActivate: boolean;
  canPrintExport: boolean;
  openEdit: () => void;
  openNote: () => void;
  openUpload: () => void;
  printProfile: () => void;
  toggleStatus: () => void;
  openLoyalty: () => void;
  openNotesPage: () => void;
  openStaysPage: () => void;
  openReservationsPage: () => void;
  openIdentityPage: () => void;
};

const GuestProfileActionsContext = createContext<GuestProfileActionsValue | null>(null);

export function useGuestProfileActions(): GuestProfileActionsValue {
  const value = useContext(GuestProfileActionsContext);
  if (!value) {
    throw new Error("useGuestProfileActions must be used inside GuestProfileActionsProvider");
  }
  return value;
}

export function useOptionalGuestProfileActions(): GuestProfileActionsValue | null {
  return useContext(GuestProfileActionsContext);
}

export function GuestProfileActionsProvider({
  restaurantId,
  guest,
  membershipRole,
  onOpenLoyalty,
  onOpenNotesPage,
  onOpenStaysPage,
  onOpenReservationsPage,
  onOpenIdentityPage,
  children,
}: {
  restaurantId: string;
  guest: GuestProfile;
  membershipRole?: string | undefined;
  onOpenLoyalty: () => void;
  onOpenNotesPage: () => void;
  onOpenStaysPage: () => void;
  onOpenReservationsPage: () => void;
  onOpenIdentityPage: () => void;
  onMerged?: () => void;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const changeStatus = useServerFn(setGuestStatus);
  const addNote = useServerFn(addGuestNote);
  const fetchAccess = useServerFn(getGuestsAccess);
  const [editOpen, setEditOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);

  const accessQuery = useQuery({
    queryKey: ["guests-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    staleTime: 60_000,
  });

  const ownerBypass =
    pmsPropertyOwnerRole(membershipRole) || Boolean(accessQuery.data?.isOwner);
  const canView = ownerBypass || (accessQuery.data?.canManage ?? false);
  const canEdit = ownerBypass || (accessQuery.data?.canEdit ?? false);
  const canActivate = ownerBypass || (accessQuery.data?.canActivate ?? false);
  const canPrintExport = ownerBypass || (accessQuery.data?.canPrintExport ?? false);
  const canCreateReservation =
    ownerBypass || (accessQuery.data?.canCreateReservation ?? false);

  function refresh() {
    invalidateGuestWorkspaceQueries(queryClient, restaurantId);
    void queryClient.invalidateQueries({ queryKey: ["guest", restaurantId, guest.id] });
    void queryClient.invalidateQueries({ queryKey: ["guest-documents", restaurantId, guest.id] });
  }

  const noteMutation = useMutation({
    mutationFn: () => addNote({ data: { restaurantId, guestId: guest.id, notes: note } }),
    onSuccess: () => {
      toast.success("Note saved.");
      setNote("");
      setNoteOpen(false);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const statusMutation = useMutation({
    mutationFn: (status: "active" | "inactive") =>
      changeStatus({ data: { restaurantId, guestId: guest.id, status } }),
    onSuccess: () => {
      toast.success(
        guest.guestStatus === "active" ? "Profile deactivated." : "Profile reactivated.",
      );
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const value = useMemo<GuestProfileActionsValue>(
    () => ({
      restaurantId,
      guest,
      canManage: canView,
      canView,
      canEdit,
      canCreateReservation,
      canActivate,
      canPrintExport,
      openEdit: () => {
        if (!canEdit) {
          toast.error("You don't have permission to edit guest profiles.");
          return;
        }
        setEditOpen(true);
      },
      openNote: () => {
        if (!canEdit) {
          toast.error("You don't have permission to edit guest profiles.");
          return;
        }
        setNoteOpen(true);
      },
      openUpload: () => {
        if (!canEdit) {
          toast.error("You don't have permission to edit guest profiles.");
          return;
        }
        setUploadOpen(true);
      },
      printProfile: () => {
        if (!canPrintExport) {
          toast.error("You don't have permission to print or export guest lists.");
          return;
        }
        window.print();
      },
      toggleStatus: () => {
        if (!canActivate) {
          toast.error("You don't have permission to change guest profile status.");
          return;
        }
        statusMutation.mutate(guest.guestStatus === "active" ? "inactive" : "active");
      },
      openLoyalty: onOpenLoyalty,
      openNotesPage: onOpenNotesPage,
      openStaysPage: onOpenStaysPage,
      openReservationsPage: onOpenReservationsPage,
      openIdentityPage: onOpenIdentityPage,
    }),
    [
      canActivate,
      canCreateReservation,
      canEdit,
      canPrintExport,
      canView,
      guest,
      onOpenIdentityPage,
      onOpenLoyalty,
      onOpenNotesPage,
      onOpenReservationsPage,
      onOpenStaysPage,
      restaurantId,
      statusMutation,
    ],
  );

  return (
    <GuestProfileActionsContext.Provider value={value}>
      {children}
      {canPrintExport ? <GuestPrintProfile guest={guest} /> : null}
      {canEdit ? (
        <GuestFormDialog
          restaurantId={restaurantId}
          open={editOpen}
          onOpenChange={setEditOpen}
          guest={guest}
          onSaved={refresh}
        />
      ) : null}
      {canEdit ? (
        <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add note</DialogTitle>
            </DialogHeader>
            <Textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setNoteOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => noteMutation.mutate()} disabled={noteMutation.isPending || note.trim() === ""}>
                Save note
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      {canEdit ? (
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogContent className="max-w-lg border-[#DDD4C5] bg-white">
            <DialogHeader>
              <DialogTitle>Upload document</DialogTitle>
            </DialogHeader>
            <GuestFormIdentityUpload restaurantId={restaurantId} guestId={guest.id} />
          </DialogContent>
        </Dialog>
      ) : null}
    </GuestProfileActionsContext.Provider>
  );
}

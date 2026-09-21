import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { GuestFormDialog } from "@/packages/pms/components/guests/guest-form-dialog";
import { GuestFormIdentityUpload } from "@/packages/pms/components/guests/guest-form-identity-upload";
import { GuestMergeDialog } from "@/packages/pms/components/guests/guest-merge-dialog";
import { GuestPrintProfile } from "@/packages/pms/components/guests/guest-print-profile";
import { canStartReservationForRole } from "@/packages/pms/lib/guest-profile-overview";
import { invalidateGuestWorkspaceQueries } from "@/packages/pms/lib/guest-profile-listing";
import {
  addGuestNote,
  setGuestStatus,
  type GuestProfile,
} from "@/packages/pms/lib/guests.functions";
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
  canManage: boolean;
  canCreateReservation: boolean;
  openEdit: () => void;
  openNote: () => void;
  openUpload: () => void;
  openMerge: () => void;
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
  onMerged,
  children,
}: {
  restaurantId: string;
  guest: GuestProfile;
  membershipRole: string;
  onOpenLoyalty: () => void;
  onOpenNotesPage: () => void;
  onOpenStaysPage: () => void;
  onOpenReservationsPage: () => void;
  onOpenIdentityPage: () => void;
  onMerged: () => void;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const changeStatus = useServerFn(setGuestStatus);
  const addNote = useServerFn(addGuestNote);
  const [editOpen, setEditOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeRetiredId, setMergeRetiredId] = useState<string | undefined>();
  const [uploadOpen, setUploadOpen] = useState(false);
  const canManage = canStartReservationForRole(membershipRole);

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
      canManage,
      canCreateReservation: canManage,
      openEdit: () => setEditOpen(true),
      openNote: () => setNoteOpen(true),
      openUpload: () => setUploadOpen(true),
      openMerge: () => {
        setMergeRetiredId(undefined);
        setMergeOpen(true);
      },
      printProfile: () => window.print(),
      toggleStatus: () =>
        statusMutation.mutate(guest.guestStatus === "active" ? "inactive" : "active"),
      openLoyalty: onOpenLoyalty,
      openNotesPage: onOpenNotesPage,
      openStaysPage: onOpenStaysPage,
      openReservationsPage: onOpenReservationsPage,
      openIdentityPage: onOpenIdentityPage,
    }),
    [
      canManage,
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
      <GuestPrintProfile guest={guest} />
      <GuestFormDialog
        restaurantId={restaurantId}
        open={editOpen}
        onOpenChange={setEditOpen}
        guest={guest}
        onSaved={refresh}
        onMergeRequested={(duplicateId) => {
          setMergeRetiredId(duplicateId);
          setMergeOpen(true);
        }}
      />
      <GuestMergeDialog
        restaurantId={restaurantId}
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        initialSurvivorId={guest.id}
        initialRetiredId={mergeRetiredId}
        onMerged={onMerged}
      />
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
            <Button
              onClick={() => noteMutation.mutate()}
              disabled={noteMutation.isPending || note.trim() === ""}
            >
              Save note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload document</DialogTitle>
          </DialogHeader>
          <GuestFormIdentityUpload restaurantId={restaurantId} guestId={guest.id} />
        </DialogContent>
      </Dialog>
    </GuestProfileActionsContext.Provider>
  );
}

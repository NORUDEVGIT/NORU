import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Pencil, Power, StickyNote } from "lucide-react";
import { toast } from "sonner";

import {
  GuestRestrictionBadges,
  StatusBadge,
  VipBadge,
} from "@/packages/pms/components/guests/guest-bits";
import { GuestFormDialog } from "@/packages/pms/components/guests/guest-form-dialog";
import { GuestMergeDialog } from "@/packages/pms/components/guests/guest-merge-dialog";
import {
  GUEST_PROFILE_DIRECTORY_PATH,
  guestProfileSearch,
  type GuestProfileCardId,
  type GuestProfileTypeId,
} from "@/packages/pms/lib/guest-profile-wave1";
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

export function GuestProfileHeader({
  restaurantId,
  guest,
  returnCard,
  profileType,
}: {
  restaurantId: string;
  guest: GuestProfile;
  returnCard: GuestProfileCardId;
  profileType: GuestProfileTypeId;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const changeStatus = useServerFn(setGuestStatus);
  const addNote = useServerFn(addGuestNote);
  const [editOpen, setEditOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeRetiredId, setMergeRetiredId] = useState<string | undefined>();

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["guest", restaurantId, guest.id] });
    void queryClient.invalidateQueries({ queryKey: ["guests", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["guest-directory-stats", restaurantId] });
  }

  const statusMutation = useMutation({
    mutationFn: (status: "active" | "inactive") =>
      changeStatus({ data: { restaurantId, guestId: guest.id, status } }),
    onSuccess: () => {
      toast.success("Guest status updated.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const noteMutation = useMutation({
    mutationFn: () => addNote({ data: { restaurantId, guestId: guest.id, note } }),
    onSuccess: () => {
      toast.success("Note added to history.");
      setNote("");
      setNoteOpen(false);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <>
      <button
        type="button"
        onClick={() =>
          void navigate({
            to: GUEST_PROFILE_DIRECTORY_PATH,
            search: guestProfileSearch({ card: returnCard, type: profileType }),
          })
        }
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Guest Profiles
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h1 className="font-display text-2xl">{guest.fullName}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {guest.vipStatus ? <VipBadge /> : null}
            <StatusBadge status={guest.guestStatus} />
            <GuestRestrictionBadges guest={guest} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="size-4 sm:mr-2" />
            <span className="hidden sm:inline">Edit</span>
          </Button>
          <Button variant="outline" onClick={() => setNoteOpen(true)}>
            <StickyNote className="size-4 sm:mr-2" />
            <span className="hidden sm:inline">Add Note</span>
          </Button>
          {guest.mergedIntoGuestId ? null : (
            <Button
              variant="outline"
              onClick={() => {
                setMergeRetiredId(undefined);
                setMergeOpen(true);
              }}
            >
              Merge Guest
            </Button>
          )}
          <Button
            variant="outline"
            disabled={statusMutation.isPending}
            onClick={() =>
              statusMutation.mutate(guest.guestStatus === "active" ? "inactive" : "active")
            }
          >
            <Power className="size-4 sm:mr-2" />
            <span className="hidden sm:inline">
              {guest.guestStatus === "active" ? "Deactivate" : "Reactivate"}
            </span>
          </Button>
        </div>
      </div>

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
        onMerged={() => {
          refresh();
          void navigate({ to: GUEST_PROFILE_DIRECTORY_PATH });
        }}
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
    </>
  );
}

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Camera, MoreHorizontal, Pencil, Power, StickyNote } from "lucide-react";
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
  canStartReservationForRole,
  formatGuestAddress,
  guestInitials,
} from "@/packages/pms/lib/guest-profile-overview";
import {
  addGuestNote,
  createGuestPhotoUpload,
  saveGuestPhoto,
  setGuestStatus,
  type GuestProfile,
} from "@/packages/pms/lib/guests.functions";
import { invalidateGuestWorkspaceQueries } from "@/packages/pms/lib/guest-profile-listing";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Textarea } from "@/shared/components/ui/textarea";

export function GuestProfileHeader({
  restaurantId,
  guest,
  returnCard,
  profileType,
  membershipRole,
}: {
  restaurantId: string;
  guest: GuestProfile;
  returnCard: GuestProfileCardId;
  profileType: GuestProfileTypeId;
  membershipRole: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const changeStatus = useServerFn(setGuestStatus);
  const addNote = useServerFn(addGuestNote);
  const startPhoto = useServerFn(createGuestPhotoUpload);
  const registerPhoto = useServerFn(saveGuestPhoto);
  const photoRef = useRef<HTMLInputElement>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeRetiredId, setMergeRetiredId] = useState<string | undefined>();
  const canCreateReservation = canStartReservationForRole(membershipRole);
  const location = formatGuestAddress(guest);
  const profileNo = guest.profileNumber ?? "—";

  function refresh() {
    invalidateGuestWorkspaceQueries(queryClient, restaurantId);
    void queryClient.invalidateQueries({ queryKey: ["guest", restaurantId, guest.id] });
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

  async function onPhoto(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Use a JPG, PNG or WebP photo.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Photos must be 8 MB or smaller.");
      return;
    }
    const ticket = await startPhoto({
      data: {
        restaurantId,
        guestId: guest.id,
        contentType: file.type as "image/jpeg" | "image/png" | "image/webp",
        size: file.size,
      },
    });
    if (!ticket.ok) {
      toast.error(ticket.message);
      return;
    }
    const { error } = await supabase.storage
      .from("property-images")
      .uploadToSignedUrl(ticket.path, ticket.token, file);
    if (error) {
      toast.error("Photo upload failed.");
      return;
    }
    await registerPhoto({ data: { restaurantId, guestId: guest.id, path: ticket.path } });
    toast.success("Guest photo saved.");
    refresh();
  }

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
        <div className="flex flex-wrap items-start gap-4">
          <div className="relative">
            {guest.photoUrl ? (
              <img
                src={guest.photoUrl}
                alt=""
                className="size-16 rounded-full object-cover"
                data-testid="guest-overview-photo"
              />
            ) : (
              <div
                className="flex size-16 items-center justify-center rounded-full bg-muted font-display text-lg"
                data-testid="guest-overview-photo"
              >
                {guestInitials(guest.fullName)}
              </div>
            )}
            <button
              type="button"
              className="absolute -bottom-1 -right-1 rounded-full border border-border bg-card p-1"
              aria-label="Upload guest photo"
              onClick={() => photoRef.current?.click()}
            >
              <Camera className="size-3.5" />
            </button>
            <input
              ref={photoRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => void onPhoto(event.target.files)}
            />
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-2xl">{guest.fullName}</h1>
            <p className="text-sm text-muted-foreground">
              {profileNo}
              {guest.profileType ? ` · ${guest.profileType.name}` : " · Individual"}
              {guest.createdAt ? ` · Member since ${guest.createdAt.slice(0, 10)}` : ""}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {guest.vipStatus ? <VipBadge /> : null}
              <StatusBadge status={guest.guestStatus} />
              <GuestRestrictionBadges guest={guest} />
            </div>
            <p className="text-sm text-muted-foreground">
              {[guest.phone, guest.email, location].filter(Boolean).join(" · ") || "No contact details"}
            </p>
            {guest.notes ? <p className="text-sm italic text-muted-foreground">{guest.notes}</p> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreateReservation ? (
            <Button asChild>
              <Link to="/restaurant/bookings/new" search={{ guestId: guest.id }}>
                New Reservation
              </Link>
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="size-4 sm:mr-2" />
            <span className="hidden sm:inline">Edit</span>
          </Button>
          <Button variant="outline" onClick={() => setNoteOpen(true)}>
            <StickyNote className="size-4 sm:mr-2" />
            <span className="hidden sm:inline">Add Note</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" aria-label="More guest actions">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {guest.mergedIntoGuestId ? null : (
                <DropdownMenuItem
                  onSelect={() => {
                    setMergeRetiredId(undefined);
                    setMergeOpen(true);
                  }}
                >
                  Merge Guest
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                disabled={statusMutation.isPending}
                onSelect={() =>
                  statusMutation.mutate(guest.guestStatus === "active" ? "inactive" : "active")
                }
              >
                <Power className="mr-2 size-4" />
                {guest.guestStatus === "active" ? "Deactivate" : "Reactivate"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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

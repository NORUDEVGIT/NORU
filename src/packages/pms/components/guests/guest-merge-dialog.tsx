import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { guestListItems, listGuests, mergeGuests, type GuestSummary } from "@/packages/pms/lib/guests.functions";
import { invalidateGuestWorkspaceQueries } from "@/packages/pms/lib/guest-profile-listing";

export function GuestMergeDialog({
  restaurantId,
  open,
  onOpenChange,
  initialSurvivorId,
  initialRetiredId,
  onMerged,
}: {
  restaurantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSurvivorId?: string | undefined;
  initialRetiredId?: string | undefined;
  onMerged?: (survivorId: string) => void;
}) {
  const fetchGuests = useServerFn(listGuests);
  const merge = useServerFn(mergeGuests);
  const queryClient = useQueryClient();
  const [survivorId, setSurvivorId] = useState(initialSurvivorId ?? "");
  const [retiredId, setRetiredId] = useState(initialRetiredId ?? "");
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSurvivorId(initialSurvivorId ?? "");
    setRetiredId(initialRetiredId ?? "");
    setConfirmOpen(false);
  }, [open, initialSurvivorId, initialRetiredId]);

  const guestsQuery = useQuery({
    queryKey: ["guests", restaurantId, "merge-picker"],
    queryFn: () => fetchGuests({ data: { restaurantId, status: "active", limit: 200 } }),
    enabled: open,
  });

  const guests = guestListItems(guestsQuery.data);
  const survivor = guests.find((guest) => guest.id === survivorId);
  const retired = guests.find((guest) => guest.id === retiredId);

  const mutation = useMutation({
    mutationFn: () =>
      merge({
        data: { restaurantId, survivorId, retiredId },
      }),
    onSuccess: (result) => {
      toast.success("Guests merged. The retired profile is no longer a live Directory row.");
      invalidateGuestWorkspaceQueries(queryClient, restaurantId);
      setConfirmOpen(false);
      onOpenChange(false);
      onMerged?.(result.survivorId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!mutation.isPending) onOpenChange(next);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge guests</DialogTitle>
            <DialogDescription>
              Choose the surviving profile and the profile to retire. Nothing is merged until you
              confirm. This is not a hard delete and Wave 2 cannot unmerge.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <GuestPicker
              id="merge-survivor"
              label="Survive"
              value={survivorId || initialSurvivorId || ""}
              guests={guests}
              excludeId={retiredId}
              onChange={setSurvivorId}
            />
            <GuestPicker
              id="merge-retired"
              label="Retire"
              value={retiredId || initialRetiredId || ""}
              guests={guests}
              excludeId={survivorId}
              onChange={setRetiredId}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              disabled={!survivorId || !retiredId || survivorId === retiredId}
              onClick={() => {
                if (!survivorId) setSurvivorId(initialSurvivorId ?? "");
                if (!retiredId) setRetiredId(initialRetiredId ?? "");
                setConfirmOpen(true);
              }}
            >
              Review merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent data-testid="guest-merge-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Merge these guests?</AlertDialogTitle>
            <AlertDialogDescription>
              {retired?.fullName ?? "The retired guest"} will be retired into{" "}
              {survivor?.fullName ?? "the surviving guest"}. Reservations and documents move to the
              survivor. Cancel leaves both profiles unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={mutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                mutation.mutate();
              }}
            >
              {mutation.isPending ? "Merging…" : "Merge guests"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function GuestPicker({
  id,
  label,
  value,
  guests,
  excludeId,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  guests: GuestSummary[];
  excludeId?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select {...(value ? { value } : {})} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue placeholder="Select a guest" />
        </SelectTrigger>
        <SelectContent>
          {guests
            .filter((guest) => guest.id !== excludeId)
            .map((guest) => (
              <SelectItem key={guest.id} value={guest.id}>
                {guest.fullName}
                {guest.email || guest.phone
                  ? ` · ${[guest.phone, guest.email].filter(Boolean).join(" · ")}`
                  : ""}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  );
}

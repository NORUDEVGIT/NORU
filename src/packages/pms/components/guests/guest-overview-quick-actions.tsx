import { Link } from "@tanstack/react-router";
import { FileUp, GitMerge, Printer, Power, StickyNote, CalendarPlus } from "lucide-react";

import { useGuestProfileActions } from "@/packages/pms/components/guests/guest-profile-actions";
import { Button } from "@/shared/components/ui/button";

export function GuestOverviewQuickActions() {
  const actions = useGuestProfileActions();
  const { guest, canManage, canCreateReservation } = actions;

  return (
    <section
      className="rounded-2xl border border-border bg-card p-5"
      data-testid="guest-overview-quick-actions"
    >
      <h3 className="font-display text-lg">Quick Actions</h3>
      <div className="mt-3 grid gap-2">
        {canCreateReservation ? (
          <Button asChild>
            <Link to="/restaurant/bookings/new" search={{ guestId: guest.id }}>
              <CalendarPlus className="mr-2 size-4" />
              New Reservation
            </Link>
          </Button>
        ) : (
          <Button disabled>
            <CalendarPlus className="mr-2 size-4" />
            New Reservation
          </Button>
        )}
        <Button variant="outline" onClick={actions.openNote} disabled={!canManage}>
          <StickyNote className="mr-2 size-4" />
          Add Note
        </Button>
        <Button variant="outline" onClick={actions.openUpload} disabled={!canManage}>
          <FileUp className="mr-2 size-4" />
          Upload Document
        </Button>
        <Button variant="outline" onClick={actions.printProfile}>
          <Printer className="mr-2 size-4" />
          Print Profile
        </Button>
        <Button variant="outline" disabled={!canManage} onClick={actions.toggleStatus}>
          <Power className="mr-2 size-4" />
          {guest.guestStatus === "active" ? "Deactivate Profile" : "Reactivate Profile"}
        </Button>
        <Button
          variant="outline"
          disabled={!canManage || Boolean(guest.mergedIntoGuestId)}
          onClick={actions.openMerge}
        >
          <GitMerge className="mr-2 size-4" />
          Merge Profile
        </Button>
      </div>
    </section>
  );
}

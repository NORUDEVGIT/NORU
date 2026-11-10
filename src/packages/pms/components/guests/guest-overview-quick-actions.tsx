import { Link } from "@tanstack/react-router";
import { FileUp, Printer, Power, StickyNote, CalendarPlus } from "lucide-react";

import { useGuestProfileActions } from "@/packages/pms/components/guests/guest-profile-actions";
import { Button } from "@/shared/components/ui/button";

export function GuestOverviewQuickActions() {
  const actions = useGuestProfileActions();
  const { guest, canEdit, canCreateReservation, canActivate, canPrintExport } = actions;

  return (
    <section
      className="rounded-2xl border border-border bg-card p-5"
      data-testid="guest-overview-quick-actions"
    >
      <h3 className="font-display text-lg">Quick Actions</h3>
      <div className="mt-3 grid gap-2">
        {canCreateReservation ? (
          <Button asChild>
            <Link to="/restaurant/pms/reservations" search={{ create: "new", guestId: guest.id }}>
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
        {canEdit ? (
          <Button variant="outline" onClick={actions.openNote}>
            <StickyNote className="mr-2 size-4" />
            Add Note
          </Button>
        ) : null}
        {canEdit ? (
          <Button variant="outline" onClick={actions.openUpload}>
            <FileUp className="mr-2 size-4" />
            Upload Document
          </Button>
        ) : null}
        {canPrintExport ? (
          <Button variant="outline" onClick={actions.printProfile}>
            <Printer className="mr-2 size-4" />
            Print Profile
          </Button>
        ) : null}
        <Button variant="outline" disabled={!canActivate} onClick={actions.toggleStatus}>
          <Power className="mr-2 size-4" />
          {guest.guestStatus === "active" ? "Deactivate Profile" : "Reactivate Profile"}
        </Button>
      </div>
    </section>
  );
}

import { type ReactNode } from "react";
import { BedDouble, CalendarRange, Users } from "lucide-react";

import { Button } from "@/shared/components/ui/button";

function AlternativeCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-xl border border-[#E7E0D4] bg-[#FAF8F4] px-3 py-3">
      <div className="mt-0.5 text-[#C89933]">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[#251605]">{title}</p>
        {children}
      </div>
    </div>
  );
}

export function CreateReservationAlternatives() {
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="create-reservation-alternatives"
    >
      <h2 className="font-display text-lg text-[#251605]">Alternative Options</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        No availability for your exact search? Here are some alternative options.
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {/* TODO: wire availability alternatives */}
        <AlternativeCard icon={<CalendarRange className="size-4" />} title="Alternative Dates">
          <p className="mt-1 text-xs text-muted-foreground">No alternative recommendation available yet.</p>
          <Button type="button" variant="outline" size="sm" className="mt-2" disabled>
            View
          </Button>
        </AlternativeCard>
        {/* TODO: wire alternate room-type search */}
        <AlternativeCard icon={<BedDouble className="size-4" />} title="Different Room Type">
          <p className="mt-1 text-xs text-muted-foreground">No alternative recommendation available yet.</p>
          <Button type="button" variant="outline" size="sm" className="mt-2" disabled>
            View
          </Button>
        </AlternativeCard>
        {/* TODO: wire occupancy optimization */}
        <AlternativeCard icon={<Users className="size-4" />} title="Adjust Occupancy">
          <p className="mt-1 text-xs text-muted-foreground">No alternative recommendation available yet.</p>
          <Button type="button" variant="outline" size="sm" className="mt-2" disabled>
            View
          </Button>
        </AlternativeCard>
      </div>
    </section>
  );
}

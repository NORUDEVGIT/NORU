/**
 * Phase 8G2D — Back Office · Human Resources.
 *
 * Back Office is the canonical administrative home for the property's
 * workforce. It reads and writes the SAME records as every other package:
 * one profile, one property membership (`restaurant_users`), one schedule
 * (`staff_shifts`) and one attendance set (`staff_attendance`). Nothing is
 * duplicated and no HR-specific person table exists.
 *
 * Sign-in identity, property membership and module authorization stay Core:
 * this screen is only an administrative surface over them. Restaurant table
 * assignments stay in Restaurant Management; hotel task assignment stays in
 * PMS.
 */
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, Clock, ShieldCheck, Users } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { StaffManager } from "@/components/workspaces/staff-workspace";
import { ScheduleTab } from "@/components/workforce/schedule-tab";
import { AttendanceTab } from "@/components/workforce/attendance-tab";
import { getMyModuleAccess } from "@/lib/module-access.functions";
import type { RestaurantMembership } from "@/lib/restaurant.functions";

export function HrHeader({ title, blurb }: { title: string; blurb: string }) {
  return (
    <header className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Back Office · Human Resources
      </p>
      <h1 className="font-display text-2xl sm:text-3xl">{title}</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">{blurb}</p>
    </header>
  );
}

/**
 * The Back Office package on its own grants nothing here: the person still
 * needs the existing Human Resources module access for this property, and the
 * server functions re-check it independently.
 */
export function HrGate({
  restaurantId,
  children,
}: {
  restaurantId: string;
  children: ReactNode;
}) {
  const fetchModuleAccess = useServerFn(getMyModuleAccess);
  const access = useQuery({
    queryKey: ["my-module-access", restaurantId],
    queryFn: () => fetchModuleAccess({ data: { restaurantId } }),
    retry: false,
  });

  if (access.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!access.data?.modules.includes("human_resources")) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        You don&apos;t have Human Resources access for this property. Ask an owner or manager to
        give you access.
      </div>
    );
  }
  return <>{children}</>;
}

type HrPath =
  | "/restaurant/back-office/hr/staff"
  | "/restaurant/back-office/hr/shifts"
  | "/restaurant/back-office/hr/attendance";

function NavCard({
  icon: Icon,
  title,
  body,
  to,
  cta,
}: {
  icon: typeof Users;
  title: string;
  body: string;
  to: HrPath;
  cta: string;
}) {
  return (
    <article className="flex flex-col rounded-2xl border border-border bg-card p-5">
      <Icon className="size-5 text-primary" />
      <h2 className="mt-3 font-display text-lg">{title}</h2>
      <p className="mt-1 flex-1 text-sm text-muted-foreground">{body}</p>
      <Button asChild variant="outline" size="sm" className="mt-4 self-start">
        <Link to={to}>{cta}</Link>
      </Button>
    </article>
  );
}

// ---------------------------------------------------------------- home

export function BackOfficeHrHome({ restaurantId }: { restaurantId: string }) {
  return (
    <div className="space-y-6">
      <HrHeader
        title="Human Resources"
        blurb="Workforce administration for the whole property: who works here, when they are scheduled and whether they turned up. The same people and the same records that Restaurant Management and the hotel modules use operationally."
      />

      <HrGate restaurantId={restaurantId}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <NavCard
            icon={Users}
            title="Workforce directory"
            body="Everyone with access to this property, with their role and status. Add a person, change their role, switch their access on or off."
            to="/restaurant/back-office/hr/staff"
            cta="Open workforce directory"
          />
          <NavCard
            icon={CalendarDays}
            title="Shifts"
            body="The single property schedule. Restaurant and hotel workflows read these same shifts — there is no second timetable."
            to="/restaurant/back-office/hr/shifts"
            cta="Open shifts"
          />
          <NavCard
            icon={Clock}
            title="Attendance"
            body="Today's check-ins and check-outs against the schedule, from the one shared attendance record."
            to="/restaurant/back-office/hr/attendance"
            cta="Open attendance"
          />
        </div>

        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 text-primary" />
            <div>
              <h2 className="font-display text-lg">Roles &amp; access</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Roles and per-person module access decide what someone may do in the app. They are
                part of the property&apos;s access system, not an employment record — Human
                Resources only gives you a place to administer them. You&apos;ll find both on each
                person in the workforce directory.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-dashed border-border p-5">
          <h2 className="font-display text-lg">Not built yet</h2>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Payroll.</span> Nothing is calculated or
              paid today. It will build on this workforce record together with Accounting &amp;
              Finance.
            </li>
            <li>
              <span className="font-medium text-foreground">Departments and job titles.</span> There
              is no structured department or job model — only the access role each person holds.
            </li>
            <li>
              <span className="font-medium text-foreground">Leave, performance and training.</span>{" "}
              No requests, reviews or records exist yet.
            </li>
          </ul>
        </section>

        <p className="text-xs text-muted-foreground">
          Restaurant table assignments stay in Restaurant Management, and hotel task assignment
          stays in the hotel modules. They point at these same people.
        </p>
      </HrGate>
    </div>
  );
}

// ------------------------------------------------------------- sections

export function BackOfficeHrStaff({ membership }: { membership: RestaurantMembership }) {
  return (
    <div className="space-y-6">
      <HrHeader
        title="Workforce directory"
        blurb="Every person with access to this property. One record per person — the same identity used by restaurant and hotel operations."
      />
      <HrGate restaurantId={membership.restaurantId}>
        <StaffManager membership={membership} embedded />
      </HrGate>
    </div>
  );
}

export function BackOfficeHrShifts({ membership }: { membership: RestaurantMembership }) {
  const canManage = membership.role === "owner" || membership.role === "manager";
  return (
    <div className="space-y-6">
      <HrHeader
        title="Shifts"
        blurb="The property's single schedule. Every package reads these shifts; none of them keeps its own."
      />
      <HrGate restaurantId={membership.restaurantId}>
        <ScheduleTab
          restaurantId={membership.restaurantId}
          canManage={canManage}
          timezone={membership.restaurant.timezone}
        />
      </HrGate>
    </div>
  );
}

export function BackOfficeHrAttendance({ membership }: { membership: RestaurantMembership }) {
  return (
    <div className="space-y-6">
      <HrHeader
        title="Attendance"
        blurb="Who was scheduled today and who actually checked in, from the one shared attendance record."
      />
      <HrGate restaurantId={membership.restaurantId}>
        <AttendanceTab
          restaurantId={membership.restaurantId}
          timezone={membership.restaurant.timezone}
        />
      </HrGate>
    </div>
  );
}

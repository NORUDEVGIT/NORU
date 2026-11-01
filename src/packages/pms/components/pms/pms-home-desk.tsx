import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from "lucide-react";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { getMyModuleAccess } from "@/core/lib/module-access.functions";
import { getFrontOfficeDashboard } from "@/packages/pms/lib/frontoffice.functions";
import { getPmsPropertySetupCard1 } from "@/packages/pms/lib/pms-property-setup-card1.functions";
import { usePropertyBusinessDate } from "@/packages/pms/lib/use-property-business-date";
import { cn } from "@/shared/lib/utils";

/* Palette (only these five colours are used on this page):
   brown #251605 · gold #C89933 · green #436436 · grey #CCCCCC · white #FFFFFF */
const BROWN = "#251605";
const GOLD = "#C89933";
const GREEN = "#436436";
const GREY = "#CCCCCC";
const WHITE = "#FFFFFF";

/** Faint gold diamonds used behind the hero and the clock panel. */
const DIAMONDS: CSSProperties = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='72' height='72' viewBox='0 0 72 72'%3E%3Cg fill='none' stroke='%23C89933' stroke-width='1.6' opacity='.2'%3E%3Cpath d='M36 6L66 36L36 66L6 36Z'/%3E%3Cpath d='M36 18L54 36L36 54L18 36Z'/%3E%3C/g%3E%3Cpath d='M36 29L43 36L36 43L29 36Z' fill='%23C89933' opacity='.2'/%3E%3C/svg%3E")`,
  backgroundSize: "72px 72px",
};

const ROOM_TYPES = [
  { name: "Standard Twin", share: 0.32, rate: 95 },
  { name: "Standard Double", share: 0.28, rate: 110 },
  { name: "Deluxe King", share: 0.28, rate: 150 },
  { name: "Executive Suite", share: 0.12, rate: 260 },
];

/* =========================================================================
   Day statistics for the selected calendar date.
   Today uses the live front-office snapshot. Out-of-order rooms, housekeeping
   counts and revenue are SAMPLE values until their server functions exist:
   replace the marked lines in sampleDay() with real data.
   ========================================================================= */
interface LiveCounts { occupied: number; available: number; arrivals: number; departures: number; inHouse: number }
interface DayStats {
  total: number; available: number; occupied: number; outOfOrder: number;
  hk: { clean: number; inspected: number; progress: number; dirty: number };
  arrivals: number; departures: number; inHouse: number;
  roomRev: number[]; roomRevenue: number; fnb: number; other: number;
}

function sampleDay(date: Date, live?: LiveCounts): DayStats {
  let s = (Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 864e5) * 2654435761) >>> 0;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  rnd(); rnd();

  const outOfOrder = live ? 0 : 2 + Math.floor(rnd() * 3); // TODO real out-of-order count
  const total = live ? live.occupied + live.available : 84;
  const occupied = live ? live.occupied : Math.min(total - outOfOrder, Math.round(50 + rnd() * 20));
  const available = live ? live.available : total - outOfOrder - occupied;
  const arrivals = live ? live.arrivals : 8 + Math.floor(rnd() * 16);
  const departures = live ? live.departures : 8 + Math.floor(rnd() * 15);
  const inHouse = live ? live.inHouse : Math.round(occupied * 1.75);

  const usable = total - outOfOrder; // TODO real housekeeping status counts
  const dirty = Math.round(usable * (0.08 + rnd() * 0.08));
  const progress = Math.round(usable * (0.04 + rnd() * 0.05));
  const inspected = Math.round(usable * (0.2 + rnd() * 0.08));
  const clean = usable - dirty - progress - inspected;

  const counts = ROOM_TYPES.map((t) => Math.round(occupied * t.share)); // TODO real revenue from folios
  counts[0] += occupied - counts.reduce((a, b) => a + b, 0);
  const roomRev = counts.map((n, i) => n * ROOM_TYPES[i].rate);
  const roomRevenue = roomRev.reduce((a, b) => a + b, 0);
  return {
    total, available, occupied, outOfOrder, hk: { clean, inspected, progress, dirty },
    arrivals, departures, inHouse, roomRev, roomRevenue,
    fnb: Math.round(roomRevenue * (0.17 + rnd() * 0.1)),
    other: Math.round(roomRevenue * (0.04 + rnd() * 0.05)),
  };
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const longDate = (d: Date) =>
  d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export function PmsHomeDesk({
  membership,
}: {
  membership: RestaurantMembership;
  /** Kept so existing callers still compile; the module grid was removed. */
  moduleQuery?: string;
}) {
  const restaurantId = membership.restaurant.id;
  const businessDate = usePropertyBusinessDate(restaurantId, membership.restaurant.timezone);
  const fetchModules = useServerFn(getMyModuleAccess);
  const fetchCard1 = useServerFn(getPmsPropertySetupCard1);
  const fetchFrontOffice = useServerFn(getFrontOfficeDashboard);

  const moduleAccess = useQuery({
    queryKey: ["pms-home-modules", restaurantId],
    queryFn: () => fetchModules({ data: { restaurantId } }),
  });
  const card1 = useQuery({
    queryKey: ["pms-card1", restaurantId],
    queryFn: () => fetchCard1({ data: { restaurantId } }),
    retry: false,
  });
  const allowed = moduleAccess.data?.modules ?? [];
  const canReadFrontOffice = allowed.includes("front_office");
  const frontOffice = useQuery({
    queryKey: ["pms-home-front-office", restaurantId, businessDate],
    queryFn: () => fetchFrontOffice({ data: { restaurantId, today: businessDate } }),
    enabled: canReadFrontOffice,
    retry: false,
  });

  const configuredName = card1.data?.snapshot.draft.name.trim() ?? "";
  const propertyName = configuredName || membership.restaurant.name;
  const snapshot = frontOffice.data;
  const roomTotal = snapshot ? snapshot.occupiedRooms + snapshot.availableRooms : 84;
  const occupiedCount = snapshot ? snapshot.occupiedRooms : 64;
  const occupancyNum = roomTotal > 0 ? Math.round((occupiedCount / roomTotal) * 100) : 76;
  const occupancy = `${occupancyNum}%`;

  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  // Selected calendar day drives the three status cards
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());

  const stats = useMemo(
    () =>
      sampleDay(
        selectedDate,
        snapshot && sameDay(selectedDate, new Date())
          ? {
              occupied: snapshot.occupiedRooms,
              available: snapshot.availableRooms,
              arrivals: snapshot.arrivalsToday,
              departures: snapshot.departuresToday,
              inHouse: snapshot.inHouse,
            }
          : undefined,
      ),
    [selectedDate, snapshot],
  );

  return (
    <div className="min-h-full space-y-6 bg-white px-4 py-5 sm:px-6 sm:py-6" data-testid="pms-home-desk">
      {/* 1. Welcome banner: solid brown with diamond pattern */}
      <section
        className="relative overflow-hidden rounded-2xl border border-[#C89933] bg-[#251605] p-6 text-white shadow-xl sm:p-8"
        style={DIAMONDS}
        aria-label="PMS Welcome Hero"
      >
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="font-serif text-sm font-bold tracking-wider text-[#C89933]" lang="am">
              እንኳን ደህና መጡ · WELCOME
            </div>
            <p className="text-xs uppercase tracking-widest text-white">Hotel operating system – {propertyName}</p>
            <h1 className="font-brand text-3xl font-bold tracking-tight text-white sm:text-4xl">{timeGreeting}</h1>
            <div className="flex items-center gap-2 pt-1 text-xs text-white">
              <CalendarDays className="size-4 text-[#C89933]" />
              <span>Business date · {longDate(new Date())}</span>
            </div>
            <div className="mt-3 h-0.5 w-14 rounded-full bg-[#C89933]" />
          </div>

          <div className="relative flex size-24 shrink-0 items-center justify-center">
            <svg className="size-full -rotate-90" viewBox="0 0 84 84" role="img" aria-label={`Occupancy ${occupancy}`}>
              <circle cx="42" cy="42" r="34" fill="none" stroke={GREEN} strokeWidth="7" />
              <circle
                cx="42" cy="42" r="34" fill="none" stroke={GOLD} strokeWidth="7" strokeLinecap="round"
                strokeDasharray={`${Math.round((occupancyNum / 100) * 214)} 214`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="font-brand text-xl font-bold leading-none text-white">{occupancy}</span>
              <span className="text-[10px] text-white">occupied</span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Clock panel + calendar fill the row */}
      <section className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-[1.1fr_1fr]" aria-label="Clock and Calendar">
        <PmsClockPanel />
        <PmsInteractiveCalendar
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          calMonth={calMonth}
          setCalMonth={setCalMonth}
          calYear={calYear}
          setCalYear={setCalYear}
        />
      </section>

      {/* 3. Room Status · Guest Status · Revenue: one row, follow the selected date */}
      <section
        className="grid auto-cols-[88%] grid-flow-col gap-4 overflow-x-auto pb-1 sm:auto-cols-auto sm:grid-flow-row sm:grid-cols-3 sm:overflow-visible"
        aria-label="Status cards"
      >
        <RoomStatusCard date={selectedDate} stats={stats} />
        <GuestStatusCard date={selectedDate} stats={stats} />
        <RevenueCard date={selectedDate} stats={stats} />
      </section>

    </div>
  );
}

/* =========================================================================
   Clocks: local analog clock + New York and Delhi
   ========================================================================= */
interface ClockParts { h: number; m: number; s: number; day: string; time: string }
function clockParts(tz: string | undefined, d: Date): ClockParts {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", weekday: "short" });
  const o: Record<string, string> = {};
  f.formatToParts(d).forEach((x) => { o[x.type] = x.value; });
  return { h: +o.hour, m: +o.minute, s: +o.second, day: o.weekday, time: `${o.hour}:${o.minute}:${o.second}` };
}
const polar = (deg: number, r: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [100 + r * Math.sin(a), 100 - r * Math.cos(a)];
};

function ClockFace({ p, big }: { p: ClockParts; big: boolean }) {
  const min = p.m + p.s / 60;
  const hr = (p.h % 12) + min / 60;
  const numerals = big ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [12, 3, 6, 9];
  return (
    <svg viewBox="0 0 200 200" className="size-full" role="img" aria-label="Analog clock">
      <circle cx="100" cy="100" r="98" fill={GOLD} />
      <circle cx="100" cy="100" r="95" fill={BROWN} />
      <circle cx="100" cy="100" r="89" fill="none" stroke={GOLD} strokeWidth="7" strokeDasharray="3.5 3.5" opacity=".75" />
      <circle cx="100" cy="100" r="84" fill={BROWN} stroke={GOLD} strokeWidth="1.5" />
      <circle cx="100" cy="100" r="79" fill="none" stroke={GOLD} strokeWidth="3" strokeDasharray="1 7.06" opacity=".8" />
      {big && (
        <>
          <circle cx="100" cy="100" r="58" fill="none" stroke={GOLD} strokeWidth=".8" opacity=".7" />
          <circle cx="100" cy="56" r="8" fill={GOLD} opacity=".85" />
          <path d="M62 80L86 63L100 54L116 64L138 80" fill="none" stroke={GOLD} strokeWidth="1.2" />
          <circle cx="100" cy="100" r="27" fill={BROWN} stroke={GOLD} strokeWidth="1.8" />
        </>
      )}
      {numerals.map((n) => {
        const [x, y] = polar(n * 30, big ? 68 : 66);
        return <text key={n} x={x} y={y + 5} textAnchor="middle" fontSize={big ? 15 : 18} fontWeight="600" fontFamily="serif" fill={GOLD}>{n}</text>;
      })}
      {[0, 90, 180, 270].map((a) => {
        const [x, y] = polar(a, 92);
        return (
          <g key={a} transform={`translate(${x} ${y}) rotate(45)`}>
            <rect x="-8" y="-8" width="16" height="16" fill={GOLD} />
            <rect x="-5.5" y="-5.5" width="11" height="11" fill={GREEN} />
            <rect x="-3.5" y="-3.5" width="7" height="7" fill={GOLD} />
          </g>
        );
      })}
      <g transform={`rotate(${hr * 30} 100 100)`}><polygon points="97,100 100,52 103,100 100,110" fill={GOLD} /></g>
      <g transform={`rotate(${min * 6} 100 100)`}><polygon points="98.3,100 100,28 101.7,100 100,110" fill={GREY} /></g>
      <g transform={`rotate(${p.s * 6} 100 100)`}><line x1="100" y1="114" x2="100" y2="22" stroke={WHITE} strokeWidth="1.2" /></g>
      <circle cx="100" cy="100" r="4.5" fill={GOLD} />
      <circle cx="100" cy="100" r="1.8" fill={BROWN} />
    </svg>
  );
}

function PmsClockPanel() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 250);
    return () => clearInterval(t);
  }, []);
  const local = clockParts(undefined, now);
  const zone = (Intl.DateTimeFormat().resolvedOptions().timeZone || "Local").replace(/_/g, " ");
  const world: [string, string][] = [["New York", "America/New_York"], ["Delhi", "Asia/Kolkata"]];

  return (
    <div
      className="flex flex-col gap-5 rounded-2xl border border-[#C89933] bg-[#251605] p-5 text-white shadow-lg sm:flex-row sm:items-center sm:p-6"
      style={DIAMONDS}
    >
      <div className="mx-auto w-48 shrink-0 text-center sm:w-56">
        <div className="relative aspect-square w-full">
          <ClockFace p={local} big />
        </div>
        <div className="mt-3 font-mono text-2xl font-bold tracking-wider text-[#C89933]">{local.time}</div>
        <div className="text-xs text-white">{longDate(now)}</div>
        <div className="flex items-center justify-center gap-1 text-[11px] text-[#CCCCCC]"><Clock className="size-3 text-[#C89933]" />{zone}</div>
      </div>

      <div className="flex flex-1 flex-row justify-around gap-4 border-t border-[#C89933] pt-4 sm:flex-col sm:justify-center sm:gap-5 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
        {world.map(([city, tz]) => {
          const p = clockParts(tz, now);
          return (
            <div key={city} className="flex flex-col items-center gap-1 text-center sm:flex-row sm:gap-4 sm:text-left">
              <div className="size-20 shrink-0 sm:size-24"><ClockFace p={p} big={false} /></div>
              <div>
                <div className="font-brand text-sm font-semibold text-white">{city}</div>
                <div className="font-mono text-lg font-bold text-[#C89933]">{p.time.slice(0, 5)}</div>
                <div className="text-[11px] text-[#CCCCCC]">{p.day}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =========================================================================
   Calendar: month grid, today in gold, selection ring
   ========================================================================= */
function PmsInteractiveCalendar({
  selectedDate, onSelectDate, calMonth, setCalMonth, calYear, setCalYear,
}: {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  calMonth: number;
  setCalMonth: (m: number) => void;
  calYear: number;
  setCalYear: (y: number) => void;
}) {
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const years = [2024, 2025, 2026, 2027, 2028];
  const today = new Date();

  const go = (delta: number) => {
    const d = new Date(calYear, calMonth + delta, 1);
    setCalMonth(d.getMonth());
    setCalYear(d.getFullYear());
  };
  const goToday = () => { setCalMonth(today.getMonth()); setCalYear(today.getFullYear()); onSelectDate(today); };

  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const lead = (new Date(calYear, calMonth, 1).getDay() + 6) % 7; // Monday first
  const cells = Math.ceil((lead + daysInMonth) / 7) * 7;
  const btn = "inline-flex h-8 items-center justify-center rounded-lg border border-[#CCCCCC] bg-white text-xs font-semibold text-[#251605] transition-colors hover:border-[#C89933] active:bg-[#C89933]";

  return (
    <div className="flex flex-col rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <div className="flex items-center gap-2">
          <span className="size-3 rotate-45 border-2 border-[#C89933]" aria-hidden />
          <h2 className="font-brand text-lg font-bold text-[#251605]">PMS Calendar</h2>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => go(-1)} className={cn(btn, "w-8")} aria-label="Previous month"><ChevronLeft className="size-4" /></button>
          <select value={calMonth} onChange={(e) => setCalMonth(Number(e.target.value))} className={cn(btn, "px-2.5")} aria-label="Month">
            {months.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select value={calYear} onChange={(e) => setCalYear(Number(e.target.value))} className={cn(btn, "px-2.5")} aria-label="Year">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button type="button" onClick={() => go(1)} className={cn(btn, "w-8")} aria-label="Next month"><ChevronRight className="size-4" /></button>
          <button type="button" onClick={goToday} className={cn(btn, "px-3")}>Today</button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center font-serif text-xs font-semibold">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
          <div key={d} className={cn("rounded-md py-1.5", i >= 5 ? "bg-[#C89933] text-[#251605]" : "bg-[#251605] text-white")}>{d}</div>
        ))}
      </div>

      <div className="mt-1.5 grid flex-1 auto-rows-fr grid-cols-7 gap-1.5">
        {Array.from({ length: cells }, (_, idx) => {
          const date = new Date(calYear, calMonth, idx - lead + 1);
          const inMonth = date.getMonth() === calMonth;
          const isToday = sameDay(date, today);
          const isSelected = sameDay(date, selectedDate);
          return (
            <button
              key={idx}
              type="button"
              aria-pressed={isSelected}
              aria-label={date.toDateString()}
              onClick={() => { onSelectDate(date); if (!inMonth) { setCalMonth(date.getMonth()); setCalYear(date.getFullYear()); } }}
              className={cn(
                "flex min-h-10 items-center justify-center rounded-xl border text-xs font-semibold text-[#251605] transition-all",
                isToday ? "border-[#C89933] bg-[#C89933]" : idx % 7 >= 5 ? "border-[#CCCCCC] bg-[#CCCCCC]" : "border-[#CCCCCC] bg-white hover:border-[#C89933]",
                !inMonth && "opacity-40",
                isSelected && "ring-2 ring-[#251605]",
              )}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* =========================================================================
   Room Status · Guest Status · Revenue
   ========================================================================= */
interface Slice { label: string; value: number; color: string; text: string }

function Donut({ slices, center, caption }: { slices: Slice[]; center: number; caption: string }) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  const r = 64;
  const c = 2 * Math.PI * r;
  let off = 0;
  const arcs = slices.filter((s) => s.value > 0).map((s) => {
    const l = (s.value / total) * c;
    const mid = ((off + l / 2) / c) * 2 * Math.PI - Math.PI / 2;
    const o = off;
    off += l;
    return { s, l, o, mid };
  });
  return (
    <svg viewBox="0 0 200 200" className="mx-auto size-40" role="img" aria-label={caption}>
      {total === 0 && <circle r={r} cx="100" cy="100" fill="none" stroke={GREY} strokeWidth="34" />}
      {arcs.map(({ s, l, o }) => (
        <circle key={s.label} r={r} cx="100" cy="100" fill="none" stroke={s.color} strokeWidth="34" transform="rotate(-90 100 100)"
          strokeDasharray={`${Math.max(l - 1.5, 0.1)} ${c - l + 1.5}`} strokeDashoffset={-o}>
          <title>{`${s.label}: ${s.value.toLocaleString()}`}</title>
        </circle>
      ))}
      {arcs.filter(({ s }) => s.value / total >= 0.07).map(({ s, mid }) => (
        <text key={s.label} x={100 + r * Math.cos(mid)} y={100 + r * Math.sin(mid) + 4} textAnchor="middle" fontSize="14" fontWeight="700" fill={s.text}>{s.value}</text>
      ))}
      <circle r="47" cx="100" cy="100" fill="none" stroke={BROWN} strokeWidth=".8" />
      <circle r="81" cx="100" cy="100" fill="none" stroke={BROWN} strokeWidth=".8" />
      <text x="100" y="100" textAnchor="middle" fontSize="24" fontWeight="700" fill={BROWN}>{center}</text>
      <text x="100" y="117" textAnchor="middle" fontSize="10" fill={BROWN}>{caption}</text>
    </svg>
  );
}

function Legend({ slices }: { slices: Slice[] }) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  return (
    <ul className="mt-3 divide-y divide-[#CCCCCC] text-sm">
      {slices.map((s) => (
        <li key={s.label} className="flex items-center gap-2.5 py-1.5">
          <span className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: s.color, boxShadow: `inset 0 0 0 1px ${BROWN}` }} />
          <span className="flex-1 text-[#251605]">{s.label}</span>
          <b className="tabular-nums text-[#251605]">{s.value}</b>
          <small className="w-9 text-right text-[#251605]">{total ? Math.round((s.value / total) * 100) : 0}%</small>
        </li>
      ))}
    </ul>
  );
}

function StatusCard({ title, date, action, children }: { title: string; date: Date; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col rounded-2xl border border-[#CCCCCC] bg-white p-4 shadow-sm" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-brand text-base font-bold text-[#251605]">
          <span className="size-2.5 rotate-45 border-2 border-[#C89933]" aria-hidden />{title}
        </h2>
        {action}
      </div>
      <p className="mt-1 text-xs text-[#251605]">{longDate(date)}</p>
      {children}
    </section>
  );
}

const Chips = ({ items }: { items: [string, string][] }) => (
  <div className="mt-2 flex flex-wrap gap-1.5">
    {items.map(([label, value]) => (
      <span key={label} className="rounded-full bg-[#CCCCCC] px-2.5 py-0.5 text-[11px] text-[#251605]"><b className="mr-1 text-[#436436]">{value}</b>{label}</span>
    ))}
  </div>
);

function RoomStatusCard({ date, stats }: { date: Date; stats: DayStats }) {
  const [view, setView] = useState<"av" | "hk">("av");
  const { hk } = stats;
  const slices: Slice[] =
    view === "av"
      ? [
          { label: "Available", value: stats.available, color: GREEN, text: WHITE },
          { label: "Occupied", value: stats.occupied, color: GOLD, text: BROWN },
          { label: "Out of order", value: stats.outOfOrder, color: BROWN, text: WHITE },
        ]
      : [
          { label: "Clean", value: hk.clean, color: GREEN, text: WHITE },
          { label: "Inspected", value: hk.inspected, color: GREY, text: BROWN },
          { label: "In progress", value: hk.progress, color: GOLD, text: BROWN },
          { label: "Dirty", value: hk.dirty, color: BROWN, text: WHITE },
          { label: "Out of order", value: stats.outOfOrder, color: WHITE, text: BROWN },
        ];
  const seg = (on: boolean) => cn("rounded-lg px-2.5 py-1 text-[11px] font-semibold text-[#251605] transition-colors active:bg-[#C89933]", on ? "bg-[#C89933]" : "bg-white");
  return (
    <StatusCard
      title="Room Status"
      date={date}
      action={
        <div className="inline-flex gap-0.5 rounded-xl border border-[#C89933] p-0.5" role="group" aria-label="Room status view">
          <button type="button" aria-pressed={view === "av"} onClick={() => setView("av")} className={seg(view === "av")}>Availability</button>
          <button type="button" aria-pressed={view === "hk"} onClick={() => setView("hk")} className={seg(view === "hk")}>Housekeeping</button>
        </div>
      }
    >
      <Chips items={[["Available", String(stats.available)], ["Out of order", String(stats.outOfOrder)]]} />
      <div className="mt-3"><Donut slices={slices} center={stats.total} caption="rooms" /></div>
      <Legend slices={slices} />
    </StatusCard>
  );
}

function GuestStatusCard({ date, stats }: { date: Date; stats: DayStats }) {
  const slices: Slice[] = [
    { label: "Arrivals", value: stats.arrivals, color: GOLD, text: BROWN },
    { label: "Departures", value: stats.departures, color: BROWN, text: WHITE },
    { label: "In-house", value: stats.occupied, color: GREEN, text: WHITE },
  ];
  return (
    <StatusCard title="Guest Status" date={date}>
      <Chips items={[["In-house guests", String(stats.inHouse)]]} />
      <div className="mt-3"><Donut slices={slices} center={slices.reduce((a, s) => a + s.value, 0)} caption="total" /></div>
      <Legend slices={slices} />
    </StatusCard>
  );
}

function RevenueCard({ date, stats }: { date: Date; stats: DayStats }) {
  const total = stats.roomRevenue + stats.fnb + stats.other;
  const adr = stats.occupied ? stats.roomRevenue / stats.occupied : 0;
  const sellable = stats.total - stats.outOfOrder;
  const revpar = sellable ? stats.roomRevenue / sellable : 0;
  const occPct = sellable ? Math.round((stats.occupied / sellable) * 100) : 0;
  const max = Math.max(...stats.roomRev, 1);
  return (
    <StatusCard title="Revenue" date={date}>
      <div className="mt-3">
        <b className="block font-brand text-3xl leading-tight text-[#251605]">{money(total)}</b>
        <span className="text-xs text-[#251605]">Total revenue</span>
      </div>
      <Chips items={[["Rooms", money(stats.roomRevenue)], ["Food & beverage", money(stats.fnb)], ["Other", money(stats.other)]]} />
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {[["ADR", money(adr)], ["RevPAR", money(revpar)], ["Occupancy", `${occPct}%`]].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-[#CCCCCC] px-2 py-1.5 text-[11px] text-[#251605]"><b className="block text-sm">{value}</b>{label}</div>
        ))}
      </div>
      <p className="mb-1 mt-3 text-xs text-[#251605]">Rooms revenue by room type</p>
      <ul className="space-y-1.5 text-xs text-[#251605]">
        {ROOM_TYPES.map((t, i) => (
          <li key={t.name} className="grid grid-cols-[88px_1fr_auto] items-center gap-2">
            <span>{t.name}</span>
            <span className="h-2 rounded-full bg-[#CCCCCC]"><span className="block h-full rounded-full bg-[#C89933]" style={{ width: `${(stats.roomRev[i] / max) * 100}%` }} /></span>
            <b className="tabular-nums">{money(stats.roomRev[i])}</b>
          </li>
        ))}
      </ul>
    </StatusCard>
  );
}
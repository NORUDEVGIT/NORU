export type PmsWorldClock = {
  timeZone: string;
  city: string;
  region?: string;
  pinned?: boolean;
};

export const DEFAULT_PMS_WORLD_CLOCKS: PmsWorldClock[] = [
  { timeZone: "Africa/Addis_Ababa", city: "Addis Ababa", region: "East Africa", pinned: true },
  { timeZone: "Asia/Dubai", city: "Dubai", region: "Middle East", pinned: true },
  { timeZone: "Asia/Singapore", city: "Singapore", region: "Asia", pinned: true },
  { timeZone: "Europe/London", city: "London", region: "Europe", pinned: true },
  { timeZone: "America/New_York", city: "New York", region: "United States", pinned: true },
  { timeZone: "America/Los_Angeles", city: "Los Angeles", region: "United States", pinned: true },
  {
    timeZone: "America/Argentina/Buenos_Aires",
    city: "Buenos Aires",
    region: "South America",
    pinned: true,
  },
];

export const PMS_WORLD_CLOCK_OPTIONS: PmsWorldClock[] = [
  ...DEFAULT_PMS_WORLD_CLOCKS,
  { timeZone: "Africa/Nairobi", city: "Nairobi", region: "East Africa" },
  { timeZone: "Africa/Cairo", city: "Cairo", region: "North Africa" },
  { timeZone: "Africa/Johannesburg", city: "Johannesburg", region: "Southern Africa" },
  { timeZone: "Europe/Paris", city: "Paris", region: "Europe" },
  { timeZone: "Europe/Berlin", city: "Berlin", region: "Europe" },
  { timeZone: "Europe/Rome", city: "Rome", region: "Europe" },
  { timeZone: "Europe/Madrid", city: "Madrid", region: "Europe" },
  { timeZone: "Europe/Amsterdam", city: "Amsterdam", region: "Europe" },
  { timeZone: "Europe/Zurich", city: "Zurich", region: "Europe" },
  { timeZone: "Europe/Istanbul", city: "Istanbul", region: "Europe" },
  { timeZone: "Asia/Tokyo", city: "Tokyo", region: "Asia" },
  { timeZone: "Asia/Hong_Kong", city: "Hong Kong", region: "Asia" },
  { timeZone: "Asia/Shanghai", city: "Shanghai", region: "Asia" },
  { timeZone: "Asia/Seoul", city: "Seoul", region: "Asia" },
  { timeZone: "Asia/Bangkok", city: "Bangkok", region: "Asia" },
  { timeZone: "Asia/Kolkata", city: "Mumbai", region: "Asia" },
  { timeZone: "Asia/Jakarta", city: "Jakarta", region: "Asia" },
  { timeZone: "Australia/Sydney", city: "Sydney", region: "Oceania" },
  { timeZone: "Pacific/Auckland", city: "Auckland", region: "Oceania" },
  { timeZone: "America/Chicago", city: "Chicago", region: "United States" },
  { timeZone: "America/Toronto", city: "Toronto", region: "North America" },
  { timeZone: "America/Mexico_City", city: "Mexico City", region: "North America" },
  { timeZone: "America/Sao_Paulo", city: "São Paulo", region: "South America" },
];

const CLOCK_PREFIX = "noru.pms.worldClocks.v1.";

export function worldClockStorageKey(restaurantId: string): string {
  return `${CLOCK_PREFIX}${restaurantId}`;
}

export function clockOptionLabel(clock: PmsWorldClock): string {
  return clock.region ? `${clock.city} / ${clock.region}` : clock.city;
}

export function loadWorldClocks(restaurantId: string): PmsWorldClock[] {
  if (typeof window === "undefined") return DEFAULT_PMS_WORLD_CLOCKS;
  try {
    const raw = window.localStorage.getItem(worldClockStorageKey(restaurantId));
    if (!raw) return DEFAULT_PMS_WORLD_CLOCKS;
    const parsed = JSON.parse(raw) as { custom?: PmsWorldClock[] };
    const extras = (parsed.custom ?? []).filter(
      (clock) =>
        typeof clock?.timeZone === "string" &&
        typeof clock?.city === "string" &&
        !DEFAULT_PMS_WORLD_CLOCKS.some((item) => item.timeZone === clock.timeZone),
    );
    return [...DEFAULT_PMS_WORLD_CLOCKS, ...extras];
  } catch {
    return DEFAULT_PMS_WORLD_CLOCKS;
  }
}

export function saveCustomWorldClocks(restaurantId: string, clocks: PmsWorldClock[]): void {
  if (typeof window === "undefined") return;
  const custom = clocks.filter((clock) => !clock.pinned);
  try {
    window.localStorage.setItem(worldClockStorageKey(restaurantId), JSON.stringify({ custom }));
  } catch {
    /* ignore quota / private mode */
  }
}

export function searchWorldClockOptions(query: string, existing: PmsWorldClock[]): PmsWorldClock[] {
  const taken = new Set(existing.map((clock) => clock.timeZone));
  const needle = query.trim().toLowerCase();
  return PMS_WORLD_CLOCK_OPTIONS.filter((clock) => {
    if (taken.has(clock.timeZone)) return false;
    if (!needle) return true;
    return `${clock.city} ${clock.region ?? ""} ${clock.timeZone}`.toLowerCase().includes(needle);
  });
}

export function formatClockDigital(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(now);
}

export function clockHands(now: Date, timeZone: string): { hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const second = Number(parts.find((part) => part.type === "second")?.value ?? 0);
  return {
    hour: ((hour % 12) + minute / 60) * 30,
    minute: (minute + second / 60) * 6,
    second: second * 6,
  };
}

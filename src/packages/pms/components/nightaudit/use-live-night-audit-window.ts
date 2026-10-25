import { useEffect, useState } from "react";

import {
  evaluateNightAuditWindow,
  type NightAuditWindowState,
} from "@/packages/pms/lib/night-audit-window";

/** Server window config re-evaluated on a property-local clock so OPEN/CLOSED does not go stale. */
export function useLiveNightAuditWindow(
  base: NightAuditWindowState | null | undefined,
  role: string,
) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  if (!base) return null;
  return evaluateNightAuditWindow({
    start: base.start,
    end: base.end,
    timezone: base.timezone,
    role,
    now,
  });
}

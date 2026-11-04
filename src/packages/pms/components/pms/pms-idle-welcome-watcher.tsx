import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

import {
  PMS_DASHBOARD_PATH,
  PMS_IDLE_MS,
  currentPmsHref,
  hasBlockingPmsDialog,
  isPmsSurfacePath,
  isPmsWelcomePath,
  writeLastPmsWorkspace,
} from "@/packages/pms/lib/pms-idle-welcome";

export function PmsIdleWelcomeWatcher({ restaurantId }: { restaurantId: string }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    if (!isPmsSurfacePath(pathname) || isPmsWelcomePath(pathname)) return;
    writeLastPmsWorkspace(restaurantId, currentPmsHref());
  }, [restaurantId, pathname]);

  useEffect(() => {
    if (!isPmsSurfacePath(pathname)) return;

    const events: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "pointerdown",
      "scroll",
      "wheel",
    ];

    let timer = 0;

    function goIdle() {
      if (hasBlockingPmsDialog()) {
        timer = window.setTimeout(goIdle, PMS_IDLE_MS);
        return;
      }
      const href = currentPmsHref();
      const path = window.location.pathname;
      if (isPmsWelcomePath(path)) return;
      writeLastPmsWorkspace(restaurantId, href);
      void navigate({ to: PMS_DASHBOARD_PATH });
    }

    function reset() {
      window.clearTimeout(timer);
      timer = window.setTimeout(goIdle, PMS_IDLE_MS);
    }

    reset();
    for (const event of events) {
      window.addEventListener(event, reset, { passive: true });
    }
    return () => {
      window.clearTimeout(timer);
      for (const event of events) {
        window.removeEventListener(event, reset);
      }
    };
  }, [navigate, pathname, restaurantId]);

  return null;
}

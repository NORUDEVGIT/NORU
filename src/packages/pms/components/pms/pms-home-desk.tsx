import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRouter } from "@tanstack/react-router";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { getPmsPropertySetupCard1 } from "@/packages/pms/lib/pms-property-setup-card1.functions";
import {
  PMS_DEFAULT_WORKSPACE_PATH,
  readLastPmsWorkspace,
} from "@/packages/pms/lib/pms-idle-welcome";
import { PmsWorldClocks } from "@/packages/pms/components/pms/pms-world-clocks";
import welcomeDesk from "@/assets/pms-welcome-front-desk.jpg";

export function PmsHomeDesk({
  membership,
}: {
  membership: RestaurantMembership;
  moduleQuery?: string;
}) {
  const router = useRouter();
  const restaurantId = membership.restaurant.id;
  const fetchCard1 = useServerFn(getPmsPropertySetupCard1);
  const card1 = useQuery({
    queryKey: ["pms-card1", restaurantId],
    queryFn: () => fetchCard1({ data: { restaurantId } }),
    retry: false,
  });

  const configuredName = card1.data?.snapshot.draft.name.trim() ?? "";
  const propertyName = configuredName || membership.restaurant.name;

  function resumeWorkspace() {
    const next = readLastPmsWorkspace(restaurantId);
    router.history.push(next || PMS_DEFAULT_WORKSPACE_PATH);
  }

  return (
    <div
      className="absolute inset-0 overflow-hidden bg-[#F3EEE4]"
      data-testid="pms-home-desk"
      data-welcome="true"
      onDoubleClick={resumeWorkspace}
    >
      <img
        src={welcomeDesk}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover object-[center_bottom]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(243,238,228,0.88)_0%,rgba(243,238,228,0.58)_32%,rgba(243,238,228,0.22)_62%,rgba(243,238,228,0.06)_100%)]"
      />

      <div className="relative z-10 flex h-full flex-col px-5 pt-[7vh] sm:px-10 sm:pt-[8vh]">
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-[#8A6A24]">
            Welcome back
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-[#251605] sm:text-5xl">
            {propertyName}
          </h1>
        </div>

        <div className="mt-6 flex justify-center sm:mt-7">
          <PmsWorldClocks restaurantId={restaurantId} />
        </div>
      </div>
    </div>
  );
}

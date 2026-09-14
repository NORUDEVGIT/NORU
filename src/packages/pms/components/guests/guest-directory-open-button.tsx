import { useNavigate } from "@tanstack/react-router";

import {
  GUEST_PROFILE_DIRECTORY_PATH,
  GUEST_PROFILE_OPEN_DIRECTORY_LABEL,
  guestProfileCardSearch,
  type GuestProfileCardId,
} from "@/packages/pms/lib/guest-profile-wave1";
import { Button } from "@/shared/components/ui/button";

/**
 * Empty / no-guest CTA on guest-required cards. Navigates to Directory and
 * keeps `?card=` so staff return to the same card after they pick a guest
 * (Spec §5.16 — Wave 3 residual / Guest shell UX, not Waves 4–5).
 */
export function GuestDirectoryOpenButton({
  fromCard,
  onOpen,
}: {
  fromCard: GuestProfileCardId;
  /** Switch the shell to Directory when already on the directory path. */
  onOpen?: (() => void) | undefined;
}) {
  const navigate = useNavigate();

  return (
    <Button
      type="button"
      data-testid="guest-profile-open-directory"
      className="mt-4"
      onClick={() => {
        onOpen?.();
        void navigate({
          to: GUEST_PROFILE_DIRECTORY_PATH,
          search: guestProfileCardSearch(fromCard),
        });
      }}
    >
      {GUEST_PROFILE_OPEN_DIRECTORY_LABEL}
    </Button>
  );
}

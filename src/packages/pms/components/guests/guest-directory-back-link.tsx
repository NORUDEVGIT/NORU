import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import {
  GUEST_PROFILE_DIRECTORY_PATH,
  guestProfileSearch,
  type GuestProfileCardId,
  type GuestProfileTypeId,
} from "@/packages/pms/lib/guest-profile-wave1";

/**
 * Information's Directory back arrow. Guest-required cards reuse this same
 * control (Spec §5.15 — or a shell-level sticky back-to-Directory). Wave 3
 * residual / Guest shell UX — not Waves 4–5.
 */
export function GuestDirectoryBackLink({
  fromCard,
  profileType,
}: {
  fromCard: GuestProfileCardId;
  profileType?: GuestProfileTypeId | undefined;
}) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      data-testid="guest-profile-directory-back"
      onClick={() =>
        void navigate({
          to: GUEST_PROFILE_DIRECTORY_PATH,
          search: guestProfileSearch({ card: fromCard, type: profileType }),
        })
      }
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" /> Directory
    </button>
  );
}

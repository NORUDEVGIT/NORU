import { useState } from "react";

import { maskIdNumber } from "@/packages/pms/lib/guest-profile-wave2";

export function MaskedIdNumber({
  value,
  empty = "—",
  className,
}: {
  value: string | null | undefined;
  empty?: string;
  className?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const trimmed = (value ?? "").trim();
  if (!trimmed) return <span className={className}>{empty}</span>;
  const masked = maskIdNumber(trimmed) ?? empty;

  return (
    <span className={className} data-testid="guest-id-mask">
      <span>{revealed ? trimmed : masked}</span>
      <button
        type="button"
        className="ml-2 text-xs font-medium text-primary underline-offset-2 hover:underline"
        onClick={(event) => {
          event.stopPropagation();
          setRevealed((current) => !current);
        }}
      >
        {revealed ? "Hide" : "Reveal"}
      </button>
    </span>
  );
}

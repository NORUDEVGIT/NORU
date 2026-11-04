import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Places in the shared Reservations toolbar that a workspace can fill with its own
 * controls (its filter menu, its primary action), so every workspace keeps one
 * toolbar instead of drawing its own.
 */
export type ReservationShellSlots = {
  filter: HTMLElement | null;
  primary: HTMLElement | null;
};

const ReservationShellContext = createContext<ReservationShellSlots | null>(null);

export const ReservationShellProvider = ReservationShellContext.Provider;

export function ReservationShellSlot({
  name,
  children,
}: {
  name: keyof ReservationShellSlots;
  children: ReactNode;
}) {
  const slots = useContext(ReservationShellContext);
  if (!slots) return <>{children}</>;
  const node = slots[name];
  return node ? createPortal(children, node) : null;
}

/** Same look for every toolbar icon button (Filter, Refresh, Export). */
export const SHELL_ICON_BUTTON =
  "relative size-9 border-[#DDD4C5] bg-white text-[#4a2c1a] hover:bg-[#F7F4EE]";

/** Same look for every workspace primary action. */
export const SHELL_PRIMARY_BUTTON =
  "h-9 shrink-0 whitespace-nowrap bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]";

export function ShellCountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-4 justify-center rounded-full bg-[#C89933] px-1 text-[10px] font-semibold leading-4 text-[#251605]">
      {count}
    </span>
  );
}

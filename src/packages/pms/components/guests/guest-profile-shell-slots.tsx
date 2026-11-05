import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Toolbar slots so each Guest Profile section fills one shared toolbar. */
export type GuestProfileShellSlots = {
  search: HTMLElement | null;
  filter: HTMLElement | null;
  export: HTMLElement | null;
};

const GuestProfileShellContext = createContext<GuestProfileShellSlots | null>(null);

export const GuestProfileShellProvider = GuestProfileShellContext.Provider;

export function GuestProfileShellSlot({
  name,
  children,
}: {
  name: keyof GuestProfileShellSlots;
  children: ReactNode;
}) {
  const slots = useContext(GuestProfileShellContext);
  if (!slots) return null;
  const node = slots[name];
  return node ? createPortal(children, node) : null;
}

import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Places in the shared Reports toolbar that the open report fills
 * (its filters, its export action), so every report keeps one toolbar.
 */
export type ReportsShellSlots = {
  search: HTMLElement | null;
  filter: HTMLElement | null;
  export: HTMLElement | null;
};

const ReportsShellContext = createContext<ReportsShellSlots | null>(null);

export const ReportsShellProvider = ReportsShellContext.Provider;

export function ReportsShellSlot({
  name,
  children,
}: {
  name: keyof ReportsShellSlots;
  children: ReactNode;
}) {
  const slots = useContext(ReportsShellContext);
  if (!slots) return <>{children}</>;
  const node = slots[name];
  return node ? createPortal(children, node) : null;
}

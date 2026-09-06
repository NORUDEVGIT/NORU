import { createContext, useContext, type ReactNode } from "react";

/**
 * Phase 7D.2D — presentation-only PMS context.
 *
 * When a screen is reached through a canonical `/restaurant/pms/*` address the
 * shell publishes the PMS submodule title here, so the reused workspace bodies
 * can show the PMS name instead of their legacy heading. No behaviour changes.
 */
const PmsHeadingContext = createContext<string | undefined>(undefined);

export function PmsHeadingProvider({
  heading,
  children,
}: {
  heading?: string | undefined;
  children: ReactNode;
}) {
  return <PmsHeadingContext.Provider value={heading}>{children}</PmsHeadingContext.Provider>;
}

/** Returns the PMS title when inside a canonical PMS route, else the fallback. */
export function usePageHeading(fallback: string): string {
  return useContext(PmsHeadingContext) ?? fallback;
}

/** True when the current screen is presented as a PMS submodule. */
export function useIsPmsContext(): boolean {
  return useContext(PmsHeadingContext) !== undefined;
}

/** Renders the PMS submodule title when in PMS context, else the given fallback. */
export function PageHeading({ fallback }: { fallback: string }) {
  const heading = useContext(PmsHeadingContext);
  return <>{heading ?? fallback}</>;
}

/** Hides legacy-architecture chrome (eyebrows, parent labels) inside PMS routes. */
export function NonPmsOnly({ children }: { children: ReactNode }) {
  const heading = useContext(PmsHeadingContext);
  return heading === undefined ? <>{children}</> : null;
}

/** Renders content only inside a canonical PMS route. */
export function PmsOnly({ children }: { children: ReactNode }) {
  const heading = useContext(PmsHeadingContext);
  return heading === undefined ? null : <>{children}</>;
}

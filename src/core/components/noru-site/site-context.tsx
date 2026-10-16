import { createContext, useContext, type ReactNode } from "react";
import type { NoruSiteContent } from "@/core/lib/marketing/types";

const NoruSiteContext = createContext<NoruSiteContent | null>(null);

export function NoruSiteProvider({
  value,
  children,
}: {
  value: NoruSiteContent;
  children: ReactNode;
}) {
  return <NoruSiteContext.Provider value={value}>{children}</NoruSiteContext.Provider>;
}

export function useNoruSite(): NoruSiteContent {
  const value = useContext(NoruSiteContext);
  if (!value) throw new Error("Noru site content is missing.");
  return value;
}

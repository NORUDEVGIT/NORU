import { createContext, useContext, type ReactNode } from "react";
import { getMarketingContent, type MarketingContent } from "@/core/lib/marketing";

const PublicMarketingContext = createContext<MarketingContent | null>(null);

export function PublicMarketingProvider({
  content,
  children,
}: {
  content: MarketingContent;
  children: ReactNode;
}) {
  return <PublicMarketingContext.Provider value={content}>{children}</PublicMarketingContext.Provider>;
}

/** Published CMS document from the route loader, or the honest seed. */
export function usePublicMarketing(): MarketingContent {
  return useContext(PublicMarketingContext) ?? getMarketingContent();
}

import { FeatureList } from "../components/FeatureList";
import { SplitPage, type SplitSection } from "../components/SplitPage";
import { RequestDemoButton } from "../components/RequestDemoButton";
import { useNoruSite } from "../site-context";

export function Solutions({ anchor }: { anchor?: string | undefined }) {
  const { solutions } = useNoruSite();
  const sections: SplitSection[] = solutions.map((solution) => ({
    id: solution.id,
    icon: solution.icon,
    title: solution.title,
    lead: solution.lead,
    body: <FeatureList points={solution.points} />,
  }));
  return (
    <SplitPage
      page="solutions"
      sections={sections}
      anchor={anchor}
      footer={<RequestDemoButton />}
    />
  );
}

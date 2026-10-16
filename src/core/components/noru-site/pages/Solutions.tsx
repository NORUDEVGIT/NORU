import { FeatureList } from "../components/FeatureList";
import { SplitPage, type SplitSection } from "../components/SplitPage";
import { RequestDemoButton } from "../components/RequestDemoButton";
import { SOLUTIONS } from "../data/content";

const SECTIONS: SplitSection[] = SOLUTIONS.map((s) => ({
  id: s.id,
  icon: s.icon,
  title: s.title,
  lead: s.lead,
  body: <FeatureList points={s.points} />,
}));

export function Solutions({ anchor }: { anchor?: string | undefined }) {
  return <SplitPage page="solutions" sections={SECTIONS} anchor={anchor} footer={<RequestDemoButton />} />;
}

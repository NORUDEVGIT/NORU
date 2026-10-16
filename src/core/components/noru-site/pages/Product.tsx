import { FeatureList } from "../components/FeatureList";
import { SplitPage, type SplitSection } from "../components/SplitPage";
import { RequestDemoButton } from "../components/RequestDemoButton";
import { PRODUCTS } from "../data/content";

const SECTIONS: SplitSection[] = PRODUCTS.map((p) => ({
  id: p.id,
  icon: p.icon,
  title: p.title,
  lead: p.lead,
  body: <FeatureList points={p.points} />,
}));

export function Product({ anchor }: { anchor?: string | undefined }) {
  return <SplitPage page="product" sections={SECTIONS} anchor={anchor} footer={<RequestDemoButton />} />;
}

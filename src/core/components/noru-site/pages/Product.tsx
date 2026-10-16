import { FeatureList } from "../components/FeatureList";
import { SplitPage, type SplitSection } from "../components/SplitPage";
import { RequestDemoButton } from "../components/RequestDemoButton";
import { useNoruSite } from "../site-context";

export function Product({ anchor }: { anchor?: string | undefined }) {
  const { products } = useNoruSite();
  const sections: SplitSection[] = products.map((product) => ({
    id: product.id,
    icon: product.icon,
    title: product.title,
    lead: product.lead,
    body: <FeatureList points={product.points} />,
  }));
  return (
    <SplitPage page="product" sections={sections} anchor={anchor} footer={<RequestDemoButton />} />
  );
}

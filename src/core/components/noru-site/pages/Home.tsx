import { EventsMarquee } from "../components/EventsMarquee";
import { Faq } from "../components/Faq";
import { HeroAnimation } from "../components/HeroAnimation";
import { ProductHighlights, SolutionHighlights } from "../components/OfferingCards";
import { PartnersMarquee } from "../components/PartnersMarquee";

export function Home() {
  return (
    <div className="pg on" id="home">
      <HeroAnimation />
      <PartnersMarquee />
      <EventsMarquee />
      <ProductHighlights />
      <SolutionHighlights />
      <Faq />
    </div>
  );
}

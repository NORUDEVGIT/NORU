import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/shared/components/ui/accordion";
import { activeOf, getMarketingContent } from "@/core/lib/marketing";

export function HomeFaq() {
  const items = activeOf(getMarketingContent().faq);
  if (items.length === 0) return null;

  return (
    <section id="faq" className="bg-background" aria-labelledby="faq-heading">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:py-20">
        <h2 id="faq-heading" className="font-display text-3xl sm:text-4xl">
          Frequently asked questions
        </h2>
        <Accordion type="single" collapsible className="mt-8">
          {items.map((item) => (
            <AccordionItem key={item.id} value={item.id}>
              <AccordionTrigger className="text-base">{item.question}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{item.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

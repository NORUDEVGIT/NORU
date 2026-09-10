import { Button } from "@/shared/components/ui/button";
import { MarketingHref } from "@/core/components/home/marketing-href";
import { usePublicMarketing } from "@/core/components/home/marketing-content-context";

export function HomeCta() {
  const { contact } = usePublicMarketing();

  return (
    <section id="contact" className="bg-primary text-primary-foreground">
      <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:py-24">
        <h2 className="font-display text-3xl sm:text-5xl">{contact.heading}</h2>
        <p className="mx-auto mt-4 max-w-2xl text-base text-primary-foreground/80 sm:text-lg">
          {contact.description}
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button
            asChild
            size="lg"
            className="h-12 rounded-full bg-accent px-7 font-semibold text-accent-foreground hover:bg-accent/90"
          >
            <MarketingHref href={contact.primaryCta.target}>{contact.primaryCta.label}</MarketingHref>
          </Button>
          {contact.secondaryCta ? (
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 rounded-full border-primary-foreground/30 bg-transparent px-7 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
            >
              <MarketingHref href={contact.secondaryCta.target}>{contact.secondaryCta.label}</MarketingHref>
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

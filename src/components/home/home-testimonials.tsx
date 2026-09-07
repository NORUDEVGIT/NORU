import { Quote } from "lucide-react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/shared/components/ui/carousel";

/**
 * Placeholder testimonial slots. No real quotes or customers are claimed here —
 * replace the entries below with verified restaurant testimonials when available.
 */
const TESTIMONIAL_SLOTS = [
  { label: "Restaurant testimonial", note: "Coming soon" },
  { label: "Restaurant testimonial", note: "Coming soon" },
  { label: "Restaurant testimonial", note: "Coming soon" },
  { label: "Restaurant testimonial", note: "Coming soon" },
];

export function HomeTestimonials() {
  return (
    <section className="bg-background">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Testimonials
        </span>
        <h2 className="mt-3 font-display text-3xl sm:text-4xl">From Restaurants Using NORU</h2>
        <p className="mt-3 max-w-xl text-base text-muted-foreground">
          Verified restaurant stories will appear here.
        </p>

        <Carousel opts={{ align: "start" }} className="mt-10">
          <CarouselContent>
            {TESTIMONIAL_SLOTS.map((slot, index) => (
              <CarouselItem key={index} className="sm:basis-1/2 lg:basis-1/3">
                <div className="flex h-full flex-col rounded-3xl border border-dashed border-border bg-card p-6">
                  <Quote className="size-6 text-accent" />
                  <p className="mt-4 flex-1 text-sm font-medium text-muted-foreground">
                    {slot.label}
                  </p>
                  <div className="mt-6 flex items-center gap-3">
                    <span className="size-10 shrink-0 rounded-full bg-muted" />
                    <span className="text-xs font-semibold text-muted-foreground">{slot.note}</span>
                  </div>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <div className="mt-6 flex gap-2">
            <CarouselPrevious className="static translate-y-0" />
            <CarouselNext className="static translate-y-0" />
          </div>
        </Carousel>
      </div>
    </section>
  );
}

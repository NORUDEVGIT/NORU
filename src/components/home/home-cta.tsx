import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function HomeCta() {
  return (
    <section id="contact" className="bg-primary text-primary-foreground">
      <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:py-24">
        <h2 className="font-display text-3xl sm:text-5xl">Ready to Transform Your Restaurant?</h2>
        <p className="mx-auto mt-4 max-w-2xl text-base text-primary-foreground/80 sm:text-lg">
          Bring ordering, kitchen operations, staff and restaurant management together with NORU.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button
            asChild
            size="lg"
            className="h-12 rounded-full bg-accent px-7 font-semibold text-accent-foreground hover:bg-accent/90"
          >
            <Link to="/restaurant/register">Create Restaurant Account</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="h-12 rounded-full border-primary-foreground/30 bg-transparent px-7 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
          >
            <Link to="/restaurant/login">Sign In</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

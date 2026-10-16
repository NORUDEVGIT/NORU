import type { KeyboardEvent } from "react";
import { SOLUTIONS, PRODUCTS, type Offering } from "../data/content";
import { useNavigate, type PageId } from "../lib/router";
import { ArrowIcon, Icon } from "./Icon";
import photoRestaurants from "../assets/photo-restaurants.jpg";
import photoResorts from "../assets/photo-resorts.jpg";
import photoHotels from "../assets/photo-hotels.jpg";
import photoGuest from "../assets/photo-guest.jpg";

const SOLUTION_PHOTOS: Record<string, string> = {
  restaurants: photoRestaurants,
  resorts: photoResorts,
  hotels: photoHotels,
  guest: photoGuest,
};

interface CardProps {
  item: Offering;
  page: PageId;
  cta: string;
  photo?: string | undefined;
}

/** A clickable card that opens a section of the product or solutions page. */
function OfferingCard({ item, page, cta, photo }: CardProps) {
  const navigate = useNavigate();
  const open = (): void => navigate(page, item.id);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === "Enter") open();
  };
  return (
    <div
      className={photo ? "card fc" : "card fc nimg"}
      data-k={item.id}
      role="link"
      tabIndex={0}
      aria-label={`${item.title}: ${cta}`}
      onClick={open}
      onKeyDown={onKeyDown}
    >
      {photo ? (
        <div className="cimg">
          <img src={photo} alt="" loading="lazy" />
        </div>
      ) : null}
      <div className="fb">
        <Icon name={item.icon} />
        <h3>{item.title}</h3>
        <span className="fd">{item.blurb}</span>
        <span className="l">
          {cta}
          <ArrowIcon />
        </span>
      </div>
    </div>
  );
}

export function ProductHighlights() {
  return (
    <section>
      <div className="w">
        <h2>Product highlights</h2>
        <div className="g4">
          {PRODUCTS.map((p) => (
            <OfferingCard key={p.id} item={p} page="product" cta="Learn More" />
          ))}
        </div>
      </div>
    </section>
  );
}

export function SolutionHighlights() {
  return (
    <section className="alt">
      <div className="w">
        <h2>Solutions for every property</h2>
        <div className="g4">
          {SOLUTIONS.map((s) => (
            <OfferingCard key={s.id} item={s} page="solutions" cta="See solution" photo={SOLUTION_PHOTOS[s.id]} />
          ))}
        </div>
      </div>
    </section>
  );
}

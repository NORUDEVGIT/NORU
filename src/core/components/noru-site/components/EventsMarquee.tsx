import type { CSSProperties } from "react";
import { EVENTS, type EventItem } from "../data/content";

/**
 * "Events We Attend" slides continuously, exactly like the partners strip.
 * The list is rendered twice so the loop has no gap; the copy is hidden from screen readers.
 * Hovering or focusing the strip pauses it.
 */
export function EventsMarquee({ events = EVENTS }: { events?: EventItem[] }) {
  const style = { "--n": events.length } as CSSProperties;

  const card = (ev: EventItem, copy: string) => (
    <article className="ev-card" key={`${copy}-${ev.id}`}>
      <span className="ev-date">{ev.date}</span>
      <h3>{ev.title}</h3>
      <p className="ev-loc">{ev.place}</p>
      <p>{ev.note}</p>
    </article>
  );

  return (
    <section id="events">
      <div className="w">
        <h2>Events We Attend</h2>
        <div className="mq ev-mq" aria-label="Events we attend" tabIndex={0}>
          <div className="mt ev-mt" style={style}>
            {events.map((ev) => card(ev, "a"))}
            <div className="ev-dup" aria-hidden="true">
              {events.map((ev) => card(ev, "b"))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

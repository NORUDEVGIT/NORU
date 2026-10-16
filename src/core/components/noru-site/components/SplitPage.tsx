import type { ReactNode } from "react";
import { hrefFor, type PageId } from "../lib/router";
import { Icon, type IconName } from "./Icon";

export interface SplitSection {
  id: string;
  icon: IconName;
  title: string;
  /** Shown under the title and repeated in the page banner. */
  lead?: string;
  chipLabel?: string;
  /** Right-hand column content. */
  body: ReactNode;
}

interface Props {
  page: PageId;
  sections: SplitSection[];
  /** Currently selected section id (from the URL). Falls back to the first section. */
  anchor?: string | undefined;
  footer?: ReactNode;
}

/**
 * Product, Solutions and Resources share one layout: a banner with chips, and one section at a time.
 * The banner heading and subtitle follow the selected section.
 */
export function SplitPage({ page, sections, anchor, footer }: Props) {
  const current = sections.find((s) => s.id === anchor) ?? sections[0];
  if (!current) return null;

  return (
    <div className="pg on solo" id={page}>
      <div className="pbn">
        <div className="w ph1">
          <h1>{current.title}</h1>
          {current.lead ? <p className="mut">{current.lead}</p> : null}
          <div className="chips">
            {sections.map((s) => (
              <a key={s.id} className={s.id === current.id ? "chip on" : "chip"} href={hrefFor(page, s.id)}>
                {s.chipLabel ?? s.title}
              </a>
            ))}
          </div>
        </div>
      </div>
      <div className="w">
        <div className="split cur" id={current.id}>
          <div>
            <Icon name={current.icon} />
            <h2>{current.title}</h2>
            {current.lead ? <p className="mut">{current.lead}</p> : null}
          </div>
          {current.body}
        </div>
      </div>
      {footer}
    </div>
  );
}

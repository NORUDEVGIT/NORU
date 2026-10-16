import type { Point } from "../data/content";

export function FeatureList({ points }: { points: Point[] }) {
  return (
    <ul className="ck">
      {points.map((p) => (
        <li key={`${p.strong ?? ""}${p.text}`}>
          {p.strong ? (
            <>
              <b>{p.strong}</b> — {p.text}
            </>
          ) : (
            p.text
          )}
        </li>
      ))}
    </ul>
  );
}

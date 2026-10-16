import type { SitePoint } from "@/core/lib/marketing/types";

export function FeatureList({ points }: { points: SitePoint[] }) {
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

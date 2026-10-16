import { useEffect, useRef } from "react";
import { useNoruSite } from "../site-context";

/* Timeline (seconds) */
const END = 9;
const WALK = 2.6;
const BOW_AT = 3.1;
const BOW_LEN = 1.6;
const HOLD = 3;

/* Geometry */
const HIP_Y = 540;
const FEET_Y = 832;
const STAND_X = 335;
const FINAL_X = 255;
const TORSO = Math.hypot(150, 120);
const TH_FIN = Math.atan2(-120, 150);
const HEAD_TH_FIN = Math.atan2(-60, 95);
const HEAD_L_FIN = Math.hypot(95, 60);
const HEAD_L_STAND = 47.5 + 17 + 58;

const clamp = (v: number): number => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const inOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);

interface FigureParts {
  body: SVGGElement;
  torso: SVGPathElement;
  legA: SVGPathElement;
  legB: SVGPathElement;
  head: SVGCircleElement;
  shadow: SVGEllipseElement;
  armNear: SVGGElement;
  armNearOutline: SVGPathElement;
  armNearPath: SVGPathElement;
  handNear: SVGCircleElement;
  armFar: SVGGElement;
  armFarPath: SVGPathElement;
  handFar: SVGCircleElement;
}

function pick<T extends Element>(root: Element, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`HeroAnimation: missing element ${selector}`);
  return el;
}

function figureParts(root: Element): FigureParts {
  return {
    body: pick<SVGGElement>(root, ".bd"),
    torso: pick<SVGPathElement>(root, ".torso"),
    legA: pick<SVGPathElement>(root, ".legA"),
    legB: pick<SVGPathElement>(root, ".legB"),
    head: pick<SVGCircleElement>(root, ".hd"),
    shadow: pick<SVGEllipseElement>(root, ".sh"),
    armNear: pick<SVGGElement>(root, ".armA"),
    armNearOutline: pick<SVGPathElement>(root, ".ao"),
    armNearPath: pick<SVGPathElement>(root, ".ap"),
    handNear: pick<SVGCircleElement>(root, ".ah"),
    armFar: pick<SVGGElement>(root, ".armB"),
    armFarPath: pick<SVGPathElement>(root, ".bp"),
    handFar: pick<SVGCircleElement>(root, ".bh"),
  };
}

function setArm(
  group: SVGGElement,
  path: SVGPathElement,
  outline: SVGPathElement | null,
  hand: SVGCircleElement,
  sx: number,
  sy: number,
  angle: number,
  k: number,
): void {
  if (k <= 0.001) {
    group.style.visibility = "hidden";
    return;
  }
  group.style.visibility = "visible";
  group.style.opacity = k.toFixed(3);
  const ex = sx + 85 * k * Math.sin(angle);
  const ey = sy + 85 * k * Math.cos(angle);
  const bend = angle + 0.45;
  const hx = ex + 80 * k * Math.sin(bend);
  const hy = ey + 80 * k * Math.cos(bend);
  const d = `M${sx.toFixed(1)} ${sy.toFixed(1)} L${ex.toFixed(1)} ${ey.toFixed(1)} L${hx.toFixed(1)} ${hy.toFixed(1)}`;
  path.setAttribute("d", d);
  outline?.setAttribute("d", d);
  hand.setAttribute("cx", hx.toFixed(1));
  hand.setAttribute("cy", hy.toFixed(1));
}

function renderFigure(f: FigureParts, t: number): void {
  const w = clamp(t / WALK);
  const xs = lerp(-150, STAND_X, 1 - Math.pow(1 - w, 2.2));
  const b = inOut(clamp((t - BOW_AT) / BOW_LEN));
  const x = xs + (FINAL_X - STAND_X) * b;
  const th = lerp(-Math.PI / 2, TH_FIN, b);
  const p0x = x + TORSO * Math.cos(th);
  const p0y = HIP_Y + TORSO * Math.sin(th);
  const hth = lerp(-Math.PI / 2, HEAD_TH_FIN, b);
  const hl = lerp(HEAD_L_STAND, HEAD_L_FIN, b);
  const c = inOut(clamp((t - BOW_AT - 0.3) / 1.2));
  const lw = 40 + 55 * c;
  const off = 26 * (1 - c);
  const amp = w < 1 ? Math.min(1, (1 - w) * 4) : 0;
  const ph = w * 5 * Math.PI;
  const sw = 42 * Math.sin(ph) * amp;
  const lift = 16 * amp;
  const fy = 879.5 - lw / 2;
  const la = Math.max(0, Math.cos(ph)) * lift;
  const lb = Math.max(0, -Math.cos(ph)) * lift;

  f.torso.setAttribute("d", `M${p0x.toFixed(1)} ${p0y.toFixed(1)} L${x.toFixed(1)} ${HIP_Y}`);
  f.legA.setAttribute(
    "d",
    `M${(x - off).toFixed(1)} ${HIP_Y} L${(x - off + sw).toFixed(1)} ${(fy - la).toFixed(1)}`,
  );
  f.legB.setAttribute(
    "d",
    `M${(x + off).toFixed(1)} ${HIP_Y} L${(x + off - sw).toFixed(1)} ${(fy - lb).toFixed(1)}`,
  );
  f.legA.setAttribute("stroke-width", lw.toFixed(1));
  f.legB.setAttribute("stroke-width", lw.toFixed(1));
  f.head.setAttribute("cx", (p0x + hl * Math.cos(hth)).toFixed(1));
  f.head.setAttribute("cy", (p0y + hl * Math.sin(hth)).toFixed(1));

  /* Arms swing while walking and vanish as the figures bow. */
  const ak = 1 - inOut(clamp((t - BOW_AT) / 0.5));
  const sx = p0x + ((x - p0x) / TORSO) * 34;
  const sy = p0y + ((HIP_Y - p0y) / TORSO) * 34;
  const sa = 0.62 * Math.sin(ph) * amp;
  setArm(f.armNear, f.armNearPath, f.armNearOutline, f.handNear, sx, sy, 0.1 - sa, ak);
  setArm(f.armFar, f.armFarPath, null, f.handFar, sx, sy, 0.1 + sa, ak);

  const bob = w < 1 ? Math.abs(Math.sin(w * 5 * Math.PI)) * 5 * Math.min(1, (1 - w) * 4) : 0;
  const lean = (1 - w) * 5;
  f.body.setAttribute(
    "transform",
    `translate(0 ${(-bob).toFixed(1)}) rotate(${lean.toFixed(2)} ${x.toFixed(1)} ${FEET_Y})`,
  );
  f.shadow.setAttribute("cx", x.toFixed(1));
  f.shadow.setAttribute("rx", (56 * (1 - bob / 40)).toFixed(1));
  f.shadow.setAttribute("opacity", (0.3 * (1 - clamp((t - 4.7) / 0.6))).toFixed(3));
}

function FigureShapes() {
  return (
    <>
      <ellipse className="nh-shadow sh" cx={255} cy={884} rx={56} ry={9} opacity={0} />
      <g className="bd">
        <g className="armB">
          <path className="nh-line bp" d="M0 0" strokeWidth={28} />
          <circle className="nh-ink bh" r={18} cx={0} cy={0} />
        </g>
        <path className="nh-line legA" d="M255 540 L255 832" strokeWidth={95} />
        <path className="nh-line legB" d="M255 540 L255 832" strokeWidth={95} />
        <path className="nh-line torso" d="M405 420 L255 540" strokeWidth={95} />
        <circle className="nh-ink hd" cx={500} cy={360} r={58} />
        <g className="armA">
          <path className="nh-arm-o ao" d="M0 0" />
          <path className="nh-line ap" d="M0 0" strokeWidth={28} />
          <circle className="nh-hand ah" r={18} cx={0} cy={0} />
        </g>
      </g>
    </>
  );
}

/**
 * Two people walk toward each other, bow and form the Noru logo.
 * The drawing is updated imperatively on every animation frame (no React state), which keeps it smooth.
 */
export function HeroAnimation() {
  const rootRef = useRef<HTMLElement>(null);
  const { hero } = useNoruSite();

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const figures = [
      figureParts(pick<SVGGElement>(root, ".nh-fig-l")),
      figureParts(pick<SVGGElement>(root, ".nh-fig-r")),
    ];
    const letters = Array.from(root.querySelectorAll<SVGPathElement>(".nh-word path"));
    const sub = pick<SVGTextElement>(root, ".nh-sub");
    const tag = pick<HTMLElement>(root, ".nh-tag");

    const render = (t: number): void => {
      figures.forEach((f) => renderFigure(f, t));
      letters.forEach((p, i) => {
        const k = clamp((t - (5.3 + i * 0.4)) / 0.7);
        p.style.visibility = k <= 0 ? "hidden" : "visible";
        p.style.strokeDasharray = "1 1.05";
        p.style.strokeDashoffset = (1 - easeOut(k)).toFixed(4);
      });
      sub.style.opacity = easeOut(clamp((t - 7.0) / 0.6)).toFixed(3);
      const g = easeOut(clamp((t - 7.8) / 0.9));
      tag.style.opacity = g.toFixed(3);
      tag.style.transform = `translateY(${((1 - g) * 12).toFixed(1)}px)`;
    };

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    render(reduceMotion ? END : 0);
    if (reduceMotion) return;

    let raf = 0;
    let start = performance.now();
    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      let t = (now - start) / 1000;
      if (t >= END + HOLD) {
        start = now;
        t = 0;
      }
      render(Math.min(t, END));
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section className="hh" id="nh-hero" ref={rootRef}>
      <div className="nh-band pbn">
        <div className="nh-stage">
          <svg
            viewBox="130 150 1020 870"
            role="img"
            aria-label="Two people walk toward each other, bow, and form the Noru logo."
          >
            <g className="nh-fig-l">
              <FigureShapes />
            </g>
            <g transform="translate(1280 0) scale(-1 1)">
              <g className="nh-fig-r">
                <FigureShapes />
              </g>
            </g>
            <g className="nh-word" strokeWidth={30}>
              <path
                className="nh-line"
                pathLength={1}
                d="M360 865 V705 Q360 665 400 665 H410 Q450 665 450 705 V865"
              />
              <path
                className="nh-line"
                pathLength={1}
                d="M525 710 Q525 665 570 665 Q615 665 615 710 V820 Q615 865 570 865 Q525 865 525 820 Z"
              />
              <path
                className="nh-line"
                pathLength={1}
                d="M690 865 V705 Q690 665 730 665 H735 Q765 665 765 705 V735 Q765 775 735 775 H690 M735 775 L770 865"
              />
              <path
                className="nh-line"
                pathLength={1}
                d="M840 665 V825 Q840 865 880 865 H890 Q930 865 930 825 V665"
              />
            </g>
            <text
              className="nh-ink nh-subtxt nh-sub"
              x={645}
              y={975}
              textLength={415}
              lengthAdjust="spacing"
            >
              {hero.amharic}
            </text>
          </svg>
          <p className="nh-tag">{hero.tagline}</p>
        </div>
      </div>
    </section>
  );
}

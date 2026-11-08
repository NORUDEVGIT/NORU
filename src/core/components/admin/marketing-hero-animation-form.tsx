import { useSiteDraft } from "@/core/components/admin/marketing-noru-site-forms";
import { Field, SectionCard, TextField } from "@/core/components/admin/marketing-form-fields";
import {
  NORU_SITE_ANIMATION_DURATION_LIMITS,
  NORU_SITE_ANIMATION_SPEED_PRESETS,
  NORU_SITE_INTENSITY_PRESETS,
  NORU_SITE_MOBILE_FALLBACKS,
  NORU_SITE_REDUCED_MOTION_FALLBACKS,
  NORU_SITE_SCENE_VARIANTS,
  type NoruSiteAnimationConfig,
} from "@/core/lib/marketing/types";
import {
  clampNoruSiteAnimationDuration,
  resolveSiteAnimationConfig,
} from "@/core/lib/marketing/site-content";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";

const SCENE_LABELS: Record<(typeof NORU_SITE_SCENE_VARIANTS)[number], string> = {
  "greeting-bow": "Greeting Bow",
  "logo-only": "Logo Only",
  static: "Static",
};

const SPEED_LABELS: Record<(typeof NORU_SITE_ANIMATION_SPEED_PRESETS)[number], string> = {
  slow: "Slow",
  normal: "Normal",
  fast: "Fast",
};

const MOTION_LABELS: Record<(typeof NORU_SITE_REDUCED_MOTION_FALLBACKS)[number], string> = {
  "end-pose": "End pose",
  "static-logo": "Static logo",
  hide: "Hide",
};

const MOBILE_LABELS: Record<(typeof NORU_SITE_MOBILE_FALLBACKS)[number], string> = {
  full: "Full animation",
  "static-logo": "Static logo",
  "still-image": "Still image",
};

const INTENSITY_LABELS: Record<(typeof NORU_SITE_INTENSITY_PRESETS)[number], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export function MarketingHeroAnimationForm() {
  const { site, updateSite } = useSiteDraft();
  const values = resolveSiteAnimationConfig(site);

  function patch(next: Partial<NoruSiteAnimationConfig>) {
    updateSite((draft) => {
      draft.animation = { ...draft.animation, ...next };
    });
  }

  return (
    <div className="space-y-5">
      <SectionCard
        title="Hero words"
        description="The greeting animation stays in application code. These two lines are the editable copy."
      >
        <TextField
          id="hero-tagline"
          label="Tagline"
          value={site.hero.tagline}
          onChange={(tagline) =>
            updateSite((draft) => {
              draft.hero.tagline = tagline;
            })
          }
        />
        <TextField
          id="hero-amharic"
          label="Amharic line"
          value={site.hero.amharic}
          onChange={(amharic) =>
            updateSite((draft) => {
              draft.hero.amharic = amharic;
            })
          }
        />
      </SectionCard>

      <SectionCard
        title="Animation"
        description="Safe configuration only. Scene graph, shaders, and model URLs are not editable here."
      >
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={values.enabled} onCheckedChange={(checked) => patch({ enabled: checked === true })} />
          Enabled
        </label>
        <Field label="Scene variant">
          <Select value={values.sceneVariant} onValueChange={(sceneVariant) => patch({ sceneVariant: sceneVariant as NoruSiteAnimationConfig["sceneVariant"] })}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NORU_SITE_SCENE_VARIANTS.map((variant) => (
                <SelectItem key={variant} value={variant}>
                  {SCENE_LABELS[variant]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Speed preset">
          <Select value={values.speedPreset} onValueChange={(speedPreset) => patch({ speedPreset: speedPreset as NoruSiteAnimationConfig["speedPreset"] })}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NORU_SITE_ANIMATION_SPEED_PRESETS.map((preset) => (
                <SelectItem key={preset} value={preset}>
                  {SPEED_LABELS[preset]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["introDelaySec", "Intro delay"],
              ["walkDurationSec", "Walk duration"],
              ["greetingDurationSec", "Greeting duration"],
              ["logoRevealDelaySec", "Logo reveal delay"],
              ["holdDurationSec", "Hold duration"],
            ] as const
          ).map(([field, label]) => (
            <TextField
              key={field}
              id={field}
              label={`${label} (seconds)`}
              value={String(values[field])}
              hint={`${NORU_SITE_ANIMATION_DURATION_LIMITS[field].min}–${NORU_SITE_ANIMATION_DURATION_LIMITS[field].max}`}
              onChange={(raw) => {
                const parsed = Number(raw);
                if (!Number.isFinite(parsed)) return;
                patch({ [field]: clampNoruSiteAnimationDuration(field, parsed) });
              }}
            />
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={values.idleLoop} onCheckedChange={(checked) => patch({ idleLoop: checked === true })} />
          Idle loop
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={values.backgroundPatternEnabled}
            onCheckedChange={(checked) => patch({ backgroundPatternEnabled: checked === true })}
          />
          Background pattern
        </label>
        <Field label="Reduced motion fallback">
          <Select
            value={values.reducedMotionFallback}
            onValueChange={(reducedMotionFallback) =>
              patch({ reducedMotionFallback: reducedMotionFallback as NoruSiteAnimationConfig["reducedMotionFallback"] })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NORU_SITE_REDUCED_MOTION_FALLBACKS.map((item) => (
                <SelectItem key={item} value={item}>
                  {MOTION_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Mobile fallback">
          <Select
            value={values.mobileFallback}
            onValueChange={(mobileFallback) =>
              patch({ mobileFallback: mobileFallback as NoruSiteAnimationConfig["mobileFallback"] })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NORU_SITE_MOBILE_FALLBACKS.map((item) => (
                <SelectItem key={item} value={item}>
                  {MOBILE_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Intensity preset">
          <Select
            value={values.intensityPreset}
            onValueChange={(intensityPreset) =>
              patch({ intensityPreset: intensityPreset as NoruSiteAnimationConfig["intensityPreset"] })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NORU_SITE_INTENSITY_PRESETS.map((item) => (
                <SelectItem key={item} value={item}>
                  {INTENSITY_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </SectionCard>

      <SectionCard title="Current behaviour" description="Read-only. These are the values the public renderer will use after the animation task.">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Scene</dt>
            <dd className="font-medium">{SCENE_LABELS[values.sceneVariant]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Enabled</dt>
            <dd className="font-medium">{values.enabled ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Speed</dt>
            <dd className="font-medium">{SPEED_LABELS[values.speedPreset]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Loop</dt>
            <dd className="font-medium">{values.idleLoop ? "On" : "Off"}</dd>
          </div>
        </dl>
      </SectionCard>
    </div>
  );
}

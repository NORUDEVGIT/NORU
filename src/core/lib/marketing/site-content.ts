import { isAllowedNoruSiteHref, isAllowedSocialHref } from "./allowlist.ts";
import {
  NORU_SITE_ANIMATION_DURATION_LIMITS,
  NORU_SITE_ANIMATION_SPEED_PRESETS,
  NORU_SITE_ICONS,
  NORU_SITE_INTENSITY_PRESETS,
  NORU_SITE_MOBILE_FALLBACKS,
  NORU_SITE_REDUCED_MOTION_FALLBACKS,
  NORU_SITE_SCENE_VARIANTS,
  type NoruSiteAnimationConfig,
  type NoruSiteAnimationDurationField,
  type NoruSiteContent,
  type NoruSiteCta,
  type NoruSiteFooterConfig,
  type NoruSiteFooterSocialLink,
  type NoruSiteIcon,
  type SiteFooterContact,
  type SitePost,
} from "./types.ts";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const SITE_COPY_LIMITS = {
  ctaTitle: 120,
  ctaDescription: 400,
  ctaButton: 40,
  footerTagline: 160,
  footerCopyright: 200,
  socialPlatform: 40,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isIcon(value: unknown): value is NoruSiteIcon {
  return typeof value === "string" && (NORU_SITE_ICONS as readonly string[]).includes(value);
}

function isOffering(value: unknown): boolean {
  if (!isRecord(value) || !isIcon(value.icon)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.blurb === "string" &&
    typeof value.lead === "string" &&
    Array.isArray(value.points) &&
    typeof value.order === "number" &&
    typeof value.visible === "boolean"
  );
}

function isPlan(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const price = value.priceEtb;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.modules === "string" &&
    typeof value.order === "number" &&
    typeof value.featured === "boolean" &&
    (price === null || (typeof price === "number" && Number.isFinite(price) && price >= 0))
  );
}

function isOrdered(value: unknown): boolean {
  return isRecord(value) && typeof value.id === "string" && typeof value.order === "number";
}

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === "boolean";
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isOptionalEnum(value: unknown, allowed: readonly string[]): boolean {
  return value === undefined || (typeof value === "string" && allowed.includes(value));
}

function isOptionalDuration(value: unknown, field: NoruSiteAnimationDurationField): boolean {
  if (value === undefined) return true;
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  const { min, max } = NORU_SITE_ANIMATION_DURATION_LIMITS[field];
  return value >= min && value <= max;
}

export function isNoruSiteAnimationConfig(value: unknown): value is NoruSiteAnimationConfig {
  if (!isRecord(value)) return false;
  return (
    isOptionalBoolean(value.enabled) &&
    isOptionalEnum(value.sceneVariant, NORU_SITE_SCENE_VARIANTS) &&
    isOptionalDuration(value.introDelaySec, "introDelaySec") &&
    isOptionalDuration(value.walkDurationSec, "walkDurationSec") &&
    isOptionalDuration(value.greetingDurationSec, "greetingDurationSec") &&
    isOptionalDuration(value.logoRevealDelaySec, "logoRevealDelaySec") &&
    isOptionalDuration(value.holdDurationSec, "holdDurationSec") &&
    isOptionalBoolean(value.idleLoop) &&
    isOptionalEnum(value.speedPreset, NORU_SITE_ANIMATION_SPEED_PRESETS) &&
    isOptionalBoolean(value.backgroundPatternEnabled) &&
    isOptionalEnum(value.reducedMotionFallback, NORU_SITE_REDUCED_MOTION_FALLBACKS) &&
    isOptionalEnum(value.mobileFallback, NORU_SITE_MOBILE_FALLBACKS) &&
    isOptionalEnum(value.intensityPreset, NORU_SITE_INTENSITY_PRESETS)
  );
}

export function isNoruSiteCta(value: unknown): value is NoruSiteCta {
  if (!isRecord(value)) return false;
  return (
    isOptionalBoolean(value.enabled) &&
    isOptionalString(value.title) &&
    isOptionalString(value.description) &&
    isOptionalString(value.buttonLabel) &&
    isOptionalString(value.target)
  );
}

export function isNoruSiteFooterSocialLink(value: unknown): value is NoruSiteFooterSocialLink {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.platform === "string" &&
    typeof value.href === "string" &&
    isOptionalBoolean(value.active) &&
    (value.order === undefined || (typeof value.order === "number" && Number.isFinite(value.order)))
  );
}

function isFooterContact(value: unknown): value is SiteFooterContact {
  if (!isRecord(value)) return false;
  if (typeof value.email !== "string" || typeof value.phone !== "string" || typeof value.address !== "string") {
    return false;
  }
  if (!isOptionalString(value.tagline) || !isOptionalString(value.privacyTarget)) return false;
  if (!isOptionalString(value.termsTarget) || !isOptionalString(value.copyrightText)) return false;
  if (value.socialLinks === undefined) return true;
  return Array.isArray(value.socialLinks) && value.socialLinks.every(isNoruSiteFooterSocialLink);
}

export function isNoruSiteContent(value: unknown): value is NoruSiteContent {
  if (!isRecord(value)) return false;
  const about = value.about;
  const hero = value.hero;
  return (
    Array.isArray(value.products) &&
    value.products.every(isOffering) &&
    Array.isArray(value.solutions) &&
    value.solutions.every(isOffering) &&
    Array.isArray(value.hotelPlans) &&
    value.hotelPlans.every(isPlan) &&
    Array.isArray(value.restaurantPlans) &&
    value.restaurantPlans.every(isPlan) &&
    Array.isArray(value.faq) &&
    value.faq.every(isOrdered) &&
    Array.isArray(value.partners) &&
    value.partners.every(isOrdered) &&
    Array.isArray(value.events) &&
    value.events.every(isOrdered) &&
    Array.isArray(value.posts) &&
    value.posts.every(isOrdered) &&
    Array.isArray(value.quotes) &&
    value.quotes.every(isOrdered) &&
    isRecord(about) &&
    typeof about.title === "string" &&
    typeof about.intro === "string" &&
    typeof about.body === "string" &&
    isFooterContact(value.footerContact) &&
    isRecord(hero) &&
    typeof hero.tagline === "string" &&
    typeof hero.amharic === "string" &&
    (value.animation === undefined || isNoruSiteAnimationConfig(value.animation)) &&
    (value.cta === undefined || isNoruSiteCta(value.cta))
  );
}

export interface SiteContentIssue {
  code: string;
  message: string;
  path?: string;
}

export function siteContentIssues(site: NoruSiteContent): SiteContentIssue[] {
  const errors: SiteContentIssue[] = [];
  for (const offering of [...site.products, ...site.solutions]) {
    if (!offering.title.trim()) {
      errors.push({
        code: "site_title",
        message: "Each product and solution needs a title.",
        path: offering.id,
      });
    }
    if (offering.imageUrl && !isAllowedSocialHref(offering.imageUrl)) {
      errors.push({
        code: "site_image",
        message: "Solution images must be https URLs.",
        path: offering.id,
      });
    }
  }
  for (const plan of [...site.hotelPlans, ...site.restaurantPlans]) {
    if (!plan.name.trim()) {
      errors.push({ code: "site_plan", message: "Each pricing plan needs a name.", path: plan.id });
    }
  }
  for (const partner of site.partners) {
    if (partner.href && !isAllowedSocialHref(partner.href)) {
      errors.push({
        code: "site_partner_href",
        message: "Partner links must be https and must not point at Admin.",
        path: partner.id,
      });
    }
    if (partner.logoUrl && !isAllowedSocialHref(partner.logoUrl)) {
      errors.push({
        code: "site_partner_logo",
        message: "Partner logos must be https URLs.",
        path: partner.id,
      });
    }
  }
  errors.push(...postSlugIssues(site.posts));
  if (!site.about.title.trim()) {
    errors.push({ code: "site_about", message: "About Us needs a title.", path: "about.title" });
  }
  errors.push(...siteAnimationIssues(site.animation));
  errors.push(...siteCtaIssues(site.cta));
  errors.push(...siteFooterExtraIssues(site.footerContact));
  return errors;
}

export function siteAnimationIssues(animation: unknown, path = "site.animation"): SiteContentIssue[] {
  if (animation === undefined) return [];
  if (!isRecord(animation)) {
    return [{ code: "site_animation", message: "Animation configuration must be an object.", path }];
  }
  const errors: SiteContentIssue[] = [];
  if (animation.enabled !== undefined && typeof animation.enabled !== "boolean") {
    errors.push({ code: "site_animation_enabled", message: "Animation enabled must be true or false.", path });
  }
  if (animation.sceneVariant !== undefined && !isOptionalEnum(animation.sceneVariant, NORU_SITE_SCENE_VARIANTS)) {
    errors.push({
      code: "site_animation_variant",
      message: "Animation scene must be greeting-bow, logo-only, or static.",
      path: `${path}.sceneVariant`,
    });
  }
  if (
    animation.speedPreset !== undefined &&
    !isOptionalEnum(animation.speedPreset, NORU_SITE_ANIMATION_SPEED_PRESETS)
  ) {
    errors.push({
      code: "site_animation_speed",
      message: "Animation speed must be slow, normal, or fast.",
      path: `${path}.speedPreset`,
    });
  }
  if (
    animation.reducedMotionFallback !== undefined &&
    !isOptionalEnum(animation.reducedMotionFallback, NORU_SITE_REDUCED_MOTION_FALLBACKS)
  ) {
    errors.push({
      code: "site_animation_reduced_motion",
      message: "Reduced-motion fallback must be end-pose, static-logo, or hide.",
      path: `${path}.reducedMotionFallback`,
    });
  }
  if (
    animation.mobileFallback !== undefined &&
    !isOptionalEnum(animation.mobileFallback, NORU_SITE_MOBILE_FALLBACKS)
  ) {
    errors.push({
      code: "site_animation_mobile",
      message: "Mobile fallback must be full, static-logo, or still-image.",
      path: `${path}.mobileFallback`,
    });
  }
  if (
    animation.intensityPreset !== undefined &&
    !isOptionalEnum(animation.intensityPreset, NORU_SITE_INTENSITY_PRESETS)
  ) {
    errors.push({
      code: "site_animation_intensity",
      message: "Animation intensity must be low, medium, or high.",
      path: `${path}.intensityPreset`,
    });
  }
  for (const field of Object.keys(NORU_SITE_ANIMATION_DURATION_LIMITS) as NoruSiteAnimationDurationField[]) {
    const value = animation[field];
    if (value === undefined) continue;
    const { min, max } = NORU_SITE_ANIMATION_DURATION_LIMITS[field];
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
      errors.push({
        code: "site_animation_duration",
        message: `${field} must be a finite number between ${min} and ${max} seconds.`,
        path: `${path}.${field}`,
      });
    }
  }
  return errors;
}

export function siteCtaIssues(cta: unknown, path = "site.cta"): SiteContentIssue[] {
  if (cta === undefined) return [];
  if (!isRecord(cta)) {
    return [{ code: "site_cta", message: "CTA configuration must be an object.", path }];
  }
  const errors: SiteContentIssue[] = [];
  errors.push(...boundedCopyIssue(cta.title, SITE_COPY_LIMITS.ctaTitle, "site_cta_title", `${path}.title`, "CTA title"));
  errors.push(
    ...boundedCopyIssue(
      cta.description,
      SITE_COPY_LIMITS.ctaDescription,
      "site_cta_description",
      `${path}.description`,
      "CTA description",
    ),
  );
  errors.push(
    ...boundedCopyIssue(
      cta.buttonLabel,
      SITE_COPY_LIMITS.ctaButton,
      "site_cta_button",
      `${path}.buttonLabel`,
      "CTA button label",
    ),
  );
  if (cta.target !== undefined) {
    if (typeof cta.target !== "string" || !isAllowedNoruSiteHref(cta.target)) {
      errors.push({
        code: "site_cta_target",
        message: "CTA target must be a current public-site path, hash page, or https URL — not Admin or javascript:.",
        path: `${path}.target`,
      });
    }
  }
  return errors;
}

export function siteFooterExtraIssues(
  footer: SiteFooterContact | unknown,
  path = "site.footerContact",
): SiteContentIssue[] {
  if (!isRecord(footer)) return [];
  const errors: SiteContentIssue[] = [];
  errors.push(
    ...boundedCopyIssue(footer.tagline, SITE_COPY_LIMITS.footerTagline, "site_footer_tagline", `${path}.tagline`, "Footer tagline"),
  );
  errors.push(
    ...boundedCopyIssue(
      footer.copyrightText,
      SITE_COPY_LIMITS.footerCopyright,
      "site_footer_copyright",
      `${path}.copyrightText`,
      "Footer copyright",
    ),
  );
  if (footer.privacyTarget !== undefined && (typeof footer.privacyTarget !== "string" || !isAllowedNoruSiteHref(footer.privacyTarget))) {
    errors.push({
      code: "site_footer_privacy",
      message: "Privacy Policy destination must be a public-site path, hash, or https URL.",
      path: `${path}.privacyTarget`,
    });
  }
  if (footer.termsTarget !== undefined && (typeof footer.termsTarget !== "string" || !isAllowedNoruSiteHref(footer.termsTarget))) {
    errors.push({
      code: "site_footer_terms",
      message: "Terms of Service destination must be a public-site path, hash, or https URL.",
      path: `${path}.termsTarget`,
    });
  }
  if (footer.socialLinks === undefined) return errors;
  if (!Array.isArray(footer.socialLinks)) {
    errors.push({
      code: "site_footer_socials",
      message: "Footer social links must be a list.",
      path: `${path}.socialLinks`,
    });
    return errors;
  }
  for (const [index, link] of footer.socialLinks.entries()) {
    const linkPath = `${path}.socialLinks.${index}`;
    if (!isNoruSiteFooterSocialLink(link)) {
      errors.push({
        code: "site_footer_social",
        message: "Each social link needs an id, platform, and href.",
        path: linkPath,
      });
      continue;
    }
    if (!link.id.trim() || !link.platform.trim()) {
      errors.push({
        code: "site_footer_social",
        message: "Each social link needs an id and platform.",
        path: link.id || linkPath,
      });
    }
    if (link.platform.length > SITE_COPY_LIMITS.socialPlatform) {
      errors.push({
        code: "site_footer_social_platform",
        message: `Social platform names must be ${SITE_COPY_LIMITS.socialPlatform} characters or fewer.`,
        path: link.id,
      });
    }
    if (!isAllowedSocialHref(link.href)) {
      errors.push({
        code: "site_footer_social_href",
        message: "Footer social links must be https URLs and must not point at Admin.",
        path: link.id || linkPath,
      });
    }
  }
  return errors;
}

function boundedCopyIssue(
  value: unknown,
  max: number,
  code: string,
  path: string,
  label: string,
): SiteContentIssue[] {
  if (value === undefined) return [];
  if (typeof value !== "string") {
    return [{ code, message: `${label} must be text.`, path }];
  }
  if (value.length > max) {
    return [{ code, message: `${label} must be ${max} characters or fewer.`, path }];
  }
  return [];
}

function postSlugIssues(posts: readonly SitePost[]): SiteContentIssue[] {
  const errors: SiteContentIssue[] = [];
  const seen = new Set<string>();
  for (const post of posts) {
    const slug = post.slug.trim().toLowerCase();
    if (!post.published) continue;
    if (!slug || !SLUG_PATTERN.test(slug)) {
      errors.push({
        code: "slug_format",
        message: `Published article “${post.title || post.id}” needs a lowercase slug.`,
        path: post.id,
      });
      continue;
    }
    if (seen.has(slug)) {
      errors.push({
        code: "slug_duplicate",
        message: `Article slug “${slug}” is already used.`,
        path: post.id,
      });
    }
    seen.add(slug);
  }
  return errors;
}

/**
 * Current HeroAnimation.tsx timeline. Resolvers return these when `site.animation` is absent.
 * Do not persist these onto stored documents.
 */
export const NORU_SITE_ANIMATION_DEFAULTS: Required<NoruSiteAnimationConfig> = {
  enabled: true,
  sceneVariant: "greeting-bow",
  introDelaySec: 0,
  walkDurationSec: 2.6,
  greetingDurationSec: 1.6,
  logoRevealDelaySec: 5.3,
  holdDurationSec: 3,
  idleLoop: true,
  speedPreset: "normal",
  backgroundPatternEnabled: true,
  reducedMotionFallback: "end-pose",
  mobileFallback: "full",
  intensityPreset: "medium",
};

export const NORU_SITE_CTA_DEFAULTS: Required<NoruSiteCta> = {
  enabled: true,
  title: "Ready to run your property on one platform?",
  description: "Book a demo and see reservations, restaurant and back office working together.",
  buttonLabel: "Request Demo",
  target: "#resources/contact",
};

export const NORU_SITE_FOOTER_DEFAULTS: Required<Omit<NoruSiteFooterConfig, "socialLinks">> & {
  socialLinks: NoruSiteFooterSocialLink[];
} = {
  tagline: "One Platform. Every Hotel Operation.",
  socialLinks: [],
  privacyTarget: "#",
  termsTarget: "#",
  copyrightText: "© Noru Digital Solutions. All rights reserved.",
};

export function clampNoruSiteAnimationDuration(
  field: NoruSiteAnimationDurationField,
  value: number,
): number {
  const { min, max } = NORU_SITE_ANIMATION_DURATION_LIMITS[field];
  if (!Number.isFinite(value)) return NORU_SITE_ANIMATION_DEFAULTS[field];
  return Math.min(max, Math.max(min, value));
}

function resolvedCopy(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

/** Missing `site.animation` → current greeting-bow defaults. Present numbers are clamped for renderers. */
export function resolveSiteAnimationConfig(
  site?: Pick<NoruSiteContent, "animation"> | null,
): Required<NoruSiteAnimationConfig> {
  const raw = site?.animation;
  if (!raw) return { ...NORU_SITE_ANIMATION_DEFAULTS };
  return {
    enabled: raw.enabled ?? NORU_SITE_ANIMATION_DEFAULTS.enabled,
    sceneVariant: isOptionalEnum(raw.sceneVariant, NORU_SITE_SCENE_VARIANTS)
      ? (raw.sceneVariant ?? NORU_SITE_ANIMATION_DEFAULTS.sceneVariant)
      : NORU_SITE_ANIMATION_DEFAULTS.sceneVariant,
    introDelaySec: clampNoruSiteAnimationDuration(
      "introDelaySec",
      raw.introDelaySec ?? NORU_SITE_ANIMATION_DEFAULTS.introDelaySec,
    ),
    walkDurationSec: clampNoruSiteAnimationDuration(
      "walkDurationSec",
      raw.walkDurationSec ?? NORU_SITE_ANIMATION_DEFAULTS.walkDurationSec,
    ),
    greetingDurationSec: clampNoruSiteAnimationDuration(
      "greetingDurationSec",
      raw.greetingDurationSec ?? NORU_SITE_ANIMATION_DEFAULTS.greetingDurationSec,
    ),
    logoRevealDelaySec: clampNoruSiteAnimationDuration(
      "logoRevealDelaySec",
      raw.logoRevealDelaySec ?? NORU_SITE_ANIMATION_DEFAULTS.logoRevealDelaySec,
    ),
    holdDurationSec: clampNoruSiteAnimationDuration(
      "holdDurationSec",
      raw.holdDurationSec ?? NORU_SITE_ANIMATION_DEFAULTS.holdDurationSec,
    ),
    idleLoop: raw.idleLoop ?? NORU_SITE_ANIMATION_DEFAULTS.idleLoop,
    speedPreset: isOptionalEnum(raw.speedPreset, NORU_SITE_ANIMATION_SPEED_PRESETS)
      ? (raw.speedPreset ?? NORU_SITE_ANIMATION_DEFAULTS.speedPreset)
      : NORU_SITE_ANIMATION_DEFAULTS.speedPreset,
    backgroundPatternEnabled:
      raw.backgroundPatternEnabled ?? NORU_SITE_ANIMATION_DEFAULTS.backgroundPatternEnabled,
    reducedMotionFallback: isOptionalEnum(raw.reducedMotionFallback, NORU_SITE_REDUCED_MOTION_FALLBACKS)
      ? (raw.reducedMotionFallback ?? NORU_SITE_ANIMATION_DEFAULTS.reducedMotionFallback)
      : NORU_SITE_ANIMATION_DEFAULTS.reducedMotionFallback,
    mobileFallback: isOptionalEnum(raw.mobileFallback, NORU_SITE_MOBILE_FALLBACKS)
      ? (raw.mobileFallback ?? NORU_SITE_ANIMATION_DEFAULTS.mobileFallback)
      : NORU_SITE_ANIMATION_DEFAULTS.mobileFallback,
    intensityPreset: isOptionalEnum(raw.intensityPreset, NORU_SITE_INTENSITY_PRESETS)
      ? (raw.intensityPreset ?? NORU_SITE_ANIMATION_DEFAULTS.intensityPreset)
      : NORU_SITE_ANIMATION_DEFAULTS.intensityPreset,
  };
}

/** Missing `site.cta` → current hard-coded CtaBand copy. */
export function resolveSiteCta(site?: Pick<NoruSiteContent, "cta"> | null): Required<NoruSiteCta> {
  const raw = site?.cta;
  if (!raw) return { ...NORU_SITE_CTA_DEFAULTS };
  const target = raw.target?.trim();
  return {
    enabled: raw.enabled ?? NORU_SITE_CTA_DEFAULTS.enabled,
    title: resolvedCopy(raw.title, NORU_SITE_CTA_DEFAULTS.title),
    description: resolvedCopy(raw.description, NORU_SITE_CTA_DEFAULTS.description),
    buttonLabel: resolvedCopy(raw.buttonLabel, NORU_SITE_CTA_DEFAULTS.buttonLabel),
    target: target && isAllowedNoruSiteHref(target) ? target : NORU_SITE_CTA_DEFAULTS.target,
  };
}

/** Missing footer extras → current hard-coded footer chrome. Contact lines are not invented here. */
export function resolveSiteFooter(
  site?: Pick<NoruSiteContent, "footerContact"> | null,
): Required<NoruSiteFooterConfig> {
  const raw = site?.footerContact;
  if (!raw) {
    return { ...NORU_SITE_FOOTER_DEFAULTS, socialLinks: [] };
  }
  const socialLinks = (raw.socialLinks ?? []).filter(
    (link) => link.active !== false && isAllowedSocialHref(link.href),
  );
  const privacy = raw.privacyTarget?.trim();
  const terms = raw.termsTarget?.trim();
  return {
    tagline: resolvedCopy(raw.tagline, NORU_SITE_FOOTER_DEFAULTS.tagline),
    socialLinks,
    privacyTarget:
      privacy && isAllowedNoruSiteHref(privacy) ? privacy : NORU_SITE_FOOTER_DEFAULTS.privacyTarget,
    termsTarget: terms && isAllowedNoruSiteHref(terms) ? terms : NORU_SITE_FOOTER_DEFAULTS.termsTarget,
    copyrightText: resolvedCopy(raw.copyrightText, NORU_SITE_FOOTER_DEFAULTS.copyrightText),
  };
}

/**
 * Card 6 Phase 2 — provider → channel → mapping-kind catalog.
 *
 * External entity lists are local configuration, not a provider fetch. Adding a
 * channel is a data change here. Policy mapping is absent because NORU has no
 * policy entity.
 */

import {
  isSelectableDistributionIntegration,
  type DistributionSyncConfig,
  type DistributionDraft,
  type MappingPair,
  type NamedEntity,
  type ValidationCheck,
} from "./distribution-card6.server.ts";

export const MAPPING_KINDS = ["rooms", "rates", "meals"] as const;
export type MappingKind = (typeof MAPPING_KINDS)[number];

export const DISTRIBUTION_PROVIDER_KINDS = ["channel_manager", "ota", "booking_engine"] as const;
export type DistributionProviderKind = (typeof DISTRIBUTION_PROVIDER_KINDS)[number];

export const DISTRIBUTION_PROVIDER_KIND_LABELS: Record<DistributionProviderKind, string> = {
  channel_manager: "Channel Manager",
  ota: "OTA Connectivity",
  booking_engine: "Booking Engine",
};

export type CatalogEntity = { id: string; label: string };

export type DistributionSyncCapabilities = {
  inventory: {
    supported: boolean;
    availability: boolean;
    roomStatus: boolean;
    outOfOrder: boolean;
    outOfService: boolean;
  };
  rates: {
    supported: boolean;
    rateUpdates: boolean;
    baseRates: boolean;
    derivedRates: boolean;
  };
  restrictions: {
    supported: boolean;
    minimumStay: boolean;
    maximumStay: boolean;
    closedToArrival: boolean;
    closedToDeparture: boolean;
    stopSell: boolean;
  };
  frequencies: readonly ["manual"];
  automaticSync: false;
  manualSync: false;
  retry: false;
};

export type DistributionChannelDef = {
  id: string;
  label: string;
  mappingKinds: readonly MappingKind[];
  rooms: readonly CatalogEntity[];
  rates: readonly CatalogEntity[];
  meals: readonly CatalogEntity[];
  sync: DistributionSyncCapabilities;
};

function mappedDataCapabilities(
  mappingKinds: readonly MappingKind[],
): DistributionSyncCapabilities {
  return {
    inventory: {
      supported: mappingKinds.includes("rooms"),
      availability: mappingKinds.includes("rooms"),
      roomStatus: false,
      outOfOrder: false,
      outOfService: false,
    },
    rates: {
      supported: mappingKinds.includes("rates"),
      rateUpdates: mappingKinds.includes("rates"),
      baseRates: mappingKinds.includes("rates"),
      derivedRates: false,
    },
    restrictions: {
      supported: false,
      minimumStay: false,
      maximumStay: false,
      closedToArrival: false,
      closedToDeparture: false,
      stopSell: false,
    },
    frequencies: ["manual"],
    automaticSync: false,
    manualSync: false,
    retry: false,
  };
}

export type DistributionProviderDef = {
  id: string;
  label: string;
  kind: DistributionProviderKind;
  channels: readonly DistributionChannelDef[];
};

const BOOKING_COM: DistributionChannelDef = {
  id: "booking_com",
  label: "Booking.com",
  mappingKinds: ["rooms", "rates", "meals"],
  rooms: [
    { id: "bcom_deluxe_double", label: "Deluxe Double" },
    { id: "bcom_standard_twin", label: "Standard Twin" },
    { id: "bcom_suite", label: "Suite" },
    { id: "bcom_family", label: "Family Room" },
  ],
  rates: [
    { id: "bcom_flex", label: "Standard Flexible" },
    { id: "bcom_nrfn", label: "Non-refundable" },
    { id: "bcom_corporate", label: "Corporate Rate" },
  ],
  meals: [
    { id: "bcom_ro", label: "Room Only" },
    { id: "bcom_bb", label: "Breakfast" },
    { id: "bcom_hb", label: "Half Board" },
  ],
  sync: mappedDataCapabilities(["rooms", "rates", "meals"]),
};

const EXPEDIA: DistributionChannelDef = {
  id: "expedia",
  label: "Expedia",
  mappingKinds: ["rooms", "rates", "meals"],
  rooms: [
    { id: "exp_deluxe", label: "Deluxe Room" },
    { id: "exp_twin", label: "Twin Room" },
    { id: "exp_suite", label: "Suite" },
  ],
  rates: [
    { id: "exp_retail", label: "Retail Flexible" },
    { id: "exp_package", label: "Package Rate" },
  ],
  meals: [
    { id: "exp_ro", label: "Room Only" },
    { id: "exp_bb", label: "Breakfast Included" },
  ],
  sync: mappedDataCapabilities(["rooms", "rates", "meals"]),
};

const AGODA: DistributionChannelDef = {
  id: "agoda",
  label: "Agoda",
  mappingKinds: ["rooms", "rates"],
  rooms: [
    { id: "agoda_deluxe", label: "Deluxe" },
    { id: "agoda_superior", label: "Superior" },
    { id: "agoda_suite", label: "Suite" },
  ],
  rates: [
    { id: "agoda_flex", label: "Flexible" },
    { id: "agoda_saver", label: "Saver" },
  ],
  meals: [],
  sync: mappedDataCapabilities(["rooms", "rates"]),
};

export const DISTRIBUTION_PROVIDERS: readonly DistributionProviderDef[] = [
  {
    id: "aiosell",
    label: "Aiosell",
    kind: "channel_manager",
    channels: [BOOKING_COM, EXPEDIA, AGODA],
  },
  {
    id: "generic_channel_manager",
    label: "Generic channel manager",
    kind: "channel_manager",
    channels: [BOOKING_COM, EXPEDIA, AGODA],
  },
  {
    id: "generic_ota",
    label: "Generic OTA connectivity",
    kind: "ota",
    channels: [BOOKING_COM],
  },
];

export function distributionProvider(provider: string): DistributionProviderDef | null {
  return DISTRIBUTION_PROVIDERS.find((row) => row.id === provider) ?? null;
}

export function distributionProviderLabel(provider: string): string {
  return distributionProvider(provider)?.label ?? provider;
}

export function distributionChannel(
  provider: string,
  channel: string,
): DistributionChannelDef | null {
  return distributionProvider(provider)?.channels.find((row) => row.id === channel) ?? null;
}

export function distributionChannelLabel(provider: string, channel: string): string {
  return distributionChannel(provider, channel)?.label ?? channel;
}

export function channelSupports(provider: string, channel: string, kind: MappingKind): boolean {
  return distributionChannel(provider, channel)?.mappingKinds.includes(kind) === true;
}

export function distributionSyncCapabilities(
  provider: string,
  channel: string,
): DistributionSyncCapabilities | null {
  return distributionChannel(provider, channel)?.sync ?? null;
}

export function validateDistributionSyncConfig(
  config: DistributionSyncConfig,
  capabilities: DistributionSyncCapabilities | null,
): ValidationCheck[] {
  if (!capabilities) {
    return [
      check("sync_provider", "Sync capabilities available", false, false, "Choose a channel."),
    ];
  }
  const enabled =
    (capabilities.inventory.supported && config.inventory.enabled) ||
    (capabilities.rates.supported && config.rates.enabled) ||
    (capabilities.restrictions.supported && config.restrictions.enabled);
  const unsupportedEnabled =
    (!capabilities.inventory.supported && config.inventory.enabled) ||
    (!capabilities.rates.supported && config.rates.enabled) ||
    (!capabilities.restrictions.supported && config.restrictions.enabled);
  return [
    check(
      "sync_type",
      "At least one supported sync type enabled",
      enabled,
      false,
      enabled ? null : "Enable inventory or rate synchronization.",
    ),
    check(
      "sync_supported",
      "Enabled sync types are supported",
      !unsupportedEnabled,
      false,
      unsupportedEnabled ? "This channel does not support one of the enabled sync types." : null,
    ),
    check(
      "sync_frequency",
      "Sync settings valid",
      capabilities.frequencies.includes(config.frequency),
      false,
      capabilities.frequencies.includes(config.frequency)
        ? null
        : "Choose a supported sync frequency.",
    ),
  ];
}

export function externalEntities(
  provider: string,
  channel: string,
  kind: MappingKind,
): readonly CatalogEntity[] {
  const def = distributionChannel(provider, channel);
  if (!def || !def.mappingKinds.includes(kind)) return [];
  if (kind === "rooms") return def.rooms;
  if (kind === "rates") return def.rates;
  return def.meals;
}

export function externalEntityLabel(
  provider: string,
  channel: string,
  kind: MappingKind,
  id: string,
): string {
  return externalEntities(provider, channel, kind).find((row) => row.id === id)?.label ?? id;
}

export function isDistributionIntegration(row: {
  enabled: boolean;
  status: string;
  provider: string;
}): boolean {
  return distributionProvider(row.provider) !== null;
}

export function isEligibleDistributionIntegration(row: {
  enabled: boolean;
  status: string;
  provider: string;
}): boolean {
  return isDistributionIntegration(row) && isSelectableDistributionIntegration(row);
}

function mappingErrors(
  pairs: readonly MappingPair[],
  noru: readonly NamedEntity[],
  externals: readonly CatalogEntity[],
  noruLabel: string,
  externalLabel: string,
): string[] {
  const messages: string[] = [];
  const noruIds = new Set<string>();
  const externalIds = new Set<string>();
  const activeNoru = new Set(noru.map((row) => row.id));
  const knownExternal = new Set(externals.map((row) => row.id));
  for (const pair of pairs) {
    if (!pair.noruId || !pair.externalId) {
      messages.push(`Every ${noruLabel} mapping needs both sides.`);
      continue;
    }
    if (!activeNoru.has(pair.noruId)) {
      messages.push(`A ${noruLabel} is inactive or no longer exists.`);
    }
    if (!knownExternal.has(pair.externalId)) {
      messages.push(`A ${externalLabel} is not in this channel's catalog.`);
    }
    if (noruIds.has(pair.noruId)) messages.push(`A ${noruLabel} is mapped more than once.`);
    if (externalIds.has(pair.externalId))
      messages.push(`A ${externalLabel} is mapped more than once.`);
    noruIds.add(pair.noruId);
    externalIds.add(pair.externalId);
  }
  return Array.from(new Set(messages));
}

function check(
  id: string,
  label: string,
  passed: boolean,
  warning = false,
  detail: string | null = null,
): ValidationCheck {
  return { id, label, passed, warning, detail };
}

export function validateDistributionDraft(
  draft: DistributionDraft,
  ctx: {
    integration: {
      id: string;
      enabled: boolean;
      status: string;
      provider: string;
      name: string;
    } | null;
    roomTypes: readonly NamedEntity[];
    ratePlans: readonly NamedEntity[];
    mealPlans: readonly NamedEntity[];
    takenChannels: readonly { integrationId: string; channel: string; excludeId: string | null }[];
    excludeId: string | null;
  },
): ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  const integration = ctx.integration;
  if (!integration) {
    checks.push(
      check("integration", "Integration selected", false, false, "Choose an integration."),
    );
    checks.push(check("available", "Integration available", false, false, null));
    checks.push(check("channel", "Channel selected", false, false, null));
    return checks;
  }
  checks.push(check("integration", "Integration selected", true));
  const available = isEligibleDistributionIntegration(integration);
  checks.push(
    check(
      "available",
      "Integration available",
      available,
      false,
      available
        ? null
        : "That integration is disabled or in error. Fix it on the Integrations tab.",
    ),
  );

  const channelDef = distributionChannel(integration.provider, draft.channel);
  checks.push(
    check(
      "channel",
      "Channel selected",
      Boolean(channelDef),
      false,
      channelDef ? null : "Choose a channel for this provider.",
    ),
  );
  if (!channelDef) return checks;

  const clash = ctx.takenChannels.some(
    (row) => row.channel === draft.channel && row.excludeId !== ctx.excludeId,
  );
  if (clash) {
    checks.push(
      check(
        "unique",
        "Channel is unique for this property",
        false,
        false,
        "That channel is already configured.",
      ),
    );
  }

  const roomsSupported = channelDef.mappingKinds.includes("rooms");
  const ratesSupported = channelDef.mappingKinds.includes("rates");
  const mealsSupported = channelDef.mappingKinds.includes("meals");

  const roomMessages = roomsSupported
    ? mappingErrors(
        draft.rooms,
        ctx.roomTypes,
        channelDef.rooms,
        "Noru room type",
        "external room type",
      )
    : [];
  const rateMessages = ratesSupported
    ? mappingErrors(
        draft.rates,
        ctx.ratePlans,
        channelDef.rates,
        "Noru rate plan",
        "external rate plan",
      )
    : [];
  const mealMessages = mealsSupported
    ? mappingErrors(
        draft.meals,
        ctx.mealPlans,
        channelDef.meals,
        "Noru meal plan",
        "external meal plan",
      )
    : [];

  checks.push(
    check(
      "rooms_valid",
      "Room type mappings are valid",
      roomMessages.length === 0,
      false,
      roomMessages[0] ?? null,
    ),
  );
  checks.push(
    check(
      "rates_valid",
      "Rate plan mappings are valid",
      rateMessages.length === 0,
      false,
      rateMessages[0] ?? null,
    ),
  );
  if (mealsSupported) {
    checks.push(
      check(
        "meals_valid",
        "Meal plan mappings are valid",
        mealMessages.length === 0,
        false,
        mealMessages[0] ?? null,
      ),
    );
  }

  if (roomsSupported) {
    const incomplete = ctx.roomTypes.length > 0 && draft.rooms.length < ctx.roomTypes.length;
    checks.push(
      check(
        "rooms_complete",
        "Room types mapped",
        !incomplete,
        incomplete,
        incomplete
          ? `${ctx.roomTypes.length - draft.rooms.length} room type${
              ctx.roomTypes.length - draft.rooms.length === 1 ? "" : "s"
            } not mapped.`
          : null,
      ),
    );
  }
  if (ratesSupported) {
    const incomplete = ctx.ratePlans.length > 0 && draft.rates.length < ctx.ratePlans.length;
    checks.push(
      check(
        "rates_complete",
        "Rate plans mapped",
        !incomplete,
        incomplete,
        incomplete
          ? `${ctx.ratePlans.length - draft.rates.length} rate plan${
              ctx.ratePlans.length - draft.rates.length === 1 ? "" : "s"
            } not mapped.`
          : null,
      ),
    );
  }
  if (mealsSupported) {
    const incomplete = ctx.mealPlans.length > 0 && draft.meals.length < ctx.mealPlans.length;
    checks.push(
      check(
        "meals_complete",
        "Meal plans mapped",
        !incomplete,
        incomplete,
        incomplete
          ? `${ctx.mealPlans.length - draft.meals.length} meal plan${
              ctx.mealPlans.length - draft.meals.length === 1 ? "" : "s"
            } not mapped.`
          : null,
      ),
    );
  }

  return checks;
}

export function draftHasBlockingErrors(checks: readonly ValidationCheck[]): boolean {
  return checks.some((row) => !row.passed && !row.warning);
}

export function draftHasIncompleteMappings(checks: readonly ValidationCheck[]): boolean {
  return checks.some((row) => row.warning && !row.passed);
}

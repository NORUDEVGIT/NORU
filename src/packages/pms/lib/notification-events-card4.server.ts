/**
 * Card 4 Notifications & Communication — Notification Events.
 *
 * Property-scoped event configuration. Delivery and SET5 catalogues remain
 * outside this module.
 */

import {
  COMMUNICATION_CHANNEL_TYPES,
  type CommunicationChannelType,
} from "./communication-channels-card4.server.ts";
import {
  COMMUNICATION_TEMPLATE_CATEGORIES,
  type CommunicationTemplateCategory,
} from "./communication-templates-card4.server.ts";

export const NOTIFICATION_EVENT_MODULES = [
  "reservations",
  "front_office",
  "guest_services",
  "housekeeping",
  "payments",
  "feedback",
] as const;
export type NotificationEventModule = (typeof NOTIFICATION_EVENT_MODULES)[number];

export const NOTIFICATION_EVENT_MODULE_LABELS: Record<NotificationEventModule, string> = {
  reservations: "Reservations",
  front_office: "Front Office",
  guest_services: "Guest Services",
  housekeeping: "Housekeeping",
  payments: "Payments",
  feedback: "Feedback",
};

export const SYSTEM_NOTIFICATION_EVENTS = [
  {
    name: "Reservation Confirmed",
    code: "reservation_confirmed",
    module: "reservations",
    category: "reservation",
  },
  {
    name: "Reservation Modified",
    code: "reservation_modified",
    module: "reservations",
    category: "reservation",
  },
  {
    name: "Reservation Cancelled",
    code: "reservation_cancelled",
    module: "reservations",
    category: "reservation",
  },
  {
    name: "Pre-Arrival Reminder",
    code: "pre_arrival",
    module: "front_office",
    category: "pre_arrival",
  },
  { name: "VIP Arrival", code: "vip_arrival", module: "front_office", category: "stay" },
  { name: "Room Ready", code: "room_ready", module: "housekeeping", category: "stay" },
  {
    name: "Room Not Ready",
    code: "room_not_ready",
    module: "housekeeping",
    category: "stay",
  },
  {
    name: "Guest Request Created",
    code: "guest_request_created",
    module: "guest_services",
    category: "stay",
  },
  {
    name: "Service Overdue",
    code: "service_overdue",
    module: "guest_services",
    category: "stay",
  },
  { name: "Payment Received", code: "payment_received", module: "payments", category: "stay" },
  {
    name: "Checkout Completed",
    code: "checkout_completed",
    module: "front_office",
    category: "departure",
  },
  {
    name: "Guest Feedback Received",
    code: "guest_feedback_received",
    module: "feedback",
    category: "departure",
  },
] as const satisfies ReadonlyArray<{
  name: string;
  code: string;
  module: NotificationEventModule;
  category: CommunicationTemplateCategory;
}>;

export const NOTIFICATION_EVENT_CODE_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;

export type NotificationEventRecord = {
  id: string;
  name: string;
  code: string;
  module: NotificationEventModule;
  category: CommunicationTemplateCategory;
  description: string;
  defaultChannelType: CommunicationChannelType;
  defaultTemplateId: string | null;
  active: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NotificationEventDraft = {
  id: string | null;
  name: string;
  code: string;
  module: NotificationEventModule;
  category: CommunicationTemplateCategory;
  description: string;
  defaultChannelType: CommunicationChannelType;
  defaultTemplateId: string | null;
  active: boolean;
  isSystem: boolean;
};

export type NotificationEventsSnapshot = {
  events: NotificationEventRecord[];
  lastUpdatedAt: string | null;
};

export type NotificationEventError = { field: string; message: string };

export type NotificationEventTemplateCompatibility = {
  id: string;
  category: CommunicationTemplateCategory;
  eventTrigger: string;
  channelType: CommunicationChannelType;
  active: boolean;
};

export function emptyNotificationEventDraft(): NotificationEventDraft {
  return {
    id: null,
    name: "",
    code: "",
    module: "reservations",
    category: "reservation",
    description: "",
    defaultChannelType: "email",
    defaultTemplateId: null,
    active: false,
    isSystem: false,
  };
}

export function notificationEventToDraft(row: NotificationEventRecord): NotificationEventDraft {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    module: row.module,
    category: row.category,
    description: row.description,
    defaultChannelType: row.defaultChannelType,
    defaultTemplateId: row.defaultTemplateId,
    active: row.active,
    isSystem: row.isSystem,
  };
}

export function generateNotificationEventCode(name: string): string {
  const generated = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
    .replace(/_+$/g, "");
  return /^[a-z]/.test(generated) ? generated : generated ? `event_${generated}`.slice(0, 40) : "";
}

export function normalizeNotificationEventDraft(
  draft: NotificationEventDraft,
): NotificationEventDraft {
  const name = draft.name.trim();
  return {
    ...draft,
    name,
    code: (draft.code.trim() || generateNotificationEventCode(name)).toLowerCase(),
    description: draft.description.trim(),
    defaultTemplateId: draft.defaultTemplateId || null,
  };
}

export function validateNotificationEventTemplate(
  draft: Pick<
    NotificationEventDraft,
    "code" | "category" | "defaultChannelType" | "defaultTemplateId" | "active"
  >,
  template: NotificationEventTemplateCompatibility | null,
): NotificationEventError[] {
  if (!draft.defaultTemplateId) {
    return draft.active
      ? [{ field: "defaultTemplateId", message: "Choose a template before activating this event." }]
      : [];
  }
  if (!template || template.id !== draft.defaultTemplateId) {
    return [{ field: "defaultTemplateId", message: "Choose a template from this property." }];
  }
  if (!template.active) {
    return [{ field: "defaultTemplateId", message: "The selected template must be active." }];
  }
  if (template.channelType !== draft.defaultChannelType) {
    return [{ field: "defaultTemplateId", message: "The template channel must match the event." }];
  }
  if (template.category !== draft.category) {
    return [{ field: "defaultTemplateId", message: "The template category must match the event." }];
  }
  if (template.eventTrigger !== draft.code) {
    return [{ field: "defaultTemplateId", message: "The template trigger must match the event code." }];
  }
  return [];
}

export function validateNotificationEventDraft(
  input: NotificationEventDraft,
  existing: readonly NotificationEventRecord[],
  original: NotificationEventRecord | null = null,
  template: NotificationEventTemplateCompatibility | null = null,
): NotificationEventError[] {
  const draft = normalizeNotificationEventDraft(input);
  const errors: NotificationEventError[] = [];
  if (!draft.name) errors.push({ field: "name", message: "Event name is required." });
  else if (draft.name.length > 80) {
    errors.push({ field: "name", message: "Event name must be 80 characters or fewer." });
  } else if (
    existing.some(
      (row) => row.id !== draft.id && row.name.trim().toLowerCase() === draft.name.toLowerCase(),
    )
  ) {
    errors.push({ field: "name", message: "This event name is already in use." });
  }
  if (!draft.code) errors.push({ field: "code", message: "Event code is required." });
  else if (!NOTIFICATION_EVENT_CODE_PATTERN.test(draft.code)) {
    errors.push({
      field: "code",
      message: "Use lowercase snake case with 1–40 letters, numbers, or underscores.",
    });
  } else if (existing.some((row) => row.id !== draft.id && row.code === draft.code)) {
    errors.push({ field: "code", message: "This event code is already in use." });
  }
  if (!NOTIFICATION_EVENT_MODULES.includes(draft.module)) {
    errors.push({ field: "module", message: "Choose a supported module." });
  }
  if (!COMMUNICATION_TEMPLATE_CATEGORIES.includes(draft.category)) {
    errors.push({ field: "category", message: "Choose an event category." });
  }
  if (draft.description.length > 500) {
    errors.push({ field: "description", message: "Description must be 500 characters or fewer." });
  }
  if (!COMMUNICATION_CHANNEL_TYPES.includes(draft.defaultChannelType)) {
    errors.push({ field: "defaultChannelType", message: "Choose a communication channel." });
  }
  if (
    original?.isSystem &&
    (draft.code !== original.code ||
      draft.module !== original.module ||
      draft.category !== original.category ||
      !draft.isSystem)
  ) {
    errors.push({
      field: "code",
      message: "System event code, module, and category cannot be changed.",
    });
  }
  errors.push(...validateNotificationEventTemplate(draft, template));
  return errors;
}

export function notificationEventsConfigured(
  events: readonly NotificationEventRecord[],
): boolean {
  return events.some((row) => row.active && row.defaultTemplateId !== null);
}

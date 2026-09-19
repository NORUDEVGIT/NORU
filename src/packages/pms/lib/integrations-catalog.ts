/**
 * Card 6 Phase 1 — the integration catalog.
 *
 * Single source of truth for every category, provider and field the setup
 * drawer renders. Adding a provider is a data change here; it never needs a
 * new component. Fields flagged `secret` are collected in the drawer, used for
 * the session only, and excluded from everything that is persisted.
 */

import { SECRET_KEY_PATTERN } from "./integrations-card6.server.ts";

export const INTEGRATION_CATEGORIES = [
  "payments",
  "sms",
  "email",
  "whatsapp",
  "accounting",
  "hospitality",
  "government",
  "distribution",
  "other",
] as const;
export type IntegrationCategory = (typeof INTEGRATION_CATEGORIES)[number];

export const INTEGRATION_AUTH_METHODS = [
  "api_key",
  "oauth2",
  "basic",
  "bearer_token",
  "certificate",
  "none",
] as const;
export type IntegrationAuthMethod = (typeof INTEGRATION_AUTH_METHODS)[number];

export const INTEGRATION_FIELD_SECTIONS = [
  "connection",
  "credentials",
  "technical",
  "security",
] as const;
export type IntegrationFieldSection = (typeof INTEGRATION_FIELD_SECTIONS)[number];

export type IntegrationFieldType = "text" | "textarea" | "select" | "toggle" | "number" | "secret";

export type IntegrationFieldFormat = "url" | "email" | "host" | "port" | "slug";

export type IntegrationFieldOption = { value: string; label: string };

export type IntegrationField = {
  id: string;
  label: string;
  type: IntegrationFieldType;
  section: IntegrationFieldSection;
  required?: boolean;
  secret?: boolean;
  placeholder?: string;
  help?: string;
  options?: readonly IntegrationFieldOption[];
  format?: IntegrationFieldFormat;
  maxLength?: number;
  min?: number;
  max?: number;
  /** Render only when one of these auth methods is selected. */
  authMethods?: readonly IntegrationAuthMethod[];
  /** Render only when another field in the same provider holds this value. */
  dependsOn?: { field: string; equals: string | boolean };
};

export type IntegrationProviderDef = {
  id: string;
  label: string;
  blurb: string;
  authMethods: readonly IntegrationAuthMethod[];
  supportsWebhook: boolean;
  fields: readonly IntegrationField[];
};

export type IntegrationCategoryDef = {
  id: IntegrationCategory;
  label: string;
  description: string;
  events: readonly IntegrationFieldOption[];
  providers: readonly IntegrationProviderDef[];
};

export const INTEGRATION_AUTH_METHOD_LABELS: Record<IntegrationAuthMethod, string> = {
  api_key: "API key",
  oauth2: "OAuth 2.0",
  basic: "Basic auth",
  bearer_token: "Bearer token",
  certificate: "Certificate",
  none: "No authentication",
};

export const INTEGRATION_SECTION_LABELS: Record<IntegrationFieldSection, string> = {
  connection: "Connection",
  credentials: "Credentials",
  technical: "Technical settings",
  security: "Security",
};

type FieldOptions = Omit<IntegrationField, "id" | "label" | "type" | "section">;

function field(
  type: IntegrationFieldType,
  section: IntegrationFieldSection,
  id: string,
  label: string,
  options: FieldOptions = {},
): IntegrationField {
  return { id, label, type, section, ...options };
}

const text = (id: string, label: string, o: FieldOptions = {}) =>
  field("text", "connection", id, label, o);
const credential = (id: string, label: string, o: FieldOptions = {}) =>
  field("secret", "credentials", id, label, { secret: true, ...o });
const choice = (
  id: string,
  label: string,
  options: readonly IntegrationFieldOption[],
  o: FieldOptions = {},
) => field("select", "connection", id, label, { options, ...o });
const flag = (id: string, label: string, o: FieldOptions = {}) =>
  field("toggle", "technical", id, label, o);

const ETB: IntegrationFieldOption = { value: "ETB", label: "ETB — Ethiopian Birr" };

const CURRENCIES: readonly IntegrationFieldOption[] = [
  ETB,
  { value: "USD", label: "USD — US Dollar" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "GBP", label: "GBP — Pound Sterling" },
];

/** Providers that settle domestically cannot offer a currency choice. */
const ETB_ONLY: readonly IntegrationFieldOption[] = [ETB];

const CAPTURE_MODES: readonly IntegrationFieldOption[] = [
  { value: "automatic", label: "Capture automatically" },
  { value: "manual", label: "Authorize now, capture at check-out" },
];

/** Inbound-callback hardening offered wherever a provider can call NORU. */
const WEBHOOK_SECURITY: readonly IntegrationField[] = [
  field("toggle", "security", "verifySignatures", "Verify webhook signatures", {
    help: "Reject inbound callbacks that do not carry a valid provider signature.",
  }),
  field("secret", "security", "signingSecret", "Webhook signing secret", {
    secret: true,
    required: true,
    dependsOn: { field: "verifySignatures", equals: true },
  }),
  field("text", "security", "ipAllowlist", "IP allowlist", {
    placeholder: "196.188.0.0/16, 41.216.0.0/16",
    help: "Optional. Comma-separated addresses or CIDR ranges permitted to call the webhook.",
    maxLength: 400,
  }),
];

/** Transport tuning shared by the HTTP-based providers. */
const HTTP_TECHNICAL: readonly IntegrationField[] = [
  field("number", "technical", "timeoutSeconds", "Request timeout (seconds)", {
    min: 5,
    max: 120,
    help: "How long NORU waits for a response before treating the call as failed.",
  }),
  field("number", "technical", "retryCount", "Retry attempts", { min: 0, max: 5 }),
  field("textarea", "technical", "customHeaders", "Additional request headers", {
    placeholder: "X-Property-Code: NORU-001",
    help: "Optional. One header per line. Do not put credentials here.",
    maxLength: 800,
  }),
];

const PAYMENT_PROVIDERS: readonly IntegrationProviderDef[] = [
  {
    id: "stripe",
    label: "Stripe",
    blurb: "Card payments, authorizations and refunds.",
    authMethods: ["api_key"],
    supportsWebhook: true,
    fields: [
      text("publishableKey", "Publishable key", {
        required: true,
        placeholder: "pk_live_…",
        help: "Public identifier. Safe to store.",
        maxLength: 200,
      }),
      credential("secretKey", "Secret key", { required: true, placeholder: "sk_live_…" }),
      choice("currency", "Settlement currency", CURRENCIES, { required: true }),
      choice("captureMode", "Capture mode", CAPTURE_MODES, { required: true }),
      text("statementDescriptor", "Statement descriptor", {
        maxLength: 22,
        help: "Shown on the guest's card statement. Maximum 22 characters.",
      }),
      ...HTTP_TECHNICAL,
      ...WEBHOOK_SECURITY,
    ],
  },
  {
    id: "telebirr",
    label: "telebirr",
    blurb: "Ethio Telecom mobile money.",
    authMethods: ["api_key"],
    supportsWebhook: true,
    fields: [
      text("merchantId", "Merchant ID", { required: true, maxLength: 60 }),
      text("shortCode", "Short code", { required: true, maxLength: 20 }),
      credential("appKey", "App key", { required: true }),
      credential("publicKey", "Merchant public key", {
        help: "Paste the PEM block issued by Ethio Telecom.",
      }),
      choice("currency", "Settlement currency", ETB_ONLY, { required: true }),
      ...HTTP_TECHNICAL,
      ...WEBHOOK_SECURITY,
    ],
  },
  {
    id: "chapa",
    label: "Chapa",
    blurb: "Ethiopian card and wallet aggregation.",
    authMethods: ["api_key"],
    supportsWebhook: true,
    fields: [
      text("publicKey", "Public key", { required: true, placeholder: "CHAPUBK-…", maxLength: 200 }),
      credential("secretKey", "Secret key", { required: true, placeholder: "CHASECK-…" }),
      choice("currency", "Settlement currency", CURRENCIES, { required: true }),
      ...HTTP_TECHNICAL,
      ...WEBHOOK_SECURITY,
    ],
  },
  {
    id: "cbe_birr",
    label: "CBE Birr",
    blurb: "Commercial Bank of Ethiopia wallet.",
    authMethods: ["basic"],
    supportsWebhook: false,
    fields: [
      text("merchantCode", "Merchant code", { required: true, maxLength: 40 }),
      text("endpointUrl", "Endpoint URL", {
        required: true,
        format: "url",
        placeholder: "https://…",
      }),
      text("apiUsername", "API username", { required: true, maxLength: 80 }),
      credential("apiPassword", "API password", { required: true }),
      choice("currency", "Settlement currency", ETB_ONLY, { required: true }),
      ...HTTP_TECHNICAL,
    ],
  },
  {
    id: "generic_gateway",
    label: "Generic payment gateway",
    blurb: "Any gateway exposing a REST API.",
    authMethods: ["api_key", "basic", "bearer_token", "none"],
    supportsWebhook: true,
    fields: [
      text("baseUrl", "Base URL", { required: true, format: "url", placeholder: "https://…" }),
      credential("apiKey", "API key", { required: true, authMethods: ["api_key"] }),
      text("username", "Username", { required: true, authMethods: ["basic"], maxLength: 80 }),
      credential("password", "Password", { required: true, authMethods: ["basic"] }),
      credential("bearerToken", "Bearer token", { required: true, authMethods: ["bearer_token"] }),
      choice("currency", "Settlement currency", CURRENCIES, { required: true }),
      choice("captureMode", "Capture mode", CAPTURE_MODES, { required: true }),
      ...HTTP_TECHNICAL,
      ...WEBHOOK_SECURITY,
    ],
  },
];

const SMS_PROVIDERS: readonly IntegrationProviderDef[] = [
  {
    id: "twilio",
    label: "Twilio",
    blurb: "Global SMS delivery.",
    authMethods: ["basic"],
    supportsWebhook: true,
    fields: [
      text("accountSid", "Account SID", { required: true, placeholder: "AC…", maxLength: 80 }),
      credential("authToken", "Auth token", { required: true }),
      text("senderId", "Sender ID or number", { required: true, maxLength: 20 }),
      flag("deliveryReports", "Request delivery reports"),
      ...HTTP_TECHNICAL,
      ...WEBHOOK_SECURITY,
    ],
  },
  {
    id: "africas_talking",
    label: "Africa's Talking",
    blurb: "Pan-African SMS and USSD.",
    authMethods: ["api_key"],
    supportsWebhook: true,
    fields: [
      text("username", "Username", { required: true, maxLength: 80 }),
      credential("apiKey", "API key", { required: true }),
      text("senderId", "Sender ID", { required: true, maxLength: 20 }),
      flag("deliveryReports", "Request delivery reports"),
      ...HTTP_TECHNICAL,
      ...WEBHOOK_SECURITY,
    ],
  },
  {
    id: "ethio_telecom_sms",
    label: "Ethio Telecom SMS",
    blurb: "Domestic bulk SMS.",
    authMethods: ["basic"],
    supportsWebhook: false,
    fields: [
      text("endpointUrl", "Endpoint URL", { required: true, format: "url" }),
      text("username", "Username", { required: true, maxLength: 80 }),
      credential("password", "Password", { required: true }),
      text("senderId", "Sender ID", { required: true, maxLength: 20 }),
      flag("deliveryReports", "Request delivery reports"),
      ...HTTP_TECHNICAL,
    ],
  },
  {
    id: "generic_sms",
    label: "Generic SMS gateway",
    blurb: "Any gateway exposing an HTTP send endpoint.",
    authMethods: ["api_key", "basic", "bearer_token", "none"],
    supportsWebhook: false,
    fields: [
      text("endpointUrl", "Endpoint URL", { required: true, format: "url" }),
      credential("apiKey", "API key", { required: true, authMethods: ["api_key"] }),
      text("username", "Username", { required: true, authMethods: ["basic"], maxLength: 80 }),
      credential("password", "Password", { required: true, authMethods: ["basic"] }),
      credential("bearerToken", "Bearer token", { required: true, authMethods: ["bearer_token"] }),
      text("senderId", "Sender ID", { required: true, maxLength: 20 }),
      ...HTTP_TECHNICAL,
    ],
  },
];

const EMAIL_PROVIDERS: readonly IntegrationProviderDef[] = [
  {
    id: "smtp",
    label: "SMTP server",
    blurb: "Send through your own mail server.",
    authMethods: ["basic", "none"],
    supportsWebhook: false,
    fields: [
      text("host", "SMTP host", {
        required: true,
        format: "host",
        placeholder: "smtp.example.com",
      }),
      field("number", "connection", "port", "SMTP port", { required: true, min: 1, max: 65535 }),
      text("username", "Username", { required: true, authMethods: ["basic"], maxLength: 120 }),
      credential("password", "Password", { required: true, authMethods: ["basic"] }),
      text("fromName", "From name", { required: true, maxLength: 80 }),
      text("fromEmail", "From address", { required: true, format: "email" }),
      text("replyToEmail", "Reply-to address", { format: "email" }),
      flag("useTls", "Use TLS"),
      ...HTTP_TECHNICAL,
    ],
  },
  {
    id: "sendgrid",
    label: "SendGrid",
    blurb: "Transactional email API.",
    authMethods: ["api_key"],
    supportsWebhook: true,
    fields: [
      credential("apiKey", "API key", { required: true, placeholder: "SG.…" }),
      text("fromName", "From name", { required: true, maxLength: 80 }),
      text("fromEmail", "From address", { required: true, format: "email" }),
      text("replyToEmail", "Reply-to address", { format: "email" }),
      ...HTTP_TECHNICAL,
      ...WEBHOOK_SECURITY,
    ],
  },
  {
    id: "mailgun",
    label: "Mailgun",
    blurb: "Transactional email API.",
    authMethods: ["api_key"],
    supportsWebhook: true,
    fields: [
      text("domain", "Sending domain", {
        required: true,
        format: "host",
        placeholder: "mg.example.com",
      }),
      credential("apiKey", "API key", { required: true }),
      choice(
        "region",
        "Region",
        [
          { value: "us", label: "United States" },
          { value: "eu", label: "European Union" },
        ],
        { required: true },
      ),
      text("fromName", "From name", { required: true, maxLength: 80 }),
      text("fromEmail", "From address", { required: true, format: "email" }),
      ...HTTP_TECHNICAL,
      ...WEBHOOK_SECURITY,
    ],
  },
  {
    id: "amazon_ses",
    label: "Amazon SES",
    blurb: "AWS Simple Email Service.",
    authMethods: ["api_key"],
    supportsWebhook: true,
    fields: [
      text("region", "AWS region", { required: true, placeholder: "eu-west-1", maxLength: 30 }),
      text("accessKeyId", "Access key ID", { required: true, maxLength: 60 }),
      credential("secretAccessKey", "Secret access key", { required: true }),
      text("fromName", "From name", { required: true, maxLength: 80 }),
      text("fromEmail", "From address", { required: true, format: "email" }),
      ...HTTP_TECHNICAL,
      ...WEBHOOK_SECURITY,
    ],
  },
];

const WHATSAPP_PROVIDERS: readonly IntegrationProviderDef[] = [
  {
    id: "dialog_360",
    label: "360Dialog",
    blurb: "WhatsApp Business messaging through 360Dialog.",
    authMethods: ["api_key"],
    supportsWebhook: true,
    fields: [
      text("endpointUrl", "API base URL", {
        required: true,
        format: "url",
        placeholder: "https://waba-v2.360dialog.io",
      }),
      credential("apiKey", "API key", { required: true }),
      text("phoneNumber", "WhatsApp number", { required: true, maxLength: 30 }),
      ...HTTP_TECHNICAL,
      ...WEBHOOK_SECURITY,
    ],
  },
];

const ACCOUNTING_PROVIDERS: readonly IntegrationProviderDef[] = [
  {
    id: "quickbooks",
    label: "QuickBooks Online",
    blurb: "Cloud accounting ledger.",
    authMethods: ["oauth2"],
    supportsWebhook: true,
    fields: [
      text("companyId", "Company (realm) ID", { required: true, maxLength: 60 }),
      text("clientId", "Client ID", { required: true, maxLength: 120 }),
      credential("clientSecret", "Client secret", { required: true }),
      text("redirectUri", "Redirect URI", { required: true, format: "url" }),
      choice(
        "postingMode",
        "Posting mode",
        [
          { value: "summary", label: "Daily summary journal" },
          { value: "transaction", label: "Per transaction" },
        ],
        { required: true },
      ),
      ...HTTP_TECHNICAL,
      ...WEBHOOK_SECURITY,
    ],
  },
  {
    id: "xero",
    label: "Xero",
    blurb: "Cloud accounting ledger.",
    authMethods: ["oauth2"],
    supportsWebhook: true,
    fields: [
      text("tenantId", "Tenant ID", { required: true, maxLength: 60 }),
      text("clientId", "Client ID", { required: true, maxLength: 120 }),
      credential("clientSecret", "Client secret", { required: true }),
      text("redirectUri", "Redirect URI", { required: true, format: "url" }),
      choice(
        "postingMode",
        "Posting mode",
        [
          { value: "summary", label: "Daily summary journal" },
          { value: "transaction", label: "Per transaction" },
        ],
        { required: true },
      ),
      ...HTTP_TECHNICAL,
      ...WEBHOOK_SECURITY,
    ],
  },
  {
    id: "odoo",
    label: "Odoo",
    blurb: "Self-hosted or Odoo Online ERP.",
    authMethods: ["api_key", "basic"],
    supportsWebhook: false,
    fields: [
      text("baseUrl", "Server URL", { required: true, format: "url" }),
      text("database", "Database name", { required: true, maxLength: 80 }),
      text("username", "Username", { required: true, maxLength: 80 }),
      credential("apiKey", "API key", { required: true, authMethods: ["api_key"] }),
      credential("password", "Password", { required: true, authMethods: ["basic"] }),
      text("journalCode", "Sales journal code", { maxLength: 20 }),
      ...HTTP_TECHNICAL,
    ],
  },
  {
    id: "peachtree_sage",
    label: "Peachtree / Sage",
    blurb: "File or endpoint based export.",
    authMethods: ["api_key", "none"],
    supportsWebhook: false,
    fields: [
      text("endpointUrl", "Export endpoint", { required: true, format: "url" }),
      credential("apiKey", "API key", { required: true, authMethods: ["api_key"] }),
      text("companyCode", "Company code", { required: true, maxLength: 40 }),
      choice(
        "exportFormat",
        "Export format",
        [
          { value: "csv", label: "CSV" },
          { value: "xml", label: "XML" },
        ],
        { required: true },
      ),
      ...HTTP_TECHNICAL,
    ],
  },
  {
    id: "generic_accounting",
    label: "Generic accounting API",
    blurb: "Any ledger exposing a REST API.",
    authMethods: ["api_key", "basic", "bearer_token", "none"],
    supportsWebhook: true,
    fields: [
      text("baseUrl", "Base URL", { required: true, format: "url" }),
      credential("apiKey", "API key", { required: true, authMethods: ["api_key"] }),
      text("username", "Username", { required: true, authMethods: ["basic"], maxLength: 80 }),
      credential("password", "Password", { required: true, authMethods: ["basic"] }),
      credential("bearerToken", "Bearer token", { required: true, authMethods: ["bearer_token"] }),
      text("accountCode", "Default account code", { maxLength: 40 }),
      ...HTTP_TECHNICAL,
      ...WEBHOOK_SECURITY,
    ],
  },
];

const HOSPITALITY_PROVIDERS: readonly IntegrationProviderDef[] = [
  {
    id: "noru_pos",
    label: "NORU POS",
    blurb: "Charge-to-room from a NORU outlet. Already live in the product.",
    authMethods: ["none"],
    supportsWebhook: false,
    fields: [
      choice(
        "outletScope",
        "Outlet scope",
        [
          { value: "all", label: "All outlets" },
          { value: "selected", label: "Selected outlets only" },
        ],
        { required: true },
      ),
      text("outletCodes", "Outlet codes", {
        dependsOn: { field: "outletScope", equals: "selected" },
        required: true,
        placeholder: "BAR, REST, SPA",
        maxLength: 200,
      }),
      flag("chargeToRoom", "Allow charge to room"),
    ],
  },
  {
    id: "generic_pos",
    label: "Generic POS",
    blurb: "Third-party point of sale posting to guest folios.",
    authMethods: ["api_key", "bearer_token", "none"],
    supportsWebhook: true,
    fields: [
      text("endpointUrl", "Endpoint URL", { required: true, format: "url" }),
      credential("apiKey", "API key", { required: true, authMethods: ["api_key"] }),
      credential("bearerToken", "Bearer token", { required: true, authMethods: ["bearer_token"] }),
      choice(
        "outletMappingMode",
        "Outlet mapping",
        [
          { value: "automatic", label: "Match on outlet code" },
          { value: "manual", label: "Post everything to one department" },
        ],
        { required: true },
      ),
      text("defaultDepartmentCode", "Default department code", {
        dependsOn: { field: "outletMappingMode", equals: "manual" },
        required: true,
        maxLength: 40,
      }),
      flag("chargeToRoom", "Allow charge to room"),
      ...HTTP_TECHNICAL,
      ...WEBHOOK_SECURITY,
    ],
  },
  {
    id: "door_lock",
    label: "Door lock system",
    blurb: "Electronic key encoding at check-in.",
    authMethods: ["api_key", "certificate"],
    supportsWebhook: false,
    fields: [
      text("endpointUrl", "Controller URL", { required: true, format: "url" }),
      credential("apiKey", "API key", { required: true, authMethods: ["api_key"] }),
      credential("clientCertificate", "Client certificate", {
        required: true,
        authMethods: ["certificate"],
        help: "Paste the PEM block. Used for this session only.",
      }),
      text("encoderId", "Encoder ID", { required: true, maxLength: 40 }),
      flag("issueKeyOnCheckIn", "Issue a key automatically at check-in"),
      ...HTTP_TECHNICAL,
    ],
  },
  {
    id: "pabx",
    label: "Telephone / PABX",
    blurb: "Call accounting posted to the guest folio.",
    authMethods: ["basic", "none"],
    supportsWebhook: false,
    fields: [
      text("host", "PABX host", { required: true, format: "host" }),
      field("number", "connection", "port", "Port", { required: true, min: 1, max: 65535 }),
      text("username", "Username", { required: true, authMethods: ["basic"], maxLength: 80 }),
      credential("password", "Password", { required: true, authMethods: ["basic"] }),
      text("departmentCode", "Posting department code", { required: true, maxLength: 40 }),
      ...HTTP_TECHNICAL,
    ],
  },
];

const GOVERNMENT_PROVIDERS: readonly IntegrationProviderDef[] = [
  {
    id: "erca_fiscal_device",
    label: "ERCA fiscal device",
    blurb: "Fiscal receipt issuance on certified hardware.",
    authMethods: ["certificate", "api_key"],
    supportsWebhook: false,
    fields: [
      text("tin", "TIN", {
        required: true,
        maxLength: 20,
        help: "Taxpayer identification number.",
      }),
      text("deviceId", "Fiscal device ID", { required: true, maxLength: 40 }),
      text("endpointUrl", "Device endpoint", { required: true, format: "url" }),
      credential("deviceCertificate", "Device certificate", {
        required: true,
        authMethods: ["certificate"],
        help: "Paste the PEM block. Used for this session only.",
      }),
      credential("apiKey", "API key", { required: true, authMethods: ["api_key"] }),
      flag("testMode", "Test mode", {
        help: "Issue non-fiscal test receipts instead of live fiscal receipts.",
      }),
      ...HTTP_TECHNICAL,
    ],
  },
  {
    id: "tax_reporting_endpoint",
    label: "Tax reporting endpoint",
    blurb: "Scheduled submission of tax summaries.",
    authMethods: ["api_key", "bearer_token", "basic"],
    supportsWebhook: false,
    fields: [
      text("tin", "TIN", { required: true, maxLength: 20 }),
      text("endpointUrl", "Submission endpoint", { required: true, format: "url" }),
      credential("apiKey", "API key", { required: true, authMethods: ["api_key"] }),
      credential("bearerToken", "Bearer token", { required: true, authMethods: ["bearer_token"] }),
      text("username", "Username", { required: true, authMethods: ["basic"], maxLength: 80 }),
      credential("password", "Password", { required: true, authMethods: ["basic"] }),
      choice(
        "submissionFrequency",
        "Submission frequency",
        [
          { value: "daily", label: "Daily" },
          { value: "weekly", label: "Weekly" },
          { value: "monthly", label: "Monthly" },
        ],
        { required: true },
      ),
      flag("testMode", "Test mode"),
      ...HTTP_TECHNICAL,
    ],
  },
];

const DISTRIBUTION_INTEGRATION_PROVIDERS: readonly IntegrationProviderDef[] = [
  {
    id: "aiosell",
    label: "Aiosell",
    blurb:
      "Channel manager. Credentials stay on this integration; Card 6 Distribution maps the channels.",
    authMethods: ["api_key", "bearer_token"],
    supportsWebhook: true,
    fields: [
      text("endpointUrl", "API base URL", { required: true, format: "url" }),
      credential("apiKey", "API key", { required: true, authMethods: ["api_key"] }),
      credential("bearerToken", "Bearer token", { required: true, authMethods: ["bearer_token"] }),
      text("hotelCode", "Hotel code", { required: true, maxLength: 40 }),
      ...HTTP_TECHNICAL,
      ...WEBHOOK_SECURITY,
    ],
  },
  {
    id: "generic_channel_manager",
    label: "Generic channel manager",
    blurb: "Any channel manager that exposes OTAs through one connection.",
    authMethods: ["api_key", "oauth2", "bearer_token"],
    supportsWebhook: true,
    fields: [
      text("endpointUrl", "API base URL", { required: true, format: "url" }),
      credential("apiKey", "API key", { required: true, authMethods: ["api_key"] }),
      text("clientId", "Client ID", { required: true, authMethods: ["oauth2"], maxLength: 80 }),
      credential("clientSecret", "Client secret", { required: true, authMethods: ["oauth2"] }),
      credential("bearerToken", "Bearer token", { required: true, authMethods: ["bearer_token"] }),
      text("propertyCode", "Property code", { required: true, maxLength: 40 }),
      ...HTTP_TECHNICAL,
      ...WEBHOOK_SECURITY,
    ],
  },
  {
    id: "generic_ota",
    label: "Generic OTA connectivity",
    blurb: "A single OTA connected without a channel manager in between.",
    authMethods: ["api_key", "oauth2"],
    supportsWebhook: true,
    fields: [
      text("endpointUrl", "API base URL", { required: true, format: "url" }),
      credential("apiKey", "API key", { required: true, authMethods: ["api_key"] }),
      text("clientId", "Client ID", { required: true, authMethods: ["oauth2"], maxLength: 80 }),
      credential("clientSecret", "Client secret", { required: true, authMethods: ["oauth2"] }),
      text("hotelId", "Hotel ID at the OTA", { required: true, maxLength: 40 }),
      ...HTTP_TECHNICAL,
      ...WEBHOOK_SECURITY,
    ],
  },
];

const OTHER_PROVIDERS: readonly IntegrationProviderDef[] = [
  {
    id: "webhook_endpoint",
    label: "Webhook endpoint",
    blurb: "Push NORU events to a URL you control.",
    authMethods: ["bearer_token", "none"],
    supportsWebhook: false,
    fields: [
      text("targetUrl", "Target URL", { required: true, format: "url" }),
      credential("bearerToken", "Bearer token", { required: true, authMethods: ["bearer_token"] }),
      choice(
        "payloadFormat",
        "Payload format",
        [
          { value: "json", label: "JSON" },
          { value: "form", label: "Form encoded" },
        ],
        { required: true },
      ),
      ...HTTP_TECHNICAL,
      field("secret", "security", "signingSecret", "Outbound signing secret", {
        secret: true,
        help: "Optional. Used to sign the payloads NORU sends.",
      }),
    ],
  },
  {
    id: "custom_rest_api",
    label: "Custom REST API",
    blurb: "Any internal or partner service.",
    authMethods: ["api_key", "basic", "bearer_token", "none"],
    supportsWebhook: true,
    fields: [
      text("baseUrl", "Base URL", { required: true, format: "url" }),
      credential("apiKey", "API key", { required: true, authMethods: ["api_key"] }),
      text("username", "Username", { required: true, authMethods: ["basic"], maxLength: 80 }),
      credential("password", "Password", { required: true, authMethods: ["basic"] }),
      credential("bearerToken", "Bearer token", { required: true, authMethods: ["bearer_token"] }),
      ...HTTP_TECHNICAL,
      ...WEBHOOK_SECURITY,
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    blurb: "Forward operational events to an analytics workspace.",
    authMethods: ["api_key", "none"],
    supportsWebhook: false,
    fields: [
      text("workspaceId", "Workspace ID", { required: true, maxLength: 80 }),
      text("ingestUrl", "Ingest URL", { required: true, format: "url" }),
      credential("apiKey", "Write key", { required: true, authMethods: ["api_key"] }),
      flag("anonymizeGuests", "Anonymize guest identifiers", {
        help: "Strip names and contact details before forwarding.",
      }),
      ...HTTP_TECHNICAL,
    ],
  },
];

export const INTEGRATION_CATALOG: readonly IntegrationCategoryDef[] = [
  {
    id: "payments",
    label: "Payments",
    description: "Card, wallet and gateway processing for folios and deposits.",
    events: [
      { value: "payment.succeeded", label: "Payment succeeded" },
      { value: "payment.failed", label: "Payment failed" },
      { value: "refund.created", label: "Refund created" },
      { value: "payout.settled", label: "Payout settled" },
      { value: "chargeback.opened", label: "Chargeback opened" },
    ],
    providers: PAYMENT_PROVIDERS,
  },
  {
    id: "sms",
    label: "Communication — SMS",
    description: "Guest and staff text messaging.",
    events: [
      { value: "message.sent", label: "Message sent" },
      { value: "message.delivered", label: "Message delivered" },
      { value: "message.failed", label: "Message failed" },
    ],
    providers: SMS_PROVIDERS,
  },
  {
    id: "email",
    label: "Communication — Email",
    description: "Confirmations, folios and operational mail.",
    events: [
      { value: "email.sent", label: "Email sent" },
      { value: "email.delivered", label: "Email delivered" },
      { value: "email.bounced", label: "Email bounced" },
      { value: "email.complained", label: "Spam complaint" },
    ],
    providers: EMAIL_PROVIDERS,
  },
  {
    id: "whatsapp",
    label: "Communication — WhatsApp",
    description: "Guest messaging through WhatsApp Business.",
    events: [
      { value: "message.sent", label: "Message sent" },
      { value: "message.delivered", label: "Message delivered" },
      { value: "message.failed", label: "Message failed" },
    ],
    providers: WHATSAPP_PROVIDERS,
  },
  {
    id: "accounting",
    label: "Accounting / ERP",
    description: "Post revenue, payments and journals to your ledger.",
    events: [
      { value: "invoice.posted", label: "Invoice posted" },
      { value: "payment.posted", label: "Payment posted" },
      { value: "journal.synced", label: "Journal synced" },
      { value: "guest_ledger.synced", label: "Guest ledger synced" },
    ],
    providers: ACCOUNTING_PROVIDERS,
  },
  {
    id: "hospitality",
    label: "Hospitality / POS",
    description: "Outlets, door locks and telephony that touch the guest stay.",
    events: [
      { value: "charge.posted", label: "Charge posted to folio" },
      { value: "order.created", label: "Order created" },
      { value: "shift.closed", label: "Shift closed" },
      { value: "door_key.issued", label: "Door key issued" },
    ],
    providers: HOSPITALITY_PROVIDERS,
  },
  {
    id: "government",
    label: "Government / Tax",
    description: "Fiscal devices and statutory reporting.",
    events: [
      { value: "receipt.issued", label: "Fiscal receipt issued" },
      { value: "receipt.voided", label: "Fiscal receipt voided" },
      { value: "report.z_daily", label: "Daily Z report" },
    ],
    providers: GOVERNMENT_PROVIDERS,
  },
  {
    id: "distribution",
    label: "Distribution",
    description: "Channel managers and OTA connectivity. Mapping happens on the Distribution tab.",
    events: [
      { value: "inventory.updated", label: "Inventory updated" },
      { value: "rate.updated", label: "Rate updated" },
      { value: "reservation.inbound", label: "Inbound reservation" },
      { value: "reservation.modified", label: "Reservation modified" },
      { value: "reservation.cancelled", label: "Reservation cancelled" },
    ],
    providers: DISTRIBUTION_INTEGRATION_PROVIDERS,
  },
  {
    id: "other",
    label: "Other services",
    description: "Webhooks, custom APIs and analytics.",
    events: [
      { value: "reservation.created", label: "Reservation created" },
      { value: "reservation.cancelled", label: "Reservation cancelled" },
      { value: "stay.checked_in", label: "Guest checked in" },
      { value: "stay.checked_out", label: "Guest checked out" },
    ],
    providers: OTHER_PROVIDERS,
  },
];

export function integrationCategory(category: string): IntegrationCategoryDef | null {
  return INTEGRATION_CATALOG.find((row) => row.id === category) ?? null;
}

export function integrationProvider(
  category: string,
  provider: string,
): IntegrationProviderDef | null {
  return integrationCategory(category)?.providers.find((row) => row.id === provider) ?? null;
}

export function integrationCategoryLabel(category: string): string {
  return integrationCategory(category)?.label ?? category;
}

export function integrationProviderLabel(category: string, provider: string): string {
  return integrationProvider(category, provider)?.label ?? provider;
}

export type IntegrationDraftValues = Record<string, string | number | boolean>;

/**
 * Fields the drawer should render for the current selection. Hidden fields are
 * omitted rather than styled away, so an inapplicable credential can never be
 * submitted or validated.
 */
export function visibleIntegrationFields(
  category: string,
  provider: string,
  authMethod: string,
  values: IntegrationDraftValues,
): IntegrationField[] {
  const def = integrationProvider(category, provider);
  if (!def) return [];
  return def.fields.filter((row) => {
    if (row.authMethods && !row.authMethods.includes(authMethod as IntegrationAuthMethod))
      return false;
    if (row.dependsOn && values[row.dependsOn.field] !== row.dependsOn.equals) return false;
    return true;
  });
}

export function defaultAuthMethod(category: string, provider: string): IntegrationAuthMethod {
  return integrationProvider(category, provider)?.authMethods[0] ?? "none";
}

/** Initial values so selects and toggles are never rendered uncontrolled. */
export function defaultIntegrationValues(
  category: string,
  provider: string,
): IntegrationDraftValues {
  const def = integrationProvider(category, provider);
  const values: IntegrationDraftValues = {};
  for (const row of def?.fields ?? []) {
    if (row.type === "toggle") values[row.id] = false;
    else if (row.type === "select") values[row.id] = row.options?.[0]?.value ?? "";
    else if (row.type === "number") values[row.id] = "";
    else values[row.id] = "";
  }
  if (values["timeoutSeconds"] === "") values["timeoutSeconds"] = 30;
  if (values["retryCount"] === "") values["retryCount"] = 2;
  if ("useTls" in values) values["useTls"] = true;
  return values;
}

const URL_PATTERN = /^https?:\/\/[^\s]+$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HOST_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

function formatError(field: IntegrationField, raw: string): string | null {
  if (field.format === "url" && !URL_PATTERN.test(raw))
    return "Enter a URL starting with http:// or https://.";
  if (field.format === "email" && !EMAIL_PATTERN.test(raw)) return "Enter a valid email address.";
  if (field.format === "host" && !HOST_PATTERN.test(raw)) return "Enter a valid hostname.";
  if (field.maxLength && raw.length > field.maxLength)
    return `Use at most ${field.maxLength} characters.`;
  if (field.type === "number") {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return "Enter a number.";
    if (field.min !== undefined && parsed < field.min) return `Enter ${field.min} or more.`;
    if (field.max !== undefined && parsed > field.max) return `Enter ${field.max} or less.`;
  }
  return null;
}

export type IntegrationDraft = {
  name: string;
  category: string;
  provider: string;
  environment: string;
  authMethod: string;
  description: string;
  events: string[];
  values: IntegrationDraftValues;
};

/** Inline, per-field messages. An empty object means the draft may be saved. */
export function validateIntegrationDraft(draft: IntegrationDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = draft.name.trim();
  if (name.length === 0) errors["name"] = "Give this integration a name.";
  else if (name.length > 80) errors["name"] = "Use at most 80 characters.";

  if (!integrationCategory(draft.category)) errors["category"] = "Choose an integration type.";
  if (!integrationProvider(draft.category, draft.provider))
    errors["provider"] = "Choose a provider.";
  if (draft.description.length > 400) errors["description"] = "Use at most 400 characters.";

  for (const field of visibleIntegrationFields(
    draft.category,
    draft.provider,
    draft.authMethod,
    draft.values,
  )) {
    if (field.type === "toggle") continue;
    const raw = String(draft.values[field.id] ?? "").trim();
    if (raw.length === 0) {
      if (field.required) errors[field.id] = `${field.label} is required.`;
      continue;
    }
    const message = formatError(field, raw);
    if (message) errors[field.id] = message;
  }
  return errors;
}

/**
 * The only values allowed to leave the browser. Secret fields and fields that
 * are not visible for the current selection are dropped, so a stale credential
 * from an abandoned provider choice cannot ride along.
 */
export function buildPersistedConfig(
  draft: IntegrationDraft,
): Record<string, string | number | boolean> {
  const config: Record<string, string | number | boolean> = {};
  for (const field of visibleIntegrationFields(
    draft.category,
    draft.provider,
    draft.authMethod,
    draft.values,
  )) {
    if (field.secret || SECRET_KEY_PATTERN.test(field.id)) continue;
    const value = draft.values[field.id];
    if (field.type === "toggle") {
      config[field.id] = value === true;
      continue;
    }
    const raw = String(value ?? "").trim();
    if (raw.length === 0) continue;
    config[field.id] = field.type === "number" ? Number(raw) : raw;
  }
  return config;
}

/** Field ids the server will accept for a given selection. */
export function persistableFieldIds(category: string, provider: string): string[] {
  const def = integrationProvider(category, provider);
  return (def?.fields ?? [])
    .filter((row) => !row.secret && !SECRET_KEY_PATTERN.test(row.id))
    .map((row) => row.id);
}

export function categoryEventValues(category: string): string[] {
  return (integrationCategory(category)?.events ?? []).map((row) => row.value);
}

export type SimulatedTestCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type SimulatedTestOutcome = {
  result: "passed" | "failed";
  checks: SimulatedTestCheck[];
};

/**
 * Local pre-flight for the Test Connection modal. Nothing leaves the browser:
 * this inspects the draft the operator just filled in and reports what it can
 * actually verify. A pass means "the configuration is well formed", never
 * "the provider answered".
 */
export function simulateIntegrationTest(draft: IntegrationDraft): SimulatedTestOutcome {
  const def = integrationProvider(draft.category, draft.provider);
  const visible = visibleIntegrationFields(
    draft.category,
    draft.provider,
    draft.authMethod,
    draft.values,
  );
  const filled = (field: IntegrationField) =>
    String(draft.values[field.id] ?? "").trim().length > 0;

  const requiredSecrets = visible.filter((row) => row.secret && row.required);
  const missingSecrets = requiredSecrets.filter((row) => !filled(row));
  const requiredSettings = visible.filter(
    (row) => row.required && !row.secret && row.type !== "toggle",
  );
  const missingSettings = requiredSettings.filter((row) => !filled(row));
  const endpoints = visible.filter((row) => row.format === "url" && filled(row));
  const badEndpoints = endpoints.filter(
    (row) => !URL_PATTERN.test(String(draft.values[row.id]).trim()),
  );

  const checks: SimulatedTestCheck[] = [
    {
      id: "provider",
      label: "Provider supported",
      passed: def !== null,
      detail: def ? `${def.label} is in the NORU catalog.` : "Choose a provider first.",
    },
    {
      id: "settings",
      label: "Required settings complete",
      passed: missingSettings.length === 0,
      detail:
        missingSettings.length === 0
          ? "Every required setting has a value."
          : `Missing: ${missingSettings.map((row) => row.label).join(", ")}.`,
    },
    {
      id: "credentials",
      label: "Credentials supplied for this session",
      passed: missingSecrets.length === 0,
      detail:
        requiredSecrets.length === 0
          ? "This provider needs no credentials."
          : missingSecrets.length === 0
            ? "Entered in this session. They are not saved."
            : `Re-enter: ${missingSecrets.map((row) => row.label).join(", ")}.`,
    },
    {
      id: "endpoints",
      label: "Endpoint addresses well formed",
      passed: badEndpoints.length === 0,
      detail:
        endpoints.length === 0
          ? "No endpoint address to check."
          : badEndpoints.length === 0
            ? "Addresses parse as HTTP URLs."
            : `Not a valid URL: ${badEndpoints.map((row) => row.label).join(", ")}.`,
    },
  ];

  return {
    result: checks.every((check) => check.passed) ? "passed" : "failed",
    checks,
  };
}

import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "anchor_browser";

const rawObjectSchema = s.unknownObject("The raw object returned by Anchor Browser.");
const activeFlagSchema = (description: string) =>
  s.object(description, {
    active: s.boolean("Whether this Anchor Browser feature is active."),
  });

const billingSchema = s.looseObject(
  {
    credits: s.number("Available credit balance for the authenticated project."),
    credits_used: s.number("Credits used in the current billing period."),
    included_credits: s.number("Credits included in the current tier before overage."),
    billing_period: s.string("Current billing period in YYYY-MM format."),
    tier: s.string("Billing tier for the project."),
    gifts_balance: s.nullable(s.number("Available gift or prepaid credit balance before applicable overage.")),
    max_concurrent_browsers: s.nullable(
      s.number("Maximum concurrent browser sessions allowed for the project."),
    ),
    cost_limit: s.nullable(s.number("Optional configured credit spend limit for the project.")),
  },
  { description: "Anchor Browser billing information." },
);
const sessionOutputSchema = s.object("A started Anchor Browser session.", {
  id: s.string("Unique identifier for the browser session."),
  cdp_url: s.string("The CDP websocket connection string."),
  live_view_url: s.string("The browser session live view URL."),
});
const projectMetadataSchema = s.object("Anchor Browser project metadata.", {
  name: s.string("The project name."),
  domain: s.string("The project domain."),
  logo_url: s.nullable(s.string("The project logo URL, if one is configured.")),
});
const recordingConfigSchema = activeFlagSchema("Configuration for session recording in Anchor Browser.");
const proxyConfigSchema = s.looseObject(
  {
    active: s.boolean("Whether Anchor Browser proxying is active for the session."),
  },
  { description: "Proxy configuration forwarded to Anchor Browser." },
);
const timeoutConfigSchema = s.object(
  "Timeout configuration for the Anchor Browser session.",
  {
    max_duration: s.integer("Maximum time in minutes the session can run before automatically terminating."),
    idle_timeout: s.integer("Time in minutes the session waits for new connections after all others are closed."),
  },
  { optional: ["max_duration", "idle_timeout"] },
);
const liveViewConfigSchema = s.object(
  "Live view configuration for the Anchor Browser session.",
  {
    read_only: s.boolean("Whether live view opens in read-only mode."),
    one_time_url: s.boolean("Whether Anchor Browser should generate a single-use live view URL."),
  },
  { optional: ["read_only", "one_time_url"] },
);
const sessionConfigSchema = s.object(
  "Session-related configuration sent to Anchor Browser.",
  {
    initial_url: s.url("The URL to navigate to when the browser session starts."),
    tags: s.array("Custom labels to categorize and identify browser sessions.", s.string("One session tag.")),
    recording: recordingConfigSchema,
    proxy: proxyConfigSchema,
    timeout: timeoutConfigSchema,
    live_view: liveViewConfigSchema,
  },
  { optional: ["initial_url", "tags", "recording", "proxy", "timeout", "live_view"] },
);
const browserProfileSchema = s.object(
  "Options for managing and persisting browser session profiles.",
  {
    name: s.string("The profile name to use during the browser session.", { minLength: 1 }),
    persist: s.boolean("Whether browser session profile data should be saved when the session ends."),
  },
  { optional: ["name", "persist"] },
);
const viewportConfigSchema = s.object(
  "Viewport configuration for the Anchor Browser session.",
  {
    width: s.integer("Viewport width in pixels.", { minimum: 1 }),
    height: s.integer("Viewport height in pixels.", { minimum: 1 }),
  },
  { optional: ["width", "height"] },
);
const browserConfigSchema = s.object(
  "Browser-specific configuration sent to Anchor Browser.",
  {
    profile: browserProfileSchema,
    adblock: activeFlagSchema("Configuration for ad blocking."),
    popup_blocker: activeFlagSchema("Configuration for popup blocking."),
    captcha_solver: activeFlagSchema("Configuration for captcha solving."),
    headless: activeFlagSchema("Configuration for headless mode."),
    viewport: viewportConfigSchema,
    fullscreen: activeFlagSchema("Configuration for fullscreen mode."),
    pdf_viewer: activeFlagSchema("Configuration for PDF viewer mode."),
    p2p_download: activeFlagSchema("Configuration for peer-to-peer download capture."),
    extensions: s.array(
      "Extension IDs to load in the browser session.",
      s.string("One Anchor Browser extension ID.", { minLength: 1 }),
    ),
    disable_web_security: activeFlagSchema("Configuration for disabling browser web security."),
    extra_stealth: activeFlagSchema("Configuration for extra stealth mode."),
    force_popups_as_tabs: activeFlagSchema("Configuration for forcing popups to open as tabs."),
    web_bot_auth: activeFlagSchema("Configuration for Cloudflare Web Bot Auth."),
    disable_dialogs: activeFlagSchema("Configuration for suppressing native browser dialogs."),
  },
  {
    optional: [
      "profile",
      "adblock",
      "popup_blocker",
      "captcha_solver",
      "headless",
      "viewport",
      "fullscreen",
      "pdf_viewer",
      "p2p_download",
      "extensions",
      "disable_web_security",
      "extra_stealth",
      "force_popups_as_tabs",
      "web_bot_auth",
      "disable_dialogs",
    ],
  },
);
const integrationSchema = s.looseObject(
  {
    id: s.string("The integration ID to load.", { minLength: 1 }),
    type: s.string("The integration type, such as 1PASSWORD.", { minLength: 1 }),
    configuration: s.unknownObject("Provider-specific integration configuration."),
  },
  { description: "Anchor Browser integration to load in a browser session." },
);
const identitySchema = s.object("Previously configured identity to use for the browser session.", {
  id: s.string("The identity ID to use for the browser session.", { minLength: 1 }),
});

export const anchorBrowserActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_billing_info",
    description: "Retrieve Anchor Browser project billing balance, usage, tier, and browser limits.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving Anchor Browser billing information.", {}),
    outputSchema: s.object("The Anchor Browser billing response.", {
      billing: billingSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "start_browser_session",
    description: "Start an Anchor Browser session and return its CDP and live-view connection URLs.",
    requiredScopes: [],
    inputSchema: s.object(
      "Configuration for starting an Anchor Browser session.",
      {
        session: sessionConfigSchema,
        browser: browserConfigSchema,
        integrations: s.array("Integrations to load in the browser session.", integrationSchema),
        identities: s.array("Authenticated identities to activate in the session.", identitySchema),
      },
      { optional: ["session", "browser", "integrations", "identities"] },
    ),
    outputSchema: s.object("The Anchor Browser session creation response.", {
      session: sessionOutputSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_project_metadata",
    description: "Retrieve lightweight Anchor Browser project metadata by project ID.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving Anchor Browser project metadata.", {
      projectId: s.nonEmptyString("The Anchor Browser project ID."),
    }),
    outputSchema: s.object("The Anchor Browser project metadata response.", {
      project: projectMetadataSchema,
      raw: rawObjectSchema,
    }),
  }),
];

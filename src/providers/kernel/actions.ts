import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "kernel";

const tagsSchema = s.record(
  "Kernel browser session tags keyed by tag name. Values are serialized as tags[key] query parameters for list filtering.",
  s.string("A Kernel tag value."),
);
const viewportSchema = s.object("Viewport configuration for a Kernel browser session.", {
  width: s.integer("Viewport width in pixels.", { minimum: 1 }),
  height: s.integer("Viewport height in pixels.", { minimum: 1 }),
});
const profileReferenceSchema = s.object("Kernel browser profile reference.", {
  id: s.nonEmptyString("The Kernel profile ID."),
  name: s.nonEmptyString("The Kernel profile name."),
  save_changes: s.boolean("Whether Kernel should save browser state changes back to the profile."),
});
const browserPoolReferenceSchema = s.looseObject("Kernel browser pool reference.", {
  id: s.nonEmptyString("The Kernel browser pool ID."),
  name: s.string("The Kernel browser pool name."),
});
const browserUsageSchema = s.looseObject("Kernel browser usage metadata.", {
  runtime_seconds: s.integer("The browser session runtime in seconds."),
});
const telemetrySchema = s.looseObject("Kernel browser telemetry configuration.");
const chromePolicySchema = s.looseObject("Chrome enterprise policy overrides for the session.");

const browserSessionSchema = s.looseObject("A Kernel browser session.", {
  created_at: s.dateTime("When the browser session was created."),
  cdp_ws_url: s.string("WebSocket URL for Chrome DevTools Protocol connections to the browser session."),
  webdriver_ws_url: s.string("WebSocket URL for WebDriver BiDi connections to the browser session."),
  browser_live_view_url: s.string("Remote URL for live viewing the browser session, when available."),
  base_url: s.string("Metro-API HTTP base URL for this browser session."),
  headless: s.boolean("Whether the browser session is running in headless mode."),
  stealth: s.boolean("Whether the browser session is running in stealth mode."),
  gpu: s.boolean("Whether GPU acceleration is enabled for the browser session."),
  session_id: s.nonEmptyString("Unique identifier for the browser session."),
  name: s.nullableString("Human-readable browser session name, when one was set."),
  timeout_seconds: s.integer("The inactivity timeout in seconds for the browser session."),
  profile: profileReferenceSchema,
  proxy_id: s.nullableString("ID of the proxy associated with this browser session, if any."),
  pool: browserPoolReferenceSchema,
  viewport: viewportSchema,
  kiosk_mode: s.boolean("Whether the browser session is running in kiosk mode."),
  start_url: s.nullableString("URL the session was asked to navigate to on creation, if any."),
  chrome_policy: chromePolicySchema,
  tags: tagsSchema,
  deleted_at: s.dateTime("When the browser session was soft-deleted."),
  usage: browserUsageSchema,
  telemetry: s.nullable(telemetrySchema),
});

const paginationSchema = s.object("Kernel pagination metadata parsed from response headers.", {
  limit: s.integer("The limit used for pagination."),
  offset: s.integer("The offset used for pagination."),
  has_more: s.boolean("Whether more results are available."),
  next_offset: s.integer("The offset where the next page starts."),
});

const idOrNameInputSchema = s.object("Input for selecting one Kernel browser session.", {
  id_or_name: s.nonEmptyString("The Kernel browser session ID or name."),
});

const browserProfileInputSchema = s.object(
  "Profile to load into the Kernel browser session.",
  {
    id: s.nonEmptyString("The Kernel profile ID to load."),
    name: s.nonEmptyString("The Kernel profile name to load."),
    save_changes: s.boolean("Whether Kernel should save browser state changes back to the profile."),
  },
  { optional: ["id", "name", "save_changes"] },
);

const browserExtensionInputSchema = s.object(
  "Browser extension to load into the Kernel browser session.",
  {
    id: s.nonEmptyString("The Kernel extension ID to load."),
    name: s.nonEmptyString("The Kernel extension name to load."),
  },
  { optional: ["id", "name"] },
);

const telemetryInputSchema = s.looseObject("Kernel telemetry request configuration.");

const createBrowserSessionInputSchema = s.object(
  "Parameters for creating a Kernel browser session.",
  {
    invocation_id: s.nonEmptyString("The Kernel action invocation ID to associate with the session."),
    name: s.string("Optional human-readable name for the browser session.", {
      minLength: 1,
      maxLength: 255,
      pattern: "^[a-zA-Z0-9._-]{1,255}$",
    }),
    tags: tagsSchema,
    stealth: s.boolean("Whether to launch the browser in stealth mode."),
    headless: s.boolean("Whether to launch the browser using a headless image."),
    gpu: s.boolean("Whether to enable GPU acceleration for the browser session."),
    timeout_seconds: s.integer("The inactivity timeout in seconds.", {
      minimum: 10,
      maximum: 259200,
    }),
    profile: browserProfileInputSchema,
    extensions: s.array("Browser extensions to load into the session.", browserExtensionInputSchema, {
      maxItems: 20,
    }),
    proxy_id: s.nonEmptyString("The Kernel proxy ID to associate with the browser session."),
    viewport: viewportSchema,
    kiosk_mode: s.boolean("Whether to launch the browser in kiosk mode."),
    start_url: s.url("Optional URL to open when the browser session is created."),
    chrome_policy: chromePolicySchema,
    telemetry: s.nullable(telemetryInputSchema),
  },
  {
    optional: [
      "invocation_id",
      "name",
      "tags",
      "stealth",
      "headless",
      "gpu",
      "timeout_seconds",
      "profile",
      "extensions",
      "proxy_id",
      "viewport",
      "kiosk_mode",
      "start_url",
      "chrome_policy",
      "telemetry",
    ],
  },
);

const listBrowserSessionsInputSchema = s.object(
  "Parameters for listing Kernel browser sessions.",
  {
    status: s.stringEnum("Filter sessions by status.", ["active", "deleted", "all"]),
    limit: s.integer("Maximum number of results to return.", { minimum: 1, maximum: 100 }),
    offset: s.integer("Number of results to skip.", { minimum: 0 }),
    query: s.nonEmptyString("Search browsers by name, session ID, profile ID, proxy ID, or pool name."),
    tags: tagsSchema,
  },
  { optional: ["status", "limit", "offset", "query", "tags"] },
);

const getBrowserSessionInputSchema = s.object(
  "Parameters for retrieving one Kernel browser session.",
  {
    id_or_name: s.nonEmptyString("The Kernel browser session ID or name."),
    include_deleted: s.boolean("Whether to include soft-deleted browser sessions in the lookup."),
  },
  { optional: ["include_deleted"] },
);

const updateBrowserSessionInputSchema = s.object(
  "Parameters for updating a Kernel browser session.",
  {
    id_or_name: s.nonEmptyString("The Kernel browser session ID or name."),
    name: s.nullableString("Human-readable name for the browser session, or null to clear it."),
    tags: s.nullable(tagsSchema),
    proxy_id: s.nullableString("Kernel proxy ID to use, or an empty string to remove proxy."),
    disable_default_proxy: s.boolean(
      "Whether stealth browsers should connect directly instead of using the default stealth proxy.",
    ),
    profile: browserProfileInputSchema,
    viewport: viewportSchema,
    telemetry: s.nullable(telemetryInputSchema),
  },
  {
    optional: ["name", "tags", "proxy_id", "disable_default_proxy", "profile", "viewport", "telemetry"],
  },
);

export const kernelActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_browser_sessions",
    description: "List Kernel browser sessions with pagination, search, status, and tag filters.",
    inputSchema: listBrowserSessionsInputSchema,
    outputSchema: s.object("The Kernel browser sessions returned by the API.", {
      browser_sessions: s.array("Kernel browser sessions.", browserSessionSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_browser_session",
    description: "Create a Kernel browser session and return its connection URLs and metadata.",
    inputSchema: createBrowserSessionInputSchema,
    outputSchema: s.object("The Kernel browser session creation response.", {
      browser_session: browserSessionSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_browser_session",
    description: "Get one Kernel browser session by session ID or name.",
    inputSchema: getBrowserSessionInputSchema,
    outputSchema: s.object("The Kernel browser session lookup response.", {
      browser_session: browserSessionSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_browser_session",
    description: "Update mutable Kernel browser session metadata and settings.",
    inputSchema: updateBrowserSessionInputSchema,
    outputSchema: s.object("The Kernel browser session update response.", {
      browser_session: browserSessionSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_browser_session",
    description: "Delete a Kernel browser session by session ID or name.",
    inputSchema: idOrNameInputSchema,
    outputSchema: s.object("The normalized Kernel browser session deletion result.", {
      deleted: s.boolean("Whether Kernel accepted the delete request."),
    }),
  }),
];

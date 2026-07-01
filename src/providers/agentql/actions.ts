import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "agentql";

const browserProfileSchema = s.stringEnum("Browser profile used by AgentQL for the request or session.", [
  "light",
  "stealth",
  "tf-browser",
]);

const browserUserAgentPresetSchema = s.stringEnum(
  "Browser user agent preset used when creating a Tetra browser session.",
  ["windows", "macos", "linux"],
);

const shutdownModeSchema = s.stringEnum("How AgentQL should stop the browser session after disconnect.", [
  "on_disconnect",
  "on_inactivity_timeout",
]);

const modeSchema = s.stringEnum("AgentQL query response mode.", ["fast", "standard"]);
const statusSchema = s.stringEnum("AgentQL browser session status filter.", ["running", "ended"]);

const proxySchema = s.object(
  "Proxy configuration for AgentQL browser-backed operations.",
  {
    type: s.stringEnum("Proxy type for AgentQL browser-backed operations.", ["tetra", "custom"]),
    country_code: s.string("Optional two-letter country code for the built-in Tetra proxy.", {
      minLength: 2,
      maxLength: 2,
    }),
    url: s.string("Proxy server URL required by AgentQL custom proxy mode.", {
      minLength: 1,
    }),
    username: s.nullable(s.string("Optional username for proxy authentication.")),
    password: s.nullable(s.string("Optional password for proxy authentication.")),
  },
  { required: ["type"] },
);

const queryParamsSchema = s.object(
  "Optional query execution settings forwarded to AgentQL query-data.",
  {
    mode: modeSchema,
    wait_for: s.integer("Seconds to wait for more page content before querying.", {
      minimum: 0,
      maximum: 10,
    }),
    is_scroll_to_bottom_enabled: s.boolean(
      "Whether AgentQL should scroll to the bottom of the page before snapshot capture.",
    ),
    is_screenshot_enabled: s.boolean(
      "Whether AgentQL should capture a screenshot and return it in metadata when available.",
    ),
    browser_profile: browserProfileSchema,
    proxy: proxySchema,
  },
  {
    optional: ["mode", "wait_for", "is_scroll_to_bottom_enabled", "is_screenshot_enabled", "browser_profile", "proxy"],
  },
);

const responseMetadataSchema = s.object(
  "AgentQL metadata returned alongside the query result.",
  {
    request_id: s.string("AgentQL request identifier for the API call."),
    generated_query: s.nullable(s.string("Generated AgentQL query returned by AgentQL when prompt mode was used.")),
    screenshot: s.nullable(
      s.string("Screenshot payload or URL returned by AgentQL when screenshot capture was enabled."),
    ),
  },
  {
    optional: ["request_id", "generated_query", "screenshot"],
  },
);

const usageInfoSchema = s.requiredObject("AgentQL usage counters for the current cycle and lifetime totals.", {
  current_cycle: s.nullable(s.integer("Usage count in the current billing cycle when available.")),
  lifetime: s.integer("Lifetime usage count."),
});

const subscriptionStatusSchema = s.requiredObject("Current AgentQL subscription window and limits.", {
  lifetime_usage_limit: s.nullable(s.integer("Lifetime usage limit for the current subscription when available.")),
  current_cycle_free_usage_limit: s.nullable(
    s.integer("Free usage allowance for the current billing cycle when available."),
  ),
  current_cycle_start: s.dateTime("Start timestamp of the current billing cycle."),
  current_cycle_end: s.dateTime("End timestamp of the current billing cycle."),
});

const telemetryEntrySchema = s.requiredObject("Single AgentQL Tetra session telemetry entry.", {
  session_id: s.string("AgentQL session identifier."),
  user_id: s.nullable(s.string("Owning AgentQL user identifier when available.")),
  sub_user_id: s.nullable(s.string("Sub-user identifier attached to the session when available.")),
  base_url: s.nullable(s.string("Base streaming URL for the session when available.")),
  cdp_url: s.nullable(s.string("CDP URL for the session when available.")),
  mode: s.nullable(browserProfileSchema),
  start_time: s.nullable(s.dateTime("Session start timestamp when available.")),
  end_time: s.nullable(s.dateTime("Session end timestamp when available.")),
  duration_ms: s.nullable(s.integer("Session duration in milliseconds when available.")),
  proxy_trg_rx_bytes: s.nullable(s.integer("Proxy receive bytes recorded for the session when available.")),
  proxy_trg_tx_bytes: s.nullable(s.integer("Proxy transmit bytes recorded for the session when available.")),
  status: s.nullable(statusSchema),
  created_at: s.dateTime("Telemetry record creation timestamp."),
  updated_at: s.dateTime("Telemetry record update timestamp."),
});

export const agentqlActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "query_data",
    description: "Query a webpage with AgentQL and return the extracted structured data plus AgentQL metadata.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for querying webpage data with AgentQL.",
      {
        query: s.nullable(s.string("AgentQL query string to execute.")),
        prompt: s.nullable(s.string("Natural-language extraction prompt for AgentQL to translate into a query.")),
        url: s.nullable(s.url("Target webpage URL to fetch and query.")),
        html: s.nullable(s.string("Raw HTML content to query directly without fetching a URL.")),
        params: queryParamsSchema,
      },
      { optional: ["query", "prompt", "url", "html", "params"] },
    ),
    outputSchema: s.object(
      "AgentQL structured query result plus optional metadata.",
      {
        data: s.looseObject({}, { description: "Structured data returned by AgentQL for the query." }),
        metadata: s.nullable(responseMetadataSchema),
      },
      { required: ["data"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_usage",
    description: "Get AgentQL account and API key usage counters for the current billing cycle and lifetime totals.",
    requiredScopes: [],
    inputSchema: s.object({}, { description: "This action does not require any input parameters." }),
    outputSchema: s.object(
      "AgentQL usage payload returned by the usage endpoint.",
      {
        data: s.requiredObject("AgentQL usage summary grouped by subscription, API key, and total account usage.", {
          current_subscription: s.nullable(subscriptionStatusSchema),
          api_key_usage: usageInfoSchema,
          total_account_usage: usageInfoSchema,
        }),
        metadata: s.nullable(
          s.requiredObject("Basic AgentQL response metadata for the usage endpoint.", {
            request_id: s.string("AgentQL request identifier for the usage API call."),
          }),
        ),
      },
      { required: ["data"] },
    ),
  }),
  defineProviderAction(service, {
    name: "create_browser_session",
    description: "Create an AgentQL Tetra remote browser session and return the session, CDP, and base URLs.",
    requiredScopes: [],
    inputSchema: s.object(
      "Optional AgentQL Tetra browser session configuration.",
      {
        browser_ua_preset: browserUserAgentPresetSchema,
        browser_profile: browserProfileSchema,
        shutdown_mode: shutdownModeSchema,
        inactivity_timeout_seconds: s.integer("Inactivity timeout in seconds before AgentQL closes the session.", {
          minimum: 5,
          maximum: 86400,
        }),
        proxy: proxySchema,
        sub_user_id: s.string("Optional sub-user identifier for AgentQL session tracking."),
        branding: s.boolean("Whether the session end screen should show TinyFish branding."),
      },
      {
        optional: [
          "browser_ua_preset",
          "browser_profile",
          "shutdown_mode",
          "inactivity_timeout_seconds",
          "proxy",
          "sub_user_id",
          "branding",
        ],
      },
    ),
    outputSchema: s.requiredObject("Newly created AgentQL browser session payload.", {
      session_id: s.string("AgentQL browser session identifier."),
      cdp_url: s.string("CDP URL used to connect to the remote browser session."),
      base_url: s.string("Base URL used for viewing or streaming the remote browser session."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_session_usage",
    description: "List AgentQL Tetra session telemetry entries with optional filters and pagination controls.",
    requiredScopes: [],
    inputSchema: s.object(
      "Optional filters for listing AgentQL Tetra session telemetry.",
      {
        sub_user_id: s.string("Only return telemetry entries for this sub-user identifier."),
        session_id: s.string("Only return telemetry for this session identifier."),
        start_after: s.dateTime("Only include sessions that started after this timestamp."),
        end_before: s.dateTime("Only include sessions that ended before this timestamp."),
        updated_after: s.dateTime("Only include sessions updated after this timestamp."),
        updated_before: s.dateTime("Only include sessions updated before this timestamp."),
        status: statusSchema,
        limit: s.integer("Maximum number of entries to return per page.", {
          minimum: 1,
          maximum: 1000,
        }),
        page: s.integer("Page number to return.", {
          minimum: 1,
        }),
      },
      {
        optional: [
          "sub_user_id",
          "session_id",
          "start_after",
          "end_before",
          "updated_after",
          "updated_before",
          "status",
          "limit",
          "page",
        ],
      },
    ),
    outputSchema: s.requiredObject("Paginated AgentQL Tetra session telemetry list.", {
      items: s.array("Telemetry entries returned for the current page.", telemetryEntrySchema),
      total: s.integer("Total number of telemetry entries matching the request."),
      limit: s.integer("Maximum number of telemetry entries returned per page."),
      page: s.integer("Current page number."),
      total_pages: s.integer("Total number of pages available."),
      has_more: s.boolean("Whether there are more pages after the current page."),
    }),
  }),
];

export type AgentqlActionName = "query_data" | "get_usage" | "create_browser_session" | "list_session_usage";

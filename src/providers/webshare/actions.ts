import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "webshare";

const nonEmptyString = (description: string): JsonSchema => s.nonEmptyString(description);
const nullableString = (description: string): JsonSchema => s.nullable(s.string(description));
const nullableDateTime = (description: string): JsonSchema => s.nullable(s.dateTime(description));
const modeSchema = s.stringEnum("The Webshare proxy list mode.", ["direct", "backbone"]);

const profileSchema = s.looseObject("A Webshare user profile.", {
  id: s.integer("The Webshare user ID."),
  email: s.email("The email address of the Webshare user."),
  first_name: nullableString("The user's first name."),
  last_name: nullableString("The user's last name."),
  last_login: nullableDateTime("When the user last logged in."),
  timezone: nullableString("The user's configured timezone."),
});
const proxySchema = s.looseObject("A Webshare proxy server.", {
  id: s.string("The Webshare proxy ID."),
  username: s.string("The username used to authenticate with this proxy."),
  password: s.string("The password used to authenticate with this proxy."),
  proxy_address: s.string("The proxy IP address or hostname."),
  port: s.integer("The proxy port."),
  valid: s.boolean("Whether Webshare currently considers the proxy valid."),
  last_verification: nullableDateTime("When Webshare last verified this proxy."),
  country_code: s.string("The two-letter proxy country code."),
  city_name: nullableString("The proxy city name."),
  created_at: s.dateTime("When the proxy was created."),
});
const proxyConfigSchema = s.looseObject("A Webshare proxy configuration.", {
  request_timeout: s.integer("The request timeout in seconds."),
  request_idle_timeout: s.integer("The request idle timeout in seconds."),
  ip_authorization_country_codes: s.array(
    "Country codes enabled for IP authorization.",
    s.string("A two-letter country code."),
  ),
  ip_authorization_city: nullableString("The city enabled for IP authorization."),
  auto_replace_invalid_proxies: s.boolean("Whether invalid proxies are automatically replaced."),
  auto_replace_low_country_confidence_proxies: s.boolean(
    "Whether proxies with low country confidence are automatically replaced.",
  ),
  auto_replace_out_of_rotation_proxies: s.boolean("Whether out-of-rotation proxies are automatically replaced."),
  auto_replace_failed_site_check_proxies: s.boolean(
    "Whether proxies that fail site checks are automatically replaced.",
  ),
  proxy_list_download_token: s.string("The token used by Webshare proxy-list download URLs."),
});
const errorReasonSchema = s.looseObject("A Webshare stats error reason.", {
  reason: s.string("The Webshare error reason identifier."),
  type: s.string("The Webshare error reason category."),
  how_to_fix: s.string("Webshare guidance for fixing the error."),
  http_status: s.integer("The HTTP status associated with the error reason."),
  count: s.integer("The number of failed requests with this reason."),
});
const statsSchema = s.looseObject("A Webshare hourly proxy stats object.", {
  timestamp: s.dateTime("The hour represented by this stats object."),
  is_projected: s.boolean("Whether the stats object contains projected usage."),
  bandwidth_total: s.integer("Total bandwidth used in bytes."),
  bandwidth_average: s.number("Average bandwidth used during the hour."),
  requests_total: s.integer("Total proxy requests."),
  requests_successful: s.integer("Successful proxy requests."),
  requests_failed: s.integer("Failed proxy requests."),
  error_reasons: s.array("The error reasons reported for failed requests.", errorReasonSchema),
  countries_used: s.record("Request counts by country code.", s.integer("The request count.")),
  number_of_proxies_used: s.integer("The number of proxies used during the hour."),
  protocols_used: s.record("Request counts by protocol.", s.integer("The request count.")),
  average_concurrency: s.number("The average request concurrency."),
  average_rps: s.number("The average requests per second."),
  last_request_sent_at: nullableDateTime("When the last request was sent in this hour."),
});

export const webshareActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_profile",
    description: "Get the Webshare account profile for the connected API key.",
    requiredScopes: [],
    inputSchema: s.actionInput({}, [], "The input payload for retrieving the Webshare profile."),
    outputSchema: s.actionOutput(
      { profile: profileSchema },
      "The response returned when retrieving a Webshare profile.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_proxies",
    description: "List Webshare proxies with official mode, pagination, and filter options.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        mode: modeSchema,
        planId: nonEmptyString("The Webshare plan ID to target. When omitted, Webshare uses the default plan."),
        page: s.positiveInteger("The page number to return."),
        pageSize: s.integer("The number of proxies to return per page.", { minimum: 1, maximum: 100 }),
        country_code__in: nonEmptyString("Comma-separated country codes used to filter proxies."),
        search: nonEmptyString("Search phrase used to filter direct-mode proxies."),
        ordering: nonEmptyString("Comma-separated ordering fields such as -valid,proxy_address."),
        created_at: nonEmptyString("Proxy creation date filter accepted by Webshare."),
        proxy_address: nonEmptyString("A specific proxy address to filter by."),
        proxy_address__in: nonEmptyString("Comma-separated proxy addresses to filter by."),
        valid: s.boolean("Filter proxies by validity."),
        asn_number: nonEmptyString("ASN number used to filter direct-mode proxies."),
        asn_name: nonEmptyString("ASN name used to filter direct-mode proxies."),
      },
      [],
      "The input payload for listing Webshare proxies.",
    ),
    outputSchema: s.actionOutput(
      {
        count: s.integer("The total number of proxies matching the query."),
        next: nullableString("The next page URL returned by Webshare."),
        previous: nullableString("The previous page URL returned by Webshare."),
        proxies: s.array("The proxies returned by Webshare.", proxySchema),
      },
      "The normalized response returned when listing Webshare proxies.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_proxy_config",
    description: "Get the Webshare proxy configuration for a plan.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { planId: nonEmptyString("The Webshare plan ID whose proxy config should be returned.") },
      ["planId"],
      "The input payload for retrieving proxy config.",
    ),
    outputSchema: s.actionOutput(
      { proxyConfig: proxyConfigSchema },
      "The response returned when retrieving Webshare proxy config.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_stats",
    description: "List Webshare hourly proxy usage stats for an optional time window.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        planId: nonEmptyString("The Webshare plan ID to target. When omitted, Webshare uses the default plan."),
        timestamp__lte: s.dateTime("Return stats with timestamps less than this value."),
        timestamp__gte: s.dateTime("Return stats with timestamps greater than this value."),
      },
      [],
      "The input payload for listing Webshare proxy stats.",
    ),
    outputSchema: s.actionOutput(
      { stats: s.array("The hourly proxy stats returned by Webshare.", statsSchema) },
      "The response returned when listing Webshare proxy stats.",
    ),
  }),
];

export type WebshareActionName = "get_profile" | "list_proxies" | "get_proxy_config" | "list_stats";

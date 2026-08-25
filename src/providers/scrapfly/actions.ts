import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "scrapfly";

const proxyPoolSchema = s.stringEnum("The Scrapfly proxy pool to use for the scrape.", [
  "public_datacenter_pool",
  "public_residential_pool",
]);
const responseHeadersSchema = s.record(
  "Response headers returned by Scrapfly.",
  s.string("One response header value."),
);
const responseMetadataSchema = s.object("Metadata collected from Scrapfly response headers.", {
  status_code: s.integer("The HTTP status code returned by Scrapfly."),
  api_cost: s.nullable(s.integer("The API credit cost reported by Scrapfly.")),
  remaining_api_credit: s.nullable(s.integer("Remaining API credit reported by Scrapfly.")),
  reject_code: s.nullable(s.string("The Scrapfly reject code when a scrape is rejected.")),
  reject_description: s.nullable(s.string("The Scrapfly reject documentation URL when a scrape is rejected.")),
  reject_retryable: s.nullable(s.string("Whether Scrapfly reported the rejection as retryable.")),
});

const scrapeAction = defineProviderAction(service, {
  name: "scrape",
  description: "Scrape one public URL through Scrapfly and return the documented JSON response envelope.",
  inputSchema: s.object(
    "The input payload for scraping a URL with Scrapfly.",
    {
      url: s.url("The public URL Scrapfly should scrape."),
      method: s.stringEnum("The HTTP method Scrapfly should use against the target URL.", [
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "HEAD",
        "OPTIONS",
      ]),
      body: s.string("The raw request body Scrapfly should send to the target URL."),
      content_type: s.string("The Content-Type header for the target request body.", { minLength: 1 }),
      format: s.string("The content format Scrapfly should return.", { minLength: 1 }),
      country: s.string("The proxy country selection accepted by Scrapfly, such as us, us,ca,mx, or -gb.", {
        minLength: 2,
      }),
      proxy_pool: proxyPoolSchema,
      render_js: s.boolean("Whether Scrapfly should render JavaScript before returning."),
      asp: s.boolean("Whether Scrapfly should enable Anti Scraping Protection."),
      retry: s.boolean("Whether Scrapfly should retry the scrape request."),
      timeout: s.integer("The scrape timeout in milliseconds.", { minimum: 1000, maximum: 150000 }),
      wait_for_selector: s.string("The CSS selector Scrapfly should wait for before returning content.", {
        minLength: 1,
      }),
      cache: s.boolean("Whether Scrapfly should use cached scrape results when available."),
      cache_ttl: s.integer("The cache time-to-live in seconds.", { minimum: 1 }),
      cache_clear: s.boolean("Whether Scrapfly should clear any matching cached result."),
      session: s.string("The Scrapfly session name used to keep browsing state.", { minLength: 1, maxLength: 255 }),
      session_sticky_proxy: s.boolean("Whether Scrapfly should keep the session proxy sticky."),
      headers: s.record(
        "Target request headers Scrapfly should send to the scraped website.",
        s.string("A target request header value."),
      ),
      tags: s.array(
        "Tags for grouping the scrape in Scrapfly monitoring.",
        s.string("One Scrapfly monitoring tag.", { minLength: 1 }),
      ),
      correlation_id: s.string("A caller-provided correlation identifier for monitoring.", { minLength: 1 }),
      debug: s.boolean("Whether Scrapfly should expose debug data for the scrape."),
    },
    {
      optional: [
        "method",
        "body",
        "content_type",
        "format",
        "country",
        "proxy_pool",
        "render_js",
        "asp",
        "retry",
        "timeout",
        "wait_for_selector",
        "cache",
        "cache_ttl",
        "cache_clear",
        "session",
        "session_sticky_proxy",
        "headers",
        "tags",
        "correlation_id",
        "debug",
      ],
    },
  ),
  outputSchema: s.object("The response returned when scraping with Scrapfly.", {
    result: s.looseRequiredObject("The result object returned by Scrapfly.", {
      content: s.unknown("The scraped content, a large object URL, or encoded binary content."),
      status_code: s.integer("The HTTP status code returned by the target website."),
      format: s.string("The Scrapfly result content format."),
    }),
    config: s.looseObject("The scrape configuration returned by Scrapfly."),
    context: s.looseObject("Additional context returned by Scrapfly."),
    metadata: responseMetadataSchema,
    headers: responseHeadersSchema,
  }),
});

const getMonitoringMetricsAction = defineProviderAction(service, {
  name: "get_monitoring_metrics",
  description: "Retrieve Scrapfly monitoring metrics for the connected API key.",
  inputSchema: s.object(
    "The input payload for retrieving Scrapfly monitoring metrics.",
    {
      aggregation: s.string(
        "The metrics aggregation list accepted by Scrapfly, such as account, project, or account,project,target.",
        { minLength: 1 },
      ),
      period: s.stringEnum("The monitoring period to retrieve.", [
        "last5m",
        "last1h",
        "last7d",
        "last24h",
        "subscription",
      ]),
      start: s.string("The UTC start date accepted by Scrapfly when period is omitted.", { minLength: 1 }),
      end: s.string("The UTC end date accepted by Scrapfly when period is omitted.", { minLength: 1 }),
      group_subdomain: s.boolean("Whether target aggregation should group subdomains."),
    },
    { optional: ["aggregation", "period", "start", "end", "group_subdomain"] },
  ),
  outputSchema: s.object("The response returned when retrieving Scrapfly monitoring metrics.", {
    metrics: s.looseObject("Monitoring metrics returned by Scrapfly."),
    metadata: responseMetadataSchema,
    headers: responseHeadersSchema,
  }),
});

export const scrapflyActions: ActionDefinition[] = [scrapeAction, getMonitoringMetricsAction];

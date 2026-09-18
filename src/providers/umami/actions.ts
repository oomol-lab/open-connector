import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "umami";

const websiteIdSchema = s.nonEmptyString("The Umami website ID.");
const startAtSchema = s.nonNegativeInteger("Start timestamp in milliseconds since the Unix epoch.");
const endAtSchema = s.nonNegativeInteger("End timestamp in milliseconds since the Unix epoch.");
const timezoneSchema = s.nonEmptyString("IANA timezone name used by Umami for date grouping.");
const unitSchema = s.stringEnum("Time unit used for timeseries grouping.", ["hour", "day", "month", "year"]);
const pageSchema = s.positiveInteger("One-based page number for paginated Umami endpoints.");
const pageSizeSchema = s.positiveInteger("Number of items to return per page.");
const metricTypeSchema = s.stringEnum("Website metric dimension to return.", [
  "url",
  "referrer",
  "browser",
  "os",
  "device",
  "country",
  "region",
  "city",
  "language",
  "event",
]);

const dateRangeInput = {
  websiteId: websiteIdSchema,
  startAt: startAtSchema,
  endAt: endAtSchema,
  timezone: timezoneSchema,
  url: s.string("URL path filter for the query."),
  referrer: s.string("Referrer filter for the query."),
  title: s.string("Page title filter for the query."),
  host: s.string("Host filter for the query."),
  os: s.string("Operating system filter for the query."),
  browser: s.string("Browser filter for the query."),
  device: s.string("Device filter for the query."),
  country: s.string("Country filter for the query."),
  region: s.string("Region filter for the query."),
  city: s.string("City filter for the query."),
};

const dateRangeRequired = ["websiteId", "startAt", "endAt", "timezone"];
const rawObjectSchema = s.looseObject("Raw Umami response payload.");
const rawArraySchema = s.array("Raw Umami response array.", s.unknown("Raw Umami array item."));

const userSchema = s.looseObject("Umami user profile.", {
  id: s.string("User ID."),
  username: s.string("Username."),
  role: s.string("User role."),
  isAdmin: s.boolean("Whether the user has administrator privileges."),
});

const websiteSchema = s.looseObject("Umami website.", {
  id: s.string("Website ID."),
  name: s.string("Website name."),
  domain: s.string("Website domain."),
  shareId: s.nullableString("Public share ID when sharing is enabled."),
});

const paginatedWebsitesSchema = s.looseObject("Paginated Umami websites response.", {
  data: s.array("Websites returned by Umami.", websiteSchema),
  count: s.nonNegativeInteger("Total number of websites matching the query."),
  page: s.positiveInteger("Current page number."),
  pageSize: s.positiveInteger("Page size used by Umami."),
});

const statsSchema = s.looseObject("Umami website statistics.", {
  pageviews: s.unknown("Pageview count or comparison object returned by Umami."),
  visitors: s.unknown("Visitor count or comparison object returned by Umami."),
  visits: s.unknown("Visit count or comparison object returned by Umami."),
  bounces: s.unknown("Bounce count or comparison object returned by Umami."),
  totaltime: s.unknown("Total time count or comparison object returned by Umami."),
});

const metricRowSchema = s.looseObject("Umami metric row.", {
  x: s.unknown("Metric dimension value returned by Umami."),
  y: s.number("Metric count returned by Umami."),
});

const eventRowSchema = s.looseObject("Umami event row.", {
  id: s.string("Event ID."),
  websiteId: s.string("Website ID."),
  sessionId: s.string("Session ID."),
  eventName: s.string("Event name."),
  urlPath: s.string("URL path associated with the event."),
  createdAt: s.string("Event creation timestamp returned by Umami."),
});

export const umamiActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    operationType: "read",
    description: "Get the current Umami user for the configured API token.",
    inputSchema: s.actionInput({}, [], "No input is required to get the current Umami user."),
    outputSchema: s.actionOutput(
      {
        user: userSchema,
        raw: rawObjectSchema,
      },
      "Current Umami user response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_websites",
    operationType: "read",
    description: "List Umami websites available to the configured API token.",
    inputSchema: s.actionInput(
      {
        query: s.string("Search query filter for the endpoint."),
        page: pageSchema,
        pageSize: pageSizeSchema,
      },
      [],
      "Optional pagination and search parameters for listing Umami websites.",
    ),
    outputSchema: s.actionOutput(
      {
        websites: s.array("Websites returned by Umami.", websiteSchema),
        count: s.nonNegativeInteger("Total number of websites matching the query."),
        page: s.positiveInteger("Current page number."),
        pageSize: s.positiveInteger("Page size used by Umami."),
        raw: paginatedWebsitesSchema,
      },
      "Umami website list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_website",
    operationType: "read",
    description: "Get metadata for a single Umami website.",
    inputSchema: s.actionInput(
      { websiteId: websiteIdSchema },
      ["websiteId"],
      "Request parameters for retrieving an Umami website.",
    ),
    outputSchema: s.actionOutput(
      {
        website: websiteSchema,
        raw: rawObjectSchema,
      },
      "Umami website response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_website_stats",
    operationType: "read",
    description: "Get aggregate pageview, visitor, visit, bounce, and time statistics for a website.",
    inputSchema: s.actionInput(
      dateRangeInput,
      dateRangeRequired,
      "Request parameters for retrieving Umami website statistics.",
    ),
    outputSchema: s.actionOutput(
      {
        stats: statsSchema,
        raw: rawObjectSchema,
      },
      "Umami website statistics response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_pageviews",
    operationType: "read",
    description: "Get Umami pageview and session timeseries for a website.",
    inputSchema: s.actionInput(
      {
        ...dateRangeInput,
        unit: unitSchema,
      },
      dateRangeRequired,
      "Request parameters for retrieving Umami pageview timeseries.",
    ),
    outputSchema: s.actionOutput(
      {
        pageviews: rawObjectSchema,
        raw: rawObjectSchema,
      },
      "Umami pageview timeseries response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_metrics",
    operationType: "read",
    description: "Get grouped Umami website metrics such as URLs, referrers, browsers, or countries.",
    inputSchema: s.actionInput(
      {
        ...dateRangeInput,
        type: metricTypeSchema,
        limit: s.positiveInteger("Maximum number of metric rows to return."),
      },
      [...dateRangeRequired, "type"],
      "Request parameters for retrieving grouped Umami website metrics.",
    ),
    outputSchema: s.actionOutput(
      {
        metrics: s.array("Metric rows returned by Umami.", metricRowSchema),
        raw: rawArraySchema,
      },
      "Umami website metrics response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_realtime",
    operationType: "read",
    description: "Get realtime active visitor data for an Umami website.",
    inputSchema: s.actionInput(
      { websiteId: websiteIdSchema },
      ["websiteId"],
      "Request parameters for retrieving Umami realtime data.",
    ),
    outputSchema: s.actionOutput(
      {
        realtime: rawObjectSchema,
        raw: rawObjectSchema,
      },
      "Umami realtime response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_events",
    operationType: "read",
    description: "List tracked Umami events for a website within a time range.",
    inputSchema: s.actionInput(
      {
        ...dateRangeInput,
        query: s.string("Search query filter for the endpoint."),
        page: pageSchema,
        pageSize: pageSizeSchema,
      },
      dateRangeRequired,
      "Request parameters for listing Umami events.",
    ),
    outputSchema: s.actionOutput(
      {
        events: s.array("Events returned by Umami.", eventRowSchema),
        count: s.nonNegativeInteger("Total number of events matching the query."),
        page: s.positiveInteger("Current page number."),
        pageSize: s.positiveInteger("Page size used by Umami."),
        raw: s.looseObject("Raw Umami event list response."),
      },
      "Umami event list response.",
    ),
  }),
];

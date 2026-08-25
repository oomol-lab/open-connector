import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "short_io";

const domainIdField = s.positiveInteger("The unique identifier of the Short.io domain.");
const linkIdField = s.nonEmptyString("The unique identifier of the Short.io link.");
const limitField = s.integer({ description: "Maximum number of links to return.", minimum: 1, maximum: 150 });
const pageTokenField = s.nonEmptyString("Pagination token returned by a previous Short.io response.");
const dateSortOrderSchema = s.stringEnum("Sort order for link creation time.", ["asc", "desc"]);
const redirectTypeSchema = s.oneOf([s.literal(301), s.literal(302), s.literal(307), s.literal(308)], {
  description: "HTTP redirect status code used by the short link.",
});
const statisticsPeriodSchema = s.stringEnum("Time interval used by the Short.io statistics API.", [
  "custom",
  "today",
  "yesterday",
  "total",
  "week",
  "month",
  "lastmonth",
  "last7",
  "last30",
]);
const clicksChartIntervalSchema = s.stringEnum("Chart granularity used by the Short.io statistics API.", [
  "hour",
  "day",
  "week",
  "month",
]);

const looseObjectSchema = s.looseObject("Raw JSON object returned by Short.io.");
const domainSchema = s.object(
  "Short.io domain.",
  {
    id: domainIdField,
    hostname: s.string("Hostname of the Short.io domain."),
    state: s.string("Current configuration state of the domain."),
    title: s.string("Optional title assigned to the domain."),
    linkType: s.string("Short link generation mode configured for the domain."),
    TeamId: s.integer("Team identifier associated with the domain, when present."),
    provider: s.string("DNS provider configured for the domain, when present."),
    createdAt: s.string("Timestamp when the domain was created, when present."),
    updatedAt: s.string("Timestamp when the domain was last updated, when present."),
  },
  {
    optional: ["state", "title", "linkType", "TeamId", "provider", "createdAt", "updatedAt"],
    additionalProperties: true,
  },
);
const linkSchema = s.object(
  "Short.io short link.",
  {
    id: s.string("Unique identifier of the link."),
    idString: s.string("String form of the Short.io link identifier."),
    domain: s.string("Domain hostname used by the short link."),
    DomainId: s.integer("Numeric domain identifier associated with the short link."),
    path: s.string("Path segment of the short link."),
    title: s.string("Optional title assigned to the short link."),
    tags: s.array("Tags assigned to the short link.", s.string()),
    originalURL: s.string("Original destination URL."),
    shortURL: s.string("Non-secure short URL returned by Short.io."),
    secureShortURL: s.string("Secure HTTPS short URL returned by Short.io."),
    archived: s.boolean("Whether the link is archived."),
    cloaking: s.boolean("Whether cloaking is enabled for the link."),
    secure: s.boolean("Whether the link resolves over HTTPS."),
    clicks: s.integer("Total clicks recorded for the link, when present."),
    createdAt: s.string("Timestamp when the link was created."),
    updatedAt: s.string("Timestamp when the link was last updated, when present."),
    expiresAt: s.string("Timestamp when the link expires, when present."),
    utmSource: s.string("UTM source parameter applied to the link, when present."),
    utmMedium: s.string("UTM medium parameter applied to the link, when present."),
    utmCampaign: s.string("UTM campaign parameter applied to the link, when present."),
    utmContent: s.string("UTM content parameter applied to the link, when present."),
    utmTerm: s.string("UTM term parameter applied to the link, when present."),
  },
  {
    optional: [
      "idString",
      "domain",
      "DomainId",
      "path",
      "title",
      "tags",
      "archived",
      "cloaking",
      "secure",
      "clicks",
      "updatedAt",
      "expiresAt",
      "utmSource",
      "utmMedium",
      "utmCampaign",
      "utmContent",
      "utmTerm",
    ],
    additionalProperties: true,
  },
);
const listLinksOutputSchema = s.object("Paginated Short.io link list.", {
  links: s.array("Links returned by Short.io.", linkSchema),
  total: s.integer("Total number of links that match the current filter."),
});
const dataPointSchema = s.object("Single click chart data point.", {
  x: s.string("Timestamp of the chart data point."),
  y: s.integer("Click count at the given timestamp."),
});
const statisticsDatasetSchema = s.object("Short.io statistics dataset.", {
  data: s.array("Series data points for the current chart dataset.", dataPointSchema),
});
const statisticsChartSchema = s.object("Short.io click chart.", {
  datasets: s.array("Chart datasets returned by Short.io.", statisticsDatasetSchema),
});
const statisticsIntervalSchema = s.object(
  "Interval metadata returned by the Short.io statistics API.",
  {
    startDate: s.string("Start timestamp of the current interval, when present."),
    endDate: s.string("End timestamp of the current interval, when present."),
    prevStartDate: s.string("Start timestamp of the previous interval, when present."),
    prevEndDate: s.string("End timestamp of the previous interval, when present."),
  },
  {
    optional: ["startDate", "endDate", "prevStartDate", "prevEndDate"],
    additionalProperties: true,
  },
);
const linkStatisticsSchema = s.object(
  "Short.io link statistics.",
  {
    totalClicks: s.integer("Total clicks counted in the selected interval."),
    humanClicks: s.integer("Human clicks counted in the selected interval, when present."),
    chart: statisticsChartSchema,
    interval: statisticsIntervalSchema,
    tops: looseObjectSchema,
  },
  { optional: ["humanClicks", "chart", "interval", "tops"], additionalProperties: true },
);

const updateLinkInputSchema = s.object(
  "Request payload for updating a Short.io link.",
  {
    linkId: linkIdField,
    originalURL: s.url("Updated destination URL for the short link."),
    path: s.nonEmptyString("Updated path segment for the short link."),
    title: s.nonEmptyString("Updated title for the short link."),
    tags: s.stringArray("Updated tags to assign to the short link.", { minItems: 1 }),
    archived: s.boolean("Whether the short link should be archived."),
    cloaking: s.boolean("Whether cloaking should be enabled for the short link."),
    expiresAt: s.anyOf("Expiration timestamp to assign to the short link.", [
      s.dateTime("Expiration timestamp in ISO 8601 format."),
      s.stringPattern("^[0-9]+$", { description: "Millisecond timestamp string accepted by Short.io." }),
    ]),
    redirectType: redirectTypeSchema,
  },
  {
    optional: ["originalURL", "path", "title", "tags", "archived", "cloaking", "expiresAt", "redirectType"],
  },
);
const getLinkStatisticsInputSchema = s.object(
  "Request payload for reading Short.io link statistics.",
  {
    linkId: linkIdField,
    period: statisticsPeriodSchema,
    tz: s.nonEmptyString("Timezone used by the statistics API."),
    clicksChartInterval: clicksChartIntervalSchema,
    skipTops: s.boolean("Whether top breakdown sections should be skipped."),
    startDate: s.date("Custom interval start date in YYYY-MM-DD format."),
    endDate: s.date("Custom interval end date in YYYY-MM-DD format."),
  },
  { optional: ["period", "tz", "clicksChartInterval", "skipTops", "startDate", "endDate"] },
);

export const shortIoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_domains",
    description: "List domains available to the authenticated Short.io API key.",
    inputSchema: s.object("Action input.", {}),
    outputSchema: s.object("List of Short.io domains.", {
      domains: s.array("Domains returned by Short.io.", domainSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_domain",
    description: "Get Short.io domain details by domain ID.",
    followUpActions: ["short_io.list_links"],
    inputSchema: s.object("Action input.", { domainId: domainIdField }),
    outputSchema: domainSchema,
  }),
  defineProviderAction(service, {
    name: "list_links",
    description: "List links for a Short.io domain with optional pagination and sort order.",
    inputSchema: s.object(
      "Action input.",
      {
        domainId: domainIdField,
        limit: limitField,
        pageToken: pageTokenField,
        dateSortOrder: dateSortOrderSchema,
      },
      { optional: ["limit", "pageToken", "dateSortOrder"] },
    ),
    outputSchema: listLinksOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_link",
    description: "Get Short.io link details by link ID.",
    followUpActions: ["short_io.update_link", "short_io.delete_link", "short_io.get_link_statistics"],
    inputSchema: s.object("Action input.", { linkId: linkIdField }),
    outputSchema: linkSchema,
  }),
  defineProviderAction(service, {
    name: "create_link",
    description: "Create a new Short.io link on one of the authenticated domains.",
    followUpActions: ["short_io.get_link", "short_io.get_link_statistics"],
    inputSchema: s.object(
      "Action input.",
      {
        domain: s.nonEmptyString("Domain hostname that should own the new short link."),
        originalURL: s.url("Original destination URL to shorten."),
        path: s.nonEmptyString("Optional custom path for the short link."),
        title: s.nonEmptyString("Optional title for the short link."),
        allowDuplicates: s.boolean("Whether duplicate links to the same originalURL should be allowed."),
      },
      { optional: ["path", "title", "allowDuplicates"] },
    ),
    outputSchema: linkSchema,
  }),
  defineProviderAction(service, {
    name: "update_link",
    description: "Update an existing Short.io link by link ID.",
    followUpActions: ["short_io.get_link", "short_io.get_link_statistics"],
    inputSchema: updateLinkInputSchema,
    outputSchema: linkSchema,
  }),
  defineProviderAction(service, {
    name: "delete_link",
    description: "Delete a Short.io link by link ID.",
    inputSchema: s.object("Action input.", { linkId: linkIdField }),
    outputSchema: s.object("Acknowledgement for a deleted Short.io link.", {
      success: s.boolean("Whether the delete operation succeeded."),
      idString: s.string("Identifier of the deleted Short.io link."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_link_statistics",
    description: "Get click statistics for a Short.io link.",
    inputSchema: getLinkStatisticsInputSchema,
    outputSchema: linkStatisticsSchema,
  }),
];

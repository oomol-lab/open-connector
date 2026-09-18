import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { googleSearchConsoleReadScopes, googleSearchConsoleWriteScopes } from "./scopes.ts";

const service = "google_search_console";

const readScope = googleSearchConsoleReadScopes;

const writeScope = googleSearchConsoleWriteScopes;

const siteUrlField = s.string({
  description:
    "The site URL exactly as Search Console stores it, such as https://www.example.com/ or sc-domain:example.com.",
  minLength: 1,
});

const feedpathField = s.string({
  description: "The full sitemap URL to inspect, submit, or delete.",
  minLength: 1,
});

const dateField = (description: string) => s.date(description);

const nullableBooleanField = (description: string) => s.nullable(s.boolean({ description }));

const siteEntrySchema = s.object(
  {
    siteUrl: s.string({
      description: "The Search Console property URL.",
    }),
    permissionLevel: s.string({
      description: "The current account's permission level for this property.",
    }),
  },
  {
    description: "A Search Console property entry.",
    required: ["siteUrl", "permissionLevel"],
  },
);

const groupingDimensionSchema = s.stringEnum(
  ["date", "hour", "query", "page", "country", "device", "searchAppearance"],
  {
    description: "A Search Analytics dimension to group rows by.",
  },
);

const filterDimensionSchema = s.stringEnum(["date", "hour", "query", "page", "country", "device", "searchAppearance"], {
  description: "A Search Analytics dimension to filter by.",
});

const searchTypeSchema = s.stringEnum(["web", "image", "video", "news", "discover", "googleNews"], {
  description: "The Google search type to query.",
});

const aggregationTypeSchema = s.stringEnum(["auto", "byNewsShowcasePanel", "byPage", "byProperty"], {
  description: "How Search Console aggregates query results.",
});

const dataStateSchema = s.stringEnum(["final", "all", "hourly_all"], {
  description: "Whether to include fresh or final-only data.",
});

const dimensionFilterSchema = s.object(
  {
    dimension: filterDimensionSchema,
    operator: s.stringEnum(["contains", "equals", "notContains", "notEquals", "includingRegex", "excludingRegex"], {
      description: "The filter operator to apply to the dimension.",
    }),
    expression: s.string({
      description: "The expression to match against the selected dimension.",
      minLength: 1,
    }),
  },
  {
    description: "A Search Analytics dimension filter.",
    required: ["dimension", "operator", "expression"],
  },
);

const dimensionFilterGroupSchema = s.object(
  {
    groupType: s.stringEnum(["and"], {
      description: "How filters in the group are combined.",
    }),
    filters: s.array(dimensionFilterSchema, {
      description: "Filters applied within this group.",
    }),
  },
  {
    description: "A group of Search Analytics dimension filters.",
    required: ["filters"],
  },
);

const searchAnalyticsRowSchema = s.object(
  {
    keys: s.array(
      s.string({
        description: "A dimension value.",
      }),
      {
        description: "Dimension values for this row, in the same order as the requested dimensions.",
      },
    ),
    clicks: s.number({
      description: "Click count for this row.",
    }),
    impressions: s.number({
      description: "Impression count for this row.",
    }),
    ctr: s.number({
      description: "Click-through rate for this row.",
    }),
    position: s.number({
      description: "Average position for this row.",
    }),
  },
  {
    description: "A Search Analytics result row.",
    required: ["keys", "clicks", "impressions", "ctr", "position"],
  },
);

const searchAnalyticsMetadataSchema = s.object(
  {
    firstIncompleteDate: s.nullableString("The first date with incomplete data when Search Console reports one."),
    firstIncompleteHour: s.nullable(
      s.string({
        description: "The first hour with incomplete hourly data when Search Console reports one.",
      }),
    ),
  },
  {
    description: "Metadata returned with Search Analytics data.",
    required: ["firstIncompleteDate", "firstIncompleteHour"],
  },
);

const sitemapContentSchema = s.object(
  {
    type: s.nullableString("The sitemap content type."),
    submitted: s.nullableString("The number of submitted URLs for this content type."),
    indexed: s.nullableString("The number of indexed URLs for this content type."),
  },
  {
    description: "Indexed URL counts for a content type in a sitemap.",
    required: ["type", "submitted", "indexed"],
  },
);

const sitemapSchema = s.object(
  {
    path: s.string({
      description: "The full sitemap URL.",
    }),
    lastSubmitted: s.nullableString("When this sitemap was last submitted."),
    isPending: nullableBooleanField("Whether this sitemap is pending processing."),
    isSitemapsIndex: nullableBooleanField("Whether this sitemap is a sitemap index."),
    type: s.nullableString("The sitemap type reported by Search Console."),
    lastDownloaded: s.nullableString("When Google last downloaded this sitemap."),
    warnings: s.nullableString("Warning count reported for this sitemap."),
    errors: s.nullableString("Error count reported for this sitemap."),
    contents: s.array(sitemapContentSchema, {
      description: "Content counts reported for this sitemap.",
    }),
  },
  {
    description: "A Search Console sitemap resource.",
    required: [
      "path",
      "lastSubmitted",
      "isPending",
      "isSitemapsIndex",
      "type",
      "lastDownloaded",
      "warnings",
      "errors",
      "contents",
    ],
  },
);

const successSchema = s.object(
  {
    success: s.literal(true, {
      description: "Whether the operation completed successfully.",
    }),
  },
  {
    description: "The result of a successful Search Console write operation.",
    required: ["success"],
  },
);

const urlInspectionResultSchema = s.looseObject(
  {},
  {
    description:
      "The URL inspection result returned by Google, including index status, AMP, mobile usability, and rich results fields when present.",
  },
);

export const googleSearchConsoleActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_sites",
    operationType: "read",
    description: "List Search Console properties visible to the connected Google account.",
    requiredScopes: [...readScope],
    inputSchema: s.object(
      {},
      {
        description: "Input parameters for listing Search Console properties.",
      },
    ),
    outputSchema: s.object(
      {
        sites: s.array(siteEntrySchema, {
          description: "Search Console properties returned by the API.",
        }),
      },
      {
        description: "Search Console properties visible to the connected account.",
        required: ["sites"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_site",
    operationType: "read",
    description: "Fetch one Search Console property and the current account permission level.",
    requiredScopes: [...readScope],
    inputSchema: s.object(
      {
        siteUrl: siteUrlField,
      },
      {
        description: "Input parameters for fetching one Search Console property.",
        required: ["siteUrl"],
      },
    ),
    outputSchema: s.object(
      {
        site: siteEntrySchema,
      },
      {
        description: "A Search Console property result.",
        required: ["site"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "add_site",
    operationType: "write",
    description: "Add a property to the connected account's Search Console site set.",
    requiredScopes: [...writeScope],
    inputSchema: s.object(
      {
        siteUrl: siteUrlField,
      },
      {
        description: "Input parameters for adding a Search Console property.",
        required: ["siteUrl"],
      },
    ),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "delete_site",
    operationType: "destructive",
    description: "Remove a property from the connected account's Search Console site set.",
    requiredScopes: [...writeScope],
    inputSchema: s.object(
      {
        siteUrl: siteUrlField,
      },
      {
        description: "Input parameters for deleting a Search Console property.",
        required: ["siteUrl"],
      },
    ),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "query_search_analytics",
    operationType: "read",
    description:
      "Query Search Console performance data for a property across dates, dimensions, filters, and search types.",
    requiredScopes: [...readScope],
    inputSchema: s.object(
      {
        siteUrl: siteUrlField,
        startDate: dateField("The inclusive start date for the query in YYYY-MM-DD format."),
        endDate: dateField("The inclusive end date for the query in YYYY-MM-DD format."),
        dimensions: s.array(groupingDimensionSchema, {
          description: "Dimensions used to group result rows.",
        }),
        type: searchTypeSchema,
        dimensionFilterGroups: s.array(dimensionFilterGroupSchema, {
          description: "Dimension filter groups applied to the query.",
        }),
        aggregationType: aggregationTypeSchema,
        rowLimit: s.integer({
          description: "Maximum rows to return. Search Console accepts up to 25,000.",
          minimum: 1,
          maximum: 25000,
        }),
        startRow: s.integer({
          description: "Zero-based first row offset for pagination.",
          minimum: 0,
        }),
        dataState: dataStateSchema,
      },
      {
        description: "Input parameters for Search Analytics query.",
        required: ["siteUrl", "startDate", "endDate"],
      },
    ),
    outputSchema: s.object(
      {
        rows: s.array(searchAnalyticsRowSchema, {
          description: "Rows returned by Search Console.",
        }),
        responseAggregationType: s.nullableString(
          "The aggregation type used in the response when Search Console returns one.",
        ),
        metadata: searchAnalyticsMetadataSchema,
      },
      {
        description: "Search Analytics query result.",
        required: ["rows", "responseAggregationType", "metadata"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "list_sitemaps",
    operationType: "read",
    description: "List sitemaps submitted for a Search Console property.",
    requiredScopes: [...readScope],
    inputSchema: s.object(
      {
        siteUrl: siteUrlField,
        sitemapIndex: s.string({
          description: "Restrict results to a sitemap index URL.",
          minLength: 1,
        }),
      },
      {
        description: "Input parameters for listing Search Console sitemaps.",
        required: ["siteUrl"],
      },
    ),
    outputSchema: s.object(
      {
        sitemaps: s.array(sitemapSchema, {
          description: "Sitemaps returned by Search Console.",
        }),
      },
      {
        description: "Sitemaps returned for a Search Console property.",
        required: ["sitemaps"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_sitemap",
    operationType: "read",
    description: "Fetch one Search Console sitemap by property URL and sitemap URL.",
    requiredScopes: [...readScope],
    inputSchema: s.object(
      {
        siteUrl: siteUrlField,
        feedpath: feedpathField,
      },
      {
        description: "Input parameters for fetching one Search Console sitemap.",
        required: ["siteUrl", "feedpath"],
      },
    ),
    outputSchema: s.object(
      {
        sitemap: sitemapSchema,
      },
      {
        description: "A Search Console sitemap result.",
        required: ["sitemap"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "submit_sitemap",
    operationType: "write",
    description: "Submit a sitemap URL for a Search Console property.",
    requiredScopes: [...writeScope],
    inputSchema: s.object(
      {
        siteUrl: siteUrlField,
        feedpath: feedpathField,
      },
      {
        description: "Input parameters for submitting a Search Console sitemap.",
        required: ["siteUrl", "feedpath"],
      },
    ),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "delete_sitemap",
    operationType: "destructive",
    description: "Delete a sitemap from a Search Console property.",
    requiredScopes: [...writeScope],
    inputSchema: s.object(
      {
        siteUrl: siteUrlField,
        feedpath: feedpathField,
      },
      {
        description: "Input parameters for deleting a Search Console sitemap.",
        required: ["siteUrl", "feedpath"],
      },
    ),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "inspect_url",
    operationType: "read",
    description:
      "Inspect the indexed status of a URL under a Search Console property using Google's URL Inspection API.",
    requiredScopes: [...readScope],
    inputSchema: s.object(
      {
        siteUrl: siteUrlField,
        inspectionUrl: s.string({
          description: "The fully qualified URL to inspect. It must be under the property specified by siteUrl.",
          minLength: 1,
        }),
        languageCode: s.string({
          description: "An optional IETF BCP-47 language code for translated issue messages, such as en-US or de-CH.",
          minLength: 1,
        }),
      },
      {
        description: "Input parameters for inspecting a URL in Google's index.",
        required: ["siteUrl", "inspectionUrl"],
      },
    ),
    outputSchema: s.object(
      {
        inspectionResult: urlInspectionResultSchema,
      },
      {
        description: "URL Inspection API result.",
        required: ["inspectionResult"],
      },
    ),
  }),
];

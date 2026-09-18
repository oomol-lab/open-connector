import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "sellerspace" as const;

const datePresetSchema = s.stringEnum(
  "The SellerSpace date preset: TD today, YD yesterday, WD this week, LW last week, MO this month, LM last month, SD trailing 7 days, HD trailing 15 days, NM trailing 30 days, or CU custom dates.",
  ["TD", "YD", "WD", "LW", "MO", "LM", "SD", "HD", "NM", "CU"],
);

const comparisonSchema = s.object(
  "Optional comparison period for the requested business data.",
  {
    enabled: s.boolean({ description: "Whether to include comparison data.", default: false }),
    from: s.date("The comparison start date."),
    to: s.date("The comparison end date."),
    lastYear: s.boolean("Whether to compare with the same period last year."),
  },
  { optional: ["enabled", "from", "to", "lastYear"] },
);

const periodSchema = s.object(
  "The reporting period for the query.",
  {
    preset: s.withDefault(datePresetSchema, "SD"),
    text: s.string(
      "The user's original time expression, such as `last month` or `trailing 30 days`, for SellerSpace to normalize.",
    ),
    from: s.date("The custom start date when preset is CU."),
    to: s.date("The custom end date when preset is CU."),
  },
  { optional: ["preset", "text", "from", "to"] },
);

const comparablePeriodSchema = s.object(
  "The reporting period and optional comparison for the query.",
  {
    preset: s.withDefault(datePresetSchema, "SD"),
    text: s.string("The user's original time expression for SellerSpace to normalize."),
    from: s.date("The custom start date when preset is CU."),
    to: s.date("The custom end date when preset is CU."),
    compare: comparisonSchema,
  },
  { optional: ["preset", "text", "from", "to", "compare"] },
);

const singleStoreScopeSchema = s.object("One SellerSpace store and Amazon marketplace to query.", {
  sellerId: s.integer("The SellerSpace seller ID returned by list_stores."),
  marketplace: s.nonEmptyString("The marketplace code returned by list_stores, such as US."),
});

const stationScopeSchema = s.object("One or more SellerSpace store-marketplace stations.", {
  stations: s.stringArray("Store-marketplace identifiers in `sellerId-marketplace` form.", {
    minItems: 1,
    itemDescription: "A store-marketplace station, such as `60123-US`.",
  }),
});

const filterSchema = s.object("One metric filter applied by SellerSpace.", {
  field: s.nonEmptyString("The SellerSpace metric field to filter."),
  op: s.stringEnum("The comparison operator.", ["gt", "gte", "eq", "lt", "lte"]),
  value: s.union(
    [
      s.string("A string comparison value."),
      s.number("A numeric comparison value."),
      s.boolean("A boolean comparison value."),
    ],
    { description: "The value to compare against the selected field." },
  ),
});

const sortSchema = s.object(
  "The result ordering requested from SellerSpace.",
  {
    field: s.nonEmptyString("The SellerSpace field to sort by."),
    direction: s.withDefault(s.stringEnum("The sort direction.", ["asc", "desc"]), "desc"),
  },
  { optional: ["direction"] },
);

const pageObjectSchema = s.object(
  "Page-number pagination for a SellerSpace query.",
  {
    number: s.integer("The one-based page number.", { default: 1 }),
    size: s.integer("The number of records requested per page.", { default: 20 }),
  },
  { optional: ["number", "size"] },
);

const pageSchema = s.union([pageObjectSchema, s.integer("The one-based page number.")], {
  description: "Pagination as a one-based page number or a page configuration object.",
});

const statusSchema = s.stringEnum("The SellerSpace advertising entity status.", [
  "archived",
  "enabled",
  "paused",
  "notArchived",
]);

const queryFields = {
  fields: s.stringArray("Additional SellerSpace result fields to include."),
  selectFields: s.stringArray("The exact SellerSpace result fields to return."),
  includeSummary: s.boolean("Whether to retain summary data when selectFields requests a narrow field set."),
  includeFieldMeta: s.boolean("Whether to include contextual metadata for returned fields."),
} as const;

const queryResultSchema = s.object("The result returned by the SellerSpace MCP tool.", {
  result: s.unknown(
    "The SellerSpace result payload. Its nested fields vary with the selected entity, dataset, and field selection.",
  ),
});

const toolAnnotationsSchema = s.object(
  "MCP hints supplied by SellerSpace about the tool's behavior.",
  {
    title: s.string("A human-readable title for the tool."),
    readOnlyHint: s.boolean("Whether the tool is expected not to modify SellerSpace data."),
    destructiveHint: s.boolean("Whether the tool may perform destructive updates."),
    idempotentHint: s.boolean(
      "Whether repeated calls with the same arguments are expected to have no additional effect.",
    ),
    openWorldHint: s.boolean("Whether the tool may interact with external entities."),
  },
  {
    optional: ["title", "readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"],
  },
);

const toolSchema = s.object(
  "A tool currently exposed by the connected SellerSpace MCP account.",
  {
    name: s.nonEmptyString("The exact SellerSpace MCP tool name to pass to call_tool."),
    description: s.string("The current tool description supplied by SellerSpace MCP."),
    annotations: toolAnnotationsSchema,
    inputSchema: s.looseObject("The current JSON Schema for the tool arguments, supplied by SellerSpace MCP."),
  },
  { optional: ["description", "annotations"] },
);

export const sellerspaceToolNameByAction = {
  list_stores: "get_stores",
  discover_fields: "discover_fields",
  query_ads: "query_ads",
  query_products: "query_products",
  query_store_performance: "query_store_performance",
  get_ad_metric_history: "get_metric_history",
  list_fba_shipments: "query_shipments",
} as const;

export const sellerspaceActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_stores",
    operationType: "read",
    description:
      "List Amazon stores and marketplaces authorized in SellerSpace so their seller IDs and marketplace codes can be used in subsequent queries.",
    requiredScopes: [],
    followUpActions: [
      "sellerspace.query_store_performance",
      "sellerspace.query_ads",
      "sellerspace.query_products",
      "sellerspace.list_fba_shipments",
    ],
    inputSchema: s.object(
      "Optional filters and field selection for SellerSpace stores.",
      {
        refresh: s.boolean({
          description: "Whether to bypass the SellerSpace store cache.",
          default: false,
        }),
        keywords: s.string("A store name or seller ID search term."),
        sellingRegion: s.string("An Amazon selling region such as NA, EU, or FE."),
        authAvailable: s.string("The SP-API authorization availability filter."),
        mwsAvailable: s.string("The MWS authorization availability filter."),
        includeFields: s.stringArray("Additional store fields to include."),
        includeMarketFields: s.stringArray("Additional marketplace fields to include."),
        selectFields: s.stringArray("The exact store fields to return."),
        selectMarketFields: s.stringArray("The exact marketplace fields to return."),
        includeFieldMeta: s.boolean("Whether to include store and marketplace field metadata."),
      },
      {
        optional: [
          "refresh",
          "keywords",
          "sellingRegion",
          "authAvailable",
          "mwsAvailable",
          "includeFields",
          "includeMarketFields",
          "selectFields",
          "selectMarketFields",
          "includeFieldMeta",
        ],
      },
    ),
    outputSchema: queryResultSchema,
  }),
  defineProviderAction(service, {
    name: "query_ads",
    operationType: "read",
    description:
      "Query SellerSpace Amazon advertising campaigns, ad groups, promoted products, keywords, targets, search terms, or negative targeting with filters and pagination.",
    requiredScopes: [],
    followUpActions: ["sellerspace.get_ad_metric_history", "sellerspace.discover_fields"],
    inputSchema: s.object(
      "An advertising entity query for one SellerSpace store and marketplace.",
      {
        entity: s.stringEnum("The advertising entity to query.", [
          "campaign",
          "adGroup",
          "productAds",
          "keywords",
          "targets",
          "searchQuery",
          "searchTermFrequency",
          "negativeKeywords",
          "negativeTargets",
        ]),
        scope: singleStoreScopeSchema,
        period: periodSchema,
        name: s.string("A name or text search applied to the selected advertising entity."),
        status: statusSchema,
        campaignStatus: statusSchema,
        adGroupStatus: statusSchema,
        criteria: s.looseObject("Entity-specific SellerSpace advertising criteria."),
        filters: s.array("Metric filters applied to the advertising query.", filterSchema),
        ...queryFields,
        sort: sortSchema,
        page: pageSchema,
      },
      {
        optional: [
          "period",
          "name",
          "status",
          "campaignStatus",
          "adGroupStatus",
          "criteria",
          "filters",
          "fields",
          "selectFields",
          "includeSummary",
          "includeFieldMeta",
          "sort",
          "page",
        ],
      },
    ),
    outputSchema: queryResultSchema,
  }),
  defineProviderAction(service, {
    name: "query_products",
    operationType: "read",
    description:
      "Query SellerSpace product performance or long-term storage fee data across one or more Amazon store-marketplace stations.",
    requiredScopes: [],
    followUpActions: ["sellerspace.discover_fields"],
    inputSchema: s.object(
      "A SellerSpace product dataset query.",
      {
        scope: stationScopeSchema,
        period: comparablePeriodSchema,
        criteria: s.looseObject("Dataset-specific SellerSpace product criteria."),
        view: s.object(
          "The product dataset and grouping to return.",
          {
            dataset: s.withDefault(
              s.stringEnum("The SellerSpace product dataset.", ["performance", "longTermStorageFees"]),
              "performance",
            ),
            groupBy: s.withDefault(
              s.stringEnum("The product grouping dimension.", [
                "ASIN",
                "SKU",
                "PARENT_ASIN",
                "SELLER",
                "NO_MARKET_ASIN",
                "NO_MARKET_SKU",
                "NO_MARKET_PARENT_ASIN",
              ]),
              "SKU",
            ),
            summary: s.withDefault(
              s.stringEnum("The product summary granularity.", [
                "SUMMARY",
                "MONTHLY",
                "WEEKLY",
                "WEEK",
                "DAILY",
                "HOURLY",
                "ASIN_DAILY",
                "SKU_DAILY",
                "ASIN",
              ]),
              "SUMMARY",
            ),
          },
          { optional: ["dataset", "groupBy", "summary"] },
        ),
        ...queryFields,
        sort: sortSchema,
        page: pageSchema,
      },
      {
        optional: [
          "period",
          "criteria",
          "view",
          "fields",
          "selectFields",
          "includeSummary",
          "includeFieldMeta",
          "sort",
          "page",
        ],
      },
    ),
    outputSchema: queryResultSchema,
  }),
  defineProviderAction(service, {
    name: "query_store_performance",
    operationType: "read",
    description:
      "Query SellerSpace store or marketplace performance, including orders, revenue, profit, refunds, advertising spend, FBA fees, ROI, and ACoS.",
    requiredScopes: [],
    followUpActions: ["sellerspace.discover_fields"],
    inputSchema: s.object(
      "A SellerSpace store performance query.",
      {
        scope: stationScopeSchema,
        period: comparablePeriodSchema,
        criteria: s.looseObject("SellerSpace store query controls passed to the upstream API."),
        view: s.object(
          "The aggregation dimension and comparison granularity.",
          {
            dimension: s.withDefault(
              s.stringEnum("Whether to aggregate by marketplace or store.", ["market", "store"]),
              "market",
            ),
            chainType: s.withDefault(
              s.stringEnum("The period-over-period granularity.", ["HOURLY", "DAILY", "WEEKLY", "MONTHLY"]),
              "HOURLY",
            ),
          },
          { optional: ["dimension", "chainType"] },
        ),
        ...queryFields,
      },
      {
        optional: ["period", "criteria", "view", "fields", "selectFields", "includeSummary", "includeFieldMeta"],
      },
    ),
    outputSchema: queryResultSchema,
  }),
  defineProviderAction(service, {
    name: "discover_fields",
    operationType: "read",
    description:
      "Discover current SellerSpace fields for advanced selection, filtering, sorting, or output interpretation in a supported data domain.",
    requiredScopes: [],
    followUpActions: ["sellerspace.query_ads", "sellerspace.query_products", "sellerspace.query_store_performance"],
    inputSchema: s.object(
      "A SellerSpace field catalog search.",
      {
        domain: s.stringEnum("The SellerSpace field domain.", ["ads", "product", "website", "stores"]),
        entity: s.string("An optional entity context such as campaign, product, market, or store."),
        query: s.string("A field name, keyword, or business meaning to search for."),
        usage: s.stringEnum("The intended field usage.", ["select", "include", "sort", "filter", "output"]),
      },
      { optional: ["domain", "entity", "query", "usage"] },
    ),
    outputSchema: queryResultSchema,
  }),
  defineProviderAction(service, {
    name: "get_ad_metric_history",
    operationType: "read",
    description:
      "Get time-series or placement-level metrics for one SellerSpace advertising campaign, ad group, promoted product, keyword, target, or search term.",
    requiredScopes: [],
    followUpActions: ["sellerspace.query_ads"],
    inputSchema: s.object(
      "A metric history query for one SellerSpace advertising entity.",
      {
        sellerId: s.integer("The SellerSpace seller ID returned by list_stores."),
        marketplace: s.nonEmptyString("The marketplace code returned by list_stores."),
        adDataType: s.stringEnum("The advertising entity type.", [
          "campaign",
          "adGroup",
          "productAd",
          "keyword",
          "target",
          "searchTerm",
        ]),
        id: s.union(
          [
            s.nonEmptyString("The advertising entity or composite search-term ID."),
            s.number("The numeric advertising entity ID."),
          ],
          { description: "The entity ID returned by query_ads; use a string for large IDs." },
        ),
        fromDateStr: s.date("The query start date."),
        toDateStr: s.date("The query end date."),
        dimension: s.withDefault(
          s.stringEnum("Whether to split metrics by time or advertising placement.", ["time", "placement"]),
          "time",
        ),
        timeType: s.withDefault(
          s.stringEnum("The time aggregation used when dimension is time.", [
            "DAILY",
            "WEEKLY",
            "WEEK",
            "MONTHLY",
            "HOURLY",
          ]),
          "DAILY",
        ),
        placementBusiness: s.withDefault(
          s.stringEnum("Whether placement results should use Amazon Business placements.", ["Y", "N"]),
          "N",
        ),
        dateType: datePresetSchema,
        includeFields: s.stringArray("Additional history fields to include."),
        selectFields: s.stringArray("The exact history fields to return."),
        includeSummary: s.boolean("Whether to retain the summary when selectFields requests a narrow field set."),
      },
      {
        optional: [
          "dimension",
          "timeType",
          "placementBusiness",
          "dateType",
          "includeFields",
          "selectFields",
          "includeSummary",
        ],
      },
    ),
    outputSchema: queryResultSchema,
  }),
  defineProviderAction(service, {
    name: "list_fba_shipments",
    operationType: "read",
    description:
      "List SellerSpace FBA inbound shipments with status, warehouse, quantities, and SKU-level receiving differences for one Amazon store and marketplace.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters and pagination for SellerSpace FBA inbound shipments.",
      {
        sellerId: s.integer("The SellerSpace seller ID returned by list_stores."),
        marketplace: s.nonEmptyString("The marketplace code returned by list_stores."),
        merchantId: s.string("The optional Amazon merchant ID."),
        shipmentId: s.string("An exact FBA shipment ID."),
        shipmentStatus: s.stringEnum("The FBA shipment status.", [
          "WORKING",
          "SHIPPED",
          "RECEIVING",
          "CANCELLED",
          "DELETED",
          "CLOSED",
          "ERROR",
          "IN_TRANSIT",
          "DELIVERED",
          "CHECKED_IN",
        ]),
        amazonReferenceId: s.string("An Amazon shipment reference ID."),
        sellerSku: s.string("A seller SKU contained in the shipment."),
        fnSku: s.string("An Amazon fulfillment network SKU contained in the shipment."),
        fromDateStr: s.date("The shipment creation date range start."),
        toDateStr: s.date("The shipment creation date range end."),
        page: s.integer("The one-based page number.", { default: 1 }),
        pageSize: s.integer("The number of shipments requested per page.", { default: 30 }),
        includeFields: s.stringArray("Additional shipment fields to include."),
        selectFields: s.stringArray("The exact shipment fields to return."),
      },
      {
        optional: [
          "merchantId",
          "shipmentId",
          "shipmentStatus",
          "amazonReferenceId",
          "sellerSku",
          "fnSku",
          "fromDateStr",
          "toDateStr",
          "page",
          "pageSize",
          "includeFields",
          "selectFields",
        ],
      },
    ),
    outputSchema: queryResultSchema,
  }),
  defineProviderAction(service, {
    name: "list_tools",
    operationType: "read",
    description:
      "Discover SellerSpace tools approved by Connector for read-only dynamic calls, including their live input schemas and behavior annotations.",
    requiredScopes: [],
    followUpActions: ["sellerspace.call_tool"],
    inputSchema: s.object("No input is required.", {}),
    outputSchema: s.object("The approved read-only SellerSpace MCP tool catalog.", {
      tools: s.array("Approved read-only tools currently exposed to the connected SellerSpace account.", toolSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "call_tool",
    operationType: "read",
    description:
      "Call an explicitly approved SellerSpace MCP read tool with JSON arguments after discovering its live schema. Write, export, and browser-task tools are unavailable through this action.",
    requiredScopes: [],
    followUpActions: ["sellerspace.list_tools"],
    inputSchema: s.object(
      "Input for invoking one current SellerSpace MCP tool.",
      {
        toolName: s.nonEmptyString("The exact tool name returned by list_tools."),
        arguments: s.looseObject("JSON arguments matching the inputSchema returned for the selected tool."),
      },
      { optional: ["arguments"] },
    ),
    outputSchema: queryResultSchema,
  }),
];

import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { googleAnalyticsReadScopes, googleAnalyticsWriteScopes } from "./scopes.ts";

const service = "google_analytics";

const readScope = googleAnalyticsReadScopes;

const writeScope = googleAnalyticsWriteScopes;

const propertyIdSchema = s.string({
  description: "The Google Analytics property ID, with or without the properties/ prefix.",
  minLength: 1,
});

const pageSizeSchema = s.integer({
  description: "The maximum number of items to return per page.",
  minimum: 1,
  maximum: 200,
});

const pageTokenSchema = s.string({
  description: "The opaque pagination token returned by a previous Google Analytics response.",
  minLength: 1,
});

const rawObjectSchema = s.looseObject(
  {},
  {
    description: "The raw Google Analytics object.",
  },
);

const stringValueSchema = s.string({
  description: "A string value returned by Google Analytics.",
});

const namedRequestSchema = s.anyOf(
  [
    s.string({
      description: "The API name of the dimension or metric.",
      minLength: 1,
    }),
    s.looseObject(
      {},
      {
        description: "The official Google Analytics Dimension or Metric object, usually containing a name field.",
      },
    ),
  ],
  {
    description: "A Google Analytics named dimension or metric request.",
  },
);

const int64ScalarSchema = s.anyOf(
  [
    s.string({
      description: "The int64 value encoded as a string.",
      minLength: 1,
    }),
    s.integer({
      description: "The int64 value encoded as an integer.",
    }),
  ],
  {
    description: "A Google Analytics int64 request value.",
  },
);

const dateRangeSchema = s.object(
  {
    startDate: s.string({
      description: "The inclusive start date in YYYY-MM-DD format or a relative value such as 7daysAgo.",
      minLength: 1,
    }),
    endDate: s.string({
      description: "The inclusive end date in YYYY-MM-DD format or a relative value such as today.",
      minLength: 1,
    }),
    name: s.string({
      description: "The optional date range name used in response dimensions.",
      minLength: 1,
    }),
  },
  {
    description: "A Google Analytics Data API date range.",
    required: ["startDate", "endDate"],
  },
);

const cohortSpecSchema = s.looseObject(
  {},
  {
    description: "The Google Analytics Data API cohort specification for cohort reports.",
  },
);

const filterExpressionSchema = s.looseObject(
  {},
  {
    description: "A Google Analytics Data API FilterExpression object.",
  },
);

const orderByDescendingSchema = s.boolean("Whether to sort the values in descending order.");
const orderBySchema = s.anyOf(
  [
    s.object(
      {
        metric: s.object(
          { metricName: s.nonEmptyString("The requested metric name to sort by.") },
          { description: "The metric ordering configuration." },
        ),
        desc: orderByDescendingSchema,
      },
      { description: "A Google Analytics metric ordering rule.", required: ["metric"] },
    ),
    s.object(
      {
        dimension: s.object(
          {
            dimensionName: s.nonEmptyString("The requested dimension name to sort by."),
            orderType: s.stringEnum(
              ["ORDER_TYPE_UNSPECIFIED", "ALPHANUMERIC", "CASE_INSENSITIVE_ALPHANUMERIC", "NUMERIC"],
              { description: "The rule used to order dimension string values." },
            ),
          },
          { description: "The dimension ordering configuration.", required: ["dimensionName"] },
        ),
        desc: orderByDescendingSchema,
      },
      { description: "A Google Analytics dimension ordering rule.", required: ["dimension"] },
    ),
    s.object(
      {
        pivot: s.object(
          {
            metricName: s.nonEmptyString("The requested metric name to sort by."),
            pivotSelections: s.array(
              s.object(
                {
                  dimensionName: s.nonEmptyString("The pivot dimension name."),
                  dimensionValue: s.string("The pivot dimension value."),
                },
                {
                  description: "A dimension name and value pair selecting a pivot column.",
                  required: ["dimensionName", "dimensionValue"],
                },
              ),
              { description: "The dimension name and value pairs selecting the pivot column group." },
            ),
          },
          { description: "The pivot ordering configuration.", required: ["metricName"] },
        ),
        desc: orderByDescendingSchema,
      },
      { description: "A Google Analytics pivot ordering rule.", required: ["pivot"] },
    ),
  ],
  { description: "A Google Analytics Data API OrderBy object." },
);

const comparisonSchema = s.looseObject(
  {},
  {
    description: "A Google Analytics Data API comparison object.",
  },
);

const minuteRangeSchema = s.looseObject(
  {},
  {
    description: "A Google Analytics Data API realtime minute range.",
  },
);

const metricAggregationSchema = s.stringEnum(
  ["METRIC_AGGREGATION_UNSPECIFIED", "TOTAL", "MINIMUM", "MAXIMUM", "COUNT"],
  {
    description: "A Google Analytics metric aggregation enum value.",
  },
);

function businessReportInputSchema(description: string, orderByValues: readonly [string, ...string[]]) {
  return s.object(
    {
      propertyId: propertyIdSchema,
      startDate: s.string({
        description: "The inclusive report start date in YYYY-MM-DD format.",
        minLength: 1,
      }),
      endDate: s.string({
        description: "The inclusive report end date in YYYY-MM-DD format.",
        minLength: 1,
      }),
      limit: int64ScalarSchema,
      orderBy: s.stringEnum([...orderByValues], {
        description: "The business report field to sort by descending.",
      }),
      dimensionFilter: filterExpressionSchema,
      metricFilter: filterExpressionSchema,
      keepEmptyRows: s.boolean({
        description: "Whether rows with zero metric values should be returned.",
      }),
      returnPropertyQuota: s.boolean({
        description: "Whether to return the property quota with the response.",
      }),
    },
    {
      description,
      required: ["propertyId", "startDate", "endDate"],
    },
  );
}

const reportRequestSchema = s.object(
  {
    propertyId: propertyIdSchema,
    dateRanges: s.array(dateRangeSchema, {
      description: "The date ranges for the report.",
      minItems: 1,
    }),
    dimensions: s.array(namedRequestSchema, {
      description: "The dimensions to include in the report.",
      minItems: 1,
    }),
    metrics: s.array(namedRequestSchema, {
      description: "The metrics to include in the report.",
      minItems: 1,
    }),
    dimensionFilter: filterExpressionSchema,
    metricFilter: filterExpressionSchema,
    orderBys: s.array(orderBySchema, {
      description: "The report ordering rules.",
      minItems: 1,
    }),
    currencyCode: s.string({
      description: "The ISO 4217 currency code for currency metrics.",
      minLength: 1,
    }),
    cohortSpec: cohortSpecSchema,
    keepEmptyRows: s.boolean({
      description: "Whether rows with zero metric values should be returned.",
    }),
    metricAggregations: s.array(metricAggregationSchema, {
      description: "The metric aggregations to include in the report.",
      minItems: 1,
    }),
    comparisons: s.array(comparisonSchema, {
      description: "The comparisons to include in the report.",
      minItems: 1,
    }),
    limit: int64ScalarSchema,
    offset: int64ScalarSchema,
    returnPropertyQuota: s.boolean({
      description: "Whether to return the property quota with the response.",
    }),
  },
  {
    description: "Input parameters for running a Google Analytics Data API report.",
    required: ["propertyId", "dateRanges", "metrics"],
  },
);

const reportRequestWithoutPropertySchema = s.object(
  {
    dateRanges: s.array(dateRangeSchema, {
      description: "The date ranges for the report.",
      minItems: 1,
    }),
    dimensions: s.array(namedRequestSchema, {
      description: "The dimensions to include in the report.",
      minItems: 1,
    }),
    metrics: s.array(namedRequestSchema, {
      description: "The metrics to include in the report.",
      minItems: 1,
    }),
    dimensionFilter: filterExpressionSchema,
    metricFilter: filterExpressionSchema,
    orderBys: s.array(orderBySchema, {
      description: "The report ordering rules.",
      minItems: 1,
    }),
    currencyCode: s.string({
      description: "The ISO 4217 currency code for currency metrics.",
      minLength: 1,
    }),
    cohortSpec: cohortSpecSchema,
    keepEmptyRows: s.boolean({
      description: "Whether rows with zero metric values should be returned.",
    }),
    metricAggregations: s.array(metricAggregationSchema, {
      description: "The metric aggregations to include in the report.",
      minItems: 1,
    }),
    comparisons: s.array(comparisonSchema, {
      description: "The comparisons to include in the report.",
      minItems: 1,
    }),
    limit: int64ScalarSchema,
    offset: int64ScalarSchema,
    returnPropertyQuota: s.boolean({
      description: "Whether to return the property quota with the response.",
    }),
  },
  {
    description: "A Google Analytics RunReportRequest included in a batch request.",
    required: ["dateRanges", "metrics"],
  },
);

const pivotSchema = s.looseObject(
  {},
  {
    description:
      "A Google Analytics Data API Pivot object with fieldNames, limit, offset, orderBys, or metricAggregations.",
  },
);

const pivotReportRequestSchema = s.object(
  {
    propertyId: propertyIdSchema,
    dateRanges: s.array(dateRangeSchema, {
      description: "The date ranges for the pivot report.",
      minItems: 1,
    }),
    dimensions: s.array(namedRequestSchema, {
      description: "The dimensions to include in the pivot report.",
      minItems: 1,
    }),
    metrics: s.array(namedRequestSchema, {
      description: "The metrics to include in the pivot report.",
      minItems: 1,
    }),
    pivots: s.array(pivotSchema, {
      description: "The pivot configurations for the pivot report.",
      minItems: 1,
    }),
    dimensionFilter: filterExpressionSchema,
    metricFilter: filterExpressionSchema,
    orderBys: s.array(orderBySchema, {
      description: "The pivot report ordering rules.",
      minItems: 1,
    }),
    currencyCode: s.string({
      description: "The ISO 4217 currency code for currency metrics.",
      minLength: 1,
    }),
    cohortSpec: cohortSpecSchema,
    keepEmptyRows: s.boolean({
      description: "Whether rows with zero metric values should be returned.",
    }),
    comparisons: s.array(comparisonSchema, {
      description: "The comparisons to include in the pivot report.",
      minItems: 1,
    }),
    returnPropertyQuota: s.boolean({
      description: "Whether to return the property quota with the response.",
    }),
  },
  {
    description: "Input parameters for running a Google Analytics Data API pivot report.",
    required: ["propertyId", "metrics", "pivots"],
  },
);

const pivotReportRequestWithoutPropertySchema = s.object(
  {
    dateRanges: s.array(dateRangeSchema, {
      description: "The date ranges for the pivot report.",
      minItems: 1,
    }),
    dimensions: s.array(namedRequestSchema, {
      description: "The dimensions to include in the pivot report.",
      minItems: 1,
    }),
    metrics: s.array(namedRequestSchema, {
      description: "The metrics to include in the pivot report.",
      minItems: 1,
    }),
    pivots: s.array(pivotSchema, {
      description: "The pivot configurations for the pivot report.",
      minItems: 1,
    }),
    dimensionFilter: filterExpressionSchema,
    metricFilter: filterExpressionSchema,
    orderBys: s.array(orderBySchema, {
      description: "The pivot report ordering rules.",
      minItems: 1,
    }),
    currencyCode: s.string({
      description: "The ISO 4217 currency code for currency metrics.",
      minLength: 1,
    }),
    cohortSpec: cohortSpecSchema,
    keepEmptyRows: s.boolean({
      description: "Whether rows with zero metric values should be returned.",
    }),
    comparisons: s.array(comparisonSchema, {
      description: "The comparisons to include in the pivot report.",
      minItems: 1,
    }),
    returnPropertyQuota: s.boolean({
      description: "Whether to return the property quota with the response.",
    }),
  },
  {
    description: "A Google Analytics RunPivotReportRequest included in a batch request.",
    required: ["metrics", "pivots"],
  },
);

const realtimeReportRequestSchema = s.object(
  {
    propertyId: propertyIdSchema,
    dimensions: s.array(namedRequestSchema, {
      description: "The realtime dimensions to include in the report.",
      minItems: 1,
    }),
    metrics: s.array(namedRequestSchema, {
      description: "The realtime metrics to include in the report.",
      minItems: 1,
    }),
    dimensionFilter: filterExpressionSchema,
    metricFilter: filterExpressionSchema,
    orderBys: s.array(orderBySchema, {
      description: "The realtime report ordering rules.",
      minItems: 1,
    }),
    limit: int64ScalarSchema,
    metricAggregations: s.array(metricAggregationSchema, {
      description: "The metric aggregations to include in the realtime report.",
      minItems: 1,
    }),
    minuteRanges: s.array(minuteRangeSchema, {
      description: "The minute ranges to include in the realtime report.",
      minItems: 1,
    }),
    returnPropertyQuota: s.boolean({
      description: "Whether to return the property quota with the response.",
    }),
  },
  {
    description: "Input parameters for running a Google Analytics realtime report.",
    required: ["propertyId", "metrics"],
  },
);

const propertySummarySchema = s.object(
  {
    property: s.nullable(
      s.string({
        description: "The property resource name, such as properties/1234.",
      }),
    ),
    propertyId: s.nullable(
      s.string({
        description: "The numeric property ID extracted from the property resource.",
      }),
    ),
    displayName: s.nullable(
      s.string({
        description: "The property display name.",
      }),
    ),
    propertyType: s.nullable(
      s.string({
        description: "The Google Analytics property type enum value.",
      }),
    ),
    parent: s.nullable(
      s.string({
        description: "The parent account resource name.",
      }),
    ),
    raw: rawObjectSchema,
  },
  {
    description: "A normalized Google Analytics property summary.",
    required: ["property", "propertyId", "displayName", "propertyType", "parent", "raw"],
  },
);

const accountSummarySchema = s.object(
  {
    name: s.nullable(
      s.string({
        description: "The account summary resource name.",
      }),
    ),
    account: s.nullable(
      s.string({
        description: "The Google Analytics account resource name.",
      }),
    ),
    displayName: s.nullable(
      s.string({
        description: "The account display name.",
      }),
    ),
    propertySummaries: s.array(propertySummarySchema, {
      description: "The properties visible under the account.",
    }),
    raw: rawObjectSchema,
  },
  {
    description: "A normalized Google Analytics account summary.",
    required: ["name", "account", "displayName", "propertySummaries", "raw"],
  },
);

const propertyListItemSchema = s.object(
  {
    propertyId: s.nullable(
      s.string({
        description: "The numeric property ID extracted from the property resource.",
      }),
    ),
    property: s.nullable(
      s.string({
        description: "The property resource name, such as properties/1234.",
      }),
    ),
    displayName: s.nullable(
      s.string({
        description: "The property display name.",
      }),
    ),
    propertyType: s.nullable(
      s.string({
        description: "The Google Analytics property type enum value.",
      }),
    ),
    parent: s.nullable(
      s.string({
        description: "The parent account resource name.",
      }),
    ),
    account: s.nullable(
      s.string({
        description: "The Google Analytics account resource name.",
      }),
    ),
    accountDisplayName: s.nullable(
      s.string({
        description: "The Google Analytics account display name.",
      }),
    ),
    raw: rawObjectSchema,
  },
  {
    description: "A Google Analytics property option with account context.",
    required: [
      "propertyId",
      "property",
      "displayName",
      "propertyType",
      "parent",
      "account",
      "accountDisplayName",
      "raw",
    ],
  },
);

const metadataFieldSchema = s.object(
  {
    apiName: s.nullable(
      s.string({
        description: "The API name used in report requests.",
      }),
    ),
    uiName: s.nullable(
      s.string({
        description: "The display name shown by Google Analytics.",
      }),
    ),
    description: s.nullable(
      s.string({
        description: "The field description returned by Google Analytics.",
      }),
    ),
    category: s.nullable(
      s.string({
        description: "The metadata category returned by Google Analytics.",
      }),
    ),
    type: s.nullable(
      s.string({
        description: "The metric type returned by Google Analytics when present.",
      }),
    ),
    expression: s.nullable(
      s.string({
        description: "The metric expression returned by Google Analytics.",
      }),
    ),
    deprecatedApiNames: s.array(stringValueSchema, {
      description: "Deprecated API names for this field.",
    }),
    customDefinition: s.nullable(
      s.boolean({
        description: "Whether this is a custom dimension or metric.",
      }),
    ),
    raw: rawObjectSchema,
  },
  {
    description: "A normalized Google Analytics metadata field.",
    required: [
      "apiName",
      "uiName",
      "description",
      "category",
      "type",
      "expression",
      "deprecatedApiNames",
      "customDefinition",
      "raw",
    ],
  },
);

const metadataSchema = s.object(
  {
    name: s.nullable(
      s.string({
        description: "The metadata resource name.",
      }),
    ),
    dimensions: s.array(metadataFieldSchema, {
      description: "The available dimensions for the property.",
    }),
    metrics: s.array(metadataFieldSchema, {
      description: "The available metrics for the property.",
    }),
    comparisons: s.array(metadataFieldSchema, {
      description: "The available comparisons for the property.",
    }),
    raw: rawObjectSchema,
  },
  {
    description: "The normalized Google Analytics metadata response.",
    required: ["name", "dimensions", "metrics", "comparisons", "raw"],
  },
);

const reportHeaderSchema = s.object(
  {
    name: s.nullable(
      s.string({
        description: "The header name.",
      }),
    ),
    type: s.nullable(
      s.string({
        description: "The metric type when present.",
      }),
    ),
  },
  {
    description: "A Google Analytics report header.",
    required: ["name", "type"],
  },
);

const reportRowSchema = s.object(
  {
    dimensions: s.record(stringValueSchema, {
      description: "Dimension values keyed by dimension header name.",
    }),
    metrics: s.record(stringValueSchema, {
      description: "Metric values keyed by metric header name.",
    }),
    dimensionValues: s.array(stringValueSchema, {
      description: "Dimension values in response order.",
    }),
    metricValues: s.array(stringValueSchema, {
      description: "Metric values in response order.",
    }),
    raw: rawObjectSchema,
  },
  {
    description: "A normalized Google Analytics report row.",
    required: ["dimensions", "metrics", "dimensionValues", "metricValues", "raw"],
  },
);

const reportMetadataSchema = s.object(
  {
    currencyCode: s.nullable(
      s.string({
        description: "The currency code used by the report.",
      }),
    ),
    timeZone: s.nullable(
      s.string({
        description: "The property timezone used by the report.",
      }),
    ),
    raw: rawObjectSchema,
  },
  {
    description: "Normalized Google Analytics report metadata.",
    required: ["currencyCode", "timeZone", "raw"],
  },
);

const reportSchema = s.object(
  {
    dimensionHeaders: s.array(reportHeaderSchema, {
      description: "The dimension headers returned by the report.",
    }),
    metricHeaders: s.array(reportHeaderSchema, {
      description: "The metric headers returned by the report.",
    }),
    rows: s.array(reportRowSchema, {
      description: "The normalized report rows.",
    }),
    rowCount: s.nullable(
      s.integer({
        description: "The total row count returned by Google Analytics.",
      }),
    ),
    metadata: s.nullable(reportMetadataSchema),
    propertyQuota: s.nullable(rawObjectSchema),
    totals: s.array(reportRowSchema, {
      description: "Total rows returned by Google Analytics.",
    }),
    minimums: s.array(reportRowSchema, {
      description: "Minimum rows returned by Google Analytics.",
    }),
    maximums: s.array(reportRowSchema, {
      description: "Maximum rows returned by Google Analytics.",
    }),
    raw: rawObjectSchema,
  },
  {
    description: "A normalized Google Analytics report response.",
    required: [
      "dimensionHeaders",
      "metricHeaders",
      "rows",
      "rowCount",
      "metadata",
      "propertyQuota",
      "totals",
      "minimums",
      "maximums",
      "raw",
    ],
  },
);

const pivotHeaderSchema = s.object(
  {
    pivotDimensionHeaders: s.array(rawObjectSchema, {
      description: "The pivot dimension header entries returned by Google Analytics.",
    }),
    rowCount: s.nullable(
      s.integer({
        description: "The number of rows returned for this pivot.",
      }),
    ),
    raw: rawObjectSchema,
  },
  {
    description: "A normalized Google Analytics pivot header.",
    required: ["pivotDimensionHeaders", "rowCount", "raw"],
  },
);

const pivotReportSchema = s.object(
  {
    pivotHeaders: s.array(pivotHeaderSchema, {
      description: "The pivot headers returned by the report.",
    }),
    dimensionHeaders: s.array(reportHeaderSchema, {
      description: "The dimension headers returned by the report.",
    }),
    metricHeaders: s.array(reportHeaderSchema, {
      description: "The metric headers returned by the report.",
    }),
    rows: s.array(reportRowSchema, {
      description: "The normalized report rows.",
    }),
    metadata: s.nullable(reportMetadataSchema),
    propertyQuota: s.nullable(rawObjectSchema),
    raw: rawObjectSchema,
  },
  {
    description: "A normalized Google Analytics pivot report response.",
    required: ["pivotHeaders", "dimensionHeaders", "metricHeaders", "rows", "metadata", "propertyQuota", "raw"],
  },
);

const compatibilityResultSchema = s.object(
  {
    compatibility: s.nullable(
      s.string({
        description: "The Google Analytics compatibility enum value.",
      }),
    ),
    metadata: metadataFieldSchema,
    raw: rawObjectSchema,
  },
  {
    description: "A normalized Google Analytics compatibility result.",
    required: ["compatibility", "metadata", "raw"],
  },
);

const compatibilitySchema = s.object(
  {
    dimensionCompatibilities: s.array(compatibilityResultSchema, {
      description: "The compatibility results for requested dimensions.",
    }),
    metricCompatibilities: s.array(compatibilityResultSchema, {
      description: "The compatibility results for requested metrics.",
    }),
    raw: rawObjectSchema,
  },
  {
    description: "The normalized Google Analytics compatibility check response.",
    required: ["dimensionCompatibilities", "metricCompatibilities", "raw"],
  },
);

const propertyQuotasSnapshotSchema = s.object(
  {
    name: s.nullable(
      s.string({
        description: "The quota snapshot resource name.",
      }),
    ),
    corePropertyQuota: s.nullable(rawObjectSchema),
    realtimePropertyQuota: s.nullable(rawObjectSchema),
    funnelPropertyQuota: s.nullable(rawObjectSchema),
    raw: rawObjectSchema,
  },
  {
    description: "A normalized Google Analytics property quotas snapshot.",
    required: ["name", "corePropertyQuota", "realtimePropertyQuota", "funnelPropertyQuota", "raw"],
  },
);

const customDimensionSchema = s.object(
  {
    name: s.nullable(
      s.string({
        description: "The custom dimension resource name.",
      }),
    ),
    parameterName: s.nullable(
      s.string({
        description: "The event parameter name for the custom dimension.",
      }),
    ),
    displayName: s.nullable(
      s.string({
        description: "The custom dimension display name.",
      }),
    ),
    description: s.nullable(
      s.string({
        description: "The custom dimension description.",
      }),
    ),
    scope: s.nullable(
      s.string({
        description: "The custom dimension scope enum value.",
      }),
    ),
    disallowAdsPersonalization: s.nullable(
      s.boolean({
        description: "Whether this custom dimension is blocked from ads personalization.",
      }),
    ),
    raw: rawObjectSchema,
  },
  {
    description: "A normalized Google Analytics custom dimension.",
    required: ["name", "parameterName", "displayName", "description", "scope", "disallowAdsPersonalization", "raw"],
  },
);

const customMetricSchema = s.object(
  {
    name: s.nullable(
      s.string({
        description: "The custom metric resource name.",
      }),
    ),
    parameterName: s.nullable(
      s.string({
        description: "The event parameter name for the custom metric.",
      }),
    ),
    displayName: s.nullable(
      s.string({
        description: "The custom metric display name.",
      }),
    ),
    description: s.nullable(
      s.string({
        description: "The custom metric description.",
      }),
    ),
    measurementUnit: s.nullable(
      s.string({
        description: "The custom metric measurement unit enum value.",
      }),
    ),
    scope: s.nullable(
      s.string({
        description: "The custom metric scope enum value.",
      }),
    ),
    restrictedMetricType: s.array(stringValueSchema, {
      description: "The restricted metric type enum values for this custom metric.",
    }),
    raw: rawObjectSchema,
  },
  {
    description: "A normalized Google Analytics custom metric.",
    required: [
      "name",
      "parameterName",
      "displayName",
      "description",
      "measurementUnit",
      "scope",
      "restrictedMetricType",
      "raw",
    ],
  },
);

const dataRetentionSettingsSchema = s.object(
  {
    name: s.nullable(
      s.string({
        description: "The data retention settings resource name, such as properties/123/dataRetentionSettings.",
      }),
    ),
    eventDataRetention: s.nullable(
      s.string({
        description: "The event-level data retention duration enum value.",
      }),
    ),
    userDataRetention: s.nullable(
      s.string({
        description: "The user-level data retention duration enum value.",
      }),
    ),
    resetUserDataOnNewActivity: s.nullable(
      s.boolean({
        description: "Whether user data retention resets on new activity.",
      }),
    ),
    raw: rawObjectSchema,
  },
  {
    description: "A normalized Google Analytics data retention settings resource.",
    required: ["name", "eventDataRetention", "userDataRetention", "resetUserDataOnNewActivity", "raw"],
  },
);

const propertySchema = s.object(
  {
    name: s.nullable(
      s.string({
        description: "The property resource name, such as properties/1234.",
      }),
    ),
    propertyId: s.nullable(
      s.string({
        description: "The numeric property ID extracted from the property resource.",
      }),
    ),
    parent: s.nullable(
      s.string({
        description: "The parent account or roll-up property resource name.",
      }),
    ),
    displayName: s.nullable(
      s.string({
        description: "The property display name.",
      }),
    ),
    propertyType: s.nullable(
      s.string({
        description: "The Google Analytics property type enum value.",
      }),
    ),
    industryCategory: s.nullable(
      s.string({
        description: "The property industry category enum value.",
      }),
    ),
    timeZone: s.nullable(
      s.string({
        description: "The property reporting time zone.",
      }),
    ),
    currencyCode: s.nullable(
      s.string({
        description: "The property currency code.",
      }),
    ),
    raw: rawObjectSchema,
  },
  {
    description: "A normalized Google Analytics property.",
    required: [
      "name",
      "propertyId",
      "parent",
      "displayName",
      "propertyType",
      "industryCategory",
      "timeZone",
      "currencyCode",
      "raw",
    ],
  },
);

const customDimensionWriteInputSchema = s.object(
  {
    propertyId: propertyIdSchema,
    parameterName: s.string({
      description: "The event parameter name for the custom dimension.",
      minLength: 1,
    }),
    displayName: s.string({
      description: "The custom dimension display name.",
      minLength: 1,
    }),
    description: s.string({
      description: "The custom dimension description.",
      minLength: 1,
    }),
    scope: s.stringEnum(["EVENT", "USER", "ITEM"], {
      description: "The custom dimension scope enum value.",
    }),
    disallowAdsPersonalization: s.boolean({
      description: "Whether this custom dimension is blocked from ads personalization.",
    }),
  },
  {
    description: "Input parameters for creating a Google Analytics custom dimension.",
    required: ["propertyId", "parameterName", "displayName", "scope"],
  },
);

const archiveCustomDimensionInputSchema = s.object(
  {
    customDimensionName: s.string({
      description: "The custom dimension resource name, such as properties/123/customDimensions/456.",
      minLength: 1,
    }),
  },
  {
    description: "Input parameters for archiving a Google Analytics custom dimension.",
    required: ["customDimensionName"],
  },
);

const customMetricWriteInputSchema = s.object(
  {
    propertyId: propertyIdSchema,
    parameterName: s.string({
      description: "The event parameter name for the custom metric.",
      minLength: 1,
    }),
    displayName: s.string({
      description: "The custom metric display name.",
      minLength: 1,
    }),
    description: s.string({
      description: "The custom metric description.",
      minLength: 1,
    }),
    measurementUnit: s.stringEnum(
      [
        "MEASUREMENT_UNIT_UNSPECIFIED",
        "STANDARD",
        "CURRENCY",
        "FEET",
        "METERS",
        "KILOMETERS",
        "MILES",
        "MILLISECONDS",
        "SECONDS",
        "MINUTES",
        "HOURS",
      ],
      {
        description: "The custom metric measurement unit enum value.",
      },
    ),
    scope: s.stringEnum(["EVENT"], {
      description: "The custom metric scope enum value.",
    }),
    restrictedMetricType: s.array(
      s.stringEnum(["RESTRICTED_METRIC_TYPE_UNSPECIFIED", "COST_DATA", "REVENUE_DATA"], {
        description: "A Google Analytics restricted metric type enum value.",
      }),
      {
        description: "The restricted metric type enum values for this custom metric.",
        minItems: 1,
      },
    ),
  },
  {
    description: "Input parameters for creating a Google Analytics custom metric.",
    required: ["propertyId", "parameterName", "displayName", "measurementUnit", "scope"],
  },
);

const archiveCustomMetricInputSchema = s.object(
  {
    customMetricName: s.string({
      description: "The custom metric resource name, such as properties/123/customMetrics/456.",
      minLength: 1,
    }),
  },
  {
    description: "Input parameters for archiving a Google Analytics custom metric.",
    required: ["customMetricName"],
  },
);

const updatePropertyInputSchema = s.object(
  {
    propertyId: propertyIdSchema,
    displayName: s.string({
      description: "The property display name.",
      minLength: 1,
    }),
    industryCategory: s.string({
      description: "The property industry category enum value.",
      minLength: 1,
    }),
    timeZone: s.string({
      description: "The property reporting time zone.",
      minLength: 1,
    }),
    currencyCode: s.string({
      description: "The property currency code.",
      minLength: 1,
    }),
    serviceLevel: s.string({
      description: "The Google Analytics property service level enum value.",
      minLength: 1,
    }),
  },
  {
    description: "Input parameters for updating Google Analytics property configuration.",
    required: ["propertyId"],
  },
);

const updateDataRetentionSettingsInputSchema = s.object(
  {
    propertyId: propertyIdSchema,
    eventDataRetention: s.string({
      description: "The event-level data retention duration enum value, such as FOURTEEN_MONTHS.",
      minLength: 1,
    }),
    userDataRetention: s.string({
      description: "The user-level data retention duration enum value, such as FOURTEEN_MONTHS.",
      minLength: 1,
    }),
    resetUserDataOnNewActivity: s.boolean({
      description: "Whether user data retention resets on new activity.",
    }),
  },
  {
    description: "Input parameters for updating Google Analytics data retention settings.",
    required: ["propertyId"],
  },
);

const dataStreamSchema = s.object(
  {
    name: s.nullable(
      s.string({
        description: "The data stream resource name.",
      }),
    ),
    dataStreamId: s.nullable(
      s.string({
        description: "The numeric data stream ID extracted from the data stream resource.",
      }),
    ),
    displayName: s.nullable(
      s.string({
        description: "The data stream display name.",
      }),
    ),
    type: s.nullable(
      s.string({
        description: "The Google Analytics data stream type enum value.",
      }),
    ),
    webStreamData: s.nullable(rawObjectSchema),
    androidAppStreamData: s.nullable(rawObjectSchema),
    iosAppStreamData: s.nullable(rawObjectSchema),
    raw: rawObjectSchema,
  },
  {
    description: "A normalized Google Analytics data stream.",
    required: [
      "name",
      "dataStreamId",
      "displayName",
      "type",
      "webStreamData",
      "androidAppStreamData",
      "iosAppStreamData",
      "raw",
    ],
  },
);

const propertyOverviewSchema = s.object(
  {
    propertyId: s.nullable(
      s.string({
        description: "The numeric property ID extracted from the property resource.",
      }),
    ),
    property: s.nullable(
      s.string({
        description: "The property resource name, such as properties/1234.",
      }),
    ),
    parent: s.nullable(
      s.string({
        description: "The parent account or roll-up property resource name.",
      }),
    ),
    displayName: s.nullable(
      s.string({
        description: "The property display name.",
      }),
    ),
    propertyType: s.nullable(
      s.string({
        description: "The Google Analytics property type enum value.",
      }),
    ),
    industryCategory: s.nullable(
      s.string({
        description: "The property industry category enum value.",
      }),
    ),
    timeZone: s.nullable(
      s.string({
        description: "The property reporting time zone.",
      }),
    ),
    currencyCode: s.nullable(
      s.string({
        description: "The property currency code.",
      }),
    ),
    dataStreams: s.array(dataStreamSchema, {
      description: "The data streams configured on the property.",
    }),
    webMeasurementIds: s.array(stringValueSchema, {
      description: "The web stream measurement IDs for the property.",
    }),
    customDimensions: s.array(customDimensionSchema, {
      description: "The custom dimensions configured on the property.",
    }),
    customMetrics: s.array(customMetricSchema, {
      description: "The custom metrics configured on the property.",
    }),
    metadata: metadataSchema,
    quota: propertyQuotasSnapshotSchema,
    raw: s.object(
      {
        property: s.nullable(rawObjectSchema),
        dataStreams: rawObjectSchema,
        customDimensions: rawObjectSchema,
        customMetrics: rawObjectSchema,
        metadata: rawObjectSchema,
        quota: rawObjectSchema,
      },
      {
        description: "Raw Google Analytics responses used to build the overview.",
        required: ["property", "dataStreams", "customDimensions", "customMetrics", "metadata", "quota"],
      },
    ),
  },
  {
    description: "A Google Analytics property overview for reporting setup.",
    required: [
      "propertyId",
      "property",
      "parent",
      "displayName",
      "propertyType",
      "industryCategory",
      "timeZone",
      "currencyCode",
      "dataStreams",
      "webMeasurementIds",
      "customDimensions",
      "customMetrics",
      "metadata",
      "quota",
      "raw",
    ],
  },
);

export const googleAnalyticsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_account_summaries",
    description: "List Google Analytics accounts and property summaries visible to the connected Google account.",
    requiredScopes: readScope,
    inputSchema: s.object(
      {
        pageSize: pageSizeSchema,
        pageToken: pageTokenSchema,
      },
      {
        description: "Input parameters for listing Google Analytics account summaries.",
      },
    ),
    outputSchema: s.object(
      {
        accountSummaries: s.array(accountSummarySchema, {
          description: "The visible account summaries.",
        }),
        nextPageToken: s.nullable(
          s.string({
            description: "The token for the next page when present.",
          }),
        ),
      },
      {
        description: "The Google Analytics account summaries response.",
        required: ["accountSummaries", "nextPageToken"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "list_properties",
    description:
      "List Google Analytics properties visible to the connected account as user-selectable options. Use this first when the user does not know their GA4 propertyId.",
    requiredScopes: readScope,
    inputSchema: s.object(
      {
        pageSize: pageSizeSchema,
        pageToken: pageTokenSchema,
      },
      {
        description: "Input parameters for listing Google Analytics properties from account summaries.",
      },
    ),
    outputSchema: s.object(
      {
        properties: s.array(propertyListItemSchema, {
          description: "The visible properties with account context.",
        }),
        nextPageToken: s.nullable(
          s.string({
            description: "The token for the next page when present.",
          }),
        ),
      },
      {
        description: "The flattened Google Analytics property list response.",
        required: ["properties", "nextPageToken"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_metadata",
    description: "Get available dimensions and metrics for a Google Analytics property before building reports.",
    requiredScopes: readScope,
    inputSchema: s.object(
      {
        propertyId: propertyIdSchema,
      },
      {
        description: "Input parameters for getting Google Analytics metadata.",
        required: ["propertyId"],
      },
    ),
    outputSchema: s.object(
      {
        metadata: metadataSchema,
      },
      {
        description: "The Google Analytics metadata response.",
        required: ["metadata"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_property_overview",
    description: "Get the key setup details for a Google Analytics property before choosing reports.",
    requiredScopes: readScope,
    inputSchema: s.object(
      {
        propertyId: propertyIdSchema,
      },
      {
        description: "Input parameters for getting a Google Analytics property overview.",
        required: ["propertyId"],
      },
    ),
    outputSchema: s.object(
      {
        overview: propertyOverviewSchema,
      },
      {
        description: "The Google Analytics property overview response.",
        required: ["overview"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "run_report",
    description: "Run a Google Analytics Data API report for selected dimensions, metrics, and date ranges.",
    requiredScopes: readScope,
    inputSchema: reportRequestSchema,
    outputSchema: s.object(
      {
        report: reportSchema,
      },
      {
        description: "The Google Analytics report response.",
        required: ["report"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "run_acquisition_report",
    description: "Run a Google Analytics acquisition report showing where sessions and users came from.",
    requiredScopes: readScope,
    inputSchema: businessReportInputSchema("Input parameters for running a Google Analytics acquisition report.", [
      "activeUsers",
      "sessions",
      "engagedSessions",
      "keyEvents",
    ]),
    outputSchema: s.object(
      {
        report: reportSchema,
      },
      {
        description: "The Google Analytics acquisition report response.",
        required: ["report"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "run_engagement_report",
    description: "Run a Google Analytics engagement trend report for users, sessions, and engagement quality.",
    requiredScopes: readScope,
    inputSchema: businessReportInputSchema("Input parameters for running a Google Analytics engagement report.", [
      "date",
      "activeUsers",
      "sessions",
      "engagedSessions",
      "engagementRate",
      "averageSessionDuration",
      "eventCount",
    ]),
    outputSchema: s.object(
      {
        report: reportSchema,
      },
      {
        description: "The Google Analytics engagement report response.",
        required: ["report"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "run_pages_report",
    description: "Run a Google Analytics pages report for page views, users, sessions, and engagement.",
    requiredScopes: readScope,
    inputSchema: businessReportInputSchema("Input parameters for running a Google Analytics pages report.", [
      "pagePath",
      "pageTitle",
      "screenPageViews",
      "activeUsers",
      "sessions",
      "averageSessionDuration",
      "eventCount",
    ]),
    outputSchema: s.object(
      {
        report: reportSchema,
      },
      {
        description: "The Google Analytics pages report response.",
        required: ["report"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "run_events_report",
    description: "Run a Google Analytics events report for event volume, users, key events, and value.",
    requiredScopes: readScope,
    inputSchema: businessReportInputSchema("Input parameters for running a Google Analytics events report.", [
      "eventName",
      "eventCount",
      "totalUsers",
      "activeUsers",
      "keyEvents",
      "eventValue",
    ]),
    outputSchema: s.object(
      {
        report: reportSchema,
      },
      {
        description: "The Google Analytics events report response.",
        required: ["report"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "run_key_events_report",
    description: "Run a Google Analytics key events report for key event volume and conversion rates.",
    requiredScopes: readScope,
    inputSchema: businessReportInputSchema("Input parameters for running a Google Analytics key events report.", [
      "eventName",
      "keyEvents",
      "sessionKeyEventRate",
      "userKeyEventRate",
    ]),
    outputSchema: s.object(
      {
        report: reportSchema,
      },
      {
        description: "The Google Analytics key events report response.",
        required: ["report"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "run_geography_report",
    description: "Run a Google Analytics geography report for users, sessions, and key events by location.",
    requiredScopes: readScope,
    inputSchema: businessReportInputSchema("Input parameters for running a Google Analytics geography report.", [
      "country",
      "region",
      "city",
      "activeUsers",
      "newUsers",
      "sessions",
      "engagedSessions",
      "keyEvents",
    ]),
    outputSchema: s.object(
      {
        report: reportSchema,
      },
      {
        description: "The Google Analytics geography report response.",
        required: ["report"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "run_technology_report",
    description: "Run a Google Analytics technology report for device, browser, and operating system performance.",
    requiredScopes: readScope,
    inputSchema: businessReportInputSchema("Input parameters for running a Google Analytics technology report.", [
      "deviceCategory",
      "browser",
      "operatingSystem",
      "activeUsers",
      "sessions",
      "engagedSessions",
      "engagementRate",
      "eventCount",
      "keyEvents",
    ]),
    outputSchema: s.object(
      {
        report: reportSchema,
      },
      {
        description: "The Google Analytics technology report response.",
        required: ["report"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "check_compatibility",
    description: "Check whether selected Google Analytics dimensions and metrics can be queried together.",
    requiredScopes: readScope,
    inputSchema: s.object(
      {
        propertyId: propertyIdSchema,
        dimensions: s.array(namedRequestSchema, {
          description: "The dimensions to check for compatibility.",
          minItems: 1,
        }),
        metrics: s.array(namedRequestSchema, {
          description: "The metrics to check for compatibility.",
          minItems: 1,
          maxItems: 10,
        }),
        dimensionFilter: filterExpressionSchema,
        metricFilter: filterExpressionSchema,
        compatibilityFilter: s.stringEnum(["COMPATIBILITY_UNSPECIFIED", "COMPATIBLE", "INCOMPATIBLE"], {
          description: "Filter results by Google Analytics compatibility enum value.",
        }),
      },
      {
        description: "Input parameters for checking Google Analytics dimension and metric compatibility.",
        required: ["propertyId"],
      },
    ),
    outputSchema: s.object(
      {
        compatibility: compatibilitySchema,
      },
      {
        description: "The Google Analytics compatibility check response.",
        required: ["compatibility"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "run_pivot_report",
    description: "Run a Google Analytics Data API pivot report for cross-tabbed reporting views.",
    requiredScopes: readScope,
    inputSchema: pivotReportRequestSchema,
    outputSchema: s.object(
      {
        pivotReport: pivotReportSchema,
      },
      {
        description: "The Google Analytics pivot report response.",
        required: ["pivotReport"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "batch_run_reports",
    description: "Run up to five Google Analytics Data API reports in one batch request for a single property.",
    requiredScopes: readScope,
    inputSchema: s.object(
      {
        propertyId: propertyIdSchema,
        requests: s.array(reportRequestWithoutPropertySchema, {
          description: "The RunReportRequest objects to execute in the batch.",
          minItems: 1,
          maxItems: 5,
        }),
      },
      {
        description: "Input parameters for running a batch of Google Analytics reports.",
        required: ["propertyId", "requests"],
      },
    ),
    outputSchema: s.object(
      {
        reports: s.array(reportSchema, {
          description: "The normalized reports returned by Google Analytics.",
        }),
        raw: rawObjectSchema,
      },
      {
        description: "The Google Analytics batch report response.",
        required: ["reports", "raw"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "batch_run_pivot_reports",
    description: "Run up to five Google Analytics Data API pivot reports in one batch request for a single property.",
    requiredScopes: readScope,
    inputSchema: s.object(
      {
        propertyId: propertyIdSchema,
        requests: s.array(pivotReportRequestWithoutPropertySchema, {
          description: "The RunPivotReportRequest objects to execute in the batch.",
          minItems: 1,
          maxItems: 5,
        }),
      },
      {
        description: "Input parameters for running a batch of Google Analytics pivot reports.",
        required: ["propertyId", "requests"],
      },
    ),
    outputSchema: s.object(
      {
        pivotReports: s.array(pivotReportSchema, {
          description: "The normalized pivot reports returned by Google Analytics.",
        }),
        raw: rawObjectSchema,
      },
      {
        description: "The Google Analytics batch pivot report response.",
        required: ["pivotReports", "raw"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "run_realtime_report",
    description: "Run a Google Analytics realtime report for currently active users and events.",
    requiredScopes: readScope,
    inputSchema: realtimeReportRequestSchema,
    outputSchema: s.object(
      {
        report: reportSchema,
      },
      {
        description: "The Google Analytics realtime report response.",
        required: ["report"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_property_quotas_snapshot",
    description: "Get the Google Analytics Data API quota snapshot for a property without running a report.",
    requiredScopes: readScope,
    inputSchema: s.object(
      {
        propertyId: propertyIdSchema,
      },
      {
        description: "Input parameters for getting a Google Analytics quota snapshot.",
        required: ["propertyId"],
      },
    ),
    outputSchema: s.object(
      {
        propertyQuotasSnapshot: propertyQuotasSnapshotSchema,
      },
      {
        description: "The Google Analytics property quotas snapshot response.",
        required: ["propertyQuotasSnapshot"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "list_custom_dimensions",
    description: "List custom dimensions configured on a Google Analytics property.",
    requiredScopes: readScope,
    inputSchema: s.object(
      {
        propertyId: propertyIdSchema,
        pageSize: pageSizeSchema,
        pageToken: pageTokenSchema,
      },
      {
        description: "Input parameters for listing Google Analytics custom dimensions.",
        required: ["propertyId"],
      },
    ),
    outputSchema: s.object(
      {
        customDimensions: s.array(customDimensionSchema, {
          description: "The custom dimensions on the property.",
        }),
        nextPageToken: s.nullable(
          s.string({
            description: "The token for the next page when present.",
          }),
        ),
      },
      {
        description: "The Google Analytics custom dimensions response.",
        required: ["customDimensions", "nextPageToken"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "create_custom_dimension",
    description:
      "Create a Google Analytics custom dimension so reporting can use a business-specific event, user, or item attribute.",
    requiredScopes: writeScope,
    inputSchema: customDimensionWriteInputSchema,
    outputSchema: s.object(
      {
        customDimension: customDimensionSchema,
      },
      {
        description: "The created Google Analytics custom dimension response.",
        required: ["customDimension"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "archive_custom_dimension",
    description:
      "Archive a Google Analytics custom dimension that should no longer be available for reporting configuration.",
    requiredScopes: writeScope,
    inputSchema: archiveCustomDimensionInputSchema,
    outputSchema: s.object(
      {
        success: s.boolean({
          description: "Whether Google Analytics accepted the archive request.",
        }),
        raw: rawObjectSchema,
      },
      {
        description: "The Google Analytics custom dimension archive response.",
        required: ["success", "raw"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "list_custom_metrics",
    description: "List custom metrics configured on a Google Analytics property.",
    requiredScopes: readScope,
    inputSchema: s.object(
      {
        propertyId: propertyIdSchema,
        pageSize: pageSizeSchema,
        pageToken: pageTokenSchema,
      },
      {
        description: "Input parameters for listing Google Analytics custom metrics.",
        required: ["propertyId"],
      },
    ),
    outputSchema: s.object(
      {
        customMetrics: s.array(customMetricSchema, {
          description: "The custom metrics on the property.",
        }),
        nextPageToken: s.nullable(
          s.string({
            description: "The token for the next page when present.",
          }),
        ),
      },
      {
        description: "The Google Analytics custom metrics response.",
        required: ["customMetrics", "nextPageToken"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "create_custom_metric",
    description: "Create a Google Analytics custom metric so reports can measure business-specific event values.",
    requiredScopes: writeScope,
    inputSchema: customMetricWriteInputSchema,
    outputSchema: s.object(
      {
        customMetric: customMetricSchema,
      },
      {
        description: "The created Google Analytics custom metric response.",
        required: ["customMetric"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "archive_custom_metric",
    description:
      "Archive a Google Analytics custom metric that should no longer be available for reporting configuration.",
    requiredScopes: writeScope,
    inputSchema: archiveCustomMetricInputSchema,
    outputSchema: s.object(
      {
        success: s.boolean({
          description: "Whether Google Analytics accepted the archive request.",
        }),
        raw: rawObjectSchema,
      },
      {
        description: "The Google Analytics custom metric archive response.",
        required: ["success", "raw"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "list_properties_filtered",
    description:
      "List Google Analytics properties matching a known Admin API filter such as parent:accounts/123. Use list_properties first when the account or propertyId is unknown.",
    requiredScopes: readScope,
    inputSchema: s.object(
      {
        filter: s.string({
          description: "The Admin API filter expression, such as parent:accounts/123 or ancestor:accounts/123.",
          minLength: 1,
        }),
        pageSize: pageSizeSchema,
        pageToken: pageTokenSchema,
        showDeleted: s.boolean({
          description: "Whether to include soft-deleted properties.",
        }),
      },
      {
        description: "Input parameters for listing filtered Google Analytics properties.",
        required: ["filter"],
      },
    ),
    outputSchema: s.object(
      {
        properties: s.array(propertySchema, {
          description: "The properties matching the filter.",
        }),
        nextPageToken: s.nullable(
          s.string({
            description: "The token for the next page when present.",
          }),
        ),
      },
      {
        description: "The Google Analytics filtered properties response.",
        required: ["properties", "nextPageToken"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "update_property",
    description:
      "Update Google Analytics property settings such as display name, industry category, time zone, or currency.",
    requiredScopes: writeScope,
    inputSchema: updatePropertyInputSchema,
    outputSchema: s.object(
      {
        property: propertySchema,
      },
      {
        description: "The updated Google Analytics property response.",
        required: ["property"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "update_data_retention_settings",
    description:
      "Update Google Analytics property data retention settings for event data and user activity reset behavior.",
    requiredScopes: writeScope,
    inputSchema: updateDataRetentionSettingsInputSchema,
    outputSchema: s.object(
      {
        dataRetentionSettings: dataRetentionSettingsSchema,
      },
      {
        description: "The updated Google Analytics data retention settings response.",
        required: ["dataRetentionSettings"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "list_data_streams",
    description: "List data streams configured on a Google Analytics property.",
    requiredScopes: readScope,
    inputSchema: s.object(
      {
        propertyId: propertyIdSchema,
        pageSize: pageSizeSchema,
        pageToken: pageTokenSchema,
      },
      {
        description: "Input parameters for listing Google Analytics data streams.",
        required: ["propertyId"],
      },
    ),
    outputSchema: s.object(
      {
        dataStreams: s.array(dataStreamSchema, {
          description: "The data streams on the property.",
        }),
        nextPageToken: s.nullable(
          s.string({
            description: "The token for the next page when present.",
          }),
        ),
      },
      {
        description: "The Google Analytics data streams response.",
        required: ["dataStreams", "nextPageToken"],
      },
    ),
  }),
];

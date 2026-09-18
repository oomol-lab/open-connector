import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

const service = "apple_ads";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { billingEvents, bidStrategyTypes } from "./actions-campaigns.ts";
import {
  adAccountIdInput,
  appleAdsDateTimeOutput,
  looseResource,
  moneyOutput,
  moneyValueOutput,
  nonEmptyString,
  nullableEnum,
  offsetInput,
  readCampaignsRoles,
  sortOrders,
} from "./schemas.ts";

export const reportFilterOperators: readonly string[] = [
  "BETWEEN",
  "CONTAINS",
  "CONTAINS_ANY",
  "CONTAINS_ALL",
  "ENDS_WITH",
  "EQUALS",
  "GREATER_THAN",
  "GREATER_THAN_OR_EQUAL_TO",
  "IN",
  "LESS_THAN",
  "LESS_THAN_OR_EQUAL_TO",
  "LIKE",
  "NOT_EQUALS",
  "STARTS_WITH",
];

const reportTimeZones = ["ORTZ", "UTC"];
const searchTermTimeZones = ["ORTZ"];
const reportGranularities = ["HOURLY", "DAILY", "WEEKLY", "MONTHLY"];
const dailyOrCoarserGranularities = ["DAILY", "WEEKLY", "MONTHLY"];

const appsIncludeRows = ["GRAND_TOTAL", "EMPTY_METRICS"];
const grandTotalIncludeRows = ["GRAND_TOTAL"];

const appsEntityGroupBy = [
  "deviceClass",
  "ageRange",
  "gender",
  "countryCode",
  "adminArea",
  "locality",
  "storefront",
  "countryOrRegion",
];
const appsAdGroupBy = ["storefront", "countryOrRegion"];
const appsTermGroupBy = ["deviceClass", "storefront", "countryOrRegion"];
const brandsEntityGroupBy = ["deviceClass", "locationId", "supplyPlacement"];
const brandsTermGroupBy = ["deviceClass"];

const reportSystemStatuses = ["RUNNING", "NOT_RUNNING"];
const reportPricingModels = ["CPA", "CPM", "CPT"];
const reportAdChannelTypes = ["SEARCH", "DISPLAY"];
const appsCreativeTypes = ["CUSTOM_PRODUCT_PAGE", "DEFAULT_PRODUCT_PAGE"];
const brandsCreativeTypes = ["LOCAL_ADS_SEARCH_CREATIVE"];
const creativeSystemStatuses = ["VALID", "INVALID", "PENDING"];
const reportKeywordStatuses = ["ACTIVE", "PAUSED", "DELETED"];
const appsMatchTypes = ["BROAD", "EXACT"];
const brandsMatchTypes = ["PHRASE", "CATEGORY"];
const reportEntityStatuses = ["ENABLED", "PAUSED"];

const timeZoneDescription =
  "Time zone the date range is interpreted in. ORTZ is the org's reporting time zone and is the default.";
const searchTermTimeZoneDescription =
  "Time zone the date range is interpreted in. Search term reports accept ORTZ only; Apple Ads rejects UTC here.";

const filterFieldDescription =
  "Name of the field to filter on. Apple Ads accepts entity fields such as campaignId and adGroupId as well as metric fields such as impressions, taps and localSpend; the exact set depends on the entity level.";
const sortFieldDescription = "Name of the field to sort on, for example localSpend or impressions.";

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

const reportTimeRangeInput = (options: {
  timeZones: readonly string[];
  timeZoneDescription: string;
  granularities: readonly string[];
  granularityDescription: string;
}) =>
  s.object(
    "Date range, time zone and optional time-series breakdown for the report.",
    {
      start: s.date("First day included in the report, in YYYY-MM-DD format."),
      end: s.date("Last day included in the report, in YYYY-MM-DD format."),
      timeZone: s.stringEnum(options.timeZoneDescription, options.timeZones),
      granularity: s.stringEnum(options.granularityDescription, options.granularities),
    },
    { required: ["start", "end"] },
  );

const reportFiltersInput = s.array(
  "Filter conditions combined with logical AND.",
  s.object(
    "A single filter condition.",
    {
      field: nonEmptyString(filterFieldDescription),
      operator: s.stringEnum(
        "Comparison operator. Numeric fields accept the range operators such as GREATER_THAN and BETWEEN; string fields accept EQUALS, IN and the pattern operators.",
        reportFilterOperators,
      ),
      value: s.unknown(
        "Operand to compare against. Pass an array for IN, BETWEEN, CONTAINS_ANY and CONTAINS_ALL, and either a bare value or a single-element array for the single-value operators.",
      ),
    },
    { required: ["field", "operator"] },
  ),
);

const reportSortingInput = s.array(
  "Sort directives applied in order, with later entries breaking ties. The default is to sort by entity id ascending.",
  s.object(
    "A single sort directive.",
    {
      field: nonEmptyString(sortFieldDescription),
      order: s.stringEnum("Sort direction.", sortOrders),
    },
    { required: ["field"] },
  ),
);

const reportFieldsInput = s.stringArray("Field names to return on each row. Omit it to receive every field.", {
  itemDescription: "A metadata or metric field name, for example impressions, taps or localSpend.",
});

const reportPageSizeInput = s.positiveInteger(
  "Number of rows to return on this page. The maximum is 5000 and Apple Ads defaults to 100.",
  { maximum: 5000 },
);

const reportPaginationOutput = s.looseRequiredObject("Pagination metadata echoed by Apple Ads for this page.", {
  offset: s.nullableInteger("Zero-based index of the first record in this page."),
  pageSize: s.nullableInteger("Number of records requested for this page."),
  totalCount: s.nullableInteger(
    "Total number of rows matching the query across all pages, or null when Apple Ads leaves it out.",
  ),
});

const reportInputs = (options: {
  timeZones: readonly string[];
  timeZoneDescription: string;
  granularities: readonly string[];
  granularityDescription: string;
  groupByDimensions: readonly string[];
  groupByDescription: string;
  includeRows: readonly string[];
  includeRowsDescription: string;
}) => ({
  adAccountId: adAccountIdInput,
  timeRange: reportTimeRangeInput(options),
  filters: reportFiltersInput,
  sorting: reportSortingInput,
  fields: reportFieldsInput,
  groupBy: s.array(
    options.groupByDescription,
    s.stringEnum("A dimension to break the rows out by.", options.groupByDimensions),
  ),
  includeRows: s.array(options.includeRowsDescription, s.stringEnum("A row inclusion option.", options.includeRows)),
  offset: offsetInput,
  pageSize: reportPageSizeInput,
});

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

const reportingMoneyOutput = (description: string) => moneyValueOutput(description, "The monetary amount.");

const reportingBidStrategyOutput = s.nullable(
  looseResource("Bid strategy in effect at report time.", {
    bidStrategyType: nullableEnum("The bid strategy applied.", bidStrategyTypes),
    bid: moneyOutput("Bid amount for manual strategies, or null for automated strategies."),
  }),
);

const includeExcludeOutput = (description: string, itemDescription: string) =>
  s.nullable(
    looseResource(description, {
      include: s.nullable(s.stringArray("Values targeted at report time.", { itemDescription })),
    }),
  );

const appsTargetingOutput = s.nullable(
  looseResource("Snapshot of the campaign's targeting at report time.", {
    supplyPlacement: includeExcludeOutput(
      "Placement slots included in delivery.",
      "A placement such as APPSTORE_SEARCH_RESULTS or APPSTORE_TODAY_TAB.",
    ),
    lifetimeStorefronts: includeExcludeOutput(
      "App Store countries or regions targeted over the campaign's lifetime, which can differ from the currently active targeting.",
      "An ISO 3166-1 alpha-2 storefront code.",
    ),
    countryOrRegion: includeExcludeOutput(
      "Countries or regions currently targeted by the campaign.",
      "An ISO 3166-1 alpha-2 country or region code.",
    ),
  }),
);

const brandsTargetingOutput = s.nullable(
  looseResource("Snapshot of the Apple Maps targeting at report time.", {
    supplyPlacement: includeExcludeOutput(
      "Apple Maps placement slots included in delivery.",
      "A placement such as MAPS_SEARCH_RESULTS or MAPS_SEARCH_HOME.",
    ),
    lifetimeStorefronts: includeExcludeOutput(
      "Countries or regions targeted over the campaign's lifetime.",
      "An ISO 3166-1 alpha-2 storefront code.",
    ),
    supplySource: includeExcludeOutput(
      "Supply sources delivery is restricted to.",
      "A supply source, which is MAPS for Apple Maps placements.",
    ),
    promotedLocationGroup: includeExcludeOutput(
      "Location groups targeted by the campaign.",
      "A location group identifier.",
    ),
    promotedLocation: includeExcludeOutput(
      "Individual brand locations targeted by the campaign.",
      "A brand location identifier.",
    ),
  }),
);

const promotedObjectOutput = s.nullable(
  looseResource("Human-readable summary of the promoted entity.", {
    name: s.nullableString(
      "Name of the promoted object. For Apple Maps campaigns this is the brand or location name as it appears in Maps.",
    ),
  }),
);

const campaignMinOutput = s.nullable(
  s.looseObject(
    "Lightweight summary of the parent campaign. Apple Ads documents no fields on it beyond what the row already carries.",
  ),
);

const adGroupMinOutput = s.nullable(
  looseResource("Lightweight summary of the parent ad group.", {
    name: s.nullableString("The ad group name."),
    deleted: s.nullableBoolean("Whether the ad group has been deleted."),
  }),
);

const systemStatusReasonsOutput = s.nullable(
  s.stringArray("Reasons contributing to the current system status.", {
    itemDescription: "A system status reason code.",
  }),
);

const systemStatusLimitingReasonsOutput = s.nullable(
  s.stringArray("Reasons delivery stayed below its maximum potential.", {
    itemDescription: "A limiting reason code.",
  }),
);

const dimensionValue = (dimension: string) =>
  s.nullableString(
    `Value of the ${dimension} groupBy dimension for this row, or null when the request did not group by it.`,
  );

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

const sharedMetricFields = {
  date: s.nullableString(
    "Period this metrics entry covers, in YYYY-MM-DD format. Apple Ads sets it on granular entries only.",
  ),
  localSpend: moneyOutput("Total spend for the period in the ad account currency."),
  impressions: s.nullableInteger("Total ad impressions."),
  taps: s.nullableInteger("Total ad taps."),
  ttr: s.nullableNumber("Tap-through rate, which is taps divided by impressions."),
  cpt: moneyOutput("Average cost per tap."),
  cpm: moneyOutput("Average cost per thousand impressions."),
};

const appsMetrics = (description: string) =>
  looseResource(description, {
    ...sharedMetricFields,
    tapInstalls: s.nullableInteger("Installs attributed to taps."),
    tapInstallCPI: moneyOutput("Average cost per tap-attributed install."),
    totalNewDownloads: s.nullableInteger("First-time installs across all attribution types."),
    totalRedownloads: s.nullableInteger(
      "Installs of an app the user previously had installed, across all attribution types.",
    ),
    viewInstalls: s.nullableInteger("Installs attributed to view-through, impression-based attribution."),
    totalInstalls: s.nullableInteger("Installs combining tap and view attribution."),
    tapNewDownloads: s.nullableInteger("First-time installs attributed to taps."),
    tapRedownloads: s.nullableInteger("Redownloads attributed to taps."),
    viewNewDownloads: s.nullableInteger("First-time installs attributed to view-through impressions."),
    viewRedownloads: s.nullableInteger("Redownloads attributed to view-through impressions."),
    totalAvgCPI: moneyOutput("Average cost per install across all attribution types."),
    totalInstallRate: s.nullableNumber("Total installs divided by taps."),
    tapInstallRate: s.nullableNumber("Tap-attributed installs divided by taps."),
    tapPreOrdersPlaced: s.nullableInteger("Pre-orders placed attributed to taps."),
    viewPreOrdersPlaced: s.nullableInteger("Pre-orders placed attributed to view-through impressions."),
    totalPreOrdersPlaced: s.nullableInteger("Pre-orders placed across all attribution types."),
  });
const actionMetricsOutput = (description: string) =>
  s.nullable(looseResource(description, { tap: s.nullableInteger("Count attributed to taps.") }));
const rateMetricsOutput = (description: string) =>
  s.nullable(
    looseResource(description, {
      tap: s.nullableNumber("Rate attributed to taps, expressed as a decimal."),
    }),
  );
const costMetricsOutput = (description: string) =>
  s.nullable(looseResource(description, { tap: moneyOutput("Cost attributed to taps.") }));

const brandsMetrics = (description: string) =>
  looseResource(description, {
    ...sharedMetricFields,
    firstActions: actionMetricsOutput("First-time engagement actions taken after an ad tap."),
    firstActionsPerTap: rateMetricsOutput("First actions divided by taps."),
    firstActionsPerImpression: rateMetricsOutput("First actions divided by impressions."),
    costPerFirstAction: costMetricsOutput("Spend divided by first actions."),
    actions: actionMetricsOutput("Total Apple Maps actions such as directions, calls, URL taps and shares."),
    costPerAction: costMetricsOutput("Spend divided by actions."),
    getDirections: actionMetricsOutput("Get Directions taps."),
    tapURL: actionMetricsOutput("URL taps."),
    call: actionMetricsOutput("Call actions."),
    share: actionMetricsOutput("Share actions."),
    getTheApp: actionMetricsOutput("Get the App taps."),
    galleryEngagement: actionMetricsOutput("Gallery photo engagements."),
    actionsPerTap: rateMetricsOutput("Actions divided by taps."),
    actionsPerImpression: rateMetricsOutput("Actions divided by impressions."),
  });

const keywordInsightsOutput = s.nullable(
  looseResource("Performance insights attached to the keyword row.", {
    bidRecommendation: s.nullable(
      looseResource("Suggested bid information for this keyword.", {
        suggestedBidAmount: s.nullableNumber("Recommended bid amount for the keyword."),
      }),
    ),
  }),
);

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

const appsDimensionFields = {
  countryOrRegion: dimensionValue("countryOrRegion"),
  deviceClass: dimensionValue("deviceClass"),
  gender: dimensionValue("gender"),
  ageRange: dimensionValue("ageRange"),
  locality: dimensionValue("locality"),
  countryCode: dimensionValue("countryCode"),
  adminArea: dimensionValue("adminArea"),
};

const brandsDimensionFields = {
  deviceClass: dimensionValue("deviceClass"),
  locationId: dimensionValue("locationId"),
  supplyPlacement: dimensionValue("supplyPlacement"),
};

const sharedCampaignMetadataFields = {
  id: s.nullableInteger("System-assigned identifier for the campaign."),
  promotedObject: promotedObjectOutput,
  promotedObjectId: s.nullableString("Identifier of the promoted entity."),
  name: s.nullableString("Campaign name as configured at report time."),
  status: nullableEnum("Advertiser intent for the campaign to serve.", reportEntityStatuses),
  deleted: s.nullableBoolean("Whether the campaign has been soft-deleted."),
  displayStatus: s.nullableString("Rolled-up delivery state combining advertiser intent and system evaluation."),
  modificationTime: appleAdsDateTimeOutput("When the campaign was last modified."),
  creationTime: appleAdsDateTimeOutput("When the campaign was created."),
  adAccountId: s.nullableInteger("Ad account the campaign belongs to."),
  systemStatus: nullableEnum("System-computed delivery state.", reportSystemStatuses),
  systemStatusReasons: systemStatusReasonsOutput,
  billingEvent: nullableEnum("Interaction that triggers a charge.", billingEvents),
  systemStatusLimitingReasons: systemStatusLimitingReasonsOutput,
  dailyBudget: reportingMoneyOutput("Daily spend cap at report time."),
  startTime: appleAdsDateTimeOutput("Scheduled start of the campaign."),
  endTime: appleAdsDateTimeOutput("Scheduled end of the campaign."),
  lifetimeBudget: reportingMoneyOutput("Lifetime budget for the campaign."),
  bidStrategy: reportingBidStrategyOutput,
  adChannelType: nullableEnum(
    "Channel that served the row's metrics. SEARCH is Search results; DISPLAY covers Search tab, Today tab and product pages.",
    reportAdChannelTypes,
  ),
};

const sharedAdGroupMetadataFields = {
  id: s.nullableInteger("System-assigned identifier for the ad group."),
  campaignId: s.nullableInteger("Campaign the ad group belongs to."),
  adAccountId: s.nullableInteger("Ad account the ad group belongs to."),
  name: s.nullableString("Ad group name as configured at report time."),
  status: nullableEnum("Advertiser intent for the ad group to serve.", reportEntityStatuses),
  deleted: s.nullableBoolean("Whether the ad group has been soft-deleted."),
  systemStatus: nullableEnum("System-computed delivery state.", reportSystemStatuses),
  systemStatusReasons: systemStatusReasonsOutput,
  systemStatusLimitingReasons: systemStatusLimitingReasonsOutput,
  automatedKeywordsOptIn: s.nullableBoolean("Whether the ad group opted in to automated keywords."),
  automatedKeywordsRequired: s.nullableBoolean("Whether automated keywords are required for this ad group."),
  pricingModel: nullableEnum("How the ad group is priced.", reportPricingModels),
  displayStatus: s.nullableString("Rolled-up delivery state combining ad group and campaign conditions."),
  modificationTime: appleAdsDateTimeOutput("When the ad group was last modified."),
  creationTime: appleAdsDateTimeOutput("When the ad group was created."),
  startTime: appleAdsDateTimeOutput("Scheduled start of the ad group."),
  endTime: appleAdsDateTimeOutput("Scheduled end of the ad group."),
  campaign: campaignMinOutput,
  bidStrategy: reportingBidStrategyOutput,
};

const sharedAdMetadataFields = {
  id: s.nullableInteger("System-assigned identifier for the ad."),
  name: s.nullableString("Ad name as configured at report time."),
  deleted: s.nullableBoolean("Whether the ad has been soft-deleted."),
  status: nullableEnum("Advertiser intent for the ad to serve.", reportEntityStatuses),
  systemStatus: nullableEnum("System-computed delivery state.", reportSystemStatuses),
  systemStatusReasons: systemStatusReasonsOutput,
  systemStatusLimitingReasons: systemStatusLimitingReasonsOutput,
  adAccountId: s.nullableInteger("Ad account the ad belongs to."),
  campaignId: s.nullableInteger("Campaign the ad belongs to."),
  adGroupId: s.nullableInteger("Ad group the ad belongs to."),
  creationTime: appleAdsDateTimeOutput("When the ad was created."),
  modificationTime: appleAdsDateTimeOutput("When the ad was last modified."),
  displayStatus: s.nullableString("Rolled-up delivery state combining ad, ad group and campaign conditions."),
};

const appsCampaignMetadata = looseResource(
  "Campaign attributes captured at report time, plus the groupBy dimension values applied to this row.",
  {
    ...sharedCampaignMetadataFields,
    promotedObjectType: nullableEnum("What the campaign promotes. App Store campaigns always report APPSTORE_APP.", [
      "APPSTORE_APP",
    ]),
    targeting: appsTargetingOutput,
    ...appsDimensionFields,
  },
);

const appsAdGroupMetadata = looseResource(
  "Ad group attributes captured at report time, plus the groupBy dimension values applied to this row.",
  {
    ...sharedAdGroupMetadataFields,
    cpaCap: reportingMoneyOutput("Cost-per-acquisition cap for the ad group."),
    ...appsDimensionFields,
  },
);

const appsAdMetadata = looseResource(
  "Ad attributes captured at report time, plus the groupBy dimension values applied to this row.",
  {
    ...sharedAdMetadataFields,
    creative: s.nullable(
      looseResource("Creative snapshot for the ad.", {
        id: s.nullableInteger("System-assigned identifier for the creative."),
        creativeType: nullableEnum("Creative format.", appsCreativeTypes),
        systemStatus: nullableEnum(
          "Whether the creative was eligible to serve at report time.",
          creativeSystemStatuses,
        ),
        creativeSpec: s.nullable(
          looseResource("Content configuration of the creative.", {
            language: s.nullableString("BCP 47 language tag of the creative, for example en-US."),
          }),
        ),
        destination: s.nullable(
          looseResource("Click-through destination of the creative.", {
            parameters: s.nullable(
              s.record(
                "Destination parameters keyed by parameter name. The content varies by creative and destination type.",
                s.unknown("A destination parameter value."),
              ),
            ),
          }),
        ),
      }),
    ),
    countryOrRegion: dimensionValue("countryOrRegion"),
    deviceClass: dimensionValue("deviceClass"),
  },
);

const sharedKeywordMetadataFields = {
  id: s.nullableInteger("System-assigned identifier for the keyword."),
  campaignId: s.nullableInteger("Campaign that owns the keyword."),
  adGroupId: s.nullableInteger("Ad group that owns the keyword."),
  adAccountId: s.nullableInteger("Ad account that owns the keyword."),
  adGroup: adGroupMinOutput,
  deleted: s.nullableBoolean("Whether the keyword has been deleted."),
  text: s.nullableString("The keyword text."),
  status: nullableEnum("Serving state of the keyword.", reportKeywordStatuses),
  bid: moneyOutput("Keyword-level bid amount in the ad account currency."),
  modificationTime: appleAdsDateTimeOutput("When the keyword was last modified."),
  creationTime: appleAdsDateTimeOutput("When the keyword was created."),
  displayStatus: s.nullableString("Computed display status of the keyword."),
};

const appsKeywordMetadata = looseResource(
  "Keyword attributes captured at report time, plus the groupBy dimension values applied to this row.",
  {
    ...sharedKeywordMetadataFields,
    matchType: nullableEnum("How the keyword matches search queries.", appsMatchTypes),
    countryOrRegion: dimensionValue("countryOrRegion"),
    deviceClass: dimensionValue("deviceClass"),
  },
);

const brandsKeywordMetadata = looseResource(
  "Apple Maps keyword attributes captured at report time, plus the groupBy dimension values applied to this row.",
  {
    ...sharedKeywordMetadataFields,
    matchType: nullableEnum("How the keyword matches search queries in Apple Maps campaigns.", brandsMatchTypes),
    countryOrRegion: dimensionValue("countryOrRegion"),
    deviceClass: dimensionValue("deviceClass"),
    locationId: dimensionValue("locationId"),
  },
);

const searchTermMetadataFields = (keyword: JsonSchema) => ({
  campaignId: s.nullableInteger("Campaign that owns the search term."),
  adGroupId: s.nullableInteger("Ad group that owns the search term."),
  adAccountId: s.nullableInteger("Ad account that owns the search term."),
  adGroup: adGroupMinOutput,
  searchTermText: s.nullableString("The user-entered query string."),
  searchTermSource: s.nullableString("Whether the search term came from a direct user search or an auto-match source."),
  keyword: s.nullable(keyword),
});

const appsSearchTermMetadata = looseResource(
  "Search term attributes captured at report time, plus the groupBy dimension values applied to this row.",
  {
    ...searchTermMetadataFields(appsKeywordMetadata),
    countryOrRegion: dimensionValue("countryOrRegion"),
    deviceClass: dimensionValue("deviceClass"),
  },
);

const brandsCampaignMetadata = looseResource(
  "Apple Maps campaign attributes captured at report time, plus the groupBy dimension values applied to this row.",
  {
    ...sharedCampaignMetadataFields,
    promotedObjectType: nullableEnum("What the campaign promotes. Apple Maps campaigns always report BUSINESS_BRAND.", [
      "BUSINESS_BRAND",
    ]),
    targeting: brandsTargetingOutput,
    ...brandsDimensionFields,
  },
);

const brandsAdGroupMetadata = looseResource(
  "Apple Maps ad group attributes captured at report time, plus the groupBy dimension values applied to this row.",
  {
    ...sharedAdGroupMetadataFields,
    targeting: brandsTargetingOutput,
    ...brandsDimensionFields,
  },
);

const brandsAdMetadata = looseResource(
  "Apple Maps ad attributes captured at report time, plus the groupBy dimension values applied to this row.",
  {
    ...sharedAdMetadataFields,
    creative: s.nullable(
      looseResource("Creative snapshot for the ad. Apple Maps ads carry no creativeSpec or destination.", {
        id: s.nullableInteger("System-assigned identifier for the creative."),
        creativeType: nullableEnum("Creative format.", brandsCreativeTypes),
        systemStatus: nullableEnum(
          "Whether the creative was eligible to serve at report time.",
          creativeSystemStatuses,
        ),
      }),
    ),
    ...brandsDimensionFields,
  },
);

const brandsSearchTermMetadata = looseResource(
  "Apple Maps search term attributes captured at report time, plus the groupBy dimension values applied to this row.",
  {
    ...searchTermMetadataFields(brandsKeywordMetadata),
    countryOrRegion: dimensionValue("countryOrRegion"),
    deviceClass: dimensionValue("deviceClass"),
    locationId: dimensionValue("locationId"),
  },
);

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

interface ReportActionOptions {
  name: string;
  operationType: ProviderActionDefinition["operationType"];
  description: string;
  inputDescription: string;
  outputDescription: string;
  rowsDescription: string;
  metadata: JsonSchema;
  metrics: (description: string) => JsonSchema;
  insights?: boolean;
  timeZones: readonly string[];
  timeZoneDescription: string;
  granularities: readonly string[];
  granularityDescription: string;
  groupByDimensions: readonly string[];
  groupByDescription: string;
  includeRows: readonly string[];
  includeRowsDescription: string;
}

const defineReportAction = (options: ReportActionOptions) =>
  defineProviderAction(service, {
    name: options.name,
    operationType: options.operationType,
    description: options.description,
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(options.inputDescription, reportInputs(options), { required: ["timeRange"] }),
    outputSchema: s.actionOutput(
      {
        rows: s.array(
          options.rowsDescription,
          looseResource("A single report row.", {
            metadata: s.nullable(options.metadata),
            totalMetrics: s.nullable(options.metrics("Metrics aggregated over the whole requested date range.")),
            granularMetrics: s.nullable(
              s.array(
                "Metrics broken down by the requested granularity, one entry per period. Apple Ads omits it when the request has no granularity.",
                options.metrics("Metrics for one period."),
              ),
            ),
            ...(options.insights ? { insights: keywordInsightsOutput } : {}),
          }),
        ),
        grandTotal: s.nullable(
          options.metrics("Totals across every row of the result set, or null when GRAND_TOTAL was not requested."),
        ),
        pagination: reportPaginationOutput,
      },
      options.outputDescription,
    ),
  });

const appsCampaignFilterNote =
  "Every App Store report request must carry a filter on campaignId; this action rejects a request without one before it reaches Apple Ads.";

export const appleAdsReportActions: readonly ProviderActionDefinition[] = [
  defineReportAction({
    name: "get_campaign_report",
    operationType: "read",
    description: `Retrieve App Store campaign performance, one row per campaign with metrics aggregated over the date range and optionally broken out by granularity and dimension. ${appsCampaignFilterNote}`,
    inputDescription: "Reporting query for App Store campaigns.",
    outputDescription: "A page of App Store campaign report rows.",
    rowsDescription: "Campaign report rows on this page.",
    metadata: appsCampaignMetadata,
    metrics: appsMetrics,
    timeZones: reportTimeZones,
    timeZoneDescription,
    granularities: reportGranularities,
    granularityDescription:
      "Time-series breakdown for granularMetrics. HOURLY needs a date range starting within the last 7 days, DAILY within the last 90 days and spanning more than one day, WEEKLY within the last 365 days with an end date at least 14 days in the past, and MONTHLY an end date at least 90 days in the past. Omit it to get a single aggregate in totalMetrics.",
    groupByDimensions: appsEntityGroupBy,
    groupByDescription:
      "Dimensions to break each campaign's metrics out by, producing one row per dimension value. Omit it to get one aggregate row per campaign.",
    includeRows: appsIncludeRows,
    includeRowsDescription:
      "Extra rows to include. GRAND_TOTAL adds a summary of every row; EMPTY_METRICS adds rows for campaigns with no activity and cannot be combined with groupBy.",
  }),
  defineReportAction({
    name: "get_ad_group_report",
    operationType: "read",
    description: `Retrieve App Store ad group performance, one row per ad group with metrics aggregated over the date range and optionally broken out by granularity and dimension. ${appsCampaignFilterNote} Add an adGroupId filter to narrow the report further.`,
    inputDescription: "Reporting query for App Store ad groups.",
    outputDescription: "A page of App Store ad group report rows.",
    rowsDescription: "Ad group report rows on this page.",
    metadata: appsAdGroupMetadata,
    metrics: appsMetrics,
    timeZones: reportTimeZones,
    timeZoneDescription,
    granularities: reportGranularities,
    granularityDescription:
      "Time-series breakdown for granularMetrics. HOURLY needs a date range starting within the last 7 days, DAILY within the last 90 days and spanning more than one day, WEEKLY within the last 365 days with an end date at least 14 days in the past, and MONTHLY an end date at least 90 days in the past. Omit it to get a single aggregate in totalMetrics.",
    groupByDimensions: appsEntityGroupBy,
    groupByDescription:
      "Dimensions to break each ad group's metrics out by, producing one row per dimension value. Omit it to get one aggregate row per ad group.",
    includeRows: appsIncludeRows,
    includeRowsDescription:
      "Extra rows to include. GRAND_TOTAL adds a summary of every row; EMPTY_METRICS adds rows for ad groups with no activity and cannot be combined with groupBy.",
  }),
  defineReportAction({
    name: "get_ad_report",
    operationType: "read",
    description: `Retrieve App Store ad performance, one row per ad with metrics aggregated over the date range. ${appsCampaignFilterNote} Ad-level reports do not support HOURLY granularity or the demographic dimensions.`,
    inputDescription: "Reporting query for App Store ads.",
    outputDescription: "A page of App Store ad report rows.",
    rowsDescription: "Ad report rows on this page.",
    metadata: appsAdMetadata,
    metrics: appsMetrics,
    timeZones: reportTimeZones,
    timeZoneDescription,
    granularities: dailyOrCoarserGranularities,
    granularityDescription:
      "Time-series breakdown for granularMetrics. Ad-level reports have no HOURLY option: DAILY needs a date range starting within the last 90 days and spanning more than one day, WEEKLY within the last 365 days with an end date at least 14 days in the past, and MONTHLY an end date at least 90 days in the past. Omit it to get a single aggregate in totalMetrics.",
    groupByDimensions: appsAdGroupBy,
    groupByDescription:
      "Dimensions to break each ad's metrics out by. Ad-level reports support storefront and countryOrRegion only.",
    includeRows: appsIncludeRows,
    includeRowsDescription:
      "Extra rows to include. GRAND_TOTAL adds a summary of every row; EMPTY_METRICS adds rows for ads with no activity and cannot be combined with groupBy.",
  }),
  defineReportAction({
    name: "get_keyword_report",
    operationType: "read",
    description: `Retrieve App Store keyword performance, one row per keyword with metrics aggregated over the date range and an optional bid recommendation. ${appsCampaignFilterNote} Add an adGroupId filter to keep the report to a single ad group.`,
    inputDescription: "Reporting query for App Store keywords.",
    outputDescription: "A page of App Store keyword report rows.",
    rowsDescription: "Keyword report rows on this page.",
    metadata: appsKeywordMetadata,
    metrics: appsMetrics,
    insights: true,
    timeZones: reportTimeZones,
    timeZoneDescription,
    granularities: reportGranularities,
    granularityDescription:
      "Time-series breakdown for granularMetrics. HOURLY needs a date range starting within the last 7 days, DAILY within the last 90 days and spanning more than one day, WEEKLY within the last 365 days with an end date at least 14 days in the past, and MONTHLY an end date at least 90 days in the past. Omit it to get a single aggregate in totalMetrics.",
    groupByDimensions: appsTermGroupBy,
    groupByDescription:
      "Dimensions to break each keyword's metrics out by. Keyword reports support deviceClass, storefront and countryOrRegion only.",
    includeRows: appsIncludeRows,
    includeRowsDescription:
      "Extra rows to include. GRAND_TOTAL adds a summary of every row; EMPTY_METRICS adds rows for keywords with no activity and cannot be combined with groupBy.",
  }),
  defineReportAction({
    name: "get_search_term_report",
    operationType: "read",
    description: `Retrieve the App Store search terms that matched a keyword and produced an impression, one row per search term with the keyword it matched. ${appsCampaignFilterNote} Apple Ads suppresses or aggregates low-volume terms to protect user privacy.`,
    inputDescription: "Reporting query for App Store search terms.",
    outputDescription: "A page of App Store search term report rows.",
    rowsDescription: "Search term report rows on this page.",
    metadata: appsSearchTermMetadata,
    metrics: appsMetrics,
    timeZones: searchTermTimeZones,
    timeZoneDescription: searchTermTimeZoneDescription,
    granularities: dailyOrCoarserGranularities,
    granularityDescription:
      "Time-series breakdown for granularMetrics. Search term reports have no HOURLY option: DAILY needs a date range starting within the last 90 days and spanning more than one day, WEEKLY within the last 365 days with an end date at least 14 days in the past, and MONTHLY an end date at least 90 days in the past. Omit it to get a single aggregate in totalMetrics.",
    groupByDimensions: appsTermGroupBy,
    groupByDescription:
      "Dimensions to break each search term's metrics out by. Search term reports support deviceClass, storefront and countryOrRegion only.",
    includeRows: grandTotalIncludeRows,
    includeRowsDescription:
      "Extra rows to include. GRAND_TOTAL adds a summary of every row. Search term reports do not support EMPTY_METRICS.",
  }),
  defineReportAction({
    name: "get_brand_campaign_report",
    operationType: "read",
    description:
      "Retrieve Apple Maps campaign performance, one row per campaign with spend, engagement and Apple Maps action metrics aggregated over the date range. Filter on campaignId to scope the report to specific campaigns.",
    inputDescription: "Reporting query for Apple Maps campaigns.",
    outputDescription: "A page of Apple Maps campaign report rows.",
    rowsDescription: "Campaign report rows on this page.",
    metadata: brandsCampaignMetadata,
    metrics: brandsMetrics,
    timeZones: reportTimeZones,
    timeZoneDescription,
    granularities: reportGranularities,
    granularityDescription:
      "Time-series breakdown for granularMetrics. HOURLY needs a date range starting within the last 7 days, DAILY within the last 90 days and spanning more than one day, WEEKLY within the last 365 days with an end date at least 14 days in the past, and MONTHLY an end date at least 90 days in the past. Omit it to get a single aggregate in totalMetrics.",
    groupByDimensions: brandsEntityGroupBy,
    groupByDescription:
      "Dimensions to break each campaign's metrics out by: device type, business location or ad placement.",
    includeRows: grandTotalIncludeRows,
    includeRowsDescription:
      "Extra rows to include. GRAND_TOTAL adds a summary of every row. Apple Maps reports do not support EMPTY_METRICS.",
  }),
  defineReportAction({
    name: "get_brand_ad_group_report",
    operationType: "read",
    description:
      "Retrieve Apple Maps ad group performance, one row per ad group with spend, engagement and Apple Maps action metrics aggregated over the date range. Filter on campaignId or adGroupId to scope the report.",
    inputDescription: "Reporting query for Apple Maps ad groups.",
    outputDescription: "A page of Apple Maps ad group report rows.",
    rowsDescription: "Ad group report rows on this page.",
    metadata: brandsAdGroupMetadata,
    metrics: brandsMetrics,
    timeZones: reportTimeZones,
    timeZoneDescription,
    granularities: reportGranularities,
    granularityDescription:
      "Time-series breakdown for granularMetrics. HOURLY needs a date range starting within the last 7 days, DAILY within the last 90 days and spanning more than one day, WEEKLY within the last 365 days with an end date at least 14 days in the past, and MONTHLY an end date at least 90 days in the past. Omit it to get a single aggregate in totalMetrics.",
    groupByDimensions: brandsEntityGroupBy,
    groupByDescription:
      "Dimensions to break each ad group's metrics out by: device type, business location or ad placement.",
    includeRows: grandTotalIncludeRows,
    includeRowsDescription:
      "Extra rows to include. GRAND_TOTAL adds a summary of every row. Apple Maps reports do not support EMPTY_METRICS.",
  }),
  defineReportAction({
    name: "get_brand_ad_report",
    operationType: "read",
    description:
      "Retrieve Apple Maps ad performance, one row per ad with its creative snapshot and metrics aggregated over the date range. Filter on campaignId or adGroupId to scope the report. Ad-level reports do not support HOURLY granularity.",
    inputDescription: "Reporting query for Apple Maps ads.",
    outputDescription: "A page of Apple Maps ad report rows.",
    rowsDescription: "Ad report rows on this page.",
    metadata: brandsAdMetadata,
    metrics: brandsMetrics,
    timeZones: reportTimeZones,
    timeZoneDescription,
    granularities: dailyOrCoarserGranularities,
    granularityDescription:
      "Time-series breakdown for granularMetrics. Ad-level reports have no HOURLY option: DAILY needs a date range starting within the last 90 days and spanning more than one day, WEEKLY within the last 365 days with an end date at least 14 days in the past, and MONTHLY an end date at least 90 days in the past. Omit it to get a single aggregate in totalMetrics.",
    groupByDimensions: brandsEntityGroupBy,
    groupByDescription: "Dimensions to break each ad's metrics out by: device type, business location or ad placement.",
    includeRows: grandTotalIncludeRows,
    includeRowsDescription:
      "Extra rows to include. GRAND_TOTAL adds a summary of every row. Apple Maps reports do not support EMPTY_METRICS.",
  }),
  defineReportAction({
    name: "get_brand_keyword_report",
    operationType: "read",
    description:
      "Retrieve Apple Maps keyword performance, one row per keyword with metrics aggregated over the date range and an optional bid recommendation. Always filter on campaignId or adGroupId so the report does not span every keyword in the ad account.",
    inputDescription: "Reporting query for Apple Maps keywords.",
    outputDescription: "A page of Apple Maps keyword report rows.",
    rowsDescription: "Keyword report rows on this page.",
    metadata: brandsKeywordMetadata,
    metrics: brandsMetrics,
    insights: true,
    timeZones: reportTimeZones,
    timeZoneDescription,
    granularities: reportGranularities,
    granularityDescription:
      "Time-series breakdown for granularMetrics. HOURLY needs a date range starting within the last 7 days, DAILY within the last 90 days and spanning more than one day, WEEKLY within the last 365 days with an end date at least 14 days in the past, and MONTHLY an end date at least 90 days in the past. Omit it to get a single aggregate in totalMetrics.",
    groupByDimensions: brandsTermGroupBy,
    groupByDescription:
      "Dimensions to break each keyword's metrics out by. Apple Maps keyword reports support deviceClass only; locationId and supplyPlacement are not available at this level.",
    includeRows: grandTotalIncludeRows,
    includeRowsDescription:
      "Extra rows to include. GRAND_TOTAL adds a summary of every row. Apple Maps reports do not support EMPTY_METRICS.",
  }),
  defineReportAction({
    name: "get_brand_search_term_report",
    operationType: "read",
    description:
      "Retrieve the Apple Maps search terms that matched a keyword and produced an impression on the Search Results placement, one row per search term with the keyword it matched. Always filter on campaignId or adGroupId. Apple Ads suppresses or aggregates low-volume terms to protect user privacy.",
    inputDescription: "Reporting query for Apple Maps search terms.",
    outputDescription: "A page of Apple Maps search term report rows.",
    rowsDescription: "Search term report rows on this page.",
    metadata: brandsSearchTermMetadata,
    metrics: brandsMetrics,
    timeZones: searchTermTimeZones,
    timeZoneDescription: searchTermTimeZoneDescription,
    granularities: dailyOrCoarserGranularities,
    granularityDescription:
      "Time-series breakdown for granularMetrics. Search term reports have no HOURLY option: DAILY needs a date range starting within the last 90 days and spanning more than one day, WEEKLY within the last 365 days with an end date at least 14 days in the past, and MONTHLY an end date at least 90 days in the past. Omit it to get a single aggregate in totalMetrics.",
    groupByDimensions: brandsTermGroupBy,
    groupByDescription:
      "Dimensions to break each search term's metrics out by. Apple Maps search term reports support deviceClass only; locationId and supplyPlacement are not available at this level.",
    includeRows: grandTotalIncludeRows,
    includeRowsDescription:
      "Extra rows to include. GRAND_TOTAL adds a summary of every row. Apple Maps reports do not support EMPTY_METRICS.",
  }),
];

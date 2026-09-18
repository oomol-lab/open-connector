import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "tiktok_business" as const;

const businessReadPermissions = ["advertiser.read", "1", "2"];
const reportingReadPermissions = ["report.read", "4"];
const readScope = businessReadPermissions;
const reportScope = reportingReadPermissions;

const idField = (description: string) => s.string(description, { minLength: 1 });
const advertiserIdField = idField("The TikTok advertiser ID that owns the GMV Max resource.");
const storeIdField = idField("The TikTok Shop store ID used by the GMV Max workflow.");
const campaignIdField = idField("The TikTok GMV Max campaign ID.");
const storeAuthorizedBcIdField = idField("The Business Center ID authorized to manage the TikTok Shop store.");
const requestIdField = s.string("TikTok request ID for tracing this API call.");
const rawObjectSchema = s.looseObject("The raw TikTok Business API payload for this resource.");
const rawDataSchema = s.looseObject("The raw TikTok Business API data object.");
const pageField = s.integer("1-based page number to retrieve.", { minimum: 1 });
const pageSizeField = s.integer("Maximum number of rows to return per page.", {
  minimum: 1,
  maximum: 1000,
});

const advertiserListInputSchema = s.object("TikTok advertiser list request.", {});

const contextInfoSchema = s.object(
  "Optional request context forwarded to TikTok Business API.",
  {
    appId: s.integer("TikTok app ID to include in context_info."),
    coreUserId: s.integer("TikTok core user ID to include in context_info."),
    developerId: s.integer("TikTok developer ID to include in context_info."),
    xForwardedFor: s.string("Original client IP address for x_forwarded_for."),
    xRealIp: s.string("Original client IP address for x_real_ip."),
    userAgent: s.string("Original client user agent."),
    referer: s.string("Original request referer."),
  },
  {
    optional: ["appId", "coreUserId", "developerId", "xForwardedFor", "xRealIp", "userAgent", "referer"],
  },
);

const baseAdvertiserInputSchema = s.object("TikTok advertiser-scoped GMV Max request.", {
  advertiserId: advertiserIdField,
});

const storeScopedInputSchema = s.object("TikTok store-scoped GMV Max request.", {
  advertiserId: advertiserIdField,
  storeId: storeIdField,
});

const campaignFilteringSchema = s.object(
  "Optional filters for the TikTok campaign list query.",
  {
    campaignIds: s.array("Filter campaigns to these TikTok campaign IDs.", idField("A TikTok campaign ID."), {
      minItems: 1,
      maxItems: 100,
    }),
    campaignName: s.string("Filter campaigns by campaign name.", { minLength: 1 }),
    primaryStatus: s.string("Filter campaigns by TikTok primary status.", { minLength: 1 }),
    secondaryStatus: s.string("Filter campaigns by TikTok secondary status.", { minLength: 1 }),
    objectiveType: s.string("Filter campaigns by objective type.", { minLength: 1 }),
    campaignType: s.string("Filter campaigns by campaign type.", { minLength: 1 }),
    buyingTypes: s.array(
      "Filter campaigns by buying type.",
      s.string("A TikTok campaign buying type.", { minLength: 1 }),
      { minItems: 1, maxItems: 100 },
    ),
    campaignSystemOrigins: s.array(
      "Filter campaigns by TikTok campaign system origin.",
      s.string("A TikTok campaign system origin.", { minLength: 1 }),
      { minItems: 1, maxItems: 100 },
    ),
    campaignProductSource: s.string("Filter campaigns by campaign product source.", {
      minLength: 1,
    }),
    creativeCampaignType: s.array(
      "Filter campaigns by TikTok creative campaign type.",
      s.string("A TikTok creative campaign type.", { minLength: 1 }),
      { minItems: 1, maxItems: 100 },
    ),
    optimizationGoal: s.string("Filter campaigns by optimization goal.", { minLength: 1 }),
    salesDestination: s.string("Filter campaigns by sales destination.", { minLength: 1 }),
    creationFilterStartTime: s.string("Filter campaigns created at or after this time.", {
      minLength: 1,
    }),
    creationFilterEndTime: s.string("Filter campaigns created at or before this time.", {
      minLength: 1,
    }),
    isSmartPerformanceCampaign: s.boolean("Whether to filter Smart Performance Campaigns."),
    splitTestEnabled: s.boolean("Whether to filter campaigns by split test participation."),
  },
  {
    optional: [
      "campaignIds",
      "campaignName",
      "primaryStatus",
      "secondaryStatus",
      "objectiveType",
      "campaignType",
      "buyingTypes",
      "campaignSystemOrigins",
      "campaignProductSource",
      "creativeCampaignType",
      "optimizationGoal",
      "salesDestination",
      "creationFilterStartTime",
      "creationFilterEndTime",
      "isSmartPerformanceCampaign",
      "splitTestEnabled",
    ],
  },
);

const campaignListInputSchema = s.object(
  "TikTok campaign list request.",
  {
    advertiserId: advertiserIdField,
    filtering: campaignFilteringSchema,
    fields: s.array("TikTok campaign fields to return.", s.string("A TikTok campaign field name.", { minLength: 1 }), {
      minItems: 1,
      maxItems: 100,
    }),
    excludeFieldTypesInResponse: s.array(
      "TikTok field types to exclude from the campaign response.",
      s.string("A TikTok field type name.", { minLength: 1 }),
      { minItems: 1, maxItems: 20 },
    ),
    page: pageField,
    pageSize: pageSizeField,
  },
  {
    optional: ["filtering", "fields", "excludeFieldTypesInResponse", "page", "pageSize"],
  },
);

const identityInputSchema = s.object("TikTok GMV Max identity lookup request.", {
  advertiserId: advertiserIdField,
  storeId: storeIdField,
  storeAuthorizedBcId: storeAuthorizedBcIdField,
});

const gmvMaxVideoInputSchema = s.object(
  "TikTok GMV Max video lookup request.",
  {
    advertiserId: advertiserIdField,
    storeId: storeIdField,
    storeAuthorizedBcId: storeAuthorizedBcIdField,
    spuIdList: s.array("TikTok SPU IDs used to filter GMV Max videos.", idField("A TikTok SPU ID."), {
      minItems: 1,
      maxItems: 100,
    }),
    identityList: s.array("TikTok identity objects used to filter GMV Max videos.", rawObjectSchema, {
      minItems: 1,
      maxItems: 100,
    }),
    needAuthCodeVideo: s.boolean("Whether to include authorization-code videos."),
    customPostsEligible: s.boolean("Whether to return custom-post eligible videos."),
    sortField: s.string("TikTok video sort field.", { minLength: 1 }),
    sortType: s.stringEnum("TikTok video sort direction.", ["ASC", "DESC"]),
    keyword: s.string("Keyword used to search GMV Max videos.", { minLength: 1 }),
    page: pageField,
    pageSize: pageSizeField,
  },
  {
    optional: [
      "spuIdList",
      "identityList",
      "needAuthCodeVideo",
      "customPostsEligible",
      "sortField",
      "sortType",
      "keyword",
      "page",
      "pageSize",
    ],
  },
);

const occupiedCustomShopAdsInputSchema = s.object("TikTok GMV Max occupied custom shop ads lookup request.", {
  advertiserId: advertiserIdField,
  storeId: storeIdField,
  assetIds: s.array(
    "TikTok asset IDs to inspect for custom shop ads occupation.",
    idField("A TikTok occupied asset ID."),
    { minItems: 1, maxItems: 1 },
  ),
  occupiedAssetType: s.string("TikTok occupied asset type, such as SPU.", { minLength: 1 }),
});

const customAnchorVideoListInputSchema = s.object("TikTok GMV Max custom anchor video list request.", {
  advertiserId: advertiserIdField,
  campaignCustomAnchorVideoId: idField("The TikTok GMV Max custom anchor video list ID."),
  customAnchorVideoList: s.array("Custom anchor video filters forwarded to TikTok.", rawObjectSchema, {
    minItems: 1,
    maxItems: 100,
  }),
});

const shopVideoAnchorsInputSchema = s.object(
  "TikTok GMV Max shop video anchor request.",
  {
    advertiserId: advertiserIdField,
    storeId: storeIdField,
    storeAuthorizedBcId: storeAuthorizedBcIdField,
    videoIds: s.array("TikTok shop video IDs to inspect for GMV Max anchors.", idField("A TikTok shop video ID."), {
      minItems: 1,
      maxItems: 100,
    }),
    page: pageField,
    pageSize: pageSizeField,
  },
  {
    optional: ["videoIds", "page", "pageSize"],
  },
);

const campaignInfoInputSchema = s.object("TikTok GMV Max campaign info request.", {
  advertiserId: advertiserIdField,
  campaignId: campaignIdField,
});

const sessionListInputSchema = s.object("TikTok GMV Max campaign session list request.", {
  advertiserId: advertiserIdField,
  campaignId: campaignIdField,
});

const sessionGetInputSchema = s.object("TikTok GMV Max campaign session detail request.", {
  advertiserId: advertiserIdField,
  sessionIds: s.array(
    "The GMV Max session IDs to retrieve. TikTok allows up to 20 IDs per request.",
    idField("A GMV Max session ID."),
    { minItems: 1, maxItems: 20 },
  ),
});

const bidRecommendationInputSchema = s.object(
  "TikTok GMV Max bid recommendation request.",
  {
    advertiserId: advertiserIdField,
    storeId: storeIdField,
    shoppingAdsType: s.stringEnum("GMV Max shopping ads type.", ["LIVE", "PRODUCT"]),
    optimizationGoal: s.stringEnum("GMV Max optimization goal.", ["VALUE"]),
    itemGroupIds: s.array(
      "Optional TikTok item group IDs used to narrow the recommendation.",
      idField("A TikTok item group ID."),
      { minItems: 1, maxItems: 50 },
    ),
    identityId: idField("Optional identity ID used to narrow the recommendation."),
  },
  { optional: ["itemGroupIds", "identityId"] },
);

const reportFilteringSchema = s.object(
  "Optional filters for the GMV Max report query.",
  {
    campaignIds: s.array("Filter report rows to these GMV Max campaign IDs.", idField("A GMV Max campaign ID."), {
      minItems: 1,
      maxItems: 100,
    }),
    campaignName: s.string("Filter report rows by campaign name.", { minLength: 1 }),
    campaignStatuses: s.array(
      "Filter report rows by TikTok campaign delivery status.",
      s.stringEnum("TikTok campaign delivery status.", ["delete", "delivery_ok", "disable", "not_delivery"]),
      { minItems: 1, maxItems: 4 },
    ),
    gmvMaxPromotionTypes: s.array(
      "Filter report rows by GMV Max promotion type.",
      s.stringEnum("GMV Max promotion type.", ["PRODUCT", "LIVE"]),
      { minItems: 1, maxItems: 2 },
    ),
    itemGroupIds: s.array("Filter report rows to these item group IDs.", idField("A TikTok item group ID."), {
      minItems: 1,
      maxItems: 100,
    }),
    itemIds: s.array("Filter report rows to these TikTok item IDs.", idField("A TikTok item ID."), {
      minItems: 1,
      maxItems: 100,
    }),
    creativeTypes: s.array(
      "Filter report rows by creative source type.",
      s.stringEnum("TikTok creative source type.", ["ADS_AND_ORGANIC", "ORGANIC", "REMOVED"]),
      { minItems: 1, maxItems: 1 },
    ),
    roomIds: s.array("Filter report rows to these live room IDs.", idField("A live room ID."), {
      minItems: 1,
      maxItems: 100,
    }),
    searchWord: s.string("Free-text search term for report filtering.", { minLength: 1 }),
    creativeDeliveryStatuses: s.array(
      "Filter report rows by creative delivery status code.",
      idField("A TikTok creative delivery status code."),
      { minItems: 1, maxItems: 10 },
    ),
  },
  {
    optional: [
      "campaignIds",
      "campaignName",
      "campaignStatuses",
      "gmvMaxPromotionTypes",
      "itemGroupIds",
      "itemIds",
      "creativeTypes",
      "roomIds",
      "searchWord",
      "creativeDeliveryStatuses",
    ],
  },
);

const reportInputSchema = s.object(
  "TikTok GMV Max report request.",
  {
    advertiserId: advertiserIdField,
    storeIds: s.array(
      "The TikTok Shop store IDs to include. TikTok GMV Max supports one store ID per request.",
      storeIdField,
      { minItems: 1, maxItems: 1 },
    ),
    dimensions: s.array(
      "Report dimensions to group by, such as campaign_id.",
      s.string("A TikTok GMV Max report dimension.", { minLength: 1 }),
      { minItems: 1, maxItems: 3 },
    ),
    metrics: s.array(
      "Report metrics to return, such as spend or gross_revenue.",
      s.string("A TikTok GMV Max report metric.", { minLength: 1 }),
      { minItems: 1, maxItems: 100 },
    ),
    startDate: s.date("Report start date in YYYY-MM-DD format."),
    endDate: s.date("Report end date in YYYY-MM-DD format."),
    enableTotalMetrics: s.boolean("Whether TikTok should include total metric rows."),
    filtering: reportFilteringSchema,
    sortField: s.string("Metric or dimension field used for sorting.", { minLength: 1 }),
    sortType: s.stringEnum("Report sort direction.", ["ASC", "DESC"]),
    page: pageField,
    pageSize: pageSizeField,
    contextInfo: contextInfoSchema,
  },
  {
    optional: ["enableTotalMetrics", "filtering", "sortField", "sortType", "page", "pageSize", "contextInfo"],
  },
);

const storeSchema = s.object(
  "A normalized TikTok Shop store available to GMV Max.",
  {
    storeId: s.string("TikTok Shop store ID."),
    storeName: s.string("TikTok Shop store name."),
    storeCode: s.string("TikTok Shop store code."),
    storeStatus: s.string("TikTok Shop status."),
    storeRole: s.string("Role of the connected user for this store."),
    storeAuthorizedBcId: s.string("Business Center ID authorized for this store."),
    gmvMaxAvailable: s.boolean("Whether GMV Max is available for this store."),
    ownerBusinessCenter: s.boolean("Whether the authorized Business Center owns the store."),
    targetingRegionCodes: s.array(
      "Region codes where the store can target GMV Max campaigns.",
      s.string("A targeting region code."),
    ),
    thumbnailUrl: s.string("Store thumbnail image URL."),
    raw: rawObjectSchema,
  },
  {
    optional: [
      "storeCode",
      "storeStatus",
      "storeRole",
      "storeAuthorizedBcId",
      "gmvMaxAvailable",
      "ownerBusinessCenter",
      "targetingRegionCodes",
      "thumbnailUrl",
    ],
  },
);

const storesOutputSchema = s.object("TikTok GMV Max store list response.", {
  stores: s.array("GMV Max stores returned by TikTok.", storeSchema),
  requestId: requestIdField,
  raw: rawDataSchema,
});

const advertisersOutputSchema = s.object("TikTok advertiser list response.", {
  advertisers: s.array("Advertisers authorized for the connected TikTok user.", rawObjectSchema),
  requestId: requestIdField,
  raw: rawDataSchema,
});

const campaignsOutputSchema = s.object("TikTok campaign list response.", {
  campaigns: s.array("Campaigns returned by TikTok.", rawObjectSchema),
  pageInfo: rawObjectSchema,
  requestId: requestIdField,
  raw: rawDataSchema,
});

const shopAdUsageOutputSchema = s.object("TikTok GMV Max shop ad usage response.", {
  runningCustomShopAds: s.boolean("Whether the store is running custom shop ads."),
  promoteAllProductsAllowed: s.boolean("Whether all-product promotion is allowed."),
  requestId: requestIdField,
  raw: rawDataSchema,
});

const exclusiveAuthorizationOutputSchema = s.object(
  "TikTok GMV Max exclusive authorization response.",
  {
    advertiserId: s.string("TikTok advertiser ID."),
    advertiserName: s.string("TikTok advertiser name."),
    advertiserStatus: s.string("TikTok advertiser status."),
    authorizationStatus: s.string("GMV Max authorization status."),
    identityId: s.string("Identity ID holding the exclusive authorization."),
    storeId: s.string("TikTok Shop store ID."),
    requestId: requestIdField,
    raw: rawDataSchema,
  },
  {
    optional: ["advertiserId", "advertiserName", "advertiserStatus", "authorizationStatus", "identityId", "storeId"],
  },
);

const identitySchema = s.object(
  "A normalized TikTok identity available for GMV Max.",
  {
    identityId: s.string("TikTok identity ID."),
    identityType: s.string("TikTok identity type."),
    displayName: s.string("Identity display name."),
    userName: s.string("Identity username."),
    profileImage: s.string("Identity profile image URL."),
    storeId: s.string("TikTok Shop store ID associated with the identity."),
    identityAuthorizedBcId: s.string("Business Center ID authorized for the identity."),
    identityAuthorizedShopId: s.string("Shop authorization ID for the identity."),
    liveGmvMaxAvailable: s.boolean("Whether the identity is available for live GMV Max."),
    productGmvMaxAvailable: s.boolean("Whether the identity is available for product GMV Max."),
    runningCustomShopAds: s.boolean("Whether the identity is already running custom shop ads."),
    unavailableReason: s.string("Reason why the identity is unavailable."),
    raw: rawObjectSchema,
  },
  {
    optional: [
      "identityType",
      "displayName",
      "userName",
      "profileImage",
      "storeId",
      "identityAuthorizedBcId",
      "identityAuthorizedShopId",
      "liveGmvMaxAvailable",
      "productGmvMaxAvailable",
      "runningCustomShopAds",
      "unavailableReason",
    ],
  },
);

const identitiesOutputSchema = s.object("TikTok GMV Max identity response.", {
  identities: s.array("GMV Max identities returned by TikTok.", identitySchema),
  requestId: requestIdField,
  raw: rawDataSchema,
});

const campaignInfoOutputSchema = s.object("TikTok GMV Max campaign info response.", {
  campaign: rawObjectSchema,
  requestId: requestIdField,
  raw: rawDataSchema,
});

const sessionSchema = s.object(
  "A normalized TikTok GMV Max session.",
  {
    sessionId: s.string("TikTok GMV Max session ID."),
    campaignId: s.string("TikTok GMV Max campaign ID."),
    bidType: s.string("TikTok GMV Max session bid type."),
    budget: s.unknown("TikTok GMV Max session budget."),
    scheduleType: s.string("TikTok GMV Max session schedule type."),
    scheduleStartTime: s.unknown("Session start time returned by TikTok."),
    scheduleEndTime: s.unknown("Session end time returned by TikTok."),
    productList: s.array("Products attached to this GMV Max session.", rawObjectSchema),
    itemId: s.string("TikTok item ID attached to this session."),
    raw: rawObjectSchema,
  },
  {
    optional: [
      "campaignId",
      "bidType",
      "budget",
      "scheduleType",
      "scheduleStartTime",
      "scheduleEndTime",
      "productList",
      "itemId",
    ],
  },
);

const sessionsOutputSchema = s.object("TikTok GMV Max sessions response.", {
  sessions: s.array("GMV Max sessions returned by TikTok.", sessionSchema),
  requestId: requestIdField,
  raw: rawDataSchema,
});

const bidRecommendationOutputSchema = s.object("TikTok GMV Max bid recommendation response.", {
  budget: s.unknown("Recommended or reference budget returned by TikTok."),
  cpaBid: s.unknown("Recommended CPA bid returned by TikTok."),
  roasBid: s.unknown("Recommended ROAS bid returned by TikTok."),
  requestId: requestIdField,
  raw: rawDataSchema,
});

const videosOutputSchema = s.object("TikTok GMV Max videos response.", {
  videos: s.array("GMV Max videos returned by TikTok.", rawObjectSchema),
  pageInfo: rawObjectSchema,
  requestId: requestIdField,
  raw: rawDataSchema,
});

const occupiedCustomShopAdsOutputSchema = s.object("TikTok GMV Max occupied custom shop ads response.", {
  occupiedCustomShopAds: s.array("Custom shop ads occupying the requested TikTok assets.", rawObjectSchema),
  requestId: requestIdField,
  raw: rawDataSchema,
});

const customAnchorVideoListOutputSchema = s.object("TikTok GMV Max custom anchor video list response.", {
  customAnchorVideos: s.array("Custom anchor videos returned by TikTok.", rawObjectSchema),
  requestId: requestIdField,
  raw: rawDataSchema,
});

const shopVideoAnchorsOutputSchema = s.object("TikTok GMV Max shop video anchor response.", {
  videoAnchors: s.array("Shop video anchors returned by TikTok.", rawObjectSchema),
  pageInfo: rawObjectSchema,
  requestId: requestIdField,
  raw: rawDataSchema,
});

const reportOutputSchema = s.object("TikTok GMV Max report response.", {
  rows: s.array("Report rows returned by TikTok.", rawObjectSchema),
  pageInfo: rawObjectSchema,
  totalMetrics: rawObjectSchema,
  requestId: requestIdField,
  raw: rawDataSchema,
});

interface TikTokBusinessActionSpec {
  name: TikTokBusinessActionName;
  operationType: ProviderActionDefinition["operationType"];
  description: string;
  requiredScopes: string[];
  providerPermissions: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

const actionDefinitions: TikTokBusinessActionSpec[] = [
  {
    name: "list_advertisers",
    operationType: "read",
    description: "List TikTok advertisers authorized for the connected TikTok Business user.",
    requiredScopes: readScope,
    providerPermissions: businessReadPermissions,
    inputSchema: advertiserListInputSchema,
    outputSchema: advertisersOutputSchema,
  },
  {
    name: "list_campaigns",
    operationType: "read",
    description: "List TikTok campaigns for an advertiser so users can discover campaign IDs.",
    requiredScopes: readScope,
    providerPermissions: businessReadPermissions,
    inputSchema: campaignListInputSchema,
    outputSchema: campaignsOutputSchema,
  },
  {
    name: "list_gmv_max_stores",
    operationType: "read",
    description: "List TikTok Shop stores available to a TikTok GMV Max advertiser.",
    requiredScopes: readScope,
    providerPermissions: businessReadPermissions,
    inputSchema: baseAdvertiserInputSchema,
    outputSchema: storesOutputSchema,
  },
  {
    name: "check_gmv_max_shop_ad_usage",
    operationType: "read",
    description:
      "Check whether a TikTok Shop store is already using custom shop ads and can promote all products with GMV Max.",
    requiredScopes: readScope,
    providerPermissions: businessReadPermissions,
    inputSchema: storeScopedInputSchema,
    outputSchema: shopAdUsageOutputSchema,
  },
  {
    name: "get_gmv_max_exclusive_authorization",
    operationType: "read",
    description: "Get TikTok GMV Max exclusive authorization status for a store.",
    requiredScopes: readScope,
    providerPermissions: businessReadPermissions,
    inputSchema: identityInputSchema,
    outputSchema: exclusiveAuthorizationOutputSchema,
  },
  {
    name: "get_gmv_max_identities",
    operationType: "read",
    description: "List TikTok identities available for a GMV Max store.",
    requiredScopes: readScope,
    providerPermissions: businessReadPermissions,
    inputSchema: identityInputSchema,
    outputSchema: identitiesOutputSchema,
  },
  {
    name: "get_gmv_max_videos",
    operationType: "read",
    description: "Get TikTok GMV Max videos available for a store, identity, or SPU filter.",
    requiredScopes: readScope,
    providerPermissions: businessReadPermissions,
    inputSchema: gmvMaxVideoInputSchema,
    outputSchema: videosOutputSchema,
  },
  {
    name: "list_gmv_max_occupied_custom_shop_ads",
    operationType: "read",
    description: "List custom shop ads occupying TikTok assets before GMV Max setup.",
    requiredScopes: readScope,
    providerPermissions: businessReadPermissions,
    inputSchema: occupiedCustomShopAdsInputSchema,
    outputSchema: occupiedCustomShopAdsOutputSchema,
  },
  {
    name: "get_gmv_max_custom_anchor_video_list",
    operationType: "read",
    description: "Get TikTok GMV Max custom anchor videos for campaign creation discovery.",
    requiredScopes: readScope,
    providerPermissions: businessReadPermissions,
    inputSchema: customAnchorVideoListInputSchema,
    outputSchema: customAnchorVideoListOutputSchema,
  },
  {
    name: "get_gmv_max_shop_video_anchors",
    operationType: "read",
    description: "Get TikTok GMV Max shop video anchors for campaign creation discovery.",
    requiredScopes: readScope,
    providerPermissions: businessReadPermissions,
    inputSchema: shopVideoAnchorsInputSchema,
    outputSchema: shopVideoAnchorsOutputSchema,
  },
  {
    name: "get_gmv_max_campaign_info",
    operationType: "read",
    description: "Get detailed information for a TikTok GMV Max campaign.",
    requiredScopes: readScope,
    providerPermissions: businessReadPermissions,
    inputSchema: campaignInfoInputSchema,
    outputSchema: campaignInfoOutputSchema,
  },
  {
    name: "list_gmv_max_sessions",
    operationType: "read",
    description: "List TikTok GMV Max campaign sessions for a campaign.",
    requiredScopes: readScope,
    providerPermissions: businessReadPermissions,
    inputSchema: sessionListInputSchema,
    outputSchema: sessionsOutputSchema,
  },
  {
    name: "get_gmv_max_sessions",
    operationType: "read",
    description: "Get TikTok GMV Max campaign session details by session ID.",
    requiredScopes: readScope,
    providerPermissions: businessReadPermissions,
    inputSchema: sessionGetInputSchema,
    outputSchema: sessionsOutputSchema,
  },
  {
    name: "get_gmv_max_bid_recommendation",
    operationType: "read",
    description: "Get TikTok GMV Max budget and bid recommendations before campaign changes.",
    requiredScopes: readScope,
    providerPermissions: businessReadPermissions,
    inputSchema: bidRecommendationInputSchema,
    outputSchema: bidRecommendationOutputSchema,
  },
  {
    name: "get_gmv_max_report",
    operationType: "read",
    description: "Get TikTok GMV Max reporting rows for a store and date range.",
    requiredScopes: reportScope,
    providerPermissions: reportingReadPermissions,
    inputSchema: reportInputSchema,
    outputSchema: reportOutputSchema,
  },
];

export const tiktokBusinessActions: ProviderActionDefinition[] = actionDefinitions.map((definition) =>
  defineProviderAction(service, definition),
);

export type TikTokBusinessActionName =
  | "list_advertisers"
  | "list_campaigns"
  | "list_gmv_max_stores"
  | "check_gmv_max_shop_ad_usage"
  | "get_gmv_max_exclusive_authorization"
  | "get_gmv_max_identities"
  | "get_gmv_max_videos"
  | "list_gmv_max_occupied_custom_shop_ads"
  | "get_gmv_max_custom_anchor_video_list"
  | "get_gmv_max_shop_video_anchors"
  | "get_gmv_max_campaign_info"
  | "list_gmv_max_sessions"
  | "get_gmv_max_sessions"
  | "get_gmv_max_bid_recommendation"
  | "get_gmv_max_report";

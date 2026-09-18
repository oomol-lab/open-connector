import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

const service = "apple_ads";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  adAccountIdInput,
  appleAdsDateTime,
  appleAdsDateTimeOutput,
  deletedOutput,
  emailString,
  identifierInput,
  looseResource,
  manageCampaignsRoles,
  moneyInput,
  moneyValueInput,
  moneyValueOutput,
  nonEmptyString,
  nullableEnum,
  queryInputs,
  queryOptionalInputs,
  queryOutput,
  readCampaignsRoles,
  resourceObject,
} from "./schemas.ts";

export const promotedObjectTypes: readonly string[] = ["APPSTORE_APP", "BUSINESS_BRAND"];
export const billingEvents: readonly string[] = ["TAPS", "IMPRESSIONS"];
export const paymentModels: readonly string[] = ["PAYG", "LOC"];
export const campaignStatuses: readonly string[] = ["ENABLED", "PAUSED"];
export const campaignSystemStatuses: readonly string[] = ["RUNNING", "NOT_RUNNING"];
export const campaignDisplayStatuses: readonly string[] = [
  "RUNNING",
  "PAUSED",
  "ON_HOLD",
  "LIMITED",
  "PROCESSING",
  "DELETED",
];
export const bidStrategyTypes: readonly string[] = ["MANUAL_CPT", "MANUAL_CPM", "MAX_CONVERSIONS", "MAX_ENGAGEMENTS"];
export const bidStrategyGoals: readonly string[] = ["TAP", "IMPRESSION", "INSTALL"];
export const supplySources: readonly string[] = ["APPSTORE", "MAPS"];
export const supplyPlacements: readonly string[] = [
  "APPSTORE_SEARCH_RESULTS",
  "APPSTORE_SEARCH_TAB",
  "APPSTORE_TODAY_TAB",
  "APPSTORE_PRODUCT_PAGES",
  "MAPS_SEARCH_RESULTS",
  "MAPS_SEARCH_HOME",
];
export const regulationTypes: readonly string[] = ["CAC", "CAMPAIGN_SAPIN_LAW", "ORG_SAPIN_LAW"];
export const regulationResponseValues: readonly string[] = [
  "AGENT",
  "NOT_AGENT",
  "FRENCH_BUSINESS",
  "NOT_FRENCH_BUSINESS",
  "TRUE",
  "FALSE",
  "NOT_ANSWERED",
];

const campaignFilterFields = [
  "id",
  "name",
  "status",
  "systemStatus",
  "systemStatusReasons",
  "systemStatusLimitingReasons",
  "billingEvent",
  "paymentModel",
  "promotedObjectType",
  "promotedObjectId",
  "startTime",
  "endTime",
  "creationTime",
  "modificationTime",
  "deleted",
];
const campaignSortFields = [
  "id",
  "name",
  "status",
  "systemStatus",
  "billingEvent",
  "paymentModel",
  "promotedObjectType",
  "promotedObjectId",
  "startTime",
  "endTime",
  "creationTime",
  "modificationTime",
  "deleted",
];

const includeOnlyTargeting = (description: string, values: readonly string[], itemDescription: string) =>
  s.object(
    `${description} Only include is honored at the campaign level; Apple Ads ignores exclude here.`,
    { include: s.array("Values to include in targeting.", s.stringEnum(itemDescription, values)) },
    { required: ["include"] },
  );

const countryOrRegionTargeting = s.object(
  "Countries or regions where the campaign serves ads. Only include is honored at the campaign level.",
  {
    include: s.stringArray("ISO 3166-1 alpha-2 country or region codes to include.", {
      itemDescription: "An ISO 3166-1 alpha-2 code such as US, CA or GB.",
      minItems: 1,
    }),
  },
  { required: ["include"] },
);

const campaignTargetingInput = s.object(
  "Where the campaign is eligible to serve ads. Ad group targeting can only narrow these boundaries.",
  {
    supplySource: includeOnlyTargeting(
      "Supply sources where ads are eligible to appear.",
      supplySources,
      "A supply source.",
    ),
    supplyPlacement: includeOnlyTargeting(
      "Placements within the selected supply sources. Each placement belongs to exactly one supply source.",
      supplyPlacements,
      "A supply placement.",
    ),
    countryOrRegion: countryOrRegionTargeting,
  },
  { optional: ["supplySource", "supplyPlacement", "countryOrRegion"] },
);

const bidStrategyInput = s.object(
  "How the campaign competes in auctions. Apple Ads requires bidStrategyType and bidStrategyGoal together, paired as MANUAL_CPT with TAP, MANUAL_CPM with IMPRESSION, MAX_CONVERSIONS with INSTALL, or MAX_ENGAGEMENTS with TAP.",
  {
    bidStrategyType: s.stringEnum("The bid strategy type.", bidStrategyTypes),
    bidStrategyGoal: s.stringEnum("The optimization goal for the bid strategy.", bidStrategyGoals),
    bid: moneyInput(
      "Bid ceiling for each auction entry. It governs auction participation for MANUAL_CPT and acts as an upper bound for automated strategies.",
    ),
  },
  { optional: ["bidStrategyType", "bidStrategyGoal", "bid"] },
);

const invoiceDetailInput = s.object(
  "Invoice and billing contact details. Apple Ads requires them for Line of Credit accounts.",
  {
    primaryBuyerName: nonEmptyString("Name of the primary buyer."),
    primaryBuyerEmail: emailString("Email address of the primary buyer."),
    billingEmail: emailString("Billing email address."),
    clientName: nonEmptyString("Advertiser or product this invoice identifies."),
    orderNumber: nonEmptyString("Purchase order number."),
  },
  { optional: ["clientName", "orderNumber"] },
);

const sharedBudgetsInput = s.array(
  "Budget order assignments for this campaign. Sending this array replaces every existing assignment.",
  s.object(
    "A single budget order assignment.",
    { budgetId: identifierInput("Identifier of the budget order to assign.") },
    { required: ["budgetId"] },
  ),
);

const regulationResponsesInput = s.array(
  "Regulatory consent acknowledgments required in some markets.",
  s.object(
    "A single regulatory disclosure response.",
    {
      regulationType: s.stringEnum("Category of regulatory disclosure being answered.", regulationTypes),
      responseValue: s.stringEnum(
        "Answer to the disclosure question. Which values are valid depends on regulationType.",
        regulationResponseValues,
      ),
    },
    { required: ["regulationType", "responseValue"] },
  ),
);

const campaignResource = resourceObject(
  "A campaign, the top-level container that defines the promoted object, billing, scheduling and targeting for its ad groups.",
  "System-assigned identifier for the campaign.",
  {
    adAccountId: s.nullableInteger("Ad account the campaign belongs to."),
    name: s.nullableString("Advertiser-given campaign name."),
    billingEvent: nullableEnum("Interaction that triggers a charge.", billingEvents),
    paymentModel: nullableEnum("Payment model applied to the campaign.", paymentModels),
    startTime: appleAdsDateTimeOutput("Scheduled start of the campaign."),
    endTime: appleAdsDateTimeOutput("Scheduled end of the campaign, or null when it runs indefinitely."),
    promotedObjectType: nullableEnum("What the campaign promotes.", promotedObjectTypes),
    promotedObjectId: s.nullableString(
      "Identifier of the promoted entity: the App Store adamId, or the brand identifier for Apple Maps campaigns.",
    ),
    status: nullableEnum("Advertiser intent for the campaign to serve.", campaignStatuses),
    systemStatus: nullableEnum("System-computed delivery state.", campaignSystemStatuses),
    systemStatusReasons: s.nullable(
      s.stringArray("Reasons the campaign is not delivering.", {
        itemDescription: "A system status reason code such as PAUSED_BY_USER or SCHEDULE_EXPIRED.",
      }),
    ),
    systemStatusLimitingReasons: s.nullable(
      s.stringArray("Reasons the campaign delivers below its full potential.", {
        itemDescription: "A limiting reason code such as APP_NOT_ELIGIBLE or AD_GROUPS_LIMITED.",
      }),
    ),
    displayStatus: nullableEnum(
      "Rolled-up delivery state combining advertiser intent and system evaluation.",
      campaignDisplayStatuses,
    ),
    dailyBudget: moneyValueOutput("Daily spend cap.", "The daily budget amount."),
    sharedBudgets: s.nullable(
      s.array(
        "Budget orders assigned to the campaign.",
        looseResource("A budget order assignment.", {
          budgetId: s.nullableInteger("Identifier of the assigned budget order."),
        }),
      ),
    ),
    targeting: s.nullable(
      looseResource("Where the campaign is eligible to serve ads.", {
        supplySource: s.nullable(
          looseResource("Supply sources included in targeting.", {
            include: s.nullable(s.stringArray("Included supply sources.")),
          }),
        ),
        supplyPlacement: s.nullable(
          looseResource("Placements included in targeting.", {
            include: s.nullable(s.stringArray("Included placements.")),
          }),
        ),
        countryOrRegion: s.nullable(
          looseResource("Countries or regions included in targeting.", {
            include: s.nullable(s.stringArray("Included ISO 3166-1 alpha-2 codes.")),
          }),
        ),
      }),
    ),
    bidStrategy: s.nullable(
      looseResource("Bid strategy governing auction participation.", {
        bidStrategyType: nullableEnum("The bid strategy type.", bidStrategyTypes),
        bidStrategyGoal: nullableEnum("The optimization goal.", bidStrategyGoals),
        bid: s.nullable(
          looseResource("Bid ceiling for each auction entry.", {
            amount: s.nullableString("Bid amount as a decimal string."),
            currency: s.nullableString("ISO 4217 currency code."),
          }),
        ),
      }),
    ),
    invoiceDetail: s.nullable(
      looseResource("Invoice and billing contact details.", {
        clientName: s.nullableString("Advertiser or product this invoice identifies."),
        primaryBuyerName: s.nullableString("Name of the primary buyer."),
        primaryBuyerEmail: s.nullableString("Email address of the primary buyer."),
        orderNumber: s.nullableString("Purchase order number."),
        billingEmail: s.nullableString("Billing email address."),
      }),
    ),
    regulationResponses: s.nullable(
      s.array(
        "Regulatory consent acknowledgments recorded for the campaign.",
        looseResource("A single regulatory disclosure response.", {
          regulationType: nullableEnum("Category of regulatory disclosure.", regulationTypes),
          responseValue: nullableEnum("Recorded answer.", regulationResponseValues),
        }),
      ),
    ),
    creationTime: appleAdsDateTimeOutput("When the campaign was created."),
    modificationTime: appleAdsDateTimeOutput("When the campaign was last modified."),
    deleted: s.nullableBoolean("Whether the campaign has been soft-deleted."),
  },
);

export const appleAdsCampaignActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "query_campaigns",
    operationType: "read",
    description:
      "Search the campaigns of one ad account with filters, sorting and offset pagination. Soft-deleted campaigns are excluded unless a filter on deleted asks for them.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Query for browsing campaigns in one ad account.",
      {
        adAccountId: adAccountIdInput,
        ...queryInputs({
          filterFields: campaignFilterFields,
          filterFieldDescription:
            "Campaign field to filter on. id and name accept EQUALS, IN and the string operators; the status enums accept EQUALS and IN; the systemStatusReasons arrays accept the CONTAINS operators; the time fields accept the comparison operators.",
          sortFields: campaignSortFields,
          sortFieldDescription: "Campaign field to sort on.",
        }),
      },
      { optional: queryOptionalInputs },
    ),
    outputSchema: queryOutput(
      "campaigns",
      campaignResource,
      "Campaigns matching the query on this page.",
      "A page of campaigns.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_campaign",
    operationType: "read",
    description: "Read one campaign by identifier. Apple Ads returns the campaign regardless of its deleted state.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Identifies the campaign to read.",
      {
        campaignId: identifierInput("Identifier of the campaign."),
        adAccountId: adAccountIdInput,
      },
      { required: ["campaignId"] },
    ),
    outputSchema: s.actionOutput({ campaign: campaignResource }, "The requested campaign."),
  }),
  defineProviderAction(service, {
    name: "create_campaign",
    operationType: "write",
    description:
      "Create a campaign. promotedObjectType, promotedObjectId and billingEvent are fixed at creation: promote a different app or brand by creating another campaign.",
    requiredScopes: [],
    providerPermissions: [...manageCampaignsRoles],
    inputSchema: s.object(
      "The campaign to create.",
      {
        adAccountId: adAccountIdInput,
        name: nonEmptyString("Campaign name, at most 200 characters."),
        promotedObjectType: s.stringEnum(
          "Whether the campaign promotes an App Store app or an Apple Maps brand. It cannot be changed later.",
          promotedObjectTypes,
        ),
        promotedObjectId: nonEmptyString(
          "Identifier of the promoted entity: the App Store adamId for APPSTORE_APP, or the brand identifier for BUSINESS_BRAND. It cannot be changed later.",
        ),
        billingEvent: s.stringEnum(
          "Interaction that triggers a charge. App Store campaigns use TAPS; Apple Maps campaigns also support IMPRESSIONS. It cannot be changed later.",
          billingEvents,
        ),
        dailyBudget: moneyValueInput("Daily spend cap for the campaign.", "The daily budget amount."),
        targeting: campaignTargetingInput,
        bidStrategy: bidStrategyInput,
        startTime: appleAdsDateTime("When the campaign starts. Omit to start it as soon as it is activated."),
        endTime: appleAdsDateTime("When the campaign ends. Omit to run it indefinitely."),
        status: s.stringEnum(
          "Initial serving status. Apple Ads picks a default when this is omitted.",
          campaignStatuses,
        ),
        sharedBudgets: sharedBudgetsInput,
        invoiceDetail: invoiceDetailInput,
        regulationResponses: regulationResponsesInput,
      },
      {
        required: ["name", "promotedObjectType", "promotedObjectId", "billingEvent", "dailyBudget", "targeting"],
      },
    ),
    outputSchema: s.actionOutput({ campaign: campaignResource }, "The created campaign."),
  }),
  defineProviderAction(service, {
    name: "update_campaign",
    operationType: "destructive",
    description:
      "Change the mutable fields of one campaign. Only the fields you pass are changed, but an array you pass replaces the stored array entirely.",
    requiredScopes: [],
    providerPermissions: [...manageCampaignsRoles],
    inputSchema: s.object(
      "The campaign changes to apply.",
      {
        campaignId: identifierInput("Identifier of the campaign to update."),
        adAccountId: adAccountIdInput,
        name: nonEmptyString("New campaign name, at most 200 characters."),
        status: s.stringEnum("Pause or resume delivery.", campaignStatuses),
        startTime: appleAdsDateTime("New scheduled start."),
        endTime: appleAdsDateTime("New scheduled end."),
        dailyBudget: moneyValueInput("New daily spend cap.", "The daily budget amount."),
        targeting: campaignTargetingInput,
        bidStrategy: bidStrategyInput,
        sharedBudgets: sharedBudgetsInput,
        invoiceDetail: invoiceDetailInput,
        regulationResponses: regulationResponsesInput,
      },
      { required: ["campaignId"] },
    ),
    outputSchema: s.actionOutput({ campaign: campaignResource }, "The updated campaign."),
  }),
  defineProviderAction(service, {
    name: "delete_campaign",
    operationType: "destructive",
    description:
      "Soft-delete one campaign. Apple Ads keeps the record but stops delivery and cascades the deletion to the campaign's ad groups, keywords and ads.",
    requiredScopes: [],
    providerPermissions: [...manageCampaignsRoles],
    inputSchema: s.object(
      "Identifies the campaign to delete.",
      {
        campaignId: identifierInput("Identifier of the campaign to delete."),
        adAccountId: adAccountIdInput,
      },
      { required: ["campaignId"] },
    ),
    outputSchema: s.actionOutput(
      deletedOutput("Identifier of the soft-deleted campaign."),
      "Confirmation that the campaign was soft-deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_campaign_limited_status_details",
    operationType: "read",
    description:
      "Read why a legacy app campaign delivers below its potential in each country or region, as a map of country or region code to limiting reason.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Identifies the campaign to diagnose.",
      {
        campaignId: identifierInput("Identifier of the campaign."),
        adAccountId: adAccountIdInput,
      },
      { required: ["campaignId"] },
    ),
    outputSchema: s.actionOutput(
      {
        countryOrRegionLimitedStatusReasons: s.nullable(
          s.record(
            "Limiting reasons keyed by ISO 3166-1 alpha-2 country or region code, or null when Apple Ads reports none.",
            s.stringArray("Reasons the campaign is limited in that market.", {
              itemDescription: "A limiting reason code.",
            }),
          ),
        ),
      },
      "Per-market limiting reasons for the campaign.",
    ),
  }),
];

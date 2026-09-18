import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

const service = "apple_ads";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { bidStrategyGoals, bidStrategyTypes } from "./actions-campaigns.ts";
import {
  adAccountIdInput,
  appleAdsDateTime,
  appleAdsDateTimeOutput,
  deletedOutput,
  identifierInput,
  looseResource,
  manageCampaignsRoles,
  moneyInput,
  moneyOutput,
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

export const adGroupStatuses: readonly string[] = ["ENABLED", "PAUSED"];
export const adGroupSystemStatuses: readonly string[] = ["RUNNING", "NOT_RUNNING"];
export const adGroupDisplayStatuses: readonly string[] = [
  "RUNNING",
  "PAUSED",
  "ON_HOLD",
  "CAMPAIGN_ON_HOLD",
  "LIMITED",
  "PROCESSING",
  "DELETED",
];
export const pricingModels: readonly string[] = ["CPA", "CPM", "CPT"];
export const targetingDeviceClasses: readonly string[] = ["IPHONE", "IPAD"];
export const targetingGenders: readonly string[] = ["M", "F"];
export const targetingRadiusValues: readonly string[] = ["CLOSE", "MEDIUM", "FAR"];
const adGroupQueryFields = ["id", "campaignId", "name", "status", "startTime", "endTime", "deleted"];

const includeOnlyDimension = (description: string, include: JsonSchema) =>
  s.object(
    `${description} This dimension is include-only; an exclude array on it has no effect.`,
    { include },
    { required: ["include"] },
  );

const includeExcludeDimension = (description: string, include: JsonSchema, exclude: JsonSchema) =>
  s.object(description, { include, exclude }, { required: [] });

const geoIdArray = (description: string, itemDescription: string) => s.stringArray(description, { itemDescription });

const adGroupTargetingInput = s.object(
  "Audience and delivery targeting for the ad group. It refines the campaign's targeting and cannot widen it: a user must match every dimension you set. Not every dimension is meaningful for every campaign type, and Apple Ads does not enforce the pairings at the schema level.",
  {
    country: includeOnlyDimension(
      "Countries to deliver in, used with App Store campaigns.",
      geoIdArray("Country identifiers returned by the geo location endpoints.", "A country identifier such as 1125."),
    ),
    adminArea: includeOnlyDimension(
      "States or provinces to deliver in, used with App Store and Apple Maps campaigns.",
      geoIdArray(
        "Admin area identifiers returned by the geo location endpoints.",
        "An admin area identifier such as 9070.",
      ),
    ),
    locality: includeOnlyDimension(
      "Cities to deliver in, used with App Store and Apple Maps campaigns.",
      geoIdArray(
        "Locality identifiers returned by the geo location endpoints.",
        "A locality identifier such as 11390462.",
      ),
    ),
    postalCode: includeOnlyDimension(
      "Postal code areas to deliver in, used with Apple Maps campaigns.",
      geoIdArray(
        "Postal code identifiers returned by the geo location endpoints.",
        "A postal code identifier such as 11412181.",
      ),
    ),
    radius: includeOnlyDimension(
      "Proximity to the advertiser's business locations, used with Apple Maps campaigns on the MAPS_SEARCH_RESULTS placement. Do not combine it with geo location targeting in the same ad group.",
      s.array("Radius bands to deliver in.", s.stringEnum("A radius band.", targetingRadiusValues)),
    ),
    deviceClass: includeOnlyDimension(
      "Device classes to deliver on, used with App Store campaigns.",
      s.array("Device classes to deliver on.", s.stringEnum("A device class.", targetingDeviceClasses)),
    ),
    minAge: includeOnlyDimension(
      "Lower bound of the target age range, used with App Store campaigns.",
      s.stringArray("The lower bound of the target age range, from 18 to 64.", {
        itemDescription: 'An age as a decimal string, for example "18".',
      }),
    ),
    maxAge: includeOnlyDimension(
      "Upper bound of the target age range, used with App Store campaigns. Send include as null to target users 65 and older. Leaving the dimension out of a create request has the same effect, but leaving it out of an update keeps the stored bound.",
      s.nullable(
        s.stringArray(
          "The upper bound of the target age range, from 18 to 64, or null to leave the range open ended.",
          { itemDescription: 'An age as a decimal string, for example "34".' },
        ),
      ),
    ),
    gender: includeOnlyDimension(
      "Genders to deliver to, used with App Store campaigns.",
      s.array("Genders to deliver to.", s.stringEnum("A gender.", targetingGenders)),
    ),
    appCategory: includeExcludeDimension(
      "App Store categories of the apps a user engages with, used with App Store campaigns. Category 100 is the special value meaning the same category as the promoted app. This is one of the two dimensions Apple Ads honors exclude on.",
      s.stringArray("App Store category identifiers to target.", {
        itemDescription: 'An App Store category identifier, for example "100".',
      }),
      s.stringArray("App Store category identifiers to exclude.", {
        itemDescription: 'An App Store category identifier, for example "100".',
      }),
    ),
    appDownloader: includeExcludeDimension(
      "Users selected by the apps they already downloaded, used with App Store campaigns. Exclude the promoted app's own adamId to suppress existing users and target acquisition only. Leave the dimension out of a create request to reach all users. Apple Ads only accepts adamIds of apps the API user owns. This is one of the two dimensions Apple Ads honors exclude on.",
      s.stringArray("Adam identifiers whose downloaders to reach.", {
        itemDescription: 'An App Store adamId, for example "987654321".',
      }),
      s.stringArray("Adam identifiers whose downloaders to suppress.", {
        itemDescription: 'An App Store adamId, for example "555666777".',
      }),
    ),
    daypart: includeOnlyDimension(
      "Hours of the week the ad group may deliver in, used with App Store campaigns on APPSTORE_SEARCH_RESULTS and Apple Maps campaigns on MAPS_SEARCH_RESULTS. Slots are evaluated in the ad account's time zone.",
      s.stringArray(
        "One-hour slots in a 168-slot week starting at Sunday midnight: 0 is Sunday 12:00 a.m., 24 is Monday 12:00 a.m., and 167 is Saturday 11:00 p.m.",
        { itemDescription: 'A slot index from 0 to 167 as a decimal string, for example "8".' },
      ),
    ),
    locationGroup: includeOnlyDimension(
      "Location groups whose business locations the ad group promotes, used with Apple Maps campaigns.",
      geoIdArray("Location group identifiers.", "A location group identifier such as 123456789."),
    ),
  },
  { required: [] },
);

const bidStrategyInput = s.object(
  "How the ad group competes in auctions. Leave it out of a create request to inherit the campaign's bid strategy; leaving it out of an update keeps the stored one. An ad group under an auto-bidding campaign, meaning one whose bidStrategyType is MAX_CONVERSIONS or MAX_ENGAGEMENTS, inherits the campaign's strategy, so echo that strategy back when you update such an ad group. Apple Ads requires bidStrategyType and bidStrategyGoal together, paired as MANUAL_CPT with TAP, MANUAL_CPM with IMPRESSION, MAX_CONVERSIONS with INSTALL, or MAX_ENGAGEMENTS with TAP.",
  {
    bidStrategyType: s.stringEnum(
      "The bid strategy type. It has to stay compatible with the parent campaign's billingEvent.",
      bidStrategyTypes,
    ),
    bidStrategyGoal: s.stringEnum("The optimization goal for the bid strategy.", bidStrategyGoals),
    bid: moneyInput(
      "Bid ceiling for each auction entry. It governs auction participation for MANUAL_CPT and acts as an upper bound for automated strategies.",
    ),
  },
  { required: [] },
);

const cpaCapInput = moneyValueInput(
  "Deprecated cost-per-acquisition cap. Apple Ads still accepts it, but new integrations should use bidStrategy with MAX_CONVERSIONS instead.",
  "The target cost-per-acquisition amount.",
);

const targetingDimensionOutput = (description: string) =>
  s.nullable(
    looseResource(description, {
      include: s.nullable(
        s.stringArray("Values included in targeting.", {
          itemDescription: "An included targeting value.",
        }),
      ),
      exclude: s.nullable(
        s.stringArray("Values excluded from targeting. Most dimensions ignore it.", {
          itemDescription: "An excluded targeting value.",
        }),
      ),
    }),
  );

const adGroupResource = resourceObject(
  "An ad group, the unit inside a campaign that carries one targeting configuration, bid strategy and schedule for its ads.",
  "System-assigned identifier for the ad group.",
  {
    name: s.nullableString("Advertiser-given ad group name."),
    adAccountId: s.nullableInteger("Ad account the ad group belongs to."),
    campaignId: s.nullableInteger("Campaign the ad group belongs to."),
    startTime: appleAdsDateTimeOutput("Scheduled start of the ad group."),
    endTime: appleAdsDateTimeOutput("Scheduled end of the ad group, or null when it inherits the campaign end date."),
    pricingModel: nullableEnum("Delivery unit that triggers billing.", pricingModels),
    automatedKeywordsOptIn: s.nullableBoolean(
      "Whether Search Match automatically matches relevant search terms for this ad group.",
    ),
    automatedKeywordsRequired: s.nullableBoolean("Whether automated keyword generation is required for this ad group."),
    status: nullableEnum("Advertiser intent for the ad group to serve.", adGroupStatuses),
    systemStatus: nullableEnum("System-computed delivery state.", adGroupSystemStatuses),
    systemStatusReasons: s.nullable(
      s.stringArray("Reasons the ad group is not delivering.", {
        itemDescription: "A system status reason code such as PAUSED_BY_USER, SCHEDULE_EXPIRED or KEYWORDS_MISSING.",
      }),
    ),
    systemStatusLimitingReasons: s.nullable(
      s.stringArray("Reasons the ad group delivers below its full potential.", {
        itemDescription: "A limiting reason code such as LOCATION_POLICY_ISSUES, LOCATION_GROUP_ISSUES or ADS_LIMITED.",
      }),
    ),
    displayStatus: nullableEnum(
      "Rolled-up delivery state combining advertiser intent and system evaluation. CAMPAIGN_ON_HOLD means the parent campaign is what is blocking delivery.",
      adGroupDisplayStatuses,
    ),
    bidStrategy: s.nullable(
      looseResource("Bid strategy governing auction participation for this ad group.", {
        bidStrategyType: nullableEnum("The bid strategy type.", bidStrategyTypes),
        bidStrategyGoal: nullableEnum("The optimization goal.", bidStrategyGoals),
        bid: moneyOutput("Bid ceiling for each auction entry."),
      }),
    ),
    targeting: s.nullable(
      looseResource("Audience and delivery targeting for the ad group.", {
        country: targetingDimensionOutput("Country targeting."),
        adminArea: targetingDimensionOutput("State or province targeting."),
        locality: targetingDimensionOutput("City targeting."),
        postalCode: targetingDimensionOutput("Postal code targeting."),
        radius: targetingDimensionOutput("Radius targeting around business locations."),
        deviceClass: targetingDimensionOutput("Device class targeting."),
        minAge: targetingDimensionOutput("Lower bound of the target age range."),
        maxAge: targetingDimensionOutput("Upper bound of the target age range."),
        gender: targetingDimensionOutput("Gender targeting."),
        appCategory: targetingDimensionOutput("App Store category targeting."),
        appDownloader: targetingDimensionOutput("App downloader targeting."),
        daypart: targetingDimensionOutput("Hour-of-week targeting, as slot indexes from 0 to 167."),
        locationGroup: targetingDimensionOutput("Location group targeting."),
      }),
    ),
    cpaCap: moneyValueOutput(
      "Deprecated cost-per-acquisition cap, superseded by bidStrategy with MAX_CONVERSIONS.",
      "The target cost-per-acquisition amount.",
    ),
    creationTime: appleAdsDateTimeOutput("When the ad group was created."),
    modificationTime: appleAdsDateTimeOutput("When the ad group was last modified."),
    deleted: s.nullableBoolean("Whether the ad group has been soft-deleted."),
  },
);

export const appleAdsAdGroupActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "query_ad_groups",
    operationType: "read",
    description:
      "Search the ad groups of one ad account with filters, sorting and offset pagination. Filter on campaignId to scope the result to a single campaign. Soft-deleted ad groups are excluded unless a filter on deleted asks for them.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Query for browsing ad groups in one ad account.",
      {
        adAccountId: adAccountIdInput,
        ...queryInputs({
          filterFields: adGroupQueryFields,
          filterFieldDescription:
            "Ad group field to filter on. id accepts EQUALS and IN; campaignId and deleted accept EQUALS; name accepts EQUALS and STARTS_WITH; status accepts EQUALS and IN; startTime and endTime accept LESS_THAN and GREATER_THAN.",
          sortFields: adGroupQueryFields,
          sortFieldDescription: "Ad group field to sort on. The default is id ascending.",
        }),
      },
      { optional: queryOptionalInputs },
    ),
    outputSchema: queryOutput(
      "adGroups",
      adGroupResource,
      "Ad groups matching the query on this page.",
      "A page of ad groups.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_ad_group",
    operationType: "read",
    description:
      "Read one ad group by identifier, including its full targeting and bid strategy. Apple Ads returns the ad group regardless of its deleted state.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Identifies the ad group to read.",
      {
        adGroupId: identifierInput("Identifier of the ad group."),
        adAccountId: adAccountIdInput,
      },
      { required: ["adGroupId"] },
    ),
    outputSchema: s.actionOutput({ adGroup: adGroupResource }, "The requested ad group."),
  }),
  defineProviderAction(service, {
    name: "create_ad_group",
    operationType: "write",
    description:
      "Create an ad group inside an existing campaign. campaignId, pricingModel and automatedKeywordsRequired are fixed at creation. Keywords and negative keywords cannot be created inline: add them afterwards with the keyword actions.",
    requiredScopes: [],
    providerPermissions: [...manageCampaignsRoles],
    inputSchema: s.object(
      "The ad group to create.",
      {
        adAccountId: adAccountIdInput,
        campaignId: identifierInput("Identifier of the parent campaign. It cannot be changed later."),
        name: nonEmptyString("Ad group name."),
        pricingModel: s.stringEnum(
          "Delivery unit that triggers billing. It has to match the campaign's billingEvent: CPT with TAPS and CPM with IMPRESSIONS. It cannot be changed later.",
          pricingModels,
        ),
        startTime: appleAdsDateTime("When the ad group starts."),
        endTime: appleAdsDateTime("When the ad group ends. Omit it to inherit the campaign end date."),
        status: s.stringEnum(
          "Initial serving status. Apple Ads applies no default when this is omitted.",
          adGroupStatuses,
        ),
        automatedKeywordsOptIn: s.boolean(
          "Whether to turn on Search Match, which targets relevant search terms without an explicit keyword list. Use Search Match or your own keywords on an ad group, not both.",
        ),
        automatedKeywordsRequired: s.boolean(
          "Whether automated keyword generation is required for this ad group. It cannot be changed later.",
        ),
        bidStrategy: bidStrategyInput,
        targeting: adGroupTargetingInput,
        cpaCap: cpaCapInput,
      },
      { required: ["campaignId", "name", "pricingModel"] },
    ),
    outputSchema: s.actionOutput({ adGroup: adGroupResource }, "The created ad group."),
  }),
  defineProviderAction(service, {
    name: "update_ad_group",
    operationType: "destructive",
    description:
      "Change the mutable fields of one ad group. Only the fields you pass are changed, and targeting is merged dimension by dimension: a dimension you pass replaces the stored one, and a dimension you omit is left alone. campaignId, pricingModel and automatedKeywordsRequired cannot be changed.",
    requiredScopes: [],
    providerPermissions: [...manageCampaignsRoles],
    inputSchema: s.object(
      "The ad group changes to apply.",
      {
        adGroupId: identifierInput("Identifier of the ad group to update."),
        adAccountId: adAccountIdInput,
        name: nonEmptyString("New ad group name."),
        status: s.stringEnum("Pause or resume delivery.", adGroupStatuses),
        startTime: appleAdsDateTime("New scheduled start."),
        endTime: appleAdsDateTime("New scheduled end."),
        automatedKeywordsOptIn: s.boolean("Turn Search Match on or off."),
        bidStrategy: bidStrategyInput,
        targeting: adGroupTargetingInput,
        cpaCap: cpaCapInput,
      },
      { required: ["adGroupId"] },
    ),
    outputSchema: s.actionOutput({ adGroup: adGroupResource }, "The updated ad group."),
  }),
  defineProviderAction(service, {
    name: "delete_ad_group",
    operationType: "destructive",
    description:
      "Soft-delete one ad group. Apple Ads keeps the record but stops delivery and cascades the deletion to the ad group's ads, keywords and negative keywords. It cannot be undone.",
    requiredScopes: [],
    providerPermissions: [...manageCampaignsRoles],
    inputSchema: s.object(
      "Identifies the ad group to delete.",
      {
        adGroupId: identifierInput("Identifier of the ad group to delete."),
        adAccountId: adAccountIdInput,
      },
      { required: ["adGroupId"] },
    ),
    outputSchema: s.actionOutput(
      deletedOutput("Identifier of the soft-deleted ad group."),
      "Confirmation that the ad group was soft-deleted.",
    ),
  }),
];

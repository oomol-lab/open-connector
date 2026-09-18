import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

const service = "apple_ads";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  adAccountIdInput,
  appleAdsDateTimeOutput,
  deletedOutput,
  identifierInput,
  looseResource,
  manageCampaignsRoles,
  nonEmptyString,
  nullableEnum,
  queryInputs,
  queryOptionalInputs,
  queryOutput,
  readCampaignsRoles,
  resourceObject,
} from "./schemas.ts";

export const adStatuses: readonly string[] = ["ENABLED", "PAUSED"];
export const adSystemStatuses: readonly string[] = ["RUNNING", "NOT_RUNNING"];
export const adDisplayStatuses: readonly string[] = [
  "RUNNING",
  "PAUSED",
  "ON_HOLD",
  "AD_GROUP_ON_HOLD",
  "CAMPAIGN_ON_HOLD",
  "LIMITED",
  "PROCESSING",
  "DELETED",
];
export const creativeTypes: readonly string[] = [
  "DEFAULT_PRODUCT_PAGE",
  "CUSTOM_PRODUCT_PAGE",
  "LOCAL_ADS_SEARCH_CREATIVE",
];
export const creativeSystemStatuses: readonly string[] = ["VALID", "INVALID", "PENDING"];
export const creativeSubtypes: readonly string[] = ["BUSINESS_LOGO", "BUSINESS_ASSET"];
export const destinationTypes: readonly string[] = ["APP_STORE_PRODUCT_PAGE", "LOCAL_ADS_PLACECARD"];
export const creativeEligibilityStatuses: readonly string[] = ["ELIGIBLE", "INELIGIBLE"];

const adFilterFields = ["id", "campaignId", "adGroupId", "creativeId", "status", "deleted"];
const adSortFields = adFilterFields;

const creativeFilterFields = [
  "id",
  "adAccountId",
  "name",
  "creativeType",
  "systemStatus",
  "deleted",
  "eligibility.status",
];
const creativeSortFields = ["id"];

const adResource = resourceObject(
  "An ad, the serving unit that links an ad creative to an ad group. Only one ad per ad group can be ENABLED at a time.",
  "System-assigned identifier for the ad.",
  {
    name: s.nullableString("Advertiser-given name of the ad."),
    status: nullableEnum("Advertiser intent for the ad to serve.", adStatuses),
    adAccountId: s.nullableInteger("Ad account the ad belongs to."),
    campaignId: s.nullableInteger("Campaign the ad belongs to."),
    adGroupId: s.nullableInteger("Ad group the ad belongs to."),
    creativeId: s.nullableInteger("Ad creative this ad serves."),
    systemStatus: nullableEnum("System-computed delivery state.", adSystemStatuses),
    systemStatusReasons: s.nullable(
      s.stringArray("Reasons the ad is not delivering, populated when systemStatus is NOT_RUNNING.", {
        itemDescription:
          "A system status reason code such as AD_APPROVAL_PENDING, CREATIVE_PENDING or PRODUCT_PAGE_INCOMPATIBLE.",
      }),
    ),
    systemStatusLimitingReasons: s.nullable(
      s.stringArray("Reasons the ad delivers at reduced capacity without stopping.", {
        itemDescription: "A limiting reason code. The only documented value is CREATIVE_POLICY_ISSUES.",
      }),
    ),
    displayStatus: nullableEnum(
      "Rolled-up delivery state combining ad, ad group and campaign conditions.",
      adDisplayStatuses,
    ),
    creationTime: appleAdsDateTimeOutput("When the ad was created."),
    modificationTime: appleAdsDateTimeOutput("When the ad was last modified."),
    deleted: s.nullableBoolean("Whether the ad has been soft-deleted."),
  },
);

const localizedTextOutput = s.nullable(
  s.record(
    "Localized promotional copy keyed by BCP-47 locale code, then by text key.",
    s.nullable(
      s.record(
        "Promotional copy for one locale, keyed by text key such as promoText.",
        s.nullableString("A single piece of localized copy."),
      ),
    ),
  ),
);

const eligibilityGroupFields = {
  supplyPlacement: s.nullable(
    s.stringArray("Supply placements covered by this group.", {
      itemDescription: "A supply placement such as APPSTORE_SEARCH_RESULTS.",
    }),
  ),
  countryOrRegion: s.nullable(
    s.stringArray("Countries or regions covered by this group.", {
      itemDescription: "An ISO 3166-1 alpha-2 code such as US or GB.",
    }),
  ),
};

const creativeResource = resourceObject(
  "An ad creative, the reusable unit of visual presentation an ad references. It carries a pre-tap creativeSpec and a post-tap destination.",
  "System-assigned identifier for the ad creative. Pass this value as creativeId when creating an ad.",
  {
    adAccountId: s.nullableInteger("Ad account the ad creative belongs to."),
    name: s.nullableString("Advertiser-given name of the ad creative."),
    creativeType: nullableEnum("Content source and placement eligibility of the ad creative.", creativeTypes),
    creativeSpec: s.nullable(
      looseResource(
        "Pre-tap experience specification. Apple Ads returns an empty object for DEFAULT_PRODUCT_PAGE and CUSTOM_PRODUCT_PAGE, because App Store Connect controls their pre-tap rendering.",
        {
          brandId: s.nullableString("Brand the Apple Maps ad creative belongs to."),
          creativeSubtype: nullableEnum("Asset format of the Apple Maps ad creative.", creativeSubtypes),
          creativeAssets: s.nullable(
            s.array(
              "Ordered asset references rendered in the Apple Maps ad creative.",
              looseResource("A single asset reference.", {
                assetId: s.nullableString("UUID of the referenced asset."),
                sortOrder: s.nullableInteger("Display position of this asset within the list."),
              }),
            ),
          ),
          localizedText: localizedTextOutput,
          defaultLocale: s.nullableString(
            "Locale whose copy is used when a viewer's locale is missing from localizedText.",
          ),
        },
      ),
    ),
    destination: s.nullable(
      looseResource("Post-tap destination users land on after tapping the ad.", {
        destinationType: nullableEnum("Type of post-tap destination.", destinationTypes),
        parameters: s.nullable(
          looseResource("Destination-specific identifiers.", {
            adamId: s.nullableString("App Store app identifier the destination points at."),
            productPageId: s.nullableString(
              "UUID of the Custom Product Page, or null when the default product page is used.",
            ),
          }),
        ),
        url: s.nullableString("Resolved destination URL that Apple Ads computes from destinationType and parameters."),
      }),
    ),
    systemStatus: nullableEnum("System validation state of the ad creative.", creativeSystemStatuses),
    systemStatusReasons: s.nullable(
      s.stringArray("Reasons behind the current system status.", {
        itemDescription: "A system status reason code such as NEEDS_REVIEW, MISSING_ASSET or PRODUCT_PAGE_DELETED.",
      }),
    ),
    eligibility: s.nullable(
      looseResource(
        "Where the ad creative is allowed to serve. Apple Ads leaves it empty or null while systemStatus is PENDING.",
        {
          status: nullableEnum("Overall eligibility status.", creativeEligibilityStatuses),
          allowedGroups: s.nullable(
            s.array(
              "Placement and market combinations where the ad creative can serve.",
              looseResource("An allowed placement and market group.", eligibilityGroupFields),
            ),
          ),
          blockedGroups: s.nullable(
            s.array(
              "Placement and market combinations where the ad creative cannot serve.",
              looseResource("A blocked placement and market group.", {
                ...eligibilityGroupFields,
                reason: s.nullableString("Why the ad creative is blocked in this group, for example APP_NOT_ELIGIBLE."),
              }),
            ),
          ),
        },
      ),
    ),
    creationTime: appleAdsDateTimeOutput("When the ad creative was created."),
    modificationTime: appleAdsDateTimeOutput("When the ad creative was last modified."),
    deleted: s.nullableBoolean("Whether the ad creative has been soft-deleted."),
  },
);

const creativeSpecInput = s.object(
  "Pre-tap experience specification. Pass an empty object for DEFAULT_PRODUCT_PAGE and CUSTOM_PRODUCT_PAGE, whose pre-tap content comes from App Store Connect and is not customizable here. It is required for LOCAL_ADS_SEARCH_CREATIVE, where every field below applies.",
  {
    brandId: identifierInput("Brand the Apple Maps ad creative belongs to. LOCAL_ADS_SEARCH_CREATIVE only."),
    creativeSubtype: s.stringEnum(
      "Asset format of the Apple Maps ad creative. LOCAL_ADS_SEARCH_CREATIVE only.",
      creativeSubtypes,
    ),
    creativeAssets: s.array(
      "Asset references rendered in the Apple Maps ad creative, in display order. Each asset must already exist in the ad account. LOCAL_ADS_SEARCH_CREATIVE only.",
      s.object(
        "A single asset reference.",
        {
          assetId: nonEmptyString("UUID of an existing asset to display."),
          sortOrder: s.nonNegativeInteger("Display position of this asset within the list."),
        },
        { required: ["assetId"] },
      ),
    ),
    localizedText: s.record(
      'Promotional copy keyed by BCP-47 locale code, for example {"en-US": {"promoText": "Visit us today"}}. LOCAL_ADS_SEARCH_CREATIVE only.',
      s.record(
        "Promotional copy for one locale, keyed by text key such as promoText.",
        nonEmptyString("A single piece of localized copy."),
      ),
    ),
    defaultLocale: nonEmptyString(
      "Locale whose copy is used when a viewer's locale is missing from localizedText, for example en-US. LOCAL_ADS_SEARCH_CREATIVE only.",
    ),
  },
  {
    optional: ["brandId", "creativeSubtype", "creativeAssets", "localizedText", "defaultLocale"],
  },
);

const destinationInput = s.object(
  "Post-tap destination for the ad creative. It is fixed at creation and cannot be changed afterwards.",
  {
    destinationType: s.stringEnum(
      "Type of post-tap destination. Product page ad creatives use APP_STORE_PRODUCT_PAGE; Apple Maps ad creatives use LOCAL_ADS_PLACECARD.",
      destinationTypes,
    ),
    parameters: s.object(
      "Destination-specific identifiers. Required for APP_STORE_PRODUCT_PAGE; omit it entirely for LOCAL_ADS_PLACECARD, which takes no parameters.",
      {
        adamId: identifierInput(
          "App Store app identifier the destination points at. It is the same value as the campaign's promotedObjectId, and it is required for APP_STORE_PRODUCT_PAGE.",
        ),
        productPageId: nonEmptyString(
          "UUID of a Custom Product Page created in App Store Connect. It is required for CUSTOM_PRODUCT_PAGE; omit it for DEFAULT_PRODUCT_PAGE to use the default product page.",
        ),
      },
      { optional: ["productPageId"] },
    ),
  },
  { optional: ["parameters"] },
);

export const appleAdsAdActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "query_ads",
    operationType: "read",
    description:
      "Search the ads of one ad account with filters, sorting and offset pagination. Filter on adGroupId to scope to one ad group or on campaignId for a whole campaign. Soft-deleted ads are excluded unless a deleted EQUALS true filter asks for them.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Query for browsing ads in one ad account.",
      {
        adAccountId: adAccountIdInput,
        ...queryInputs({
          filterFields: adFilterFields,
          filterFieldDescription:
            "Ad field to filter on. id and status accept EQUALS and IN; campaignId, adGroupId, creativeId and deleted accept EQUALS.",
          sortFields: adSortFields,
          sortFieldDescription: "Ad field to sort on. Apple Ads sorts by id ascending by default.",
        }),
      },
      { optional: queryOptionalInputs },
    ),
    outputSchema: queryOutput("ads", adResource, "Ads matching the query on this page.", "A page of ads."),
  }),
  defineProviderAction(service, {
    name: "get_ad",
    operationType: "read",
    description:
      "Read one ad by identifier, including systemStatus, displayStatus and the reason arrays that explain why it is not delivering. Apple Ads still returns a soft-deleted ad with deleted set to true.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Identifies the ad to read.",
      {
        adId: identifierInput("Identifier of the ad."),
        adAccountId: adAccountIdInput,
      },
      { required: ["adId"] },
    ),
    outputSchema: s.actionOutput({ ad: adResource }, "The requested ad."),
  }),
  defineProviderAction(service, {
    name: "create_ad",
    operationType: "write",
    description:
      "Create an ad that links an existing ad creative to an ad group. adGroupId and creativeId are fixed at creation: serve a different ad creative by creating another ad and deleting this one. The ad creative must have a systemStatus of VALID, and only one ad per ad group can be ENABLED at a time.",
    requiredScopes: [],
    providerPermissions: [...manageCampaignsRoles],
    inputSchema: s.object(
      "The ad to create.",
      {
        adAccountId: adAccountIdInput,
        adGroupId: identifierInput(
          "Identifier of the ad group to place the ad in. It must belong to the same ad account, and it cannot be changed later.",
        ),
        creativeId: identifierInput("Identifier of the ad creative to serve. It cannot be changed later."),
        name: nonEmptyString("Ad name."),
        status: s.stringEnum(
          "Initial serving status. ENABLED lets the ad enter auctions once its ad group and campaign are also enabled; PAUSED creates it suspended.",
          adStatuses,
        ),
      },
      { required: ["adGroupId", "creativeId", "name", "status"] },
    ),
    outputSchema: s.actionOutput({ ad: adResource }, "The created ad."),
  }),
  defineProviderAction(service, {
    name: "update_ad",
    operationType: "destructive",
    description:
      "Change the name or status of one ad. They are the only mutable fields; adGroupId, creativeId, campaignId and adAccountId are locked at creation. Only the fields you pass are changed. Updating a soft-deleted ad returns 404.",
    requiredScopes: [],
    providerPermissions: [...manageCampaignsRoles],
    inputSchema: s.object(
      "The ad changes to apply.",
      {
        adId: identifierInput("Identifier of the ad to update."),
        adAccountId: adAccountIdInput,
        name: nonEmptyString("New ad name."),
        status: s.stringEnum("Pause or resume auction participation. PAUSED stops it immediately.", adStatuses),
      },
      { required: ["adId"] },
    ),
    outputSchema: s.actionOutput({ ad: adResource }, "The updated ad."),
  }),
  defineProviderAction(service, {
    name: "delete_ad",
    operationType: "destructive",
    description:
      "Soft-delete one ad. Delivery stops immediately and query results exclude it, but Apple Ads keeps the record and still returns it from a read. The referenced ad creative is untouched and stays available to other ads.",
    requiredScopes: [],
    providerPermissions: [...manageCampaignsRoles],
    inputSchema: s.object(
      "Identifies the ad to delete.",
      {
        adId: identifierInput("Identifier of the ad to delete."),
        adAccountId: adAccountIdInput,
      },
      { required: ["adId"] },
    ),
    outputSchema: s.actionOutput(
      deletedOutput("Identifier of the soft-deleted ad."),
      "Confirmation that the ad was soft-deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "query_creatives",
    operationType: "read",
    description:
      "Search the ad creatives of one ad account with filters, sorting and offset pagination. Soft-deleted ad creatives are excluded unless a deleted EQUALS true filter asks for them, which is the only way to read one back after deletion.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Query for browsing ad creatives in one ad account.",
      {
        adAccountId: adAccountIdInput,
        ...queryInputs({
          filterFields: creativeFilterFields,
          filterFieldDescription:
            "Ad creative field to filter on. id, creativeType and systemStatus accept EQUALS and IN; adAccountId and deleted accept EQUALS; name accepts EQUALS and STARTS_WITH; eligibility.status accepts the documented values ELIGIBLE and INELIGIBLE.",
          sortFields: creativeSortFields,
          sortFieldDescription:
            "Ad creative field to sort on. id is the only sortable field, and Apple Ads sorts by it ascending by default.",
        }),
      },
      { optional: queryOptionalInputs },
    ),
    outputSchema: queryOutput(
      "creatives",
      creativeResource,
      "Ad creatives matching the query on this page.",
      "A page of ad creatives.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_creative",
    operationType: "read",
    description:
      "Read one ad creative by identifier, including its creative spec, destination, system status and per-placement eligibility. A soft-deleted ad creative returns 404: read it back through query_creatives with a deleted filter instead.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Identifies the ad creative to read.",
      {
        creativeId: identifierInput("Identifier of the ad creative."),
        adAccountId: adAccountIdInput,
      },
      { required: ["creativeId"] },
    ),
    outputSchema: s.actionOutput({ creative: creativeResource }, "The requested ad creative."),
  }),
  defineProviderAction(service, {
    name: "create_creative",
    operationType: "write",
    description:
      "Create an ad creative at the ad account level. It is not tied to a campaign or ad group, so several ads can reference the same one. creativeType and destination are fixed at creation. Pass the returned identifier as creativeId when creating an ad.",
    requiredScopes: [],
    providerPermissions: [...manageCampaignsRoles],
    inputSchema: s.object(
      "The ad creative to create.",
      {
        adAccountId: adAccountIdInput,
        name: nonEmptyString("Name of the ad creative."),
        creativeType: s.stringEnum(
          "Content source of the ad creative, which decides the shape of creativeSpec and destination. It cannot be changed later.",
          creativeTypes,
        ),
        creativeSpec: creativeSpecInput,
        destination: destinationInput,
      },
      { required: ["name", "creativeType", "destination"] },
    ),
    outputSchema: s.actionOutput({ creative: creativeResource }, "The created ad creative."),
  }),
  defineProviderAction(service, {
    name: "update_creative",
    operationType: "destructive",
    description:
      "Change the name or creative spec of one ad creative. They are the only mutable fields; creativeType and destination are locked at creation. Changing creativeSpec can send the ad creative back to PENDING for re-review, which stops the ads referencing it from delivering until it is VALID again.",
    requiredScopes: [],
    providerPermissions: [...manageCampaignsRoles],
    inputSchema: s.object(
      "The ad creative changes to apply.",
      {
        creativeId: identifierInput("Identifier of the ad creative to update."),
        adAccountId: adAccountIdInput,
        name: nonEmptyString("New name of the ad creative."),
        creativeSpec: creativeSpecInput,
      },
      { required: ["creativeId"] },
    ),
    outputSchema: s.actionOutput({ creative: creativeResource }, "The updated ad creative."),
  }),
  defineProviderAction(service, {
    name: "delete_creative",
    operationType: "destructive",
    description:
      "Soft-delete one ad creative. It cannot be undone or reused for new ads, and every ad already referencing it drops to systemStatus NOT_RUNNING without being deleted. Deleting an already deleted ad creative returns 404.",
    requiredScopes: [],
    providerPermissions: [...manageCampaignsRoles],
    inputSchema: s.object(
      "Identifies the ad creative to delete.",
      {
        creativeId: identifierInput("Identifier of the ad creative to delete."),
        adAccountId: adAccountIdInput,
      },
      { required: ["creativeId"] },
    ),
    outputSchema: s.actionOutput(
      deletedOutput("Identifier of the soft-deleted ad creative."),
      "Confirmation that the ad creative was soft-deleted.",
    ),
  }),
];

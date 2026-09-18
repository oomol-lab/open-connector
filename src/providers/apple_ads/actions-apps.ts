import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

const service = "apple_ads";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  adAccountIdInput,
  appleAdsDateTimeOutput,
  identifierInput,
  looseResource,
  nonEmptyString,
  nullableEnum,
  offsetInput,
  queryInputs,
  queryOptionalInputs,
  queryOutput,
  readCampaignsRoles,
  resourceObject,
} from "./schemas.ts";

const appDeviceClasses = ["IPHONE", "IPAD"];
const appEligibilityStates = ["ELIGIBLE", "INELIGIBLE"];
const creativeRejectionReasonLevels = [
  "DEFAULT_PRODUCT_PAGE",
  "DEFAULT_PRODUCT_PAGE_LOCALE",
  "CUSTOM_PRODUCT_PAGE",
  "CUSTOM_PRODUCT_PAGE_LOCALE",
];

const supportedLanguageFilterFields = ["countryCode", "name"];
const supportedLanguageSortFields = ["countryCode", "name"];
const eligibilityFilterFields = [
  "adamId",
  "supplyPlacement",
  "supplySource",
  "countryOrRegion",
  "deviceClass",
  "state",
];
const eligibilitySortFields = ["countryOrRegion"];
const rejectionReasonFilterFields = ["adamId"];
const rejectionReasonSortFields = ["creationTime"];

const countryOrRegionCodeItemDescription = "An ISO 3166-1 alpha-2 country or region code such as US, CA or GB.";

const appInfoResource = looseResource(
  "One app returned by the App Store search.",
  {
    adamId: s.integer(
      "Adam ID of the app. Use it as promotedObjectId when creating a campaign that promotes this app.",
    ),
    appName: s.nullableString("App display name as shown in the App Store."),
    developerName: s.nullableString("Developer or publisher name."),
    countryOrRegionCodes: s.nullable(
      s.stringArray("ISO 3166-1 alpha-2 codes for every App Store country or region where the app is available.", {
        itemDescription: countryOrRegionCodeItemDescription,
      }),
    ),
  },
  ["adamId"],
);

const appDetailsResource = looseResource(
  "App Store metadata for one app.",
  {
    id: s.string("Adam ID of the app as a decimal string. It is the same value a campaign uses as promotedObjectId."),
    appName: s.nullableString("Application display name."),
    artistName: s.nullableString("Developer or company name from App Store Connect."),
    primaryLanguage: s.nullableString("Primary language of the app as a BCP-47 code, for example en-US."),
    primaryGenre: s.nullableString("Primary App Store genre category."),
    secondaryGenre: s.nullableString("Secondary App Store genre category, if one is assigned."),
    deviceClasses: s.nullable(
      s.array(
        "Device families the app supports. Check them against the device-class targeting of the ad group before launching.",
        s.stringEnum("A supported device family.", appDeviceClasses),
      ),
    ),
    iconPictureUrl: s.nullableString("URL of the app icon image."),
    isPreorder: s.nullableBoolean("Whether the app is currently available as a pre-order."),
    availableStorefronts: s.nullable(
      s.stringArray(
        "ISO 3166-1 alpha-2 country codes where the app is available. A campaign's countryOrRegion targeting has to be a subset of this list, otherwise that market serves no impressions.",
        { itemDescription: countryOrRegionCodeItemDescription },
      ),
    ),
  },
  ["id"],
);

const localeInfoOutput = (description: string) =>
  looseResource(description, {
    language: s.nullableString("Language identifier, for example en or es."),
    languageCode: s.nullableString("BCP-47 language code, for example en-US."),
  });

const appSupportedLanguagesResource = looseResource(
  "Languages available for Apple Ads in one App Store country or region.",
  {
    name: s.nullableString("Full display name of the country or region, for example United States."),
    countryCode: s.nullableString("ISO 3166-1 alpha-2 country or region code, for example US."),
    adsSupportedLanguages: s.nullable(
      s.array(
        "Every language and locale combination eligible for Apple Ads creatives and targeting in this market.",
        localeInfoOutput("A supported language and its BCP-47 locale code."),
      ),
    ),
    adsDefaultLanguages: s.nullable(
      s.array(
        "Languages applied automatically when no explicit locale is set for this market.",
        localeInfoOutput("A default language and its BCP-47 locale code."),
      ),
    ),
  },
);

const appEligibilityResource = looseResource(
  "Eligibility of one app for one combination of supply placement, supply source, country or region and device class.",
  {
    adamId: s.nullableInteger("Adam ID of the evaluated app."),
    supplyPlacement: s.nullableString("Supply placement being checked."),
    supplySource: s.nullableString("Supply source being checked."),
    minAge: s.nullableNumber("Minimum age rating required to serve ads for this app in this market."),
    state: nullableEnum("Eligibility state for this combination.", appEligibilityStates),
    countryOrRegion: s.nullableString("Country or region evaluated, as an ISO 3166-1 alpha-2 code."),
    deviceClass: s.nullableString("Device class evaluated."),
    reasons: s.nullable(
      s.stringArray("Codes explaining an INELIGIBLE state.", {
        itemDescription: "A reason code such as APP_NOT_ELIGIBLE_SUPPLY or APP_NOT_ELIGIBLE_IN_STOREFRONT.",
      }),
    ),
    creationTime: appleAdsDateTimeOutput("When this eligibility record was created."),
    modificationTime: appleAdsDateTimeOutput("When this eligibility record was last modified."),
  },
);

const rejectionReasonResource = resourceObject(
  "One ad creative rejection reason recorded during Apple review.",
  "System-assigned identifier for the rejection reason record.",
  {
    adamId: s.nullableInteger(
      "Adam ID of the app whose product page triggered the rejection, when the rejection is app-scoped.",
    ),
    creativeId: s.nullableInteger("Identifier of the ad creative that was rejected."),
    productPageId: s.nullableString("Product page identifier associated with the rejection."),
    assetId: s.nullableString("UUID of the asset that triggered the rejection."),
    supplySource: s.nullableString("Supply source the rejection applies to."),
    supplyPlacement: s.nullableString("Supply placement the rejection applies to."),
    countryOrRegion: s.nullableString("Country or region code the rejection applies to."),
    languageCode: s.nullableString("Language code the rejection applies to."),
    reasonType: s.nullableString("Type of rejection reason, for example REJECTION_REASON."),
    reasonCode: s.nullableString("Code for the specific rejection reason."),
    comment: s.nullableString("Additional context for the rejection."),
    reasonLevel: nullableEnum("Level the rejection applies at.", creativeRejectionReasonLevels),
    creationTime: appleAdsDateTimeOutput("When the rejection reason record was created."),
    modificationTime: appleAdsDateTimeOutput("When the rejection reason record was last modified."),
  },
);

export const appleAdsAppActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_apps",
    operationType: "read",
    description:
      "Search the App Store for apps by name or content provider, or list the apps the organization owns. Supply at least one of query, cpids or returnOwnedApps set to true. Campaigns can only promote apps the ad account owns, so use returnOwnedApps to find a usable promotedObjectId.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Search criteria for App Store apps.",
      {
        adAccountId: adAccountIdInput,
        query: nonEmptyString(
          "Free-text search matched against app name and developer name. It has to contain at least one alphanumeric character and at least 3 characters, or 2 characters for CJK languages.",
        ),
        returnOwnedApps: s.boolean(
          "Whether to return the apps owned by the caller's organization. It can be combined with query and cpids or used on its own, and Apple Ads defaults it to false.",
        ),
        cpids: s.stringArray(
          "iTunes content provider identifiers that scope the search to apps owned by those providers. They are sent as the comma-separated cpids query parameter.",
          { itemDescription: "An iTunes content provider identifier." },
        ),
        storeFronts: s.stringArray(
          "App Store countries or regions to search in. Every value has to be an enabled App Store country or region, otherwise Apple Ads answers with INVALID_COUNTRY_CODE.",
          { itemDescription: countryOrRegionCodeItemDescription },
        ),
        offset: offsetInput,
        limit: s.positiveInteger(
          "Maximum number of results to return. Apple Ads defaults to 20 and caps it at a service-side maximum.",
        ),
      },
      { required: [] },
    ),
    outputSchema: queryOutput(
      "apps",
      appInfoResource,
      "Apps matching the search criteria on this page.",
      "A page of App Store search results.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_app",
    operationType: "read",
    description:
      "Read the App Store metadata of one app by its Adam ID, including its genres, supported device classes and the countries or regions it is available in. Apple Ads answers with 404 when no app matches the Adam ID.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Identifies the app to read.",
      {
        adamId: identifierInput("Adam ID of the app."),
        adAccountId: adAccountIdInput,
      },
      { required: ["adamId"] },
    ),
    outputSchema: s.actionOutput({ app: appDetailsResource }, "The requested app."),
  }),
  defineProviderAction(service, {
    name: "query_supported_app_languages",
    operationType: "read",
    description:
      "List the App Store countries or regions along with the languages that Apple Ads supports in each market. Use it to validate a locale before setting it on an ad group or a creative. An empty query returns every market.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Query for browsing the ad-supported languages of each market.",
      {
        adAccountId: adAccountIdInput,
        ...queryInputs({
          filterFields: supportedLanguageFilterFields,
          filterFieldDescription: "Market field to filter on. countryCode accepts EQUALS and IN; name accepts EQUALS.",
          sortFields: supportedLanguageSortFields,
          sortFieldDescription: "Market field to sort on.",
        }),
      },
      { optional: queryOptionalInputs },
    ),
    outputSchema: queryOutput(
      "markets",
      appSupportedLanguagesResource,
      "One row per App Store country or region on this page.",
      "A page of ad-supported languages per market.",
    ),
  }),
  defineProviderAction(service, {
    name: "query_app_eligibilities",
    operationType: "read",
    description:
      "Check whether apps are eligible to run App Store ads, one row per combination of app, supply placement, supply source, country or region and device class. Run it before creating a campaign in a new market, because an ineligible market delivers nothing. Apple Maps brand promotion is not covered here.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Query for browsing app eligibility records.",
      {
        adAccountId: adAccountIdInput,
        ...queryInputs({
          filterFields: eligibilityFilterFields,
          filterFieldDescription:
            "Eligibility field to filter on. adamId accepts EQUALS and IN, and filtering on several adamId values checks several apps in one request.",
          sortFields: eligibilitySortFields,
          sortFieldDescription:
            "Eligibility field to sort on. countryOrRegion is the only field Apple Ads documents as sortable here.",
        }),
      },
      { optional: queryOptionalInputs },
    ),
    outputSchema: queryOutput(
      "eligibilities",
      appEligibilityResource,
      "Eligibility records matching the query on this page.",
      "A page of app eligibility records.",
    ),
  }),
  defineProviderAction(service, {
    name: "query_app_rejection_reasons",
    operationType: "read",
    description:
      "Search the rejection reasons recorded for the App Store ad creatives of an app, explaining why each creative failed Apple review. Filter by adamId to scope the search to one app.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Query for browsing ad creative rejection reasons.",
      {
        adAccountId: adAccountIdInput,
        ...queryInputs({
          filterFields: rejectionReasonFilterFields,
          filterFieldDescription:
            "Rejection reason field to filter on. adamId accepts EQUALS and is the only field Apple Ads documents as filterable here.",
          sortFields: rejectionReasonSortFields,
          sortFieldDescription:
            "Rejection reason field to sort on. Apple Ads marks no field sortable in its table, and creationTime is the only sort field its own request example uses.",
        }),
      },
      { optional: queryOptionalInputs },
    ),
    outputSchema: queryOutput(
      "rejectionReasons",
      rejectionReasonResource,
      "Rejection reasons matching the query on this page.",
      "A page of ad creative rejection reasons.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_app_rejection_reasons",
    operationType: "read",
    description:
      "Read one ad creative rejection reason by identifier, including its reason code, the level it applies at and the reviewer comment.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Identifies the rejection reason to read.",
      {
        rejectionReasonId: identifierInput("Identifier of the rejection reason record."),
        adAccountId: adAccountIdInput,
      },
      { required: ["rejectionReasonId"] },
    ),
    outputSchema: s.actionOutput({ rejectionReason: rejectionReasonResource }, "The requested rejection reason."),
  }),
];

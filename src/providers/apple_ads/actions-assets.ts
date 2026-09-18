import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

const service = "apple_ads";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { promotedObjectTypes } from "./actions-campaigns.ts";
import {
  adAccountIdInput,
  appleAdsDateTimeOutput,
  deletedOutput,
  fetchTotalCountInput,
  identifierInput,
  looseResource,
  manageCampaignsRoles,
  nonEmptyString,
  nullableEnum,
  offsetInput,
  pageSizeInput,
  queryFiltersInput,
  queryOutput,
  readCampaignsRoles,
} from "./schemas.ts";

export const assetTypes: readonly string[] = ["IMAGE"];
export const assetImageFormats: readonly string[] = ["JPEG", "JPG", "PNG", "HEIC", "HEIF", "SVG", "WEBP"];
export const assetOrientations: readonly string[] = ["PORTRAIT", "LANDSCAPE", "SQUARE"];
export const assetEligibilityStatuses: readonly string[] = [
  "ELIGIBLE",
  "INELIGIBLE",
  "LIMITED",
  "PENDING",
  "UNDEFINED",
];

const assetFilterFields = [
  "id",
  "name",
  "assetType",
  "providerAssetId",
  "promotedObjectId",
  "promotedObjectType",
  "deleted",
];
const productPageFilterFields = ["adamId", "state"];
const productPageLocaleDetailFilterFields = ["productPageId", "language", "languageCode"];
const appLocaleDetailFilterFields = ["languageCode"];

const localQueryInputs = (fields: readonly string[], fieldDescription: string, filtersDescription?: string) => ({
  filters:
    filtersDescription === undefined
      ? queryFiltersInput(fields, fieldDescription)
      : s.describe(queryFiltersInput(fields, fieldDescription), filtersDescription),
  offset: offsetInput,
  pageSize: pageSizeInput,
  fetchTotalCount: fetchTotalCountInput,
});

const localQueryOptionalInputs = ["adAccountId", "filters", "offset", "pageSize", "fetchTotalCount"];

const assetIdInput = s.uuid("Identifier of the asset. Apple Ads assigns it as a UUID.");

const assetConstraintGroup = looseResource(
  "A pairing of supply placements and markets that one eligibility rule applies to. When both lists are populated the rule covers their intersection.",
  {
    supplyPlacement: s.nullable(
      s.stringArray("Supply placements scoped by this constraint.", {
        itemDescription:
          "A supply placement identifier. Apple Ads documents SEARCH_TAB, TODAY_TAB and SEARCH_RESULTS as examples rather than a closed list.",
      }),
    ),
    countryOrRegion: s.nullable(
      s.stringArray("Countries or regions scoped by this constraint.", {
        itemDescription: "An ISO 3166-1 alpha-2 country or region code such as US, GB or CN.",
      }),
    ),
  },
);

const assetImageDetails = looseResource(
  "Image metadata Apple Ads derived when it ingested the asset. It is present when assetType is IMAGE.",
  {
    width: s.nullableInteger("Width of the image in pixels."),
    height: s.nullableInteger("Height of the image in pixels."),
    format: nullableEnum("File format of the image.", assetImageFormats),
    sizeBytes: s.nullableInteger("File size in bytes."),
    orientation: nullableEnum("Aspect-ratio classification of the image.", assetOrientations),
    providerAssetUrl: s.nullableString("Source URL of the image at the provider system."),
    providerToken: s.nullableString("Provider token used to reference the image in provider-specific APIs."),
    checkSum: s.nullableString("File checksum for verifying asset integrity after transfer."),
    sortPosition: s.nullableInteger("Display order position within an asset collection."),
    adAccountId: s.nullable(
      s.anyOf([s.string(), s.integer()], {
        description:
          "Ad account the asset belongs to, present for custom assets. Apple Ads returns it as a string in some payloads and as a number in others.",
      }),
    ),
  },
);

const assetResource = looseResource(
  "A creative asset in one ad account's asset library, with its media metadata and policy eligibility.",
  {
    id: s.string("System-assigned identifier for the asset, a UUID."),
    name: s.nullableString("User-facing asset name or description."),
    assetType: nullableEnum("Media type of the asset.", assetTypes),
    providerAssetId: s.nullableString(
      "Asset identifier assigned by the provider system, for example the App Store Connect asset identifier.",
    ),
    promotedObjectId: s.nullableString(
      "Identifier of the promoted object: the adamId for an App Store app, or the brand identifier for an Apple Maps brand.",
    ),
    promotedObjectType: nullableEnum("Type of the promoted object.", promotedObjectTypes),
    providerAssetMetadata: s.nullable(
      s.looseObject(
        "Provider-specific metadata whose keys vary by provider. App Store Connect assets carry keys such as appPreviewDevice and assetGenId, and assets uploaded for Apple Maps brands carry an empty object.",
      ),
    ),
    assetDetails: s.nullable(assetImageDetails),
    parentAssetId: s.nullableString(
      "Identifier of the parent asset when this asset is a variant such as a crop or a resize, or null for an original asset.",
    ),
    variantIds: s.nullable(
      s.stringArray("Identifiers of this asset's variants.", {
        itemDescription: "Identifier of one variant asset.",
      }),
    ),
    eligibility: s.nullable(
      looseResource(
        "Policy evaluation result for the asset. Check it before referencing the asset in a creative: INELIGIBLE and PENDING assets cannot serve anywhere, and LIMITED assets only serve outside their blocked groups.",
        {
          status: nullableEnum("Overall eligibility status.", assetEligibilityStatuses),
          blockedGroups: s.nullable(
            s.array("Constraint groups where the asset is blocked from serving.", assetConstraintGroup),
          ),
          allowedGroups: s.nullable(
            s.array("Constraint groups where the asset is explicitly allowed to serve.", assetConstraintGroup),
          ),
        },
      ),
    ),
    creationTime: appleAdsDateTimeOutput("When the asset was created."),
    modificationTime: appleAdsDateTimeOutput("When the asset was last modified."),
    deleted: s.nullableBoolean("Whether the asset has been soft-deleted."),
  },
  ["id"],
);

const productPageResource = looseResource(
  "An App Store product page as Apple Ads sees it. It can be the app's default product page, a custom product page, or a product page optimization variant, and it is created and edited in App Store Connect.",
  {
    id: s.string("App Store Connect identifier for the product page."),
    adamId: s.nullableInteger("App Store identifier of the app this product page belongs to."),
    name: s.nullableString("Product page name as configured in App Store Connect."),
    state: s.nullableString(
      "Distribution state of the product page. It is an open string rather than a closed enum; a live page is typically PUBLISHED, and App Store Connect can surface other values such as READY_FOR_DISTRIBUTION while a change propagates.",
    ),
    deepLink: s.nullableString(
      "URL used when this product page is a creative destination, or null when no deep link is configured.",
    ),
    creationTime: appleAdsDateTimeOutput("When the product page was created."),
    modificationTime: appleAdsDateTimeOutput("When the product page was last modified."),
  },
  ["id"],
);

const deviceAssetGroup = looseResource(
  "Assets configured for one device type, plus the device types to fall back to when this one has no assets.",
  {
    assets: s.nullable(
      s.array(
        "Asset references for this device type, in display order.",
        looseResource("A reference to an asset by its identifier.", {
          assetId: s.nullableString("Identifier of the referenced asset."),
        }),
      ),
    ),
    appPreviewDeviceFallBackDevices: s.nullable(
      s.stringArray("Device types to fall back to when this device type has no assets.", {
        itemDescription: "A device type identifier such as iphone6 or iphone5.",
      }),
    ),
  },
);

const localeDetailFields = {
  adamId: s.nullableInteger("App Store identifier of the app."),
  language: s.nullableString("Language identifier, for example en."),
  languageCode: s.nullableString("Locale identifier as a BCP 47 language code, for example en-US."),
  appName: s.nullableString("Localized app display name as it appears on the App Store."),
  subTitle: s.nullableString("App subtitle for this locale."),
  promotionalText: s.nullableString("Promotional text for this locale, at most 170 characters long."),
  shortDescription: s.nullableString("Short description for this locale, at most 4000 characters long."),
  deviceClasses: s.nullable(
    s.stringArray("Device classes this locale supports.", {
      itemDescription: "A device class, either IPHONE or IPAD.",
    }),
  ),
  assetsByDevice: s.nullable(
    s.record(
      "Screenshots and preview videos keyed by device type, for example iphone_6_5 or iphone_6_7. The keys are device type strings and are not limited to the values in deviceClasses.",
      deviceAssetGroup,
    ),
  ),
};

const productPageLocaleDetailsResource = looseResource("The localized content of one product page for one locale.", {
  productPageId: s.nullableString("Identifier of the product page these details belong to."),
  ...localeDetailFields,
});

const appLocaleDetailsResource = looseResource(
  "The localized content of one app's default product page for one locale.",
  {
    ...localeDetailFields,
    isPrimaryLocale: s.nullableBoolean("Whether this locale is the app's primary App Store locale."),
  },
);

export const appleAdsAssetActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "query_assets",
    operationType: "read",
    description:
      "Search the creative assets of one ad account. Soft-deleted assets and variant crops are excluded from the results; filter on deleted to include soft-deleted assets, and read a variant with get_asset. Filter on promotedObjectId to scope the query to one app or brand, because an unfiltered query spans every promoted object in the ad account.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Query for browsing the assets of one ad account.",
      {
        adAccountId: adAccountIdInput,
        ...localQueryInputs(
          assetFilterFields,
          "Asset field to filter on. id, assetType and providerAssetId accept EQUALS and IN; name additionally accepts LIKE, STARTS_WITH and ENDS_WITH; promotedObjectId, promotedObjectType and deleted accept EQUALS. Apple Ads also documents a LIKE_IGNORE_CASE operator on name; send it as LIKE with ignoreCase set to true.",
        ),
      },
      { optional: localQueryOptionalInputs },
    ),
    outputSchema: queryOutput(
      "assets",
      assetResource,
      "Assets matching the query on this page.",
      "A page of creative assets.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_asset",
    operationType: "read",
    description:
      "Read one creative asset by identifier, including its eligibility status. Apple Ads returns the asset regardless of its deleted state, and this is the only way to read a variant crop, which query_assets omits.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Identifies the asset to read.",
      { assetId: assetIdInput, adAccountId: adAccountIdInput },
      { required: ["assetId"] },
    ),
    outputSchema: s.actionOutput({ asset: assetResource }, "The requested asset."),
  }),
  defineProviderAction(service, {
    name: "delete_asset",
    operationType: "destructive",
    description:
      "Soft-delete one creative asset. Only assets uploaded through the Apple Ads API can be deleted, deleting an already deleted asset fails with 404, and get_asset keeps returning the record with deleted set to true.",
    requiredScopes: [],
    providerPermissions: [...manageCampaignsRoles],
    inputSchema: s.object(
      "Identifies the asset to delete.",
      { assetId: assetIdInput, adAccountId: adAccountIdInput },
      { required: ["assetId"] },
    ),
    outputSchema: s.actionOutput(
      deletedOutput("Identifier of the soft-deleted asset."),
      "Confirmation that the asset was soft-deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "query_product_pages",
    operationType: "read",
    description:
      "Search the App Store product pages available to one ad account, covering default product pages, custom product pages and product page optimization variants. Filter on adamId to list the pages of a single app, because an unfiltered query spans every app the ad account can reach. Product pages come from App Store Connect and appear here after a short propagation delay.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Query for browsing the product pages available to one ad account.",
      {
        adAccountId: adAccountIdInput,
        ...localQueryInputs(
          productPageFilterFields,
          "Product page field to filter on. adamId and state both accept EQUALS.",
        ),
      },
      { optional: localQueryOptionalInputs },
    ),
    outputSchema: queryOutput(
      "productPages",
      productPageResource,
      "Product pages matching the query on this page.",
      "A page of App Store product pages.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_product_page",
    operationType: "read",
    description:
      "Read one App Store product page by identifier. Use query_product_pages to discover the identifiers of an app's product pages first.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Identifies the product page to read.",
      {
        productPageId: nonEmptyString("Identifier of the product page, as assigned by App Store Connect."),
        adAccountId: adAccountIdInput,
      },
      { required: ["productPageId"] },
    ),
    outputSchema: s.actionOutput({ productPage: productPageResource }, "The requested product page."),
  }),
  defineProviderAction(service, {
    name: "query_product_page_locale_details",
    operationType: "read",
    description:
      "Read the localized content of one custom product page: the localized app name, subtitle, promotional text and the screenshots and preview videos grouped by device type. A filter on productPageId is required; without a languageCode filter Apple Ads returns every locale configured for the page.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Query for the locale details of one product page.",
      {
        adAccountId: adAccountIdInput,
        ...localQueryInputs(
          productPageLocaleDetailFilterFields,
          "Locale detail field to filter on. productPageId, language and languageCode each accept EQUALS. A filter on productPageId is required.",
          "Filter conditions combined with logical AND. A filter on productPageId is required; add a languageCode filter to narrow the result to one locale, or leave it out to return every locale configured for that product page.",
        ),
      },
      { required: ["filters"] },
    ),
    outputSchema: queryOutput(
      "localeDetails",
      productPageLocaleDetailsResource,
      "Locale details matching the query on this page, one record per product page and locale combination.",
      "A page of product page locale details.",
    ),
  }),
  defineProviderAction(service, {
    name: "query_app_locale_details",
    operationType: "read",
    description:
      "Read the localized content of one app's default product page, identified by the app's adamId. It returns every locale configured for the default product page unless a languageCode filter narrows it. Custom product pages are not covered here: use query_product_page_locale_details for those.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Query for the default product page locale details of one app.",
      {
        adamId: identifierInput("App Store identifier of the app whose default product page is read."),
        adAccountId: adAccountIdInput,
        ...localQueryInputs(
          appLocaleDetailFilterFields,
          "Locale detail field to filter on. Apple Ads documents languageCode as the only filterable field here and does not document which operators it accepts.",
          "Filter conditions combined with logical AND. The query is already scoped to the app named by adamId, so omit this to return every locale configured for that app's default product page.",
        ),
      },
      { required: ["adamId"] },
    ),
    outputSchema: queryOutput(
      "localeDetails",
      appLocaleDetailsResource,
      "Locale details of the app's default product page on this page, one record per locale.",
      "A page of default product page locale details.",
    ),
  }),
];

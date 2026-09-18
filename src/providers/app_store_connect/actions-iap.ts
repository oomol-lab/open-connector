import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { service } from "./schemas.ts";
import {
  deletedOutput,
  manageInAppPurchaseRoles,
  nonEmptyString,
  nullableEnum,
  pageOutput,
  paginationInputs,
  resourceObject,
  territoryResource,
} from "./schemas.ts";

export const inAppPurchaseTypes: readonly string[] = ["CONSUMABLE", "NON_CONSUMABLE", "NON_RENEWING_SUBSCRIPTION"];
export const inAppPurchaseStates: readonly string[] = [
  "MISSING_METADATA",
  "WAITING_FOR_UPLOAD",
  "PROCESSING_CONTENT",
  "READY_TO_SUBMIT",
  "WAITING_FOR_REVIEW",
  "IN_REVIEW",
  "DEVELOPER_ACTION_NEEDED",
  "PENDING_BINARY_APPROVAL",
  "APPROVED",
  "DEVELOPER_REMOVED_FROM_SALE",
  "REMOVED_FROM_SALE",
  "REJECTED",
];
export const inAppPurchaseLocalizationStates: readonly string[] = [
  "PREPARE_FOR_SUBMISSION",
  "WAITING_FOR_REVIEW",
  "APPROVED",
  "REJECTED",
];
export const inAppPurchaseVersionStates: readonly string[] = [
  "PREPARE_FOR_SUBMISSION",
  "READY_FOR_REVIEW",
  "WAITING_FOR_REVIEW",
  "IN_REVIEW",
  "ACCEPTED",
  "APPROVED",
  "REPLACED_WITH_NEW_VERSION",
  "REJECTED",
  "DEVELOPER_REJECTED",
];
export const offerCodeCustomerEligibilities: readonly string[] = ["NON_SPENDER", "ACTIVE_SPENDER", "CHURNED_SPENDER"];
export const offerCodeEnvironments: readonly string[] = ["PRODUCTION", "SANDBOX"];
export const promotedPurchaseStates: readonly string[] = [
  "APPROVED",
  "IN_REVIEW",
  "PREPARE_FOR_SUBMISSION",
  "REJECTED",
];

const inAppPurchaseIdInput = nonEmptyString("App Store Connect identifier of the in-app purchase.");
const territoryDescription = "ISO 3166-1 alpha-3 territory code, such as USA.";
const territoryFilterInput = nonEmptyString(`Return only records for this territory, as an ${territoryDescription}`);
const localeInput = nonEmptyString("Locale the text is written in, such as en-US.");
const customerPriceOutput = s.nullableString("Price the customer pays, as a decimal string in the territory currency.");
const proceedsOutput = s.nullableString(
  "Amount the developer receives per sale, as a decimal string in the territory currency.",
);
const territoryOutput = s.nullableString(`Territory the price applies to, as an ${territoryDescription}`);

export const inAppPurchaseResource: JsonSchema = resourceObject(
  "An in-app purchase of an app: a consumable, non-consumable, or non-renewing subscription.",
  "App Store Connect identifier for the in-app purchase.",
  {
    name: s.nullableString("Reference name shown in App Store Connect."),
    productId: s.nullableString("Product identifier the app passes to StoreKit to request the purchase."),
    inAppPurchaseType: nullableEnum("Kind of in-app purchase.", inAppPurchaseTypes),
    state: nullableEnum(
      "Where the in-app purchase stands in metadata preparation, review, and sale.",
      inAppPurchaseStates,
    ),
    reviewNote: s.nullableString("Note shown to App Review alongside the purchase."),
    familySharable: s.nullableBoolean("Whether the purchase can be shared through Family Sharing."),
    contentHosting: s.nullableBoolean("Whether Apple hosts the downloadable content of the purchase."),
  },
);

export const inAppPurchaseLocalizationResource: JsonSchema = resourceObject(
  "A localized display name and description of an in-app purchase.",
  "App Store Connect identifier for the localization.",
  {
    name: s.nullableString("Display name customers see in this locale."),
    locale: s.nullableString("Locale the text is written in, such as en-US."),
    description: s.nullableString("Description customers see in this locale."),
    state: nullableEnum("Review state of the localization.", inAppPurchaseLocalizationStates),
  },
);

export const inAppPurchaseVersionLocalizationResource: JsonSchema = resourceObject(
  "A localized display name and description attached to one in-app purchase version.",
  "App Store Connect identifier for the localization.",
  {
    name: s.nullableString("Display name customers see in this locale."),
    locale: s.nullableString("Locale the text is written in, such as en-US."),
    description: s.nullableString("Description customers see in this locale."),
  },
);

export const inAppPurchaseVersionResource: JsonSchema = resourceObject(
  "A metadata version of an in-app purchase that App Review evaluates as a unit.",
  "App Store Connect identifier for the in-app purchase version.",
  {
    version: s.nullableInteger("Sequential version number assigned by App Store Connect."),
    state: nullableEnum("Review state of the version.", inAppPurchaseVersionStates),
  },
);

export const inAppPurchasePricePointResource: JsonSchema = resourceObject(
  "A price point an in-app purchase can be sold at in one territory.",
  "App Store Connect identifier for the price point.",
  {
    customerPrice: customerPriceOutput,
    proceeds: proceedsOutput,
    territory: territoryOutput,
    currency: s.nullableString("ISO 4217 currency of the territory, such as USD."),
  },
  ["territory", "currency"],
);

export const inAppPurchasePriceResource: JsonSchema = resourceObject(
  "One price in the price schedule of an in-app purchase.",
  "App Store Connect identifier for the scheduled price.",
  {
    startDate: s.nullableString(
      "First day the price applies, as YYYY-MM-DD, or null when it applies from the start of the schedule.",
    ),
    endDate: s.nullableString(
      "Last day the price applies, as YYYY-MM-DD, or null when it stays in effect until replaced.",
    ),
    manual: s.nullableBoolean("Whether the price was set manually rather than derived from the base territory."),
    territory: territoryOutput,
    inAppPurchasePricePointId: s.nullableString("Price point the price uses."),
    customerPrice: customerPriceOutput,
    proceeds: proceedsOutput,
  },
  ["territory", "inAppPurchasePricePointId", "customerPrice", "proceeds"],
);

const priceScheduleFields = {
  id: s.string("App Store Connect identifier for the price schedule."),
  baseTerritory: s.nullableString(
    `Territory whose price the automatic prices of the other territories are derived from, as an ${territoryDescription}`,
  ),
};

export const inAppPurchasePriceScheduleOutput: JsonSchema = s.object(
  "The price schedule of an in-app purchase.",
  priceScheduleFields,
  { additionalProperties: true, required: ["id", "baseTerritory"] },
);

const inAppPurchaseAvailabilityFields = {
  availableInNewTerritories: s.nullableBoolean(
    "Whether the purchase automatically becomes available in territories Apple adds later.",
  ),
};

export const inAppPurchaseAvailabilityResource: JsonSchema = resourceObject(
  "Territory availability of an in-app purchase.",
  "App Store Connect identifier for the availability record.",
  inAppPurchaseAvailabilityFields,
);

const inAppPurchaseContentFields = {
  fileName: s.nullableString("File name of the uploaded content package."),
  fileSize: s.nullableInteger("Size of the content package in bytes."),
  url: s.nullableString("Temporary download URL for the content package."),
  lastModifiedDate: s.nullableString("When the content was last uploaded, as an ISO 8601 timestamp."),
};

export const inAppPurchaseOfferCodeResource: JsonSchema = resourceObject(
  "An offer code configuration that lets customers redeem an in-app purchase at a discounted price.",
  "App Store Connect identifier for the offer code.",
  {
    name: s.nullableString("Reference name of the offer."),
    customerEligibilities: s.nullable(
      s.array(
        "Customer groups allowed to redeem the offer.",
        s.stringEnum("A customer eligibility group.", offerCodeCustomerEligibilities),
      ),
    ),
    productionCodeCount: s.nullableInteger("Number of one-time-use codes generated for the production environment."),
    sandboxCodeCount: s.nullableInteger("Number of one-time-use codes generated for the sandbox environment."),
    active: s.nullableBoolean("Whether the offer can currently be redeemed."),
  },
);

export const inAppPurchaseOfferPriceResource: JsonSchema = resourceObject(
  "The discounted price of an offer code in one territory.",
  "App Store Connect identifier for the offer price.",
  {
    territory: territoryOutput,
    inAppPurchasePricePointId: s.nullableString("Price point the discounted price uses."),
    customerPrice: customerPriceOutput,
    proceeds: proceedsOutput,
  },
  ["territory", "inAppPurchasePricePointId", "customerPrice", "proceeds"],
);

export const inAppPurchaseOfferCodeCustomCodeResource: JsonSchema = resourceObject(
  "A custom offer code that many customers can redeem by typing the same text.",
  "App Store Connect identifier for the custom code.",
  {
    customCode: s.nullableString("The code customers enter, such as SPRING2026."),
    numberOfCodes: s.nullableInteger("How many redemptions the custom code allows."),
    createdDate: s.nullableString("When the code was created, as an ISO 8601 timestamp."),
    expirationDate: s.nullableString("Last day the code can be redeemed, as YYYY-MM-DD."),
    active: s.nullableBoolean("Whether the code can currently be redeemed."),
  },
);

export const inAppPurchaseOfferCodeOneTimeUseCodeResource: JsonSchema = resourceObject(
  "A batch of one-time-use offer codes; the code values themselves are downloaded from App Store Connect as a CSV file.",
  "App Store Connect identifier for the batch.",
  {
    numberOfCodes: s.nullableInteger("Number of codes in the batch."),
    createdDate: s.nullableString("When the batch was created, as an ISO 8601 timestamp."),
    expirationDate: s.nullableString("Last day the codes can be redeemed, as YYYY-MM-DD."),
    active: s.nullableBoolean("Whether the codes can currently be redeemed."),
    environment: nullableEnum("Environment the codes redeem in.", offerCodeEnvironments),
  },
);

export const promotedPurchaseResource: JsonSchema = resourceObject(
  "An in-app purchase or subscription promoted on the App Store product page of an app.",
  "App Store Connect identifier for the promoted purchase.",
  {
    visibleForAllUsers: s.nullableBoolean(
      "Whether every customer sees the promotion, or only those the app selects through StoreKit.",
    ),
    enabled: s.nullableBoolean("Whether the promotion is enabled."),
    state: nullableEnum("Review state of the promotion.", promotedPurchaseStates),
    inAppPurchaseId: s.nullableString(
      "The promoted in-app purchase, or null when the promotion is for a subscription or the link was not returned.",
    ),
    subscriptionId: s.nullableString(
      "The promoted subscription, or null when the promotion is for an in-app purchase or the link was not returned.",
    ),
  },
  ["inAppPurchaseId", "subscriptionId"],
);

export const appStoreConnectInAppPurchaseActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_in_app_purchases",
    operationType: "read",
    description:
      "List the in-app purchases of one app (consumables, non-consumables, and non-renewing subscriptions; auto-renewable subscriptions are a separate family). Filter by type, state, name, or product identifier.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the in-app purchases of one app.",
      {
        appId: nonEmptyString("App Store Connect identifier of the app."),
        inAppPurchaseType: s.stringEnum("Return only in-app purchases of this type.", inAppPurchaseTypes),
        state: s.stringEnum("Return only in-app purchases in this state.", inAppPurchaseStates),
        name: nonEmptyString("Return only in-app purchases with this exact reference name."),
        productId: nonEmptyString("Return only the in-app purchase with this exact product identifier."),
        sort: s.stringEnum("Sort order for the returned in-app purchases.", [
          "name",
          "-name",
          "inAppPurchaseType",
          "-inAppPurchaseType",
        ]),
        ...paginationInputs,
      },
      { required: ["appId"] },
    ),
    outputSchema: pageOutput(
      "inAppPurchases",
      inAppPurchaseResource,
      "In-app purchases returned for this page.",
      "A page of in-app purchases.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_in_app_purchase",
    operationType: "read",
    description: "Read one in-app purchase by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { inAppPurchaseId: inAppPurchaseIdInput },
      ["inAppPurchaseId"],
      "Identifies the in-app purchase to read.",
    ),
    outputSchema: s.actionOutput({ inAppPurchase: inAppPurchaseResource }, "The requested in-app purchase."),
  }),
  defineProviderAction(service, {
    name: "create_in_app_purchase",
    operationType: "write",
    description:
      "Create an in-app purchase for an app. The product identifier is permanent and cannot be reused after deletion, so choose it carefully. The purchase starts in MISSING_METADATA until localizations, a price schedule, and a review screenshot are added.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The in-app purchase to create.",
      {
        appId: nonEmptyString("App Store Connect identifier of the app the purchase belongs to."),
        name: nonEmptyString("Reference name shown in App Store Connect, up to 64 characters."),
        productId: nonEmptyString(
          "Product identifier the app passes to StoreKit, such as com.example.app.coins100. Unique within the app and permanent.",
        ),
        inAppPurchaseType: s.stringEnum("Kind of in-app purchase.", inAppPurchaseTypes),
        reviewNote: nonEmptyString("Note for App Review, for example how to reach the purchase."),
        familySharable: s.boolean("Allow the purchase to be shared through Family Sharing."),
      },
      { required: ["appId", "name", "productId", "inAppPurchaseType"] },
    ),
    outputSchema: s.actionOutput({ inAppPurchase: inAppPurchaseResource }, "The created in-app purchase."),
  }),
  defineProviderAction(service, {
    name: "update_in_app_purchase",
    operationType: "destructive",
    description:
      "Update the reference name, review note, or Family Sharing flag of an in-app purchase. Pass at least one field; each given field overwrites the current value.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The in-app purchase fields to change.",
      {
        inAppPurchaseId: inAppPurchaseIdInput,
        name: nonEmptyString("New reference name, up to 64 characters."),
        reviewNote: nonEmptyString("New note for App Review."),
        familySharable: s.boolean("Whether the purchase can be shared through Family Sharing."),
      },
      { required: ["inAppPurchaseId"] },
    ),
    outputSchema: s.actionOutput({ inAppPurchase: inAppPurchaseResource }, "The updated in-app purchase."),
  }),
  defineProviderAction(service, {
    name: "delete_in_app_purchase",
    operationType: "destructive",
    description:
      "Delete an in-app purchase that has never been approved. Its product identifier can never be used again for this app.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.actionInput(
      { inAppPurchaseId: inAppPurchaseIdInput },
      ["inAppPurchaseId"],
      "Identifies the in-app purchase to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted in-app purchase."),
      "Confirmation that the in-app purchase was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_in_app_purchase_localizations",
    operationType: "read",
    description: "List the localized display names and descriptions of one in-app purchase, one record per locale.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the in-app purchase whose localizations to list.",
      { inAppPurchaseId: inAppPurchaseIdInput, ...paginationInputs },
      { required: ["inAppPurchaseId"] },
    ),
    outputSchema: pageOutput(
      "localizations",
      inAppPurchaseLocalizationResource,
      "Localizations returned for this page.",
      "A page of in-app purchase localizations.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_in_app_purchase_localization",
    operationType: "read",
    description: "Read one in-app purchase localization by its identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        inAppPurchaseLocalizationId: nonEmptyString("App Store Connect identifier of the localization."),
      },
      ["inAppPurchaseLocalizationId"],
      "Identifies the localization to read.",
    ),
    outputSchema: s.actionOutput({ localization: inAppPurchaseLocalizationResource }, "The requested localization."),
  }),
  defineProviderAction(service, {
    name: "create_in_app_purchase_localization",
    operationType: "write",
    description:
      "Add the display name and description of an in-app purchase for one locale. Each locale can have only one localization per purchase.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The localization to create.",
      {
        inAppPurchaseId: inAppPurchaseIdInput,
        locale: localeInput,
        name: nonEmptyString("Display name customers see, up to 30 characters."),
        description: nonEmptyString("Description customers see, up to 45 characters."),
      },
      { required: ["inAppPurchaseId", "locale", "name"] },
    ),
    outputSchema: s.actionOutput({ localization: inAppPurchaseLocalizationResource }, "The created localization."),
  }),
  defineProviderAction(service, {
    name: "update_in_app_purchase_localization",
    operationType: "write",
    description:
      "Overwrite the display name or description of an in-app purchase localization. Pass at least one field; the locale itself cannot be changed.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The localization fields to change.",
      {
        inAppPurchaseLocalizationId: nonEmptyString("App Store Connect identifier of the localization."),
        name: nonEmptyString("New display name, up to 30 characters."),
        description: nonEmptyString("New description, up to 45 characters."),
      },
      { required: ["inAppPurchaseLocalizationId"] },
    ),
    outputSchema: s.actionOutput({ localization: inAppPurchaseLocalizationResource }, "The updated localization."),
  }),
  defineProviderAction(service, {
    name: "delete_in_app_purchase_localization",
    operationType: "destructive",
    description: "Delete one locale of an in-app purchase's display name and description.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.actionInput(
      {
        inAppPurchaseLocalizationId: nonEmptyString("App Store Connect identifier of the localization."),
      },
      ["inAppPurchaseLocalizationId"],
      "Identifies the localization to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted localization."),
      "Confirmation that the localization was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_in_app_purchase_price_points",
    operationType: "read",
    description:
      "List the price points available to an in-app purchase, with the customer price and proceeds per territory. Use a price point identifier from here when building a price schedule or offer code price.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the price points of one in-app purchase.",
      {
        inAppPurchaseId: inAppPurchaseIdInput,
        territory: territoryFilterInput,
        ...paginationInputs,
      },
      { required: ["inAppPurchaseId"] },
    ),
    outputSchema: pageOutput(
      "pricePoints",
      inAppPurchasePricePointResource,
      "Price points returned for this page.",
      "A page of in-app purchase price points.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_in_app_purchase_price_point_equalizations",
    operationType: "read",
    description:
      "List the price points in other territories that Apple considers equivalent to one price point, which is how automatic prices for a base territory are derived.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the equalized price points of one price point.",
      {
        inAppPurchasePricePointId: nonEmptyString("App Store Connect identifier of the price point to equalize from."),
        inAppPurchaseId: nonEmptyString("Return only equalizations that belong to this in-app purchase."),
        territory: territoryFilterInput,
        ...paginationInputs,
      },
      { required: ["inAppPurchasePricePointId"] },
    ),
    outputSchema: pageOutput(
      "pricePoints",
      inAppPurchasePricePointResource,
      "Equalized price points returned for this page.",
      "A page of equalized in-app purchase price points.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_in_app_purchase_price_schedule",
    operationType: "read",
    description:
      "Read the price schedule of an in-app purchase together with its base territory. Returns null when the purchase has no price schedule yet.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { inAppPurchaseId: inAppPurchaseIdInput },
      ["inAppPurchaseId"],
      "Identifies the in-app purchase whose price schedule to read.",
    ),
    outputSchema: s.actionOutput(
      {
        priceSchedule: s.nullable(
          s.object("The price schedule, or null when the in-app purchase has none.", priceScheduleFields, {
            additionalProperties: true,
            required: ["id", "baseTerritory"],
          }),
        ),
      },
      "The price schedule of the in-app purchase.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_in_app_purchase_price_schedule",
    operationType: "destructive",
    description:
      "Set the price schedule of an in-app purchase: a base territory plus manual prices for specific territories. Territories without a manual price get automatic prices equalized from the base territory. Posting a schedule replaces the prices App Store Connect currently has for the purchase.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The price schedule to set.",
      {
        inAppPurchaseId: inAppPurchaseIdInput,
        baseTerritory: nonEmptyString(
          `Territory the automatic prices are equalized from, as an ${territoryDescription} It must also appear in manualPrices.`,
        ),
        manualPrices: s.array(
          "Manual prices, one per territory. Each entry names the price point to charge and optionally when it applies.",
          s.object(
            "One manually priced territory.",
            {
              inAppPurchasePricePointId: nonEmptyString(
                "Price point to charge, taken from list_in_app_purchase_price_points for that territory.",
              ),
              startDate: s.date("First day the price applies, as YYYY-MM-DD. Omit to apply it immediately."),
              endDate: s.date("Last day the price applies, as YYYY-MM-DD. Omit to keep it until replaced."),
            },
            { required: ["inAppPurchasePricePointId"] },
          ),
          { minItems: 1 },
        ),
      },
      { required: ["inAppPurchaseId", "baseTerritory", "manualPrices"] },
    ),
    outputSchema: s.actionOutput({ priceSchedule: inAppPurchasePriceScheduleOutput }, "The created price schedule."),
  }),
  defineProviderAction(service, {
    name: "list_in_app_purchase_price_schedule_manual_prices",
    operationType: "read",
    description:
      "List the manually set prices of an in-app purchase price schedule, with the price point, customer price, and proceeds of each.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the manual prices of one price schedule.",
      {
        inAppPurchasePriceScheduleId: nonEmptyString(
          "App Store Connect identifier of the price schedule, from get_in_app_purchase_price_schedule.",
        ),
        territory: territoryFilterInput,
        ...paginationInputs,
      },
      { required: ["inAppPurchasePriceScheduleId"] },
    ),
    outputSchema: pageOutput(
      "prices",
      inAppPurchasePriceResource,
      "Manual prices returned for this page.",
      "A page of manual prices.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_in_app_purchase_price_schedule_automatic_prices",
    operationType: "read",
    description:
      "List the prices App Store Connect derived automatically from the base territory of an in-app purchase price schedule.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the automatic prices of one price schedule.",
      {
        inAppPurchasePriceScheduleId: nonEmptyString(
          "App Store Connect identifier of the price schedule, from get_in_app_purchase_price_schedule.",
        ),
        territory: territoryFilterInput,
        ...paginationInputs,
      },
      { required: ["inAppPurchasePriceScheduleId"] },
    ),
    outputSchema: pageOutput(
      "prices",
      inAppPurchasePriceResource,
      "Automatic prices returned for this page.",
      "A page of automatic prices.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_in_app_purchase_price_schedule_base_territory",
    operationType: "read",
    description: "Read the base territory of an in-app purchase price schedule, including its currency.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        inAppPurchasePriceScheduleId: nonEmptyString("App Store Connect identifier of the price schedule."),
      },
      ["inAppPurchasePriceScheduleId"],
      "Identifies the price schedule whose base territory to read.",
    ),
    outputSchema: s.actionOutput({ territory: territoryResource }, "The base territory of the price schedule."),
  }),
  defineProviderAction(service, {
    name: "get_in_app_purchase_availability",
    operationType: "read",
    description:
      "Read the availability record of an in-app purchase, which says whether it is offered in new territories automatically. Returns null when no availability has been set. Use list_in_app_purchase_available_territories for the territory list.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { inAppPurchaseId: inAppPurchaseIdInput },
      ["inAppPurchaseId"],
      "Identifies the in-app purchase whose availability to read.",
    ),
    outputSchema: s.actionOutput(
      {
        availability: s.nullable(
          resourceObject(
            "The availability record, or null when the in-app purchase has none.",
            "App Store Connect identifier for the availability record.",
            inAppPurchaseAvailabilityFields,
          ),
        ),
      },
      "The availability of the in-app purchase.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_in_app_purchase_availability",
    operationType: "destructive",
    description:
      "Set the territories an in-app purchase is sold in. The list replaces the current availability entirely, so territories left out are removed from sale.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The availability to set.",
      {
        inAppPurchaseId: inAppPurchaseIdInput,
        availableInNewTerritories: s.boolean(
          "Automatically offer the purchase in territories Apple adds to the App Store later.",
        ),
        availableTerritories: s.stringArray("Territories the purchase is sold in.", {
          minItems: 1,
          itemDescription: territoryDescription,
        }),
      },
      { required: ["inAppPurchaseId", "availableInNewTerritories", "availableTerritories"] },
    ),
    outputSchema: s.actionOutput(
      { availability: inAppPurchaseAvailabilityResource },
      "The created availability record.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_in_app_purchase_available_territories",
    operationType: "read",
    description:
      "List the territories an in-app purchase is currently sold in, using the availability record identifier from get_in_app_purchase_availability.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the availability record whose territories to list.",
      {
        inAppPurchaseAvailabilityId: nonEmptyString("App Store Connect identifier of the availability record."),
        ...paginationInputs,
      },
      { required: ["inAppPurchaseAvailabilityId"] },
    ),
    outputSchema: pageOutput(
      "territories",
      territoryResource,
      "Territories returned for this page.",
      "A page of territories.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_in_app_purchase_content",
    operationType: "read",
    description:
      "Read the metadata and temporary download URL of the hosted content package of an in-app purchase. Returns null when no content has been uploaded.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { inAppPurchaseId: inAppPurchaseIdInput },
      ["inAppPurchaseId"],
      "Identifies the in-app purchase whose hosted content to read.",
    ),
    outputSchema: s.actionOutput(
      {
        content: s.nullable(
          resourceObject(
            "The hosted content record, or null when the in-app purchase has none.",
            "App Store Connect identifier for the content record.",
            inAppPurchaseContentFields,
          ),
        ),
      },
      "The hosted content of the in-app purchase.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_in_app_purchase_versions",
    operationType: "read",
    description: "List the metadata versions of an in-app purchase, optionally narrowed to one review state.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the versions of one in-app purchase.",
      {
        inAppPurchaseId: inAppPurchaseIdInput,
        state: s.stringEnum("Return only versions in this state.", inAppPurchaseVersionStates),
        ...paginationInputs,
      },
      { required: ["inAppPurchaseId"] },
    ),
    outputSchema: pageOutput(
      "versions",
      inAppPurchaseVersionResource,
      "Versions returned for this page.",
      "A page of in-app purchase versions.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_in_app_purchase_version",
    operationType: "read",
    description: "Read one in-app purchase version by its identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        inAppPurchaseVersionId: nonEmptyString("App Store Connect identifier of the in-app purchase version."),
      },
      ["inAppPurchaseVersionId"],
      "Identifies the version to read.",
    ),
    outputSchema: s.actionOutput({ version: inAppPurchaseVersionResource }, "The requested in-app purchase version."),
  }),
  defineProviderAction(service, {
    name: "create_in_app_purchase_version",
    operationType: "write",
    description:
      "Create a new metadata version of an in-app purchase so its display text and images can be edited and reviewed without taking the approved version off sale.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.actionInput(
      { inAppPurchaseId: inAppPurchaseIdInput },
      ["inAppPurchaseId"],
      "Identifies the in-app purchase to version.",
    ),
    outputSchema: s.actionOutput({ version: inAppPurchaseVersionResource }, "The created in-app purchase version."),
  }),
  defineProviderAction(service, {
    name: "list_in_app_purchase_version_localizations",
    operationType: "read",
    description: "List the localized display names and descriptions attached to one in-app purchase version.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the version whose localizations to list.",
      {
        inAppPurchaseVersionId: nonEmptyString("App Store Connect identifier of the in-app purchase version."),
        ...paginationInputs,
      },
      { required: ["inAppPurchaseVersionId"] },
    ),
    outputSchema: pageOutput(
      "localizations",
      inAppPurchaseVersionLocalizationResource,
      "Localizations returned for this page.",
      "A page of version localizations.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_in_app_purchase_version_localization",
    operationType: "read",
    description: "Read one localization of an in-app purchase version by its identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        inAppPurchaseVersionLocalizationId: nonEmptyString("App Store Connect identifier of the version localization."),
      },
      ["inAppPurchaseVersionLocalizationId"],
      "Identifies the version localization to read.",
    ),
    outputSchema: s.actionOutput(
      { localization: inAppPurchaseVersionLocalizationResource },
      "The requested version localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_in_app_purchase_version_localization",
    operationType: "write",
    description: "Add the display name and description of an in-app purchase version for one locale.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The version localization to create.",
      {
        inAppPurchaseVersionId: nonEmptyString("App Store Connect identifier of the in-app purchase version."),
        locale: localeInput,
        name: nonEmptyString("Display name customers see, up to 30 characters."),
        description: nonEmptyString("Description customers see, up to 45 characters."),
      },
      { required: ["inAppPurchaseVersionId", "locale", "name"] },
    ),
    outputSchema: s.actionOutput(
      { localization: inAppPurchaseVersionLocalizationResource },
      "The created version localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_in_app_purchase_version_localization",
    operationType: "write",
    description:
      "Overwrite the display name or description of an in-app purchase version localization. Pass at least one field.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The version localization fields to change.",
      {
        inAppPurchaseVersionLocalizationId: nonEmptyString("App Store Connect identifier of the version localization."),
        name: nonEmptyString("New display name, up to 30 characters."),
        description: nonEmptyString("New description, up to 45 characters."),
      },
      { required: ["inAppPurchaseVersionLocalizationId"] },
    ),
    outputSchema: s.actionOutput(
      { localization: inAppPurchaseVersionLocalizationResource },
      "The updated version localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_in_app_purchase_version_localization",
    operationType: "destructive",
    description: "Delete one locale from an in-app purchase version.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.actionInput(
      {
        inAppPurchaseVersionLocalizationId: nonEmptyString("App Store Connect identifier of the version localization."),
      },
      ["inAppPurchaseVersionLocalizationId"],
      "Identifies the version localization to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted version localization."),
      "Confirmation that the version localization was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "submit_in_app_purchase_for_review",
    operationType: "write",
    description:
      "Submit an in-app purchase to App Review. The purchase must be in READY_TO_SUBMIT; once submitted it cannot be edited until review finishes.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.actionInput(
      { inAppPurchaseId: inAppPurchaseIdInput },
      ["inAppPurchaseId"],
      "Identifies the in-app purchase to submit.",
    ),
    outputSchema: s.actionOutput(
      {
        id: s.string("App Store Connect identifier for the submission."),
        inAppPurchaseId: s.string("The in-app purchase that was submitted."),
      },
      "The created in-app purchase submission.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_in_app_purchase_offer_codes",
    operationType: "read",
    description:
      "List the offer code configurations of an in-app purchase, optionally narrowed to offers priced in one territory.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the offer codes of one in-app purchase.",
      {
        inAppPurchaseId: inAppPurchaseIdInput,
        territory: territoryFilterInput,
        ...paginationInputs,
      },
      { required: ["inAppPurchaseId"] },
    ),
    outputSchema: pageOutput(
      "offerCodes",
      inAppPurchaseOfferCodeResource,
      "Offer codes returned for this page.",
      "A page of in-app purchase offer codes.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_in_app_purchase_offer_code",
    operationType: "read",
    description: "Read one in-app purchase offer code configuration by its identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        inAppPurchaseOfferCodeId: nonEmptyString("App Store Connect identifier of the offer code."),
      },
      ["inAppPurchaseOfferCodeId"],
      "Identifies the offer code to read.",
    ),
    outputSchema: s.actionOutput({ offerCode: inAppPurchaseOfferCodeResource }, "The requested offer code."),
  }),
  defineProviderAction(service, {
    name: "create_in_app_purchase_offer_code",
    operationType: "write",
    description:
      "Create an offer code configuration for an in-app purchase: who may redeem it and the discounted price per territory. Generate redeemable codes afterwards with the custom code or one-time-use code actions.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The offer code configuration to create.",
      {
        inAppPurchaseId: inAppPurchaseIdInput,
        name: nonEmptyString("Reference name of the offer, up to 64 characters."),
        customerEligibilities: s.array(
          "Customer groups allowed to redeem the offer.",
          s.stringEnum("A customer eligibility group.", offerCodeCustomerEligibilities),
          { minItems: 1 },
        ),
        prices: s.array(
          "Discounted price per territory. Every territory the purchase is sold in needs an entry.",
          s.object(
            "The discounted price in one territory.",
            {
              territory: nonEmptyString(territoryDescription),
              inAppPurchasePricePointId: nonEmptyString(
                "Price point for the discounted price in that territory, from list_in_app_purchase_price_points.",
              ),
            },
            { required: ["territory", "inAppPurchasePricePointId"] },
          ),
          { minItems: 1 },
        ),
      },
      { required: ["inAppPurchaseId", "name", "customerEligibilities", "prices"] },
    ),
    outputSchema: s.actionOutput({ offerCode: inAppPurchaseOfferCodeResource }, "The created offer code."),
  }),
  defineProviderAction(service, {
    name: "update_in_app_purchase_offer_code",
    operationType: "destructive",
    description:
      "Activate or deactivate an in-app purchase offer code. Deactivating stops every custom and one-time-use code of the offer from being redeemed.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The offer code state to set.",
      {
        inAppPurchaseOfferCodeId: nonEmptyString("App Store Connect identifier of the offer code."),
        active: s.boolean("Whether the offer can be redeemed."),
      },
      { required: ["inAppPurchaseOfferCodeId", "active"] },
    ),
    outputSchema: s.actionOutput({ offerCode: inAppPurchaseOfferCodeResource }, "The updated offer code."),
  }),
  defineProviderAction(service, {
    name: "list_in_app_purchase_offer_code_prices",
    operationType: "read",
    description:
      "List the discounted prices of an in-app purchase offer code per territory, with the price point, customer price, and proceeds of each.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the prices of one offer code.",
      {
        inAppPurchaseOfferCodeId: nonEmptyString("App Store Connect identifier of the offer code."),
        territory: territoryFilterInput,
        ...paginationInputs,
      },
      { required: ["inAppPurchaseOfferCodeId"] },
    ),
    outputSchema: pageOutput(
      "prices",
      inAppPurchaseOfferPriceResource,
      "Offer prices returned for this page.",
      "A page of offer code prices.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_in_app_purchase_offer_code_custom_codes",
    operationType: "read",
    description: "List the custom codes generated for an in-app purchase offer code.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the offer code whose custom codes to list.",
      {
        inAppPurchaseOfferCodeId: nonEmptyString("App Store Connect identifier of the offer code."),
        ...paginationInputs,
      },
      { required: ["inAppPurchaseOfferCodeId"] },
    ),
    outputSchema: pageOutput(
      "customCodes",
      inAppPurchaseOfferCodeCustomCodeResource,
      "Custom codes returned for this page.",
      "A page of custom offer codes.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_in_app_purchase_offer_code_custom_code",
    operationType: "write",
    description:
      "Create a custom code for an in-app purchase offer that customers redeem by typing it, with a redemption limit and optional expiration date.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The custom code to create.",
      {
        inAppPurchaseOfferCodeId: nonEmptyString("App Store Connect identifier of the offer code."),
        customCode: nonEmptyString("Text customers enter to redeem the offer, 3 to 64 letters and digits."),
        numberOfCodes: s.integer("Maximum number of redemptions the code allows, up to 25,000.", {
          minimum: 1,
          maximum: 25_000,
        }),
        expirationDate: s.date("Last day the code can be redeemed, as YYYY-MM-DD."),
      },
      { required: ["inAppPurchaseOfferCodeId", "customCode", "numberOfCodes"] },
    ),
    outputSchema: s.actionOutput({ customCode: inAppPurchaseOfferCodeCustomCodeResource }, "The created custom code."),
  }),
  defineProviderAction(service, {
    name: "update_in_app_purchase_offer_code_custom_code",
    operationType: "destructive",
    description:
      "Activate or deactivate one custom code of an in-app purchase offer without touching the other codes of the offer.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The custom code state to set.",
      {
        inAppPurchaseOfferCodeCustomCodeId: nonEmptyString("App Store Connect identifier of the custom code."),
        active: s.boolean("Whether the custom code can be redeemed."),
      },
      { required: ["inAppPurchaseOfferCodeCustomCodeId", "active"] },
    ),
    outputSchema: s.actionOutput({ customCode: inAppPurchaseOfferCodeCustomCodeResource }, "The updated custom code."),
  }),
  defineProviderAction(service, {
    name: "list_in_app_purchase_offer_code_one_time_use_codes",
    operationType: "read",
    description:
      "List the one-time-use code batches generated for an in-app purchase offer code. The code values are only available as a CSV download in App Store Connect.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the offer code whose one-time-use code batches to list.",
      {
        inAppPurchaseOfferCodeId: nonEmptyString("App Store Connect identifier of the offer code."),
        ...paginationInputs,
      },
      { required: ["inAppPurchaseOfferCodeId"] },
    ),
    outputSchema: pageOutput(
      "oneTimeUseCodes",
      inAppPurchaseOfferCodeOneTimeUseCodeResource,
      "One-time-use code batches returned for this page.",
      "A page of one-time-use code batches.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_in_app_purchase_offer_code_one_time_use_code",
    operationType: "write",
    description:
      "Generate a batch of one-time-use codes for an in-app purchase offer. Download the generated code values from App Store Connect afterwards; they are not returned here.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The one-time-use code batch to generate.",
      {
        inAppPurchaseOfferCodeId: nonEmptyString("App Store Connect identifier of the offer code."),
        numberOfCodes: s.integer("Number of codes to generate, up to 25,000.", {
          minimum: 1,
          maximum: 25_000,
        }),
        expirationDate: s.date("Last day the codes can be redeemed, as YYYY-MM-DD."),
        environment: s.stringEnum("Environment the codes redeem in. Defaults to PRODUCTION.", offerCodeEnvironments),
      },
      { required: ["inAppPurchaseOfferCodeId", "numberOfCodes", "expirationDate"] },
    ),
    outputSchema: s.actionOutput(
      { oneTimeUseCode: inAppPurchaseOfferCodeOneTimeUseCodeResource },
      "The created one-time-use code batch.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_in_app_purchase_offer_code_one_time_use_code",
    operationType: "destructive",
    description: "Activate or deactivate one batch of one-time-use codes of an in-app purchase offer.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The one-time-use code batch state to set.",
      {
        inAppPurchaseOfferCodeOneTimeUseCodeId: nonEmptyString(
          "App Store Connect identifier of the one-time-use code batch.",
        ),
        active: s.boolean("Whether the codes in the batch can be redeemed."),
      },
      { required: ["inAppPurchaseOfferCodeOneTimeUseCodeId", "active"] },
    ),
    outputSchema: s.actionOutput(
      { oneTimeUseCode: inAppPurchaseOfferCodeOneTimeUseCodeResource },
      "The updated one-time-use code batch.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_promoted_purchases",
    operationType: "read",
    description:
      "List the in-app purchases and subscriptions promoted on the App Store product page of one app, in display order.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the app whose promoted purchases to list.",
      { appId: nonEmptyString("App Store Connect identifier of the app."), ...paginationInputs },
      { required: ["appId"] },
    ),
    outputSchema: pageOutput(
      "promotedPurchases",
      promotedPurchaseResource,
      "Promoted purchases returned for this page.",
      "A page of promoted purchases.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_promoted_purchase",
    operationType: "read",
    description: "Read one promoted purchase by its identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        promotedPurchaseId: nonEmptyString("App Store Connect identifier of the promoted purchase."),
      },
      ["promotedPurchaseId"],
      "Identifies the promoted purchase to read.",
    ),
    outputSchema: s.actionOutput({ promotedPurchase: promotedPurchaseResource }, "The requested promoted purchase."),
  }),
  defineProviderAction(service, {
    name: "create_promoted_purchase",
    operationType: "write",
    description:
      "Promote an in-app purchase or a subscription on the App Store product page of an app. Pass exactly one of inAppPurchaseId or subscriptionId. A promotional image must still be uploaded in App Store Connect before the promotion can be submitted.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The promotion to create.",
      {
        appId: nonEmptyString("App Store Connect identifier of the app."),
        inAppPurchaseId: nonEmptyString("In-app purchase to promote. Mutually exclusive with subscriptionId."),
        subscriptionId: nonEmptyString(
          "Auto-renewable subscription to promote. Mutually exclusive with inAppPurchaseId.",
        ),
        visibleForAllUsers: s.boolean(
          "Show the promotion to every customer; when false only customers the app selects through StoreKit see it.",
        ),
        enabled: s.boolean("Enable the promotion right away."),
      },
      { required: ["appId", "visibleForAllUsers"] },
    ),
    outputSchema: s.actionOutput({ promotedPurchase: promotedPurchaseResource }, "The created promoted purchase."),
  }),
  defineProviderAction(service, {
    name: "update_promoted_purchase",
    operationType: "destructive",
    description: "Change whether a promoted purchase is enabled or visible to all customers. Pass at least one field.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The promoted purchase fields to change.",
      {
        promotedPurchaseId: nonEmptyString("App Store Connect identifier of the promoted purchase."),
        visibleForAllUsers: s.boolean("Whether every customer sees the promotion."),
        enabled: s.boolean("Whether the promotion is enabled."),
      },
      { required: ["promotedPurchaseId"] },
    ),
    outputSchema: s.actionOutput({ promotedPurchase: promotedPurchaseResource }, "The updated promoted purchase."),
  }),
  defineProviderAction(service, {
    name: "delete_promoted_purchase",
    operationType: "destructive",
    description: "Remove a promotion from the App Store product page of an app.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.actionInput(
      {
        promotedPurchaseId: nonEmptyString("App Store Connect identifier of the promoted purchase."),
      },
      ["promotedPurchaseId"],
      "Identifies the promoted purchase to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted promoted purchase."),
      "Confirmation that the promoted purchase was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "reorder_promoted_purchases",
    operationType: "destructive",
    description:
      "Set the display order of the promoted purchases of an app. The list replaces the current order, so include every promoted purchase that should stay listed.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The new order of promoted purchases.",
      {
        appId: nonEmptyString("App Store Connect identifier of the app."),
        promotedPurchaseIds: s.stringArray("Promoted purchase identifiers in the order they should appear.", {
          minItems: 1,
          itemDescription: "App Store Connect identifier of a promoted purchase.",
        }),
      },
      { required: ["appId", "promotedPurchaseIds"] },
    ),
    outputSchema: s.actionOutput(
      {
        appId: s.string("The app whose promoted purchases were reordered."),
        promotedPurchaseIds: s.stringArray("The promoted purchases in their new order.", {
          itemDescription: "App Store Connect identifier of a promoted purchase.",
        }),
        replaced: s.boolean("Always true once App Store Connect confirmed the new order."),
      },
      "Confirmation that the promoted purchases were reordered.",
    ),
  }),
];

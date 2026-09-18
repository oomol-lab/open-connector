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
} from "./schemas.ts";

export const subscriptionOfferDurations: readonly string[] = [
  "THREE_DAYS",
  "ONE_WEEK",
  "TWO_WEEKS",
  "ONE_MONTH",
  "TWO_MONTHS",
  "THREE_MONTHS",
  "SIX_MONTHS",
  "ONE_YEAR",
];
export const subscriptionOfferModes: readonly string[] = ["PAY_AS_YOU_GO", "PAY_UP_FRONT", "FREE_TRIAL"];
export const subscriptionPlanTypes: readonly string[] = ["MONTHLY", "UPFRONT"];
export const subscriptionCustomerEligibilities: readonly string[] = ["NEW", "EXISTING", "EXPIRED"];
export const subscriptionOfferEligibilities: readonly string[] = ["STACK_WITH_INTRO_OFFERS", "REPLACE_INTRO_OFFERS"];
export const winBackOfferPriorities: readonly string[] = ["HIGH", "NORMAL"];
export const winBackOfferPromotionIntents: readonly string[] = ["NOT_PROMOTED", "USE_AUTO_GENERATED_ASSETS"];
export const offerCodeEnvironments: readonly string[] = ["PRODUCTION", "SANDBOX"];

const dateString = (description: string) => s.date(description);

const subscriptionIdInput = nonEmptyString("App Store Connect identifier of the auto-renewable subscription.");
const territoryFilterInput = s.stringArray(
  "Return only entries for these territories, as ISO 3166-1 alpha-3 codes such as USA or DEU.",
  { minItems: 1, itemDescription: "ISO 3166-1 alpha-3 territory code." },
);
const durationInput = s.stringEnum("Length of one offer period, such as ONE_MONTH.", subscriptionOfferDurations);
const offerModeInput = s.stringEnum(
  "How the customer pays during the offer: PAY_AS_YOU_GO charges the offer price every period, PAY_UP_FRONT charges once for the whole offer, FREE_TRIAL charges nothing.",
  subscriptionOfferModes,
);
const numberOfPeriodsInput = s.integer(
  "Number of offer periods. Apple requires 1 for PAY_UP_FRONT and FREE_TRIAL offers.",
  { minimum: 1 },
);
const targetSubscriptionPlanTypeInput = s.stringEnum(
  "Subscription plan type the offer targets when the subscription has both a monthly and an upfront plan.",
  subscriptionPlanTypes,
);

const territoryPricesInput = s.array(
  "Territory prices submitted together with the offer. Each territory may appear once.",
  s.object(
    "The price of the offer in one territory.",
    {
      territoryId: nonEmptyString("ISO 3166-1 alpha-3 code of the territory the price applies to, such as USA."),
      subscriptionPricePointId: nonEmptyString(
        "Subscription price point to charge in that territory, taken from the subscription price points of the same territory. Omit for FREE_TRIAL offers.",
      ),
    },
    { required: ["territoryId"] },
  ),
  { minItems: 1 },
);

const pricePointPricesInput = s.array(
  "Prices submitted together with the offer, one subscription price point per territory.",
  s.object(
    "The price of the offer in one territory.",
    {
      subscriptionPricePointId: nonEmptyString(
        "Subscription price point to charge, taken from the subscription price points of the territory it belongs to.",
      ),
    },
    { required: ["subscriptionPricePointId"] },
  ),
  { minItems: 1 },
);

const integerRangeInput = s.object(
  "Inclusive range in months. Leave a bound out to keep that side open.",
  {
    minimum: s.integer("Lower bound of the range in months.", { minimum: 0 }),
    maximum: s.integer("Upper bound of the range in months.", { minimum: 0 }),
  },
  { optional: ["minimum", "maximum"] },
);

export const territorySummary: JsonSchema = s.nullable(
  s.object(
    "The territory the price applies to, or null when App Store Connect did not return it.",
    {
      id: s.string("ISO 3166-1 alpha-3 territory code, such as USA."),
      currency: s.nullableString("ISO 4217 currency of the territory, such as USD."),
    },
    { additionalProperties: true, required: ["id"] },
  ),
);

export const subscriptionPricePointSummary: JsonSchema = s.nullable(
  s.object(
    "The subscription price point charged for the offer, or null when App Store Connect did not return it.",
    {
      id: s.string("App Store Connect identifier for the subscription price point."),
      customerPrice: s.nullableString("Price the customer pays in the territory currency, as a decimal string."),
      proceeds: s.nullableString("Developer proceeds per period during the first year, as a decimal string."),
      proceedsYear2: s.nullableString("Developer proceeds per period after the first year, as a decimal string."),
    },
    { additionalProperties: true, required: ["id"] },
  ),
);

export const offerPriceResource: (description: string, idDescription: string) => JsonSchema = (
  description,
  idDescription,
) =>
  resourceObject(
    description,
    idDescription,
    { territory: territorySummary, subscriptionPricePoint: subscriptionPricePointSummary },
    ["territory", "subscriptionPricePoint"],
  );

const offerCoreFields = {
  duration: nullableEnum("Length of one offer period.", subscriptionOfferDurations),
  offerMode: nullableEnum("How the customer pays during the offer.", subscriptionOfferModes),
  numberOfPeriods: s.nullableInteger("Number of offer periods."),
  targetSubscriptionPlanType: nullableEnum("Subscription plan type the offer targets.", subscriptionPlanTypes),
};

export const subscriptionIntroductoryOfferResource: JsonSchema = resourceObject(
  "An introductory offer of an auto-renewable subscription in one territory.",
  "App Store Connect identifier for the introductory offer.",
  {
    startDate: s.nullableString("First day the offer is available, as YYYY-MM-DD."),
    endDate: s.nullableString("Last day the offer is available, as YYYY-MM-DD."),
    ...offerCoreFields,
    territory: territorySummary,
    subscriptionPricePoint: subscriptionPricePointSummary,
  },
  ["territory", "subscriptionPricePoint"],
);

export const subscriptionPromotionalOfferResource: JsonSchema = resourceObject(
  "A promotional offer of an auto-renewable subscription for existing or lapsed subscribers.",
  "App Store Connect identifier for the promotional offer.",
  {
    name: s.nullableString("Reference name shown in App Store Connect."),
    offerCode: s.nullableString("Offer identifier your app passes to StoreKit when presenting the offer."),
    ...offerCoreFields,
  },
);

export const subscriptionOfferCodeResource: JsonSchema = resourceObject(
  "An offer code configuration of an auto-renewable subscription.",
  "App Store Connect identifier for the offer code configuration.",
  {
    name: s.nullableString("Reference name of the offer code configuration."),
    customerEligibilities: s.nullable(
      s.array(
        "Customer groups eligible to redeem the codes.",
        s.stringEnum("An eligible customer group.", subscriptionCustomerEligibilities),
      ),
    ),
    offerEligibility: nullableEnum(
      "Whether the offer stacks with or replaces introductory offers.",
      subscriptionOfferEligibilities,
    ),
    ...offerCoreFields,
    totalNumberOfCodes: s.nullableInteger("Total number of codes generated so far."),
    productionCodeCount: s.nullableInteger("Number of codes generated for production."),
    sandboxCodeCount: s.nullableInteger("Number of codes generated for the sandbox."),
    active: s.nullableBoolean("Whether the configuration is active and its codes redeemable."),
    autoRenewEnabled: s.nullableBoolean("Whether the subscription renews automatically after the offer ends."),
  },
);

export const subscriptionOfferCodeCustomCodeResource: JsonSchema = resourceObject(
  "A custom code batch of an offer code configuration.",
  "App Store Connect identifier for the custom code batch.",
  {
    customCode: s.nullableString("The custom code customers redeem."),
    numberOfCodes: s.nullableInteger("Number of redemptions the custom code allows."),
    createdDate: s.nullableString("When the batch was created, as an ISO 8601 timestamp."),
    expirationDate: s.nullableString("Last day the code can be redeemed, as YYYY-MM-DD."),
    active: s.nullableBoolean("Whether the custom code is active and redeemable."),
  },
);

export const subscriptionOfferCodeOneTimeUseCodeResource: JsonSchema = resourceObject(
  "A batch of one-time use codes of an offer code configuration.",
  "App Store Connect identifier for the one-time use code batch.",
  {
    numberOfCodes: s.nullableInteger("Number of single-use codes in the batch."),
    createdDate: s.nullableString("When the batch was created, as an ISO 8601 timestamp."),
    expirationDate: s.nullableString("Last day the codes can be redeemed, as YYYY-MM-DD."),
    active: s.nullableBoolean("Whether the batch is active and its codes redeemable."),
    environment: nullableEnum("Environment the codes redeem in.", offerCodeEnvironments),
  },
);

export const winBackOfferResource: JsonSchema = resourceObject(
  "A win-back offer that targets lapsed subscribers of an auto-renewable subscription.",
  "App Store Connect identifier for the win-back offer.",
  {
    referenceName: s.nullableString("Reference name shown in App Store Connect."),
    offerId: s.nullableString("Offer identifier your app passes to StoreKit."),
    duration: nullableEnum("Length of one offer period.", subscriptionOfferDurations),
    offerMode: nullableEnum("How the customer pays during the offer.", subscriptionOfferModes),
    periodCount: s.nullableInteger("Number of offer periods."),
    customerEligibilityPaidSubscriptionDurationInMonths: s.nullableInteger(
      "Minimum number of months the customer must have paid for the subscription before lapsing.",
    ),
    customerEligibilityTimeSinceLastSubscribedInMonths: s.nullable(
      s.looseObject("Inclusive range of months since the customer last subscribed.", {
        minimum: s.nullableInteger("Lower bound in months."),
        maximum: s.nullableInteger("Upper bound in months."),
      }),
    ),
    customerEligibilityWaitBetweenOffersInMonths: s.nullableInteger(
      "Months a customer must wait after redeeming a win-back offer before another one is offered.",
    ),
    startDate: s.nullableString("First day the offer is available, as YYYY-MM-DD."),
    endDate: s.nullableString("Last day the offer is available, as YYYY-MM-DD."),
    priority: nullableEnum("Priority the App Store uses when several win-back offers apply.", winBackOfferPriorities),
    promotionIntent: nullableEnum(
      "Whether Apple may promote the offer on the App Store with auto-generated assets.",
      winBackOfferPromotionIntents,
    ),
    targetSubscriptionPlanType: nullableEnum("Subscription plan type the offer targets.", subscriptionPlanTypes),
  },
);

const singleIdInput = (field: string, description: string, purpose: string) =>
  s.actionInput({ [field]: nonEmptyString(description) }, [field], purpose);

const pricesPage = (key: string, resource: JsonSchema, what: string) =>
  pageOutput(
    key,
    resource,
    `${what.charAt(0).toUpperCase()}${what.slice(1)} returned for this page.`,
    `A page of ${what}.`,
  );

export const appStoreConnectSubscriptionOfferActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_subscription_introductory_offers",
    operationType: "read",
    description:
      "List the introductory offers of one auto-renewable subscription, with the territory and price point of each offer. Filter by territory to inspect one storefront.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the introductory offers of one subscription.",
      {
        subscriptionId: subscriptionIdInput,
        territoryIds: territoryFilterInput,
        ...paginationInputs,
      },
      { required: ["subscriptionId"] },
    ),
    outputSchema: pricesPage(
      "subscriptionIntroductoryOffers",
      subscriptionIntroductoryOfferResource,
      "introductory offers",
    ),
  }),
  defineProviderAction(service, {
    name: "create_subscription_introductory_offer",
    operationType: "write",
    description:
      "Create an introductory offer for an auto-renewable subscription. A FREE_TRIAL offer needs no price point; PAY_AS_YOU_GO and PAY_UP_FRONT offers need the subscription price point of the territory. Apple allows one active introductory offer per territory at a time. Sandbox may take up to an hour to reflect the change.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The introductory offer to create.",
      {
        subscriptionId: subscriptionIdInput,
        duration: durationInput,
        offerMode: offerModeInput,
        numberOfPeriods: numberOfPeriodsInput,
        startDate: dateString("First day the offer is available, as YYYY-MM-DD. Omit to start immediately."),
        endDate: dateString("Last day the offer is available, as YYYY-MM-DD. Omit for no end date."),
        territoryId: nonEmptyString(
          "ISO 3166-1 alpha-3 code of the territory the offer applies to, such as USA. Omit to apply the offer to every territory the subscription is sold in, which Apple only accepts for FREE_TRIAL offers.",
        ),
        subscriptionPricePointId: nonEmptyString(
          "Subscription price point that sets the offer price in that territory. Required for PAY_AS_YOU_GO and PAY_UP_FRONT offers.",
        ),
        targetSubscriptionPlanType: targetSubscriptionPlanTypeInput,
      },
      { required: ["subscriptionId", "duration", "offerMode", "numberOfPeriods"] },
    ),
    outputSchema: s.actionOutput(
      { subscriptionIntroductoryOffer: subscriptionIntroductoryOfferResource },
      "The created introductory offer.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_subscription_introductory_offer",
    operationType: "destructive",
    description:
      "Change the end date of an introductory offer, or remove the end date so the offer runs until it is deleted. Apple allows no other change; create a new offer to change the price, duration, or mode.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The end date to store for one introductory offer.",
      {
        subscriptionIntroductoryOfferId: nonEmptyString("App Store Connect identifier of the introductory offer."),
        endDate: s.nullable(
          dateString("New last day the offer is available, as YYYY-MM-DD. Pass null to remove the end date."),
        ),
      },
      { required: ["subscriptionIntroductoryOfferId", "endDate"] },
    ),
    outputSchema: s.actionOutput(
      { subscriptionIntroductoryOffer: subscriptionIntroductoryOfferResource },
      "The updated introductory offer.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_subscription_introductory_offer",
    operationType: "destructive",
    description: "Delete an introductory offer. Customers who already redeemed it keep their discounted period.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: singleIdInput(
      "subscriptionIntroductoryOfferId",
      "App Store Connect identifier of the introductory offer.",
      "Identifies the introductory offer to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted introductory offer."),
      "Confirmation that the introductory offer was deleted.",
    ),
  }),

  defineProviderAction(service, {
    name: "list_subscription_promotional_offers",
    operationType: "read",
    description:
      "List the promotional offers of one auto-renewable subscription. Use list_subscription_promotional_offer_prices to read the territory prices of an offer.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the promotional offers of one subscription.",
      {
        subscriptionId: subscriptionIdInput,
        territoryIds: territoryFilterInput,
        ...paginationInputs,
      },
      { required: ["subscriptionId"] },
    ),
    outputSchema: pricesPage(
      "subscriptionPromotionalOffers",
      subscriptionPromotionalOfferResource,
      "promotional offers",
    ),
  }),
  defineProviderAction(service, {
    name: "get_subscription_promotional_offer",
    operationType: "read",
    description: "Read one promotional offer by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: singleIdInput(
      "subscriptionPromotionalOfferId",
      "App Store Connect identifier of the promotional offer.",
      "Identifies the promotional offer to read.",
    ),
    outputSchema: s.actionOutput(
      { subscriptionPromotionalOffer: subscriptionPromotionalOfferResource },
      "The requested promotional offer.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_subscription_promotional_offer",
    operationType: "write",
    description:
      "Create a promotional offer for an auto-renewable subscription together with its territory prices. The offer code becomes the identifier your app passes to StoreKit and cannot be changed later.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The promotional offer to create.",
      {
        subscriptionId: subscriptionIdInput,
        name: nonEmptyString("Reference name shown in App Store Connect."),
        offerCode: nonEmptyString(
          "Offer identifier your app passes to StoreKit, up to 64 characters of letters, digits, underscores, and periods.",
        ),
        duration: durationInput,
        offerMode: offerModeInput,
        numberOfPeriods: numberOfPeriodsInput,
        targetSubscriptionPlanType: targetSubscriptionPlanTypeInput,
        prices: territoryPricesInput,
      },
      {
        required: ["subscriptionId", "name", "offerCode", "duration", "offerMode", "numberOfPeriods", "prices"],
      },
    ),
    outputSchema: s.actionOutput(
      { subscriptionPromotionalOffer: subscriptionPromotionalOfferResource },
      "The created promotional offer.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_subscription_promotional_offer",
    operationType: "destructive",
    description:
      "Set territory prices on an existing promotional offer. Each submitted territory replaces the price already stored for it; other attributes of the offer cannot be changed after creation.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The prices to store on one promotional offer.",
      {
        subscriptionPromotionalOfferId: nonEmptyString("App Store Connect identifier of the promotional offer."),
        prices: territoryPricesInput,
      },
      { required: ["subscriptionPromotionalOfferId", "prices"] },
    ),
    outputSchema: s.actionOutput(
      { subscriptionPromotionalOffer: subscriptionPromotionalOfferResource },
      "The updated promotional offer.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_subscription_promotional_offer",
    operationType: "destructive",
    description:
      "Delete a promotional offer. Apps can no longer present it, and customers who already redeemed it keep their discounted period.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: singleIdInput(
      "subscriptionPromotionalOfferId",
      "App Store Connect identifier of the promotional offer.",
      "Identifies the promotional offer to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted promotional offer."),
      "Confirmation that the promotional offer was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_subscription_promotional_offer_prices",
    operationType: "read",
    description:
      "List the territory prices of one promotional offer, with the currency and customer price of each price point.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the prices of one promotional offer.",
      {
        subscriptionPromotionalOfferId: nonEmptyString("App Store Connect identifier of the promotional offer."),
        territoryIds: territoryFilterInput,
        ...paginationInputs,
      },
      { required: ["subscriptionPromotionalOfferId"] },
    ),
    outputSchema: pricesPage(
      "subscriptionPromotionalOfferPrices",
      offerPriceResource(
        "The price of a promotional offer in one territory.",
        "App Store Connect identifier for the promotional offer price.",
      ),
      "promotional offer prices",
    ),
  }),

  defineProviderAction(service, {
    name: "list_subscription_offer_codes",
    operationType: "read",
    description:
      "List the offer code configurations of one auto-renewable subscription, with the code counts and active state of each configuration.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the offer code configurations of one subscription.",
      {
        subscriptionId: subscriptionIdInput,
        territoryIds: territoryFilterInput,
        ...paginationInputs,
      },
      { required: ["subscriptionId"] },
    ),
    outputSchema: pricesPage("subscriptionOfferCodes", subscriptionOfferCodeResource, "offer code configurations"),
  }),
  defineProviderAction(service, {
    name: "get_subscription_offer_code",
    operationType: "read",
    description: "Read one offer code configuration by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: singleIdInput(
      "subscriptionOfferCodeId",
      "App Store Connect identifier of the offer code configuration.",
      "Identifies the offer code configuration to read.",
    ),
    outputSchema: s.actionOutput(
      { subscriptionOfferCode: subscriptionOfferCodeResource },
      "The requested offer code configuration.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_subscription_offer_code",
    operationType: "write",
    description:
      "Create an offer code configuration for an auto-renewable subscription together with its territory prices. Generate the redeemable codes afterwards with create_subscription_offer_code_custom_code or create_subscription_offer_code_one_time_use_code.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The offer code configuration to create.",
      {
        subscriptionId: subscriptionIdInput,
        name: nonEmptyString("Reference name of the configuration shown in App Store Connect."),
        customerEligibilities: s.array(
          "Customer groups allowed to redeem the codes: NEW, EXISTING, or EXPIRED subscribers.",
          s.stringEnum("An eligible customer group.", subscriptionCustomerEligibilities),
          { minItems: 1, uniqueItems: true },
        ),
        offerEligibility: s.stringEnum(
          "Whether the offer stacks with the introductory offer a new subscriber is entitled to, or replaces it.",
          subscriptionOfferEligibilities,
        ),
        duration: durationInput,
        offerMode: offerModeInput,
        numberOfPeriods: numberOfPeriodsInput,
        autoRenewEnabled: s.boolean("Whether the subscription renews at the regular price after the offer ends."),
        targetSubscriptionPlanType: targetSubscriptionPlanTypeInput,
        prices: territoryPricesInput,
      },
      {
        required: [
          "subscriptionId",
          "name",
          "customerEligibilities",
          "offerEligibility",
          "duration",
          "offerMode",
          "numberOfPeriods",
          "prices",
        ],
      },
    ),
    outputSchema: s.actionOutput(
      { subscriptionOfferCode: subscriptionOfferCodeResource },
      "The created offer code configuration.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_subscription_offer_code",
    operationType: "destructive",
    description:
      "Activate or deactivate an offer code configuration. Deactivating it stops every custom and one-time use code of the configuration from being redeemed; Apple allows no other change after creation.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The active state to store for one offer code configuration.",
      {
        subscriptionOfferCodeId: nonEmptyString("App Store Connect identifier of the offer code configuration."),
        active: s.boolean("Whether the configuration and its codes can be redeemed."),
      },
      { required: ["subscriptionOfferCodeId", "active"] },
    ),
    outputSchema: s.actionOutput(
      { subscriptionOfferCode: subscriptionOfferCodeResource },
      "The updated offer code configuration.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_subscription_offer_code_prices",
    operationType: "read",
    description:
      "List the territory prices of one offer code configuration, with the currency and customer price of each price point.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the prices of one offer code configuration.",
      {
        subscriptionOfferCodeId: nonEmptyString("App Store Connect identifier of the offer code configuration."),
        territoryIds: territoryFilterInput,
        ...paginationInputs,
      },
      { required: ["subscriptionOfferCodeId"] },
    ),
    outputSchema: pricesPage(
      "subscriptionOfferCodePrices",
      offerPriceResource(
        "The price of an offer code configuration in one territory.",
        "App Store Connect identifier for the offer code price.",
      ),
      "offer code prices",
    ),
  }),
  defineProviderAction(service, {
    name: "list_subscription_offer_code_custom_codes",
    operationType: "read",
    description: "List the custom codes generated for one offer code configuration.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the offer code configuration whose custom codes to list.",
      {
        subscriptionOfferCodeId: nonEmptyString("App Store Connect identifier of the offer code configuration."),
        ...paginationInputs,
      },
      { required: ["subscriptionOfferCodeId"] },
    ),
    outputSchema: pricesPage(
      "subscriptionOfferCodeCustomCodes",
      subscriptionOfferCodeCustomCodeResource,
      "custom codes",
    ),
  }),
  defineProviderAction(service, {
    name: "get_subscription_offer_code_custom_code",
    operationType: "read",
    description: "Read one custom code batch by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: singleIdInput(
      "subscriptionOfferCodeCustomCodeId",
      "App Store Connect identifier of the custom code batch.",
      "Identifies the custom code batch to read.",
    ),
    outputSchema: s.actionOutput(
      { subscriptionOfferCodeCustomCode: subscriptionOfferCodeCustomCodeResource },
      "The requested custom code batch.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_subscription_offer_code_custom_code",
    operationType: "write",
    description:
      "Generate a custom code for an offer code configuration, which many customers can redeem up to the given number of times. The code text cannot be changed once created.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The custom code to generate.",
      {
        subscriptionOfferCodeId: nonEmptyString("App Store Connect identifier of the offer code configuration."),
        customCode: nonEmptyString(
          "The code customers type in, 3 to 64 characters of letters, digits, and underscores.",
        ),
        numberOfCodes: s.integer("Number of redemptions the code allows, up to 25,000.", {
          minimum: 1,
          maximum: 25_000,
        }),
        expirationDate: dateString("Last day the code can be redeemed, as YYYY-MM-DD. Omit for no expiration."),
      },
      { required: ["subscriptionOfferCodeId", "customCode", "numberOfCodes"] },
    ),
    outputSchema: s.actionOutput(
      { subscriptionOfferCodeCustomCode: subscriptionOfferCodeCustomCodeResource },
      "The generated custom code.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_subscription_offer_code_custom_code",
    operationType: "destructive",
    description:
      "Activate or deactivate a custom code. A deactivated code can no longer be redeemed until it is activated again.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The active state to store for one custom code.",
      {
        subscriptionOfferCodeCustomCodeId: nonEmptyString("App Store Connect identifier of the custom code batch."),
        active: s.boolean("Whether the custom code can be redeemed."),
      },
      { required: ["subscriptionOfferCodeCustomCodeId", "active"] },
    ),
    outputSchema: s.actionOutput(
      { subscriptionOfferCodeCustomCode: subscriptionOfferCodeCustomCodeResource },
      "The updated custom code.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_subscription_offer_code_one_time_use_codes",
    operationType: "read",
    description:
      "List the one-time use code batches generated for one offer code configuration. The code values themselves are only available as a CSV download in App Store Connect.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the offer code configuration whose one-time use code batches to list.",
      {
        subscriptionOfferCodeId: nonEmptyString("App Store Connect identifier of the offer code configuration."),
        ...paginationInputs,
      },
      { required: ["subscriptionOfferCodeId"] },
    ),
    outputSchema: pricesPage(
      "subscriptionOfferCodeOneTimeUseCodes",
      subscriptionOfferCodeOneTimeUseCodeResource,
      "one-time use code batches",
    ),
  }),
  defineProviderAction(service, {
    name: "get_subscription_offer_code_one_time_use_code",
    operationType: "read",
    description: "Read one one-time use code batch by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: singleIdInput(
      "subscriptionOfferCodeOneTimeUseCodeId",
      "App Store Connect identifier of the one-time use code batch.",
      "Identifies the one-time use code batch to read.",
    ),
    outputSchema: s.actionOutput(
      { subscriptionOfferCodeOneTimeUseCode: subscriptionOfferCodeOneTimeUseCodeResource },
      "The requested one-time use code batch.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_subscription_offer_code_one_time_use_code",
    operationType: "write",
    description:
      "Generate a batch of one-time use codes for an offer code configuration. Each code can be redeemed once; download the code values from App Store Connect afterwards.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The one-time use code batch to generate.",
      {
        subscriptionOfferCodeId: nonEmptyString("App Store Connect identifier of the offer code configuration."),
        numberOfCodes: s.integer("Number of single-use codes to generate, up to 25,000.", {
          minimum: 1,
          maximum: 25_000,
        }),
        expirationDate: dateString("Last day the codes can be redeemed, as YYYY-MM-DD."),
        environment: s.stringEnum(
          "Environment the codes redeem in. Defaults to PRODUCTION on Apple's side.",
          offerCodeEnvironments,
        ),
      },
      { required: ["subscriptionOfferCodeId", "numberOfCodes", "expirationDate"] },
    ),
    outputSchema: s.actionOutput(
      { subscriptionOfferCodeOneTimeUseCode: subscriptionOfferCodeOneTimeUseCodeResource },
      "The generated one-time use code batch.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_subscription_offer_code_one_time_use_code",
    operationType: "destructive",
    description:
      "Activate or deactivate a one-time use code batch. Deactivating it stops every unredeemed code in the batch from being redeemed.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The active state to store for one one-time use code batch.",
      {
        subscriptionOfferCodeOneTimeUseCodeId: nonEmptyString(
          "App Store Connect identifier of the one-time use code batch.",
        ),
        active: s.boolean("Whether the codes in the batch can be redeemed."),
      },
      { required: ["subscriptionOfferCodeOneTimeUseCodeId", "active"] },
    ),
    outputSchema: s.actionOutput(
      { subscriptionOfferCodeOneTimeUseCode: subscriptionOfferCodeOneTimeUseCodeResource },
      "The updated one-time use code batch.",
    ),
  }),

  defineProviderAction(service, {
    name: "list_win_back_offers",
    operationType: "read",
    description:
      "List the win-back offers of one auto-renewable subscription. Use list_win_back_offer_prices to read the territory prices of an offer.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the subscription whose win-back offers to list.",
      { subscriptionId: subscriptionIdInput, ...paginationInputs },
      { required: ["subscriptionId"] },
    ),
    outputSchema: pricesPage("winBackOffers", winBackOfferResource, "win-back offers"),
  }),
  defineProviderAction(service, {
    name: "get_win_back_offer",
    operationType: "read",
    description: "Read one win-back offer by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: singleIdInput(
      "winBackOfferId",
      "App Store Connect identifier of the win-back offer.",
      "Identifies the win-back offer to read.",
    ),
    outputSchema: s.actionOutput({ winBackOffer: winBackOfferResource }, "The requested win-back offer."),
  }),
  defineProviderAction(service, {
    name: "create_win_back_offer",
    operationType: "write",
    description:
      "Create a win-back offer for lapsed subscribers of an auto-renewable subscription together with its prices, one subscription price point per territory. The offer identifier, duration, mode, and period count cannot be changed later.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The win-back offer to create.",
      {
        subscriptionId: subscriptionIdInput,
        referenceName: nonEmptyString("Reference name shown in App Store Connect."),
        offerId: nonEmptyString(
          "Offer identifier your app passes to StoreKit, up to 64 characters of letters, digits, underscores, and periods.",
        ),
        duration: durationInput,
        offerMode: offerModeInput,
        periodCount: s.integer("Number of offer periods. Apple requires 1 for PAY_UP_FRONT and FREE_TRIAL offers.", {
          minimum: 1,
        }),
        customerEligibilityPaidSubscriptionDurationInMonths: s.integer(
          "Minimum number of months the customer must have paid for the subscription before lapsing.",
          { minimum: 0 },
        ),
        customerEligibilityTimeSinceLastSubscribedInMonths: integerRangeInput,
        customerEligibilityWaitBetweenOffersInMonths: s.integer(
          "Months a customer must wait after redeeming a win-back offer before another one is offered. Omit for no waiting period.",
          { minimum: 0 },
        ),
        startDate: dateString("First day the offer is available, as YYYY-MM-DD."),
        endDate: dateString("Last day the offer is available, as YYYY-MM-DD. Omit for no end date."),
        priority: s.stringEnum(
          "Priority the App Store uses when several win-back offers apply to the same customer.",
          winBackOfferPriorities,
        ),
        promotionIntent: s.stringEnum(
          "Whether Apple may promote the offer on the App Store with auto-generated assets.",
          winBackOfferPromotionIntents,
        ),
        targetSubscriptionPlanType: targetSubscriptionPlanTypeInput,
        prices: pricePointPricesInput,
      },
      {
        required: [
          "subscriptionId",
          "referenceName",
          "offerId",
          "duration",
          "offerMode",
          "periodCount",
          "customerEligibilityPaidSubscriptionDurationInMonths",
          "customerEligibilityTimeSinceLastSubscribedInMonths",
          "startDate",
          "priority",
          "prices",
        ],
      },
    ),
    outputSchema: s.actionOutput({ winBackOffer: winBackOfferResource }, "The created win-back offer."),
  }),
  defineProviderAction(service, {
    name: "update_win_back_offer",
    operationType: "destructive",
    description:
      "Change the schedule, priority, promotion intent, or customer eligibility of a win-back offer. Only the given fields change; the identifier, duration, mode, period count, and prices cannot be changed after creation.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The fields to change on one win-back offer. Give at least one field besides winBackOfferId.",
      {
        winBackOfferId: nonEmptyString("App Store Connect identifier of the win-back offer."),
        customerEligibilityPaidSubscriptionDurationInMonths: s.integer(
          "New minimum number of months the customer must have paid before lapsing.",
          { minimum: 0 },
        ),
        customerEligibilityTimeSinceLastSubscribedInMonths: integerRangeInput,
        customerEligibilityWaitBetweenOffersInMonths: s.nullable(
          s.integer("New waiting period in months between win-back offers. Pass null to remove the waiting period.", {
            minimum: 0,
          }),
        ),
        startDate: dateString("New first day the offer is available, as YYYY-MM-DD."),
        endDate: s.nullable(
          dateString("New last day the offer is available, as YYYY-MM-DD. Pass null to remove the end date."),
        ),
        priority: s.stringEnum(
          "New priority the App Store uses when several win-back offers apply.",
          winBackOfferPriorities,
        ),
        promotionIntent: s.stringEnum(
          "Whether Apple may promote the offer on the App Store with auto-generated assets.",
          winBackOfferPromotionIntents,
        ),
      },
      { required: ["winBackOfferId"] },
    ),
    outputSchema: s.actionOutput({ winBackOffer: winBackOfferResource }, "The updated win-back offer."),
  }),
  defineProviderAction(service, {
    name: "delete_win_back_offer",
    operationType: "destructive",
    description:
      "Delete a win-back offer. Apps can no longer present it, and customers who already redeemed it keep their discounted period.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: singleIdInput(
      "winBackOfferId",
      "App Store Connect identifier of the win-back offer.",
      "Identifies the win-back offer to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted win-back offer."),
      "Confirmation that the win-back offer was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_win_back_offer_prices",
    operationType: "read",
    description:
      "List the territory prices of one win-back offer, with the currency and customer price of each price point.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the prices of one win-back offer.",
      {
        winBackOfferId: nonEmptyString("App Store Connect identifier of the win-back offer."),
        territoryIds: territoryFilterInput,
        ...paginationInputs,
      },
      { required: ["winBackOfferId"] },
    ),
    outputSchema: pricesPage(
      "winBackOfferPrices",
      offerPriceResource(
        "The price of a win-back offer in one territory.",
        "App Store Connect identifier for the win-back offer price.",
      ),
      "win-back offer prices",
    ),
  }),
];

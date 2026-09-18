import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

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

export const subscriptionStates: readonly string[] = [
  "MISSING_METADATA",
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
export const subscriptionPeriods: readonly string[] = [
  "ONE_WEEK",
  "ONE_MONTH",
  "TWO_MONTHS",
  "THREE_MONTHS",
  "SIX_MONTHS",
  "ONE_YEAR",
];
export const subscriptionLocalizationStates: readonly string[] = [
  "PREPARE_FOR_SUBMISSION",
  "WAITING_FOR_REVIEW",
  "APPROVED",
  "REJECTED",
];
export const subscriptionPlanTypes: readonly string[] = ["MONTHLY", "UPFRONT"];
export const subscriptionGracePeriodDurations: readonly string[] = ["THREE_DAYS", "SIXTEEN_DAYS", "TWENTY_EIGHT_DAYS"];
export const subscriptionGracePeriodRenewalTypes: readonly string[] = ["ALL_RENEWALS", "PAID_TO_PAID_ONLY"];
export const subscriptionVersionStates: readonly string[] = [
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

const territoryCodeNote = "ISO 3166-1 alpha-3 App Store territory code, such as USA.";
const planTypeDescription =
  "Payment plan of the subscription: UPFRONT charges the full price at the start of each period, MONTHLY is a 12-month commitment billed monthly (App Store Connect API 4.4).";
const versionFlowNote =
  "Versions belong to the App Store Connect API 4.4 review flow: a version is a draft of the localized metadata that goes through App Review, and the live record is replaced once the version is approved.";

const subscriptionGroupResource = resourceObject(
  "A subscription group that holds the auto-renewable subscriptions a customer can switch between.",
  "App Store Connect identifier for the subscription group.",
  {
    referenceName: s.nullableString("Internal reference name of the group, not shown to customers."),
  },
);

const subscriptionGroupLocalizationResource = resourceObject(
  "Customer-facing name of a subscription group in one locale.",
  "App Store Connect identifier for the subscription group localization.",
  {
    name: s.nullableString("Group name shown to customers in this locale."),
    customAppName: s.nullableString("Alternative app name shown with the group in this locale, when one is set."),
    locale: s.nullableString("Locale the localization is written in, such as en-US."),
    state: nullableEnum("Review state of the localization.", subscriptionLocalizationStates),
  },
);

const subscriptionGroupVersionLocalizationResource = resourceObject(
  "Customer-facing name of a subscription group in one locale, attached to a subscription group version.",
  "App Store Connect identifier for the subscription group version localization.",
  {
    name: s.nullableString("Group name shown to customers in this locale."),
    customAppName: s.nullableString("Alternative app name shown with the group in this locale, when one is set."),
    locale: s.nullableString("Locale the localization is written in, such as en-US."),
  },
);

const subscriptionResource = resourceObject(
  "An auto-renewable subscription.",
  "App Store Connect identifier for the subscription.",
  {
    name: s.nullableString("Internal reference name of the subscription."),
    productId: s.nullableString("Product identifier used by the app to purchase the subscription."),
    familySharable: s.nullableBoolean("Whether the subscription can be shared with Family Sharing."),
    state: nullableEnum("Review and sale state of the subscription.", subscriptionStates),
    subscriptionPeriod: nullableEnum("Length of one subscription period.", subscriptionPeriods),
    reviewNote: s.nullableString("Note shown to App Review alongside the subscription."),
    groupLevel: s.nullableInteger(
      "Rank of the subscription within its group, where 1 is the highest level of service.",
    ),
    subscriptionGroupId: s.nullableString("App Store Connect identifier of the group the subscription belongs to."),
  },
  ["subscriptionGroupId"],
);

const subscriptionLocalizationResource = resourceObject(
  "Customer-facing name and description of a subscription in one locale.",
  "App Store Connect identifier for the subscription localization.",
  {
    name: s.nullableString("Subscription name shown to customers in this locale."),
    locale: s.nullableString("Locale the localization is written in, such as en-US."),
    description: s.nullableString("Subscription description shown to customers in this locale."),
    state: nullableEnum("Review state of the localization.", subscriptionLocalizationStates),
  },
);

const subscriptionVersionLocalizationResource = resourceObject(
  "Customer-facing name and description of a subscription in one locale, attached to a subscription version.",
  "App Store Connect identifier for the subscription version localization.",
  {
    name: s.nullableString("Subscription name shown to customers in this locale."),
    locale: s.nullableString("Locale the localization is written in, such as en-US."),
    description: s.nullableString("Subscription description shown to customers in this locale."),
  },
);

const subscriptionPricePointFields = {
  customerPrice: s.nullableString("Price the customer pays, as a decimal string in the territory currency."),
  proceeds: s.nullableString("Developer proceeds during the first year of a subscription, as a decimal string."),
  proceedsYear2: s.nullableString("Developer proceeds after the first year of a subscription, as a decimal string."),
};

const subscriptionPricePointSummary = s.nullable(
  s.object(
    "The price point the price is based on. Only the id is filled in when App Store Connect did not return the price point record; null when the price has no price point.",
    {
      id: s.string("App Store Connect identifier for the subscription price point."),
      ...subscriptionPricePointFields,
    },
    { additionalProperties: true, required: ["id"] },
  ),
);

const subscriptionPriceResource = resourceObject(
  "A configured price of a subscription in one territory.",
  "App Store Connect identifier for the subscription price.",
  {
    startDate: s.nullableString(
      "Date the price takes effect, as YYYY-MM-DD, or null for a price that is not scheduled.",
    ),
    preserved: s.nullableBoolean("Whether existing subscribers keep this price after a later price increase."),
    planType: nullableEnum(planTypeDescription, subscriptionPlanTypes),
    territoryId: s.nullableString(`Territory the price applies to. ${territoryCodeNote}`),
    subscriptionPricePoint: subscriptionPricePointSummary,
  },
  ["territoryId", "subscriptionPricePoint"],
);

const subscriptionPricePointResource = resourceObject(
  "A standard price tier available to a subscription in one territory.",
  "App Store Connect identifier for the subscription price point.",
  {
    ...subscriptionPricePointFields,
    territoryId: s.nullableString(`Territory the price point belongs to. ${territoryCodeNote}`),
  },
  ["territoryId"],
);

const subscriptionGracePeriodResource = resourceObject(
  "Billing grace period settings of an app, which keep subscribers on service while a failed payment is retried.",
  "App Store Connect identifier for the subscription grace period record.",
  {
    optIn: s.nullableBoolean("Whether the grace period is enabled in production."),
    sandboxOptIn: s.nullableBoolean("Whether the grace period is enabled in the sandbox."),
    duration: nullableEnum("Length of the grace period.", subscriptionGracePeriodDurations),
    renewalType: nullableEnum(
      "Which renewals get a grace period: every renewal, or only paid-to-paid renewals.",
      subscriptionGracePeriodRenewalTypes,
    ),
  },
);

const subscriptionPlanAvailabilityResource = resourceObject(
  "Territory availability of one payment plan of a subscription.",
  "App Store Connect identifier for the subscription plan availability.",
  {
    availableInNewTerritories: s.nullableBoolean(
      "Whether the plan becomes available automatically in territories the App Store adds later.",
    ),
    planType: nullableEnum(planTypeDescription, subscriptionPlanTypes),
  },
);

const subscriptionVersionResource = resourceObject(
  `A draft version of a subscription that carries its localized metadata through App Review. ${versionFlowNote}`,
  "App Store Connect identifier for the subscription version.",
  {
    version: s.nullableInteger("Sequential version number assigned by App Store Connect."),
    state: nullableEnum("Review state of the version.", subscriptionVersionStates),
  },
);

const subscriptionGroupVersionResource = resourceObject(
  `A draft version of a subscription group that carries its localized names through App Review. ${versionFlowNote}`,
  "App Store Connect identifier for the subscription group version.",
  {
    version: s.nullableInteger("Sequential version number assigned by App Store Connect."),
    state: nullableEnum("Review state of the version.", subscriptionVersionStates),
  },
);

const subscriptionGroupIdInput = nonEmptyString("App Store Connect identifier of the subscription group.");
const subscriptionIdInput = nonEmptyString("App Store Connect identifier of the subscription.");
const localeInput = nonEmptyString("Locale the localization is written in, such as en-US.");
const versionStatesInput = s.array(
  "Return only versions in one of these review states.",
  s.stringEnum("A version review state.", subscriptionVersionStates),
  { minItems: 1 },
);

export const appStoreConnectSubscriptionActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_subscription_groups",
    operationType: "read",
    description:
      "List the subscription groups of one app, optionally narrowed by reference name or by the state of the subscriptions they contain.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the subscription groups of one app.",
      {
        appId: nonEmptyString("App Store Connect identifier of the app."),
        referenceName: nonEmptyString("Return only the group with this exact internal reference name."),
        subscriptionStates: s.array(
          "Return only groups that contain a subscription in one of these states.",
          s.stringEnum("A subscription state.", subscriptionStates),
          { minItems: 1 },
        ),
        sort: s.stringEnum("Sort order for the returned groups.", ["referenceName", "-referenceName"]),
        ...paginationInputs,
      },
      { required: ["appId"] },
    ),
    outputSchema: pageOutput(
      "subscriptionGroups",
      subscriptionGroupResource,
      "Subscription groups returned for this page.",
      "A page of subscription groups.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_subscription_group",
    operationType: "read",
    description: "Read one subscription group by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { subscriptionGroupId: subscriptionGroupIdInput },
      ["subscriptionGroupId"],
      "Identifies the subscription group to read.",
    ),
    outputSchema: s.actionOutput({ subscriptionGroup: subscriptionGroupResource }, "The requested subscription group."),
  }),
  defineProviderAction(service, {
    name: "create_subscription_group",
    operationType: "write",
    description:
      "Create a subscription group for an app. Subscriptions are created inside a group, and customers can switch between the subscriptions of one group.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The subscription group to create.",
      {
        appId: nonEmptyString("App Store Connect identifier of the app the group belongs to."),
        referenceName: nonEmptyString("Internal reference name of the group, not shown to customers."),
      },
      { required: ["appId", "referenceName"] },
    ),
    outputSchema: s.actionOutput({ subscriptionGroup: subscriptionGroupResource }, "The created subscription group."),
  }),
  defineProviderAction(service, {
    name: "update_subscription_group",
    operationType: "write",
    description: "Rename a subscription group. The new reference name replaces the existing one.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The subscription group to update and its new reference name.",
      {
        subscriptionGroupId: subscriptionGroupIdInput,
        referenceName: nonEmptyString("New internal reference name of the group."),
      },
      { required: ["subscriptionGroupId", "referenceName"] },
    ),
    outputSchema: s.actionOutput({ subscriptionGroup: subscriptionGroupResource }, "The updated subscription group."),
  }),
  defineProviderAction(service, {
    name: "delete_subscription_group",
    operationType: "destructive",
    description:
      "Delete a subscription group. App Store Connect only deletes groups that no longer contain subscriptions that have been approved.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.actionInput(
      { subscriptionGroupId: subscriptionGroupIdInput },
      ["subscriptionGroupId"],
      "Identifies the subscription group to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted subscription group."),
      "Confirmation that the subscription group was deleted.",
    ),
  }),

  defineProviderAction(service, {
    name: "list_subscription_group_localizations",
    operationType: "read",
    description: "List the customer-facing localized names of one subscription group.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the subscription group whose localizations to list.",
      { subscriptionGroupId: subscriptionGroupIdInput, ...paginationInputs },
      { required: ["subscriptionGroupId"] },
    ),
    outputSchema: pageOutput(
      "subscriptionGroupLocalizations",
      subscriptionGroupLocalizationResource,
      "Subscription group localizations returned for this page.",
      "A page of subscription group localizations.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_subscription_group_localization",
    operationType: "read",
    description: "Read one subscription group localization by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        subscriptionGroupLocalizationId: nonEmptyString(
          "App Store Connect identifier of the subscription group localization.",
        ),
      },
      ["subscriptionGroupLocalizationId"],
      "Identifies the subscription group localization to read.",
    ),
    outputSchema: s.actionOutput(
      { subscriptionGroupLocalization: subscriptionGroupLocalizationResource },
      "The requested subscription group localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_subscription_group_localization",
    operationType: "write",
    description:
      "Add the customer-facing name of a subscription group in one locale. Each locale can only be added once per group.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The subscription group localization to create.",
      {
        subscriptionGroupId: subscriptionGroupIdInput,
        locale: localeInput,
        name: nonEmptyString("Group name shown to customers in this locale."),
        customAppName: nonEmptyString("Alternative app name shown with the group in this locale."),
      },
      { required: ["subscriptionGroupId", "locale", "name"] },
    ),
    outputSchema: s.actionOutput(
      { subscriptionGroupLocalization: subscriptionGroupLocalizationResource },
      "The created subscription group localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_subscription_group_localization",
    operationType: "write",
    description:
      "Change the customer-facing name or custom app name of a subscription group in one locale. Pass at least one field; the locale itself cannot be changed.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The subscription group localization to update and the fields to change.",
      {
        subscriptionGroupLocalizationId: nonEmptyString(
          "App Store Connect identifier of the subscription group localization.",
        ),
        name: nonEmptyString("New group name shown to customers in this locale."),
        customAppName: nonEmptyString("New alternative app name shown with the group in this locale."),
      },
      { required: ["subscriptionGroupLocalizationId"] },
    ),
    outputSchema: s.actionOutput(
      { subscriptionGroupLocalization: subscriptionGroupLocalizationResource },
      "The updated subscription group localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_subscription_group_localization",
    operationType: "destructive",
    description: "Delete the customer-facing name of a subscription group in one locale.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.actionInput(
      {
        subscriptionGroupLocalizationId: nonEmptyString(
          "App Store Connect identifier of the subscription group localization.",
        ),
      },
      ["subscriptionGroupLocalizationId"],
      "Identifies the subscription group localization to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted subscription group localization."),
      "Confirmation that the subscription group localization was deleted.",
    ),
  }),

  defineProviderAction(service, {
    name: "list_subscriptions",
    operationType: "read",
    description:
      "List the auto-renewable subscriptions of one subscription group, optionally narrowed by name, product identifier, or state.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the subscriptions of one group.",
      {
        subscriptionGroupId: subscriptionGroupIdInput,
        name: nonEmptyString("Return only the subscription with this exact reference name."),
        productId: nonEmptyString("Return only the subscription with this exact product identifier."),
        states: s.array(
          "Return only subscriptions in one of these states.",
          s.stringEnum("A subscription state.", subscriptionStates),
          { minItems: 1 },
        ),
        sort: s.stringEnum("Sort order for the returned subscriptions.", ["name", "-name"]),
        ...paginationInputs,
      },
      { required: ["subscriptionGroupId"] },
    ),
    outputSchema: pageOutput(
      "subscriptions",
      subscriptionResource,
      "Subscriptions returned for this page.",
      "A page of subscriptions.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_subscription",
    operationType: "read",
    description: "Read one auto-renewable subscription by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { subscriptionId: subscriptionIdInput },
      ["subscriptionId"],
      "Identifies the subscription to read.",
    ),
    outputSchema: s.actionOutput({ subscription: subscriptionResource }, "The requested subscription."),
  }),
  defineProviderAction(service, {
    name: "create_subscription",
    operationType: "write",
    description:
      "Create an auto-renewable subscription inside a subscription group. The product identifier cannot be changed afterwards, and the subscription still needs localizations, a price, availability, and a review submission before it can go on sale.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The subscription to create.",
      {
        subscriptionGroupId: nonEmptyString("App Store Connect identifier of the group the subscription belongs to."),
        name: nonEmptyString("Internal reference name of the subscription."),
        productId: nonEmptyString(
          "Product identifier the app uses to purchase the subscription. Unique per app and permanent.",
        ),
        subscriptionPeriod: s.stringEnum("Length of one subscription period.", subscriptionPeriods),
        familySharable: s.boolean("Allow the subscription to be shared with Family Sharing."),
        reviewNote: nonEmptyString("Note shown to App Review alongside the subscription."),
        groupLevel: s.integer("Rank of the subscription within its group, where 1 is the highest level of service.", {
          minimum: 1,
        }),
      },
      { required: ["subscriptionGroupId", "name", "productId"] },
    ),
    outputSchema: s.actionOutput({ subscription: subscriptionResource }, "The created subscription."),
  }),
  defineProviderAction(service, {
    name: "update_subscription",
    operationType: "destructive",
    description:
      "Change the reference name, subscription period, Family Sharing setting, review note, or group level of a subscription. Pass at least one field; each given field overwrites the existing value. Family Sharing cannot be turned off again once enabled for an approved subscription.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The subscription to update and the fields to change.",
      {
        subscriptionId: subscriptionIdInput,
        name: nonEmptyString("New internal reference name of the subscription."),
        subscriptionPeriod: s.stringEnum("New length of one subscription period.", subscriptionPeriods),
        familySharable: s.boolean("Whether the subscription can be shared with Family Sharing."),
        reviewNote: nonEmptyString("New note shown to App Review alongside the subscription."),
        groupLevel: s.integer(
          "New rank of the subscription within its group, where 1 is the highest level of service.",
          { minimum: 1 },
        ),
      },
      { required: ["subscriptionId"] },
    ),
    outputSchema: s.actionOutput({ subscription: subscriptionResource }, "The updated subscription."),
  }),
  defineProviderAction(service, {
    name: "delete_subscription",
    operationType: "destructive",
    description:
      "Delete an auto-renewable subscription. App Store Connect only deletes subscriptions that have never been approved; approved subscriptions can only be removed from sale.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.actionInput(
      { subscriptionId: subscriptionIdInput },
      ["subscriptionId"],
      "Identifies the subscription to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted subscription."),
      "Confirmation that the subscription was deleted.",
    ),
  }),

  defineProviderAction(service, {
    name: "list_subscription_localizations",
    operationType: "read",
    description: "List the customer-facing localized names and descriptions of one subscription.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the subscription whose localizations to list.",
      { subscriptionId: subscriptionIdInput, ...paginationInputs },
      { required: ["subscriptionId"] },
    ),
    outputSchema: pageOutput(
      "subscriptionLocalizations",
      subscriptionLocalizationResource,
      "Subscription localizations returned for this page.",
      "A page of subscription localizations.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_subscription_localization",
    operationType: "read",
    description: "Read one subscription localization by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        subscriptionLocalizationId: nonEmptyString("App Store Connect identifier of the subscription localization."),
      },
      ["subscriptionLocalizationId"],
      "Identifies the subscription localization to read.",
    ),
    outputSchema: s.actionOutput(
      { subscriptionLocalization: subscriptionLocalizationResource },
      "The requested subscription localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_subscription_localization",
    operationType: "write",
    description:
      "Add the customer-facing name and description of a subscription in one locale. Each locale can only be added once per subscription.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The subscription localization to create.",
      {
        subscriptionId: subscriptionIdInput,
        locale: localeInput,
        name: nonEmptyString("Subscription name shown to customers in this locale."),
        description: nonEmptyString("Subscription description shown to customers in this locale."),
      },
      { required: ["subscriptionId", "locale", "name"] },
    ),
    outputSchema: s.actionOutput(
      { subscriptionLocalization: subscriptionLocalizationResource },
      "The created subscription localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_subscription_localization",
    operationType: "write",
    description:
      "Change the customer-facing name or description of a subscription in one locale. Pass at least one field; the locale itself cannot be changed.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The subscription localization to update and the fields to change.",
      {
        subscriptionLocalizationId: nonEmptyString("App Store Connect identifier of the subscription localization."),
        name: nonEmptyString("New subscription name shown to customers in this locale."),
        description: nonEmptyString("New subscription description shown to customers in this locale."),
      },
      { required: ["subscriptionLocalizationId"] },
    ),
    outputSchema: s.actionOutput(
      { subscriptionLocalization: subscriptionLocalizationResource },
      "The updated subscription localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_subscription_localization",
    operationType: "destructive",
    description: "Delete the customer-facing name and description of a subscription in one locale.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.actionInput(
      {
        subscriptionLocalizationId: nonEmptyString("App Store Connect identifier of the subscription localization."),
      },
      ["subscriptionLocalizationId"],
      "Identifies the subscription localization to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted subscription localization."),
      "Confirmation that the subscription localization was deleted.",
    ),
  }),

  defineProviderAction(service, {
    name: "list_subscription_prices",
    operationType: "read",
    description:
      "List the current and scheduled prices of one subscription, with the territory and price point of each price. Filter by territory, payment plan, or price point.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the prices of one subscription.",
      {
        subscriptionId: subscriptionIdInput,
        territory: nonEmptyString(`Return only prices in this territory. ${territoryCodeNote}`),
        planType: s.stringEnum("Return only prices of this payment plan.", subscriptionPlanTypes),
        subscriptionPricePointId: nonEmptyString("Return only prices based on this subscription price point."),
        ...paginationInputs,
      },
      { required: ["subscriptionId"] },
    ),
    outputSchema: pageOutput(
      "subscriptionPrices",
      subscriptionPriceResource,
      "Subscription prices returned for this page.",
      "A page of subscription prices.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_subscription_price",
    operationType: "write",
    description:
      "Set the price of a subscription in one territory from a subscription price point, either as the initial price or as a scheduled price change. Use list_subscription_price_points to find the price point identifier. A scheduled change can be removed again with delete_subscription_price.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The subscription price to set.",
      {
        subscriptionId: subscriptionIdInput,
        subscriptionPricePointId: nonEmptyString(
          "App Store Connect identifier of the subscription price point that defines the new price.",
        ),
        territoryId: nonEmptyString(
          `Territory the price applies to. Omit to let App Store Connect use the territory of the price point. ${territoryCodeNote}`,
        ),
        startDate: s.date(
          "Date the price takes effect, as YYYY-MM-DD. Omit when setting the initial price of a subscription that has not been on sale yet.",
        ),
        preserveCurrentPrice: s.boolean(
          "Keep existing subscribers at their current price instead of moving them to the new price.",
        ),
        planType: s.stringEnum(planTypeDescription, subscriptionPlanTypes),
      },
      { required: ["subscriptionId", "subscriptionPricePointId"] },
    ),
    outputSchema: s.actionOutput({ subscriptionPrice: subscriptionPriceResource }, "The created subscription price."),
  }),
  defineProviderAction(service, {
    name: "delete_subscription_price",
    operationType: "destructive",
    description:
      "Delete a scheduled price change of a subscription before it takes effect. The price that is already in effect cannot be deleted.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.actionInput(
      {
        subscriptionPriceId: nonEmptyString("App Store Connect identifier of the subscription price."),
      },
      ["subscriptionPriceId"],
      "Identifies the scheduled subscription price to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted subscription price."),
      "Confirmation that the subscription price was deleted.",
    ),
  }),

  defineProviderAction(service, {
    name: "list_subscription_price_points",
    operationType: "read",
    description:
      "List the price points a subscription can be priced at, with the customer price and developer proceeds of each. Apple recommends filtering by territory and plans to make that filter mandatory.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the price points of one subscription.",
      {
        subscriptionId: subscriptionIdInput,
        territory: nonEmptyString(`Return only price points of this territory. ${territoryCodeNote}`),
        planType: s.stringEnum("Return only price points of this payment plan.", subscriptionPlanTypes),
        upfrontPricePointId: nonEmptyString(
          "Return only the monthly price points that pair with this upfront price point.",
        ),
        ...paginationInputs,
      },
      { required: ["subscriptionId"] },
    ),
    outputSchema: pageOutput(
      "subscriptionPricePoints",
      subscriptionPricePointResource,
      "Subscription price points returned for this page.",
      "A page of subscription price points.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_subscription_price_point",
    operationType: "read",
    description: "Read one subscription price point by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        subscriptionPricePointId: nonEmptyString("App Store Connect identifier of the subscription price point."),
      },
      ["subscriptionPricePointId"],
      "Identifies the subscription price point to read.",
    ),
    outputSchema: s.actionOutput(
      { subscriptionPricePoint: subscriptionPricePointResource },
      "The requested subscription price point.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_subscription_price_point_equalizations",
    operationType: "read",
    description:
      "List the price points in other territories that App Store Connect considers equivalent to one subscription price point, which is how a price set in one territory is carried over to the rest.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the equalizations of one subscription price point.",
      {
        subscriptionPricePointId: nonEmptyString(
          "App Store Connect identifier of the subscription price point to equalize from.",
        ),
        territory: nonEmptyString(`Return only the equivalent price point of this territory. ${territoryCodeNote}`),
        subscriptionId: nonEmptyString("Return only equivalents that apply to this subscription."),
        planType: s.stringEnum("Return only equivalents of this payment plan.", subscriptionPlanTypes),
        upfrontPricePointId: nonEmptyString(
          "Return only the monthly price points that pair with this upfront price point.",
        ),
        ...paginationInputs,
      },
      { required: ["subscriptionPricePointId"] },
    ),
    outputSchema: pageOutput(
      "subscriptionPricePoints",
      subscriptionPricePointResource,
      "Equivalent subscription price points returned for this page.",
      "A page of equivalent subscription price points.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_subscription_price_point_adjusted_equalizations",
    operationType: "read",
    description:
      "List the adjusted territory equalizations of one subscription price point, the equivalents App Store Connect proposes after its territory-specific price adjustments.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the adjusted equalizations of one subscription price point.",
      {
        subscriptionPricePointId: nonEmptyString(
          "App Store Connect identifier of the subscription price point to equalize from.",
        ),
        territory: nonEmptyString(`Return only the adjusted equivalent of this territory. ${territoryCodeNote}`),
        subscriptionId: nonEmptyString("Return only adjusted equivalents that apply to this subscription."),
        planType: s.stringEnum("Return only adjusted equivalents of this payment plan.", subscriptionPlanTypes),
        upfrontPricePointId: nonEmptyString(
          "Return only the monthly price points that pair with this upfront price point.",
        ),
        ...paginationInputs,
      },
      { required: ["subscriptionPricePointId"] },
    ),
    outputSchema: pageOutput(
      "subscriptionPricePoints",
      subscriptionPricePointResource,
      "Adjusted equivalent subscription price points returned for this page.",
      "A page of adjusted equivalent subscription price points.",
    ),
  }),

  defineProviderAction(service, {
    name: "get_subscription_grace_period",
    operationType: "read",
    description:
      "Read the billing grace period settings of an app, either by app or by the grace period record identifier. Pass exactly one of appId or subscriptionGracePeriodId.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the grace period settings to read.",
      {
        appId: nonEmptyString("App Store Connect identifier of the app whose grace period settings to read."),
        subscriptionGracePeriodId: nonEmptyString(
          "App Store Connect identifier of the grace period record, as returned by an earlier read.",
        ),
      },
      { optional: ["appId", "subscriptionGracePeriodId"] },
    ),
    outputSchema: s.actionOutput(
      { subscriptionGracePeriod: subscriptionGracePeriodResource },
      "The grace period settings of the app.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_subscription_grace_period",
    operationType: "destructive",
    description:
      "Change the billing grace period settings of an app: turn it on or off in production or the sandbox, set its length, or choose which renewals it covers. Pass at least one field; the change applies to every subscription of the app.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The grace period record to update and the settings to change.",
      {
        subscriptionGracePeriodId: nonEmptyString(
          "App Store Connect identifier of the grace period record, as returned by get_subscription_grace_period.",
        ),
        optIn: s.boolean("Enable or disable the grace period in production."),
        sandboxOptIn: s.boolean("Enable or disable the grace period in the sandbox."),
        duration: s.stringEnum("Length of the grace period.", subscriptionGracePeriodDurations),
        renewalType: s.stringEnum(
          "Which renewals get a grace period: every renewal, or only paid-to-paid renewals.",
          subscriptionGracePeriodRenewalTypes,
        ),
      },
      { required: ["subscriptionGracePeriodId"] },
    ),
    outputSchema: s.actionOutput(
      { subscriptionGracePeriod: subscriptionGracePeriodResource },
      "The updated grace period settings.",
    ),
  }),

  defineProviderAction(service, {
    name: "list_subscription_plan_availabilities",
    operationType: "read",
    description:
      "List the territory availability records of one subscription, one per payment plan. Use list_subscription_plan_availability_territories for the full territory list of a record.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the subscription whose plan availabilities to list.",
      { subscriptionId: subscriptionIdInput, ...paginationInputs },
      { required: ["subscriptionId"] },
    ),
    outputSchema: pageOutput(
      "subscriptionPlanAvailabilities",
      subscriptionPlanAvailabilityResource,
      "Subscription plan availabilities returned for this page.",
      "A page of subscription plan availabilities.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_subscription_plan_availability",
    operationType: "read",
    description: "Read one subscription plan availability by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        subscriptionPlanAvailabilityId: nonEmptyString(
          "App Store Connect identifier of the subscription plan availability.",
        ),
      },
      ["subscriptionPlanAvailabilityId"],
      "Identifies the subscription plan availability to read.",
    ),
    outputSchema: s.actionOutput(
      { subscriptionPlanAvailability: subscriptionPlanAvailabilityResource },
      "The requested subscription plan availability.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_subscription_plan_availability",
    operationType: "write",
    description:
      "Make one payment plan of a subscription available in a set of territories. Each plan type can only have one availability record per subscription; use update_subscription_plan_availability to change an existing one.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The subscription plan availability to create.",
      {
        subscriptionId: subscriptionIdInput,
        planType: s.stringEnum(planTypeDescription, subscriptionPlanTypes),
        availableTerritoryIds: s.stringArray("Territories the plan is sold in.", {
          minItems: 1,
          itemDescription: territoryCodeNote,
        }),
        availableInNewTerritories: s.boolean(
          "Also make the plan available automatically in territories the App Store adds later.",
        ),
      },
      { required: ["subscriptionId", "planType", "availableTerritoryIds"] },
    ),
    outputSchema: s.actionOutput(
      { subscriptionPlanAvailability: subscriptionPlanAvailabilityResource },
      "The created subscription plan availability.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_subscription_plan_availability",
    operationType: "destructive",
    description:
      "Change the territories a subscription payment plan is sold in, or whether it opens automatically in new territories. Pass at least one field; availableTerritoryIds replaces the whole territory list, so territories left out stop selling the plan.",
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The subscription plan availability to update and the settings to change.",
      {
        subscriptionPlanAvailabilityId: nonEmptyString(
          "App Store Connect identifier of the subscription plan availability.",
        ),
        availableTerritoryIds: s.stringArray("Complete list of territories the plan is sold in after the update.", {
          minItems: 1,
          itemDescription: territoryCodeNote,
        }),
        availableInNewTerritories: s.boolean(
          "Whether the plan becomes available automatically in territories the App Store adds later.",
        ),
      },
      { required: ["subscriptionPlanAvailabilityId"] },
    ),
    outputSchema: s.actionOutput(
      { subscriptionPlanAvailability: subscriptionPlanAvailabilityResource },
      "The updated subscription plan availability.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_subscription_plan_availability_territories",
    operationType: "read",
    description: "List the territories in which one subscription plan availability sells the plan.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the subscription plan availability whose territories to list.",
      {
        subscriptionPlanAvailabilityId: nonEmptyString(
          "App Store Connect identifier of the subscription plan availability.",
        ),
        ...paginationInputs,
      },
      { required: ["subscriptionPlanAvailabilityId"] },
    ),
    outputSchema: pageOutput(
      "territories",
      territoryResource,
      "Territories returned for this page.",
      "A page of territories.",
    ),
  }),

  defineProviderAction(service, {
    name: "list_subscription_versions",
    operationType: "read",
    description: `List the versions of one subscription, optionally narrowed by review state. ${versionFlowNote}`,
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the versions of one subscription.",
      { subscriptionId: subscriptionIdInput, states: versionStatesInput, ...paginationInputs },
      { required: ["subscriptionId"] },
    ),
    outputSchema: pageOutput(
      "subscriptionVersions",
      subscriptionVersionResource,
      "Subscription versions returned for this page.",
      "A page of subscription versions.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_subscription_version",
    operationType: "read",
    description: `Read one subscription version by its App Store Connect identifier. ${versionFlowNote}`,
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        subscriptionVersionId: nonEmptyString("App Store Connect identifier of the subscription version."),
      },
      ["subscriptionVersionId"],
      "Identifies the subscription version to read.",
    ),
    outputSchema: s.actionOutput(
      { subscriptionVersion: subscriptionVersionResource },
      "The requested subscription version.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_subscription_version",
    operationType: "write",
    description: `Create a new draft version of a subscription so its localized metadata can be edited and submitted for review while the approved version stays live. ${versionFlowNote}`,
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.actionInput(
      { subscriptionId: subscriptionIdInput },
      ["subscriptionId"],
      "Identifies the subscription to create a version for.",
    ),
    outputSchema: s.actionOutput(
      { subscriptionVersion: subscriptionVersionResource },
      "The created subscription version.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_subscription_version_localizations",
    operationType: "read",
    description: `List the localized names and descriptions attached to one subscription version. ${versionFlowNote}`,
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the subscription version whose localizations to list.",
      {
        subscriptionVersionId: nonEmptyString("App Store Connect identifier of the subscription version."),
        ...paginationInputs,
      },
      { required: ["subscriptionVersionId"] },
    ),
    outputSchema: pageOutput(
      "subscriptionLocalizations",
      subscriptionVersionLocalizationResource,
      "Subscription version localizations returned for this page.",
      "A page of subscription version localizations.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_subscription_version_localization",
    operationType: "read",
    description: `Read one subscription version localization by its App Store Connect identifier. ${versionFlowNote}`,
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        subscriptionLocalizationId: nonEmptyString(
          "App Store Connect identifier of the subscription version localization.",
        ),
      },
      ["subscriptionLocalizationId"],
      "Identifies the subscription version localization to read.",
    ),
    outputSchema: s.actionOutput(
      { subscriptionLocalization: subscriptionVersionLocalizationResource },
      "The requested subscription version localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_subscription_version_localization",
    operationType: "write",
    description: `Add the customer-facing name and description of a subscription in one locale to a subscription version. ${versionFlowNote}`,
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The subscription version localization to create.",
      {
        subscriptionVersionId: nonEmptyString("App Store Connect identifier of the subscription version."),
        locale: localeInput,
        name: nonEmptyString("Subscription name shown to customers in this locale."),
        description: nonEmptyString("Subscription description shown to customers in this locale."),
      },
      { required: ["subscriptionVersionId", "locale", "name"] },
    ),
    outputSchema: s.actionOutput(
      { subscriptionLocalization: subscriptionVersionLocalizationResource },
      "The created subscription version localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_subscription_version_localization",
    operationType: "destructive",
    description: `Change the customer-facing name or description of a subscription version localization. Pass at least one field; the locale itself cannot be changed. ${versionFlowNote}`,
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The subscription version localization to update and the fields to change.",
      {
        subscriptionLocalizationId: nonEmptyString(
          "App Store Connect identifier of the subscription version localization.",
        ),
        name: nonEmptyString("New subscription name shown to customers in this locale."),
        description: nonEmptyString("New subscription description shown to customers in this locale."),
      },
      { required: ["subscriptionLocalizationId"] },
    ),
    outputSchema: s.actionOutput(
      { subscriptionLocalization: subscriptionVersionLocalizationResource },
      "The updated subscription version localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_subscription_version_localization",
    operationType: "destructive",
    description: `Delete one localization from a subscription version. ${versionFlowNote}`,
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.actionInput(
      {
        subscriptionLocalizationId: nonEmptyString(
          "App Store Connect identifier of the subscription version localization.",
        ),
      },
      ["subscriptionLocalizationId"],
      "Identifies the subscription version localization to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted subscription version localization."),
      "Confirmation that the subscription version localization was deleted.",
    ),
  }),

  defineProviderAction(service, {
    name: "list_subscription_group_versions",
    operationType: "read",
    description: `List the versions of one subscription group, optionally narrowed by review state. ${versionFlowNote}`,
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the versions of one subscription group.",
      {
        subscriptionGroupId: subscriptionGroupIdInput,
        states: versionStatesInput,
        ...paginationInputs,
      },
      { required: ["subscriptionGroupId"] },
    ),
    outputSchema: pageOutput(
      "subscriptionGroupVersions",
      subscriptionGroupVersionResource,
      "Subscription group versions returned for this page.",
      "A page of subscription group versions.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_subscription_group_version",
    operationType: "read",
    description: `Read one subscription group version by its App Store Connect identifier. ${versionFlowNote}`,
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        subscriptionGroupVersionId: nonEmptyString("App Store Connect identifier of the subscription group version."),
      },
      ["subscriptionGroupVersionId"],
      "Identifies the subscription group version to read.",
    ),
    outputSchema: s.actionOutput(
      { subscriptionGroupVersion: subscriptionGroupVersionResource },
      "The requested subscription group version.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_subscription_group_version",
    operationType: "write",
    description: `Create a new draft version of a subscription group so its localized names can be edited and submitted for review while the approved version stays live. ${versionFlowNote}`,
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.actionInput(
      { subscriptionGroupId: subscriptionGroupIdInput },
      ["subscriptionGroupId"],
      "Identifies the subscription group to create a version for.",
    ),
    outputSchema: s.actionOutput(
      { subscriptionGroupVersion: subscriptionGroupVersionResource },
      "The created subscription group version.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_subscription_group_version_localizations",
    operationType: "read",
    description: `List the localized names attached to one subscription group version. ${versionFlowNote}`,
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the subscription group version whose localizations to list.",
      {
        subscriptionGroupVersionId: nonEmptyString("App Store Connect identifier of the subscription group version."),
        ...paginationInputs,
      },
      { required: ["subscriptionGroupVersionId"] },
    ),
    outputSchema: pageOutput(
      "subscriptionGroupLocalizations",
      subscriptionGroupVersionLocalizationResource,
      "Subscription group version localizations returned for this page.",
      "A page of subscription group version localizations.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_subscription_group_version_localization",
    operationType: "read",
    description: `Read one subscription group version localization by its App Store Connect identifier. ${versionFlowNote}`,
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        subscriptionGroupLocalizationId: nonEmptyString(
          "App Store Connect identifier of the subscription group version localization.",
        ),
      },
      ["subscriptionGroupLocalizationId"],
      "Identifies the subscription group version localization to read.",
    ),
    outputSchema: s.actionOutput(
      { subscriptionGroupLocalization: subscriptionGroupVersionLocalizationResource },
      "The requested subscription group version localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_subscription_group_version_localization",
    operationType: "write",
    description: `Add the customer-facing name of a subscription group in one locale to a subscription group version. ${versionFlowNote}`,
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The subscription group version localization to create.",
      {
        subscriptionGroupVersionId: nonEmptyString("App Store Connect identifier of the subscription group version."),
        locale: localeInput,
        name: nonEmptyString("Group name shown to customers in this locale."),
        customAppName: nonEmptyString("Alternative app name shown with the group in this locale."),
      },
      { required: ["subscriptionGroupVersionId", "locale", "name"] },
    ),
    outputSchema: s.actionOutput(
      { subscriptionGroupLocalization: subscriptionGroupVersionLocalizationResource },
      "The created subscription group version localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_subscription_group_version_localization",
    operationType: "destructive",
    description: `Change the customer-facing name or custom app name of a subscription group version localization. Pass at least one field; the locale itself cannot be changed. ${versionFlowNote}`,
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.object(
      "The subscription group version localization to update and the fields to change.",
      {
        subscriptionGroupLocalizationId: nonEmptyString(
          "App Store Connect identifier of the subscription group version localization.",
        ),
        name: nonEmptyString("New group name shown to customers in this locale."),
        customAppName: nonEmptyString("New alternative app name shown with the group in this locale."),
      },
      { required: ["subscriptionGroupLocalizationId"] },
    ),
    outputSchema: s.actionOutput(
      { subscriptionGroupLocalization: subscriptionGroupVersionLocalizationResource },
      "The updated subscription group version localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_subscription_group_version_localization",
    operationType: "destructive",
    description: `Delete one localization from a subscription group version. ${versionFlowNote}`,
    requiredScopes: [],
    providerPermissions: [...manageInAppPurchaseRoles],
    inputSchema: s.actionInput(
      {
        subscriptionGroupLocalizationId: nonEmptyString(
          "App Store Connect identifier of the subscription group version localization.",
        ),
      },
      ["subscriptionGroupLocalizationId"],
      "Identifies the subscription group version localization to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted subscription group version localization."),
      "Confirmation that the subscription group version localization was deleted.",
    ),
  }),
];

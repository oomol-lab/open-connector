import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  environments,
  extendReasonCodeDescription,
  nonEmptyString,
  renewalInfoPayload,
  service,
  subscriptionStatusDescription,
  transactionPayload,
  uuidString,
} from "./schemas.ts";

const extendByDaysInput = s.integer(
  "Number of days to extend the renewal date by, from 1 to 90. The extension does not count toward the year of paid service that determines your commission rate.",
  { minimum: 1, maximum: 90 },
);
const extendReasonCodeInput = s.integer(extendReasonCodeDescription, { minimum: 0, maximum: 3 });

const requestIdentifierInput = s.nonWhitespaceString(
  "Identifier you generate to track this extension request, at most 128 characters. Reuse the same value when you retry a request that timed out; use a new one for a different request.",
  { maxLength: 128 },
);

const storefrontCountryCodeInput = s.string(
  "One three-letter ISO 3166-1 alpha-3 storefront country code, such as USA. Two-letter codes and country names are not accepted.",
  { minLength: 3, maxLength: 3 },
);
const massRequestIdentifierInput = uuidString(
  "UUID you generate to track this extension request. Apple requires the UUID form on this endpoint. Reuse the same value when you retry a request that timed out; use a new one for a different request.",
);

export const appStoreServerSubscriptionActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_all_subscription_statuses",
    operationType: "read",
    description:
      "Read the status of every auto-renewable subscription a customer has for your app, grouped by subscription group, with the latest transaction and renewal information of each decoded from the signed payloads Apple returns.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the customer whose subscription statuses to read.",
      {
        transactionId: nonEmptyString(
          "Any transaction identifier that belongs to the customer for your app: a transactionId, an originalTransactionId or an appTransactionId.",
        ),
        statuses: s.array(
          "Return only subscriptions in these statuses. Omit to return every status.",
          s.integer(subscriptionStatusDescription, { minimum: 1, maximum: 5 }),
          { minItems: 1 },
        ),
      },
      { required: ["transactionId"] },
    ),
    outputSchema: s.actionOutput(
      {
        subscriptionGroups: s.array(
          "One entry per subscription group the customer has a subscription in.",
          s.object(
            "The subscriptions a customer holds in one subscription group.",
            {
              subscriptionGroupIdentifier: s.nullableString("Identifier of the subscription group."),
              lastTransactions: s.array(
                "The most recent transaction of each subscription in the group, one per original transaction identifier.",
                s.object(
                  "The latest state of one subscription.",
                  {
                    originalTransactionId: s.nullableString(
                      "Transaction identifier of the original subscription purchase.",
                    ),
                    status: s.nullableInteger(subscriptionStatusDescription),
                    transaction: s.nullable(transactionPayload),
                    renewalInfo: s.nullable(renewalInfoPayload),
                  },
                  { required: ["originalTransactionId", "status", "transaction", "renewalInfo"] },
                ),
              ),
            },
            { required: ["subscriptionGroupIdentifier", "lastTransactions"] },
          ),
        ),
        environment: s.nullable(s.stringEnum("Server environment the statuses come from.", environments)),
        bundleId: s.nullableString("Bundle identifier of the app."),
        appAppleId: s.nullableInteger("Apple identifier of the app, present for production apps."),
      },
      "The subscription statuses of one customer.",
    ),
  }),
  defineProviderAction(service, {
    name: "extend_subscription_renewal_date",
    operationType: "destructive",
    description:
      "Extend the renewal date of one customer's active auto-renewable subscription, to compensate for a service outage or a cancelled event. The extension cannot be reversed, and Apple emails the customer about the new renewal date.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        originalTransactionId: nonEmptyString(
          "Original transaction identifier of the subscription to extend. Family Sharing members are extended automatically and cannot be targeted directly.",
        ),
        extendByDays: extendByDaysInput,
        extendReasonCode: extendReasonCodeInput,
        requestIdentifier: requestIdentifierInput,
      },
      ["originalTransactionId", "extendByDays", "extendReasonCode", "requestIdentifier"],
      "Identifies the subscription to extend and by how much.",
    ),
    outputSchema: s.actionOutput(
      {
        originalTransactionId: s.nullableString("Original transaction identifier that was acted on."),
        webOrderLineItemId: s.nullableString("Identifier of the subscription purchase event the extension applies to."),
        success: s.nullableBoolean("Whether the App Store extended the renewal date."),
        effectiveDate: s.nullableInteger("New renewal date after the extension, as UNIX time in milliseconds."),
      },
      "The outcome of the renewal date extension.",
    ),
  }),
  defineProviderAction(service, {
    name: "extend_renewal_date_for_all_active_subscribers",
    operationType: "destructive",
    description:
      "Extend the renewal date of every active subscription to one product, optionally limited to some storefronts. The App Store processes the request asynchronously; poll get_subscription_renewal_date_extension_status for the outcome. The extension cannot be reversed.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        productId: nonEmptyString("Product identifier of the subscription whose active subscribers to extend."),
        extendByDays: extendByDaysInput,
        extendReasonCode: extendReasonCodeInput,
        requestIdentifier: massRequestIdentifierInput,
        storefrontCountryCodes: s.array(
          "Limit the extension to these storefronts. Omit to extend in every storefront.",
          storefrontCountryCodeInput,
          { minItems: 1 },
        ),
      },
      ["productId", "extendByDays", "extendReasonCode", "requestIdentifier"],
      "Identifies the product to extend and by how much.",
    ),
    outputSchema: s.actionOutput(
      {
        requestIdentifier: s.nullableString(
          "The request identifier the App Store echoes back. Pass it to get_subscription_renewal_date_extension_status to follow the outcome.",
        ),
      },
      "Confirmation that the App Store accepted the extension request.",
    ),
    followUpActions: ["app_store_server.get_subscription_renewal_date_extension_status"],
  }),
  defineProviderAction(service, {
    name: "get_subscription_renewal_date_extension_status",
    operationType: "read",
    description:
      "Check how far the App Store has got with a renewal date extension that was requested for all active subscribers of a product.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        productId: nonEmptyString("Product identifier the extension was requested for."),
        requestIdentifier: uuidString("UUID you supplied when requesting the extension for all active subscribers."),
      },
      ["productId", "requestIdentifier"],
      "Identifies the extension request to check.",
    ),
    outputSchema: s.actionOutput(
      {
        requestIdentifier: s.nullableString("Request identifier the status belongs to."),
        complete: s.nullableBoolean("Whether the App Store finished processing the request."),
        completeDate: s.nullableInteger(
          "When the App Store finished processing the request, as UNIX time in milliseconds.",
        ),
        succeededCount: s.nullableInteger("Number of subscriptions extended so far."),
        failedCount: s.nullableInteger("Number of subscriptions the extension failed for."),
      },
      "Progress of one renewal date extension request.",
    ),
  }),
];

import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  deliveryStatuses,
  hasMoreOutput,
  nonEmptyString,
  refundPreferences,
  revisionOutput,
  service,
  transactionListOutput,
} from "./schemas.ts";

const customerConsentedInput = s.boolean(
  "Whether the customer consented to share consumption data with Apple. The App Store rejects the request unless this is true, and you are responsible for obtaining that consent.",
);
const sampleContentProvidedInput = s.boolean(
  "Whether you offered a free sample, a trial, or information about how the content works before the customer bought it.",
);
const consumptionTransactionIdInput = nonEmptyString(
  "Identifier of the transaction the refund request is about, taken from the CONSUMPTION_REQUEST notification.",
);

const consumptionAcceptedOutput = s.actionOutput(
  {
    transactionId: s.string("Identifier of the transaction the information was sent for."),
    submitted: s.boolean("Always true once the App Store accepted the consumption information."),
  },
  "Confirmation that the App Store accepted the consumption information.",
);

export const appStoreServerRefundActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_refund_history",
    operationType: "read",
    description:
      "List the in-app purchase transactions the App Store refunded for a customer in your app, newest first, decoded from the signed payloads Apple returns. Returns up to 20 transactions per page.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the customer whose refunded transactions to list.",
      {
        transactionId: nonEmptyString(
          "Any transaction identifier that belongs to the customer for your app: a transactionId, an originalTransactionId or an appTransactionId.",
        ),
        revision: nonEmptyString(
          "Page token taken from the revision value of a previous response for the same customer.",
        ),
      },
      { required: ["transactionId"] },
    ),
    outputSchema: s.actionOutput(
      {
        transactions: transactionListOutput("Refunded transactions returned for this page."),
        revision: revisionOutput,
        hasMore: hasMoreOutput,
      },
      "A page of refunded transactions.",
    ),
  }),
  defineProviderAction(service, {
    name: "send_consumption_information",
    operationType: "write",
    description:
      "Send consumption information for an in-app purchase after a CONSUMPTION_REQUEST notification, so the App Store can decide on the customer's refund request. Apple expects an answer within 12 hours of the notification. Use this for App Store in-app purchases that do not go through the Advanced Commerce API.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        transactionId: consumptionTransactionIdInput,
        customerConsented: customerConsentedInput,
        deliveryStatus: s.stringEnum(
          "Whether your app delivered a working product to the customer, and if not, why.",
          deliveryStatuses,
        ),
        sampleContentProvided: sampleContentProvidedInput,
        consumptionPercentage: s.integer(
          "Share of the product the customer consumed, in milliunits, where 100000 is all of it. Send it only for consumable and non-consumable in-app purchases and non-renewing subscriptions: omit it entirely for an auto-renewable subscription, where the App Store calculates it from elapsed time and any value fails the request with HTTP 400 ConsumptionPercentageAutoRenewableSubscriptionError. Must be 0 when deliveryStatus is not DELIVERED, and greater than 0 and less than 100000 when refundPreference is GRANT_PRORATED.",
          { minimum: 0, maximum: 100000 },
        ),
        refundPreference: s.stringEnum(
          "Whether you would like the App Store to grant the refund. All three values apply to every product type; GRANT_PRORATED only changes what consumptionPercentage must be, which the consumptionPercentage field describes. The App Store makes the final decision either way.",
          refundPreferences,
        ),
      },
      ["transactionId", "customerConsented", "deliveryStatus", "sampleContentProvided"],
      "Consumption information for one in-app purchase under refund review.",
    ),
    outputSchema: consumptionAcceptedOutput,
  }),
  defineProviderAction(service, {
    name: "send_consumption_information_v1",
    operationType: "write",
    description:
      "Send the version 1 consumption information for an in-app purchase after a CONSUMPTION_REQUEST notification. Apple documents this shape for purchases made through the Advanced Commerce API; use send_consumption_information for ordinary App Store in-app purchases.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        transactionId: consumptionTransactionIdInput,
        customerConsented: customerConsentedInput,
        sampleContentProvided: sampleContentProvidedInput,
        appAccountToken: s.anyOf(
          "The appAccountToken of the transaction, taken from the CONSUMPTION_REQUEST notification. Send an empty string if your app does not use app account tokens.",
          [s.uuid("A valid app account token."), s.literal("", { description: "No app account token." })],
        ),
        accountTenure: s.integer(
          "How long the customer has had an account with you: 0 undeclared, 1 up to 3 days, 2 3 to 10 days, 3 10 to 30 days, 4 30 to 90 days, 5 90 to 180 days, 6 180 to 365 days, 7 more than 365 days.",
          { minimum: 0, maximum: 7 },
        ),
        consumptionStatus: s.integer(
          "How much of the purchase the customer consumed: 0 undeclared, 1 not consumed, 2 partially consumed, 3 fully consumed.",
          { minimum: 0, maximum: 3 },
        ),
        deliveryStatus: s.integer(
          "Whether your app delivered a working product: 0 delivered and working properly, 1 not delivered because of a quality issue, 2 delivered the wrong item, 3 not delivered because of a server outage, 4 not delivered because of a change to the in-game currency, 5 not delivered for another reason.",
          { minimum: 0, maximum: 5 },
        ),
        lifetimeDollarsPurchased: s.integer(
          "Total the customer has spent in your app across all platforms, in USD: 0 undeclared, 1 nothing, 2 0.01 to 49.99, 3 50 to 99.99, 4 100 to 499.99, 5 500 to 999.99, 6 1000 to 1999.99, 7 2000 or more.",
          { minimum: 0, maximum: 7 },
        ),
        lifetimeDollarsRefunded: s.integer(
          "Total the customer has been refunded in your app across all platforms, in USD, on the same scale as lifetimeDollarsPurchased.",
          { minimum: 0, maximum: 7 },
        ),
        platform: s.integer(
          "Platform the customer consumed the purchase on: 0 undeclared, 1 an Apple platform, 2 a non-Apple platform.",
          { minimum: 0, maximum: 2 },
        ),
        playTime: s.integer(
          "How long the customer used the app: 0 undeclared, 1 up to 5 minutes, 2 5 to 60 minutes, 3 1 to 6 hours, 4 6 to 24 hours, 5 1 to 4 days, 6 4 to 16 days, 7 more than 16 days.",
          { minimum: 0, maximum: 7 },
        ),
        userStatus: s.integer(
          "Status of the customer's account with you: 0 undeclared, 1 active, 2 suspended, 3 terminated, 4 has limited access.",
          { minimum: 0, maximum: 4 },
        ),
        refundPreference: s.integer(
          "Whether you would like the App Store to grant the refund: 0 undeclared, 1 prefer that it is granted, 2 prefer that it is declined, 3 no preference.",
          { minimum: 0, maximum: 3 },
        ),
      },
      [
        "transactionId",
        "customerConsented",
        "sampleContentProvided",
        "appAccountToken",
        "accountTenure",
        "consumptionStatus",
        "deliveryStatus",
        "lifetimeDollarsPurchased",
        "lifetimeDollarsRefunded",
        "platform",
        "playTime",
        "userStatus",
      ],
      "Version 1 consumption information for one in-app purchase under refund review.",
    ),
    outputSchema: consumptionAcceptedOutput,
  }),
];

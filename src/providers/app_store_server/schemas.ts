import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";

export const service = "app_store_server";

export const nonEmptyString = (description: string): JsonSchema => s.nonWhitespaceString(description);
export const uuidString = (description: string): JsonSchema => s.uuid(description);

export const identifierArray = (description: string, itemDescription: string): JsonSchema =>
  s.array(description, nonEmptyString(itemDescription), { minItems: 1 });

const absentFieldNote =
  "The App Store Server API omits a field entirely when it has no value for it, so any field can be missing.";

const payloadObject = (description: string, fields: Record<string, JsonSchema>): JsonSchema =>
  s.object(`${description} ${absentFieldNote}`, fields, {
    required: [],
    additionalProperties: true,
  });

export const environments: readonly string[] = ["Sandbox", "Production", "Xcode", "LocalTesting"];
export const transactionTypes: readonly string[] = [
  "Auto-Renewable Subscription",
  "Non-Consumable",
  "Consumable",
  "Non-Renewing Subscription",
];
export const inAppOwnershipTypes: readonly string[] = ["FAMILY_SHARED", "PURCHASED"];
export const transactionReasons: readonly string[] = ["PURCHASE", "RENEWAL"];
export const offerDiscountTypes: readonly string[] = ["FREE_TRIAL", "PAY_AS_YOU_GO", "PAY_UP_FRONT", "ONE_TIME"];
export const revocationTypes: readonly string[] = ["REFUND_FULL", "REFUND_PRORATED", "FAMILY_REVOKE"];
export const billingPlanTypes: readonly string[] = ["BILLED_UPFRONT", "MONTHLY"];
export const purchasePlatforms: readonly string[] = ["iOS", "macOS", "tvOS", "visionOS"];

export const productTypeFilters: readonly string[] = [
  "AUTO_RENEWABLE",
  "NON_RENEWABLE",
  "CONSUMABLE",
  "NON_CONSUMABLE",
];
export const historySortOrders: readonly string[] = ["ASCENDING", "DESCENDING"];
export const consumptionRequestReasons: readonly string[] = [
  "UNINTENDED_PURCHASE",
  "FULFILLMENT_ISSUE",
  "UNSATISFIED_WITH_PURCHASE",
  "LEGAL",
  "OTHER",
];
export const deliveryStatuses: readonly string[] = [
  "DELIVERED",
  "UNDELIVERED_QUALITY_ISSUE",
  "UNDELIVERED_WRONG_ITEM",
  "UNDELIVERED_SERVER_OUTAGE",
  "UNDELIVERED_OTHER",
];
export const refundPreferences: readonly string[] = ["DECLINE", "GRANT_FULL", "GRANT_PRORATED"];
export const sendAttemptResults: readonly string[] = [
  "SUCCESS",
  "TIMED_OUT",
  "TLS_ISSUE",
  "CIRCULAR_REDIRECT",
  "NO_RESPONSE",
  "SOCKET_ISSUE",
  "UNSUPPORTED_CHARSET",
  "INVALID_RESPONSE",
  "PREMATURE_CLOSE",
  "UNSUCCESSFUL_HTTP_RESPONSE_CODE",
  "OTHER",
];
export const notificationTypes: readonly string[] = [
  "SUBSCRIBED",
  "DID_CHANGE_RENEWAL_PREF",
  "DID_CHANGE_RENEWAL_STATUS",
  "OFFER_REDEEMED",
  "DID_RENEW",
  "EXPIRED",
  "DID_FAIL_TO_RENEW",
  "GRACE_PERIOD_EXPIRED",
  "PRICE_INCREASE",
  "REFUND",
  "REFUND_DECLINED",
  "CONSUMPTION_REQUEST",
  "RENEWAL_EXTENDED",
  "REVOKE",
  "TEST",
  "RENEWAL_EXTENSION",
  "REFUND_REVERSED",
  "EXTERNAL_PURCHASE_TOKEN",
  "ONE_TIME_CHARGE",
  "RESCIND_CONSENT",
  "METADATA_UPDATE",
  "MIGRATION",
  "PRICE_CHANGE",
];
export const notificationSubtypes: readonly string[] = [
  "INITIAL_BUY",
  "RESUBSCRIBE",
  "DOWNGRADE",
  "UPGRADE",
  "AUTO_RENEW_ENABLED",
  "AUTO_RENEW_DISABLED",
  "VOLUNTARY",
  "BILLING_RETRY",
  "PRICE_INCREASE",
  "GRACE_PERIOD",
  "PENDING",
  "ACCEPTED",
  "BILLING_RECOVERY",
  "PRODUCT_NOT_FOR_SALE",
  "SUMMARY",
  "FAILURE",
  "UNREPORTED",
  "ACTIVE_TOKEN_REMINDER",
  "CREATED",
];
export const externalPurchaseTokenTypes: readonly string[] = ["SERVICES", "ACQUISITION"];

export const subscriptionStatusDescription =
  "Subscription status: 1 active, 2 expired, 3 in a billing retry period, 4 in a billing grace period, 5 revoked.";
export const extendReasonCodeDescription =
  "Reason for the renewal date extension: 0 undeclared, 1 customer satisfaction, 2 other, 3 service issue or outage.";

export const millisecondTimestamp = (description: string): JsonSchema =>
  s.integer(`${description} Expressed as UNIX time in milliseconds.`);

const commitmentInfoOutput = payloadObject(
  "Billing commitment terms recorded on the transaction, for subscriptions sold with a commitment.",
  {
    billingPeriodNumber: s.integer("Position of this billing period within the commitment."),
    commitmentExpiresDate: millisecondTimestamp("When the commitment ends."),
    commitmentPrice: s.integer("Price of the commitment, in milliunits of the currency."),
    totalBillingPeriods: s.integer("Number of billing periods the commitment covers."),
  },
);

const renewalCommitmentInfoOutput = payloadObject("Billing commitment terms that apply to the upcoming renewal.", {
  commitmentAutoRenewProductId: s.string("Product identifier that renews under the commitment."),
  commitmentAutoRenewStatus: s.integer(
    "Renewal status under the commitment: 0 off, 1 on. Auto renewal status of the commitment.",
  ),
  commitmentRenewalBillingPlanType: s.stringEnum("Billing plan the commitment renews on.", billingPlanTypes),
  commitmentRenewalDate: millisecondTimestamp("When the commitment renews."),
  commitmentRenewalPrice: s.integer("Renewal price under the commitment, in milliunits of the currency."),
});

const advancedCommerceInfoOutput = s.looseObject(
  "Advanced Commerce API details Apple attaches to transactions and renewal information created through that API. Passed through as returned; this provider does not model the Advanced Commerce contract.",
  {},
);

export const transactionPayload: JsonSchema = payloadObject(
  "One in-app purchase transaction, decoded from the JWS the App Store Server API returns.",
  {
    transactionId: s.string("Unique identifier of this transaction."),
    originalTransactionId: s.string(
      "Transaction identifier of the original purchase, shared by every transaction in a subscription or restore chain.",
    ),
    webOrderLineItemId: s.string(
      "Unique identifier of the subscription purchase event, which changes on every renewal.",
    ),
    bundleId: s.string("Bundle identifier of the app the purchase belongs to."),
    productId: s.string("Product identifier of the in-app purchase."),
    subscriptionGroupIdentifier: s.string("Identifier of the subscription group the product belongs to."),
    purchaseDate: millisecondTimestamp("When the App Store charged the customer."),
    originalPurchaseDate: millisecondTimestamp("When the original purchase happened."),
    expiresDate: millisecondTimestamp("When the subscription expires or renews."),
    quantity: s.integer("Number of consumable products purchased in this transaction."),
    type: s.stringEnum("Type of the in-app purchase.", transactionTypes),
    appAccountToken: s.string(
      "UUID your app associated with the purchase, or that was set through Set App Account Token.",
    ),
    inAppOwnershipType: s.stringEnum(
      "Whether the customer purchased the product or received it through Family Sharing.",
      inAppOwnershipTypes,
    ),
    signedDate: millisecondTimestamp("When the App Store signed this transaction payload."),
    revocationReason: s.integer(
      "Why the App Store refunded or revoked the transaction: 0 refunded for another reason, 1 refunded because of an issue with the app.",
    ),
    revocationDate: millisecondTimestamp("When the App Store refunded or revoked the transaction."),
    isUpgraded: s.boolean(
      "Whether the transaction was replaced because the customer upgraded to a higher level subscription.",
    ),
    offerType: s.integer(
      "Type of subscription offer applied: 1 introductory offer, 2 promotional offer, 3 offer code, 4 win-back offer.",
    ),
    offerIdentifier: s.string("Identifier of the promotional offer, offer code or win-back offer."),
    offerDiscountType: s.stringEnum("Payment mode of the offer.", offerDiscountTypes),
    offerPeriod: s.string("Duration of the offer, as an ISO 8601 duration such as P1M or P3D."),
    environment: s.stringEnum("Server environment the transaction belongs to.", environments),
    storefront: s.string(
      "Three-letter ISO 3166-1 alpha-3 code of the storefront the purchase was made in, such as USA.",
    ),
    storefrontId: s.string("Apple identifier of that storefront."),
    transactionReason: s.stringEnum(
      "Whether the customer purchased the product or the App Store renewed it automatically.",
      transactionReasons,
    ),
    currency: s.string("Three-letter ISO 4217 code of the currency the price is expressed in."),
    price: s.integer(
      "Price recorded for the transaction, in milliunits of the currency. One unit equals 1000 milliunits.",
    ),
    revocationType: s.stringEnum("How much of the transaction was revoked.", revocationTypes),
    revocationPercentage: s.integer(
      "Share of the transaction the App Store refunded or revoked, in milliunits, where 100000 is the full amount.",
    ),
    billingPlanType: s.stringEnum("Billing plan the subscription was purchased on.", billingPlanTypes),
    appTransactionId: s.string("Unique identifier of the app download transaction."),
    commitmentInfo: commitmentInfoOutput,
    advancedCommerceInfo: advancedCommerceInfoOutput,
  },
);

export const renewalInfoPayload: JsonSchema = payloadObject(
  "Renewal information for one auto-renewable subscription, decoded from the JWS the App Store Server API returns.",
  {
    originalTransactionId: s.string("Transaction identifier of the original subscription purchase."),
    productId: s.string("Product identifier of the subscription in effect now."),
    autoRenewProductId: s.string("Product identifier that renews at the next billing period."),
    autoRenewStatus: s.integer("Renewal status of the subscription: 0 off, 1 on."),
    expirationIntent: s.integer(
      "Why an expired subscription expired: 1 the customer cancelled, 2 a billing error, 3 the customer did not consent to a price increase, 4 the product was unavailable, 5 another reason.",
    ),
    isInBillingRetryPeriod: s.boolean("Whether the App Store is still trying to renew an expired subscription."),
    gracePeriodExpiresDate: millisecondTimestamp("When the billing grace period ends."),
    priceIncreaseStatus: s.integer(
      "Where the customer stands on a pending price increase: 0 has not responded, 1 consented or was notified without needing to consent.",
    ),
    offerType: s.integer(
      "Type of subscription offer in effect for the renewal: 1 introductory offer, 2 promotional offer, 3 offer code, 4 win-back offer.",
    ),
    offerIdentifier: s.string("Identifier of the offer in effect for the renewal."),
    offerDiscountType: s.stringEnum("Payment mode of that offer.", offerDiscountTypes),
    offerPeriod: s.string("Duration of that offer, as an ISO 8601 duration such as P1M."),
    signedDate: millisecondTimestamp("When the App Store signed this renewal payload."),
    environment: s.stringEnum("Server environment the subscription belongs to.", environments),
    recentSubscriptionStartDate: millisecondTimestamp("Start of the most recent uninterrupted period of subscription."),
    renewalDate: millisecondTimestamp("When the most recent subscription period renews."),
    currency: s.string("Three-letter ISO 4217 code of the currency the renewal price is in."),
    renewalPrice: s.integer("Renewal price, in milliunits of the currency."),
    renewalBillingPlanType: s.stringEnum("Billing plan the subscription renews on.", billingPlanTypes),
    eligibleWinBackOfferIds: s.array(
      "Win-back offer identifiers the customer is eligible for, in the order Apple ranks them.",
      s.string("One win-back offer identifier."),
    ),
    appAccountToken: s.string("UUID associated with the upcoming renewal transaction."),
    appTransactionId: s.string("Unique identifier of the app download transaction."),
    commitmentInfo: renewalCommitmentInfoOutput,
    advancedCommerceInfo: advancedCommerceInfoOutput,
  },
);

export const appTransactionPayload: JsonSchema = payloadObject(
  "The app download transaction, decoded from the JWS the App Store Server API returns.",
  {
    appTransactionId: s.string("Unique identifier of the app download transaction."),
    bundleId: s.string("Bundle identifier of the app."),
    appAppleId: s.integer("Apple identifier of the app, present for production apps."),
    applicationVersion: s.string("Version of the app the customer downloaded."),
    originalApplicationVersion: s.string("Version of the app the customer originally purchased."),
    versionExternalIdentifier: s.integer("Apple identifier of that app version."),
    receiptType: s.stringEnum("Server environment the app transaction belongs to.", environments),
    receiptCreationDate: millisecondTimestamp("When the App Store signed the app transaction."),
    originalPurchaseDate: millisecondTimestamp("When the customer originally acquired the app."),
    preorderDate: millisecondTimestamp("When the customer placed a pre-order for the app."),
    originalPlatform: s.stringEnum("Platform the customer originally acquired the app on.", purchasePlatforms),
    deviceVerification: s.string(
      "Value your app uses to verify that the app transaction belongs to the device it runs on.",
    ),
    deviceVerificationNonce: s.string("UUID that pairs with deviceVerification."),
  },
);

export const sendAttemptOutput: JsonSchema = s.array(
  "Delivery attempts the App Store made for this notification, most recent first. The App Store retries a failed notification up to five times over the following hours.",
  payloadObject("One delivery attempt.", {
    attemptDate: millisecondTimestamp("When the App Store made this attempt."),
    sendAttemptResult: s.stringEnum("Outcome of the attempt.", sendAttemptResults),
  }),
);

export const notificationPayload: JsonSchema = payloadObject(
  "One App Store Server Notification, decoded from the JWS the App Store Server API returns. The transaction, renewal and app transaction payloads nested inside it are decoded as well.",
  {
    notificationType: s.stringEnum("Type of the notification.", notificationTypes),
    subtype: s.stringEnum("Subtype that further describes the notification.", notificationSubtypes),
    notificationUUID: s.string("Unique identifier of this notification."),
    version: s.string("Version of the notification payload, such as 2.0."),
    signedDate: millisecondTimestamp("When the App Store signed the notification."),
    data: payloadObject(
      "Details of the app and the transaction the notification is about. Present on every notification except the renewal date extension summary and external purchase token notifications.",
      {
        environment: s.stringEnum("Server environment the notification is about.", environments),
        appAppleId: s.integer("Apple identifier of the app, present for production apps."),
        bundleId: s.string("Bundle identifier of the app."),
        bundleVersion: s.string("Version of the app the transaction belongs to."),
        status: s.integer(subscriptionStatusDescription),
        consumptionRequestReason: s.stringEnum(
          "Reason the customer gave for requesting a refund, on CONSUMPTION_REQUEST notifications.",
          consumptionRequestReasons,
        ),
        transactionInfo: s.nullable(transactionPayload),
        renewalInfo: s.nullable(renewalInfoPayload),
      },
    ),
    summary: payloadObject(
      "Outcome of a renewal date extension that ran for all active subscribers, on RENEWAL_EXTENSION notifications with the SUMMARY subtype.",
      {
        environment: s.stringEnum("Server environment the extension ran in.", environments),
        appAppleId: s.integer("Apple identifier of the app."),
        bundleId: s.string("Bundle identifier of the app."),
        productId: s.string("Product identifier the extension applied to."),
        requestIdentifier: s.string("Identifier you supplied when requesting the extension."),
        storefrontCountryCodes: s.array(
          "Storefronts the extension was limited to, empty when it applied everywhere.",
          s.string("One three-letter ISO 3166-1 alpha-3 storefront country code."),
        ),
        succeededCount: s.integer("Number of subscriptions the extension succeeded for."),
        failedCount: s.integer("Number of subscriptions the extension failed for."),
      },
    ),
    externalPurchaseToken: payloadObject("External purchase token details, on EXTERNAL_PURCHASE_TOKEN notifications.", {
      externalPurchaseId: s.string("Unique identifier of the external purchase token."),
      tokenCreationDate: millisecondTimestamp("When the App Store created the token."),
      appAppleId: s.integer("Apple identifier of the app."),
      bundleId: s.string("Bundle identifier of the app."),
      tokenType: s.stringEnum("Type of the external purchase token.", externalPurchaseTokenTypes),
      tokenExpirationDate: millisecondTimestamp("When the token expires."),
    }),
    appData: payloadObject("App download details, on notifications that carry them.", {
      appAppleId: s.integer("Apple identifier of the app."),
      bundleId: s.string("Bundle identifier of the app."),
      environment: s.stringEnum("Server environment the app transaction belongs to.", environments),
      appTransactionInfo: s.nullable(appTransactionPayload),
    }),
  },
);

export const transactionListOutput = (description: string): JsonSchema => s.array(description, transactionPayload);

export const revisionOutput: JsonSchema = s.nullableString(
  "Token to pass back as revision to read the next page. Apple returns one on every page; keep the last one to resume the query later.",
);
export const hasMoreOutput: JsonSchema = s.nullableBoolean(
  "Whether more pages are available for this query. Apple returns pages of up to 20 transactions.",
);

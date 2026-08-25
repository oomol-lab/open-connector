import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "zylvie" as const;

const idSchema = s.nonEmptyString("The Zylvie object identifier.");
const licenseKeySchema = s.nonEmptyString("The license key issued by Zylvie.");
const stringListSchema = s.array("A list of text values.", s.nonEmptyString("One text value."));
const urlListSchema = s.array(
  "A list of publicly accessible URLs that Zylvie can fetch.",
  s.url("One publicly accessible URL."),
);

const productFields = {
  title: s.string("The product title.", { minLength: 1, maxLength: 500 }),
  url: s.string("The unique vanity URL slug.", {
    minLength: 1,
    maxLength: 100,
    pattern: "^[A-Za-z0-9_.-]+$",
  }),
  currency: s.string("The lowercase ISO 4217 currency code.", {
    minLength: 3,
    maxLength: 3,
    pattern: "^[a-z]{3}$",
  }),
  price: s.number("The base product price.", { minimum: 0 }),
  pricingModel: s.stringEnum("The product billing model.", ["one-time", "subscription", "delayed"]),
  display: s.stringEnum("How the product appears in the storefront.", [
    "featured",
    "listed",
    "unlisted",
    "unpublished",
  ]),
  subtitle: s.string("The product subtitle.", { maxLength: 500 }),
  description: s.string("The product description in HTML."),
  summary: s.string("The product summary in HTML."),
  interval: s.stringEnum("The recurring billing interval.", ["day", "week", "month", "year"]),
  intervalCount: s.integer("The number of billing intervals between charges.", { minimum: 1 }),
  trialPeriodDays: s.integer("The number of free-trial days.", { minimum: 0 }),
  collectAddressAndPhone: s.boolean("Whether checkout collects the buyer address and phone number."),
  shippingFee: s.number("The product shipping fee.", { minimum: 0 }),
  shippingType: s.stringEnum("How shipping fees scale with quantity.", ["flat", "per_quantity"]),
  categories: s.describe(stringListSchema, "The categories assigned to the product."),
  tags: s.describe(stringListSchema, "The tags assigned to the product."),
  productImageUrls: s.describe(urlListSchema, "Public image URLs assigned to the product."),
  productFileUrls: s.describe(urlListSchema, "Public downloadable file URLs for the product."),
  downloadEmailSubject: s.string("The subject of the product download email.", {
    maxLength: 100,
  }),
  downloadEmailBody: s.string("The HTML body of the product download email."),
  successUrl: s.string("The post-purchase redirect URL or Zylvie-local path.", {
    maxLength: 2500,
  }),
  successEmailSubject: s.string("The subject of the post-purchase success email.", {
    maxLength: 100,
  }),
  successEmailBody: s.string("The HTML body of the post-purchase success email."),
  gatedPageUrl: s.string("The unique slug for the gated product page.", { maxLength: 100 }),
  gatedPageBody: s.string("The HTML body of the gated product page."),
  isLicensed: s.boolean("Whether purchases receive unique license keys."),
  redemptionInstructions: s.string("The HTML instructions for redeeming a license key."),
  excludeFromAutomations: s.boolean("Whether Zylvie workflow automations should ignore this product."),
};

const productOutputSchema = s.looseObject("The product object returned by Zylvie.");
const couponOutputSchema = s.looseObject("The coupon object returned by Zylvie.");
const licenseOutputSchema = s.looseObject("The license-key result returned by Zylvie.");
const statusOutputSchema = s.looseRequiredObject("The deletion result returned by Zylvie.", {
  status: s.string("The operation status."),
  message: s.string("The deletion or archival result message."),
});

const couponFields = {
  code: s.string("The unique case-insensitive coupon code.", {
    minLength: 2,
    maxLength: 100,
  }),
  type: s.stringEnum("The discount calculation type.", ["percentage", "fixed"]),
  amount: s.number("The discount amount.", { minimum: 0.1, maximum: 999999.99 }),
  isStorewide: s.boolean("Whether the coupon applies to every product."),
  productIds: s.array(
    "The product IDs to which a non-storewide coupon applies.",
    s.nonEmptyString("One Zylvie product ID."),
    { minItems: 1 },
  ),
  isLive: s.boolean("Whether the coupon is active."),
  limit: s.integer("The maximum number of redemptions.", { minimum: 1 }),
  durationInMonths: s.integer("The number of subscription months discounted.", {
    minimum: 1,
  }),
  start: s.string("The coupon start time in ISO 8601 format.", { format: "date-time" }),
  end: s.string("The coupon expiration time in ISO 8601 format.", { format: "date-time" }),
  affiliateId: s.nonEmptyString("The affiliate ID associated with the coupon."),
  requiredSubscriptionProductId: s.nonEmptyString(
    "The subscription product whose active subscribers may use the coupon.",
  ),
};

const createProductInputSchema = s.object("The product fields accepted by Zylvie.", productFields, {
  optional: Object.keys(productFields).filter(
    (key) => !["title", "url", "currency", "price", "pricingModel", "display"].includes(key),
  ),
});

const createCouponInputSchema = s.object("The coupon fields accepted by Zylvie.", couponFields, {
  optional: Object.keys(couponFields).filter((key) => !["code", "type", "amount"].includes(key)),
});

const actions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the Zylvie user and brand authenticated by the current API key.",
    inputSchema: s.requiredObject("The input payload for getting the current Zylvie user.", {}),
    outputSchema: s.looseRequiredObject("The authenticated Zylvie user.", {
      email: s.string("The account email address."),
      brand: s.string("The account brand name."),
    }),
  }),
  defineProviderAction(service, {
    name: "create_product",
    description: "Create a product in Zylvie.",
    inputSchema: createProductInputSchema,
    outputSchema: productOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_product",
    description: "Update selected fields on an existing Zylvie product.",
    inputSchema: s.object(
      "The product identifier and fields to update.",
      { id: idSchema, ...productFields },
      { optional: Object.keys(productFields) },
    ),
    outputSchema: productOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_product",
    description: "Delete a Zylvie product, or archive it when transaction history requires it.",
    inputSchema: s.requiredObject("The product to delete or archive.", { id: idSchema }),
    outputSchema: statusOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_coupon",
    description: "Create a coupon in Zylvie.",
    inputSchema: createCouponInputSchema,
    outputSchema: couponOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_coupon",
    description: "Update selected fields on an existing Zylvie coupon.",
    inputSchema: s.object(
      "The coupon identifier and fields to update.",
      { id: idSchema, ...couponFields },
      { optional: Object.keys(couponFields) },
    ),
    outputSchema: couponOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_coupon",
    description: "Delete a Zylvie coupon, or archive it when transaction history requires it.",
    inputSchema: s.requiredObject("The coupon to delete or archive.", { id: idSchema }),
    outputSchema: statusOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_coupons",
    description: "List active or archived coupons for the authenticated Zylvie brand.",
    inputSchema: s.object(
      "The filter used to list Zylvie coupons.",
      { archived: s.boolean("Whether to return archived coupons instead of active coupons.") },
      { optional: ["archived"] },
    ),
    outputSchema: s.looseRequiredObject("The Zylvie coupon list.", {
      count: s.integer("The number of returned coupons."),
      coupons: s.array("The coupons returned by Zylvie.", couponOutputSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "verify_license_key",
    description: "Verify that a Zylvie license key is valid for a product.",
    inputSchema: s.requiredObject("The product and license key to verify.", {
      productId: idSchema,
      licenseKey: licenseKeySchema,
    }),
    outputSchema: licenseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "redeem_license_key",
    description: "Mark a Zylvie license key as redeemed.",
    inputSchema: s.requiredObject("The license key to redeem.", { licenseKey: licenseKeySchema }),
    outputSchema: licenseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "refund_license_key",
    description: "Mark a Zylvie license key as refunded.",
    inputSchema: s.requiredObject("The license key to refund.", { licenseKey: licenseKeySchema }),
    outputSchema: licenseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "verify_subscriptions",
    description: "List Zylvie subscriptions associated with a subscriber email address.",
    inputSchema: s.requiredObject("The subscriber whose subscriptions should be verified.", {
      email: s.string("The subscriber email address.", { format: "email" }),
    }),
    outputSchema: s.requiredObject("The matching Zylvie subscriptions.", {
      subscriptions: s.array("The subscriptions returned by Zylvie.", s.looseObject("One Zylvie subscription.")),
    }),
  }),
];

export const zylvieActions: ActionDefinition[] = actions;

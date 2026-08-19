import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "payhip";

const couponTypeSchema = s.stringEnum("How Payhip applies the coupon.", ["single", "multi", "collection"]);

const couponIdSchema = s.positiveInteger("The unique Payhip coupon ID.");
const couponCodeSchema = s.nonEmptyString("The coupon code customers enter at checkout.");
const couponNotesSchema = s.string("Administrative notes for the coupon. These notes are not visible to customers.");
const amountOffSchema = s.positiveInteger("The fixed discount amount in cents.");
const percentOffSchema = s.number("The percentage discount to apply.", {
  exclusiveMinimum: 0,
  maximum: 100,
});
const productKeySchema = s.nonEmptyString("The unique Payhip product key for a single-product coupon.");
const collectionIdSchema = s.nonEmptyString("The unique Payhip collection ID.");
const usageLimitSchema = s.positiveInteger("The maximum number of times the coupon can be redeemed.");

const couponInputProperties: Record<string, JsonSchema> = {
  code: couponCodeSchema,
  couponType: couponTypeSchema,
  notes: couponNotesSchema,
  amountOff: amountOffSchema,
  percentOff: percentOffSchema,
  productKey: productKeySchema,
  collectionId: collectionIdSchema,
  usageLimit: usageLimitSchema,
};

const couponWriteConstraints: JsonSchema = {
  oneOf: [{ required: ["amountOff"] }, { required: ["percentOff"] }],
  allOf: [
    {
      if: {
        properties: { couponType: { const: "single" } },
        required: ["couponType"],
      },
      then: { required: ["productKey"] },
    },
    {
      if: {
        properties: { couponType: { const: "collection" } },
        required: ["couponType"],
      },
      then: { required: ["collectionId"] },
    },
  ],
};

const writeCouponInputSchema = {
  ...s.object("Payhip coupon fields used when creating or updating a coupon.", couponInputProperties, {
    optional: ["notes", "amountOff", "percentOff", "productKey", "collectionId", "usageLimit"],
  }),
  ...couponWriteConstraints,
};

const couponSchema = s.object("A Payhip coupon object.", {
  id: couponIdSchema,
  code: couponCodeSchema,
  couponType: couponTypeSchema,
  notes: s.nullableString("Administrative notes returned by Payhip."),
  amountOff: s.nullableInteger("The fixed discount amount in cents when present."),
  percentOff: s.nullableNumber("The percentage discount when present."),
  productKey: s.nullableString("The product key when the coupon targets one product."),
  collectionId: s.nullableString("The collection ID when the coupon targets one collection."),
  usageLimit: s.nullableInteger("The maximum redemption count when present."),
  startDate: s.nullableString("The date or datetime when the coupon becomes valid."),
  endDate: s.nullableString("The date or datetime when the coupon expires."),
  minimumPurchaseAmount: s.nullableInteger("The minimum purchase amount in cents when configured."),
  raw: s.looseObject("The raw Payhip coupon object."),
});

const listCouponsInputProperties = {
  page: s.positiveInteger("The Payhip results page to request."),
};

const getCouponInputSchema = s.object("Request parameters for retrieving a Payhip coupon.", {
  couponId: couponIdSchema,
});

const deleteCouponInputSchema = getCouponInputSchema;

const deleteCouponOutputSchema = s.object("The response returned after deleting a Payhip coupon.", {
  deleted: s.boolean("Whether the coupon delete request completed successfully."),
  couponId: couponIdSchema,
  raw: s.looseObject("The raw Payhip delete response payload."),
});

const productSecretKeySchema = s.nonEmptyString(
  "The Payhip product secret key used to authenticate license key requests.",
);
const licenseKeySchema = s.nonEmptyString("The Payhip license key value to operate on.");

const licenseCheckSchema = s.object("The Payhip license check object.", {
  uses: s.nullable(s.integer("The number of license uses reported by Payhip.")),
  enabled: s.nullable(s.boolean("Whether the license key is enabled.")),
  raw: s.looseObject("The raw Payhip license check object."),
});

const licenseSchema = s.object("A normalized Payhip license response.", {
  valid: s.boolean("Whether Payhip reported the license key as valid."),
  message: s.nullableString("The message returned by Payhip when present."),
  check: s.nullable(licenseCheckSchema),
  raw: s.looseObject("The raw Payhip license response payload."),
});

const licenseInputSchema = s.object("Request parameters for a Payhip license key operation.", {
  productSecretKey: productSecretKeySchema,
  licenseKey: licenseKeySchema,
});

export const payhipActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_coupon",
    description: "Create a Payhip coupon for a fixed amount or percentage discount.",
    requiredScopes: [],
    inputSchema: writeCouponInputSchema,
    outputSchema: s.object("The response returned after creating a Payhip coupon.", {
      coupon: couponSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_coupon",
    description: "Retrieve a Payhip coupon by ID.",
    requiredScopes: [],
    inputSchema: getCouponInputSchema,
    outputSchema: s.object("The response returned when retrieving a Payhip coupon.", {
      coupon: couponSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_coupons",
    description: "List Payhip coupons, optionally starting from a specific results page.",
    requiredScopes: [],
    inputSchema: s.object("Request parameters for listing Payhip coupons.", listCouponsInputProperties, {
      optional: ["page"],
    }),
    outputSchema: s.object("The response returned when listing Payhip coupons.", {
      coupons: s.array("The Payhip coupons returned for the requested page.", couponSchema),
      page: s.nullable(s.integer("The current Payhip results page when present.")),
      perPage: s.nullable(s.integer("The Payhip page size when present.")),
      total: s.nullable(s.integer("The total coupon count when present.")),
      raw: s.looseObject("The raw Payhip list response payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "update_coupon",
    description: "Update a Payhip coupon using the same fields accepted by coupon creation.",
    requiredScopes: [],
    inputSchema: {
      ...s.object(
        "Request parameters for updating a Payhip coupon.",
        {
          couponId: couponIdSchema,
          ...couponInputProperties,
        },
        {
          optional: ["notes", "amountOff", "percentOff", "productKey", "collectionId", "usageLimit"],
        },
      ),
      ...couponWriteConstraints,
    },
    outputSchema: s.object("The response returned after updating a Payhip coupon.", {
      coupon: couponSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_coupon",
    description: "Delete a Payhip coupon by ID.",
    requiredScopes: [],
    inputSchema: deleteCouponInputSchema,
    outputSchema: deleteCouponOutputSchema,
  }),
  defineProviderAction(service, {
    name: "verify_license",
    description: "Verify a Payhip license key using the product secret key.",
    requiredScopes: [],
    inputSchema: licenseInputSchema,
    outputSchema: s.object("The response returned when verifying a Payhip license key.", {
      license: licenseSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "enable_license",
    description: "Enable a Payhip license key using the product secret key.",
    requiredScopes: [],
    inputSchema: licenseInputSchema,
    outputSchema: s.object("The response returned after enabling a Payhip license key.", {
      license: licenseSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "disable_license",
    description: "Disable a Payhip license key using the product secret key.",
    requiredScopes: [],
    inputSchema: licenseInputSchema,
    outputSchema: s.object("The response returned after disabling a Payhip license key.", {
      license: licenseSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "decrease_license_uses",
    description: "Decrease the available uses for a Payhip license key.",
    requiredScopes: [],
    inputSchema: licenseInputSchema,
    outputSchema: s.object("The response returned after decreasing Payhip license uses.", {
      license: licenseSchema,
    }),
  }),
];

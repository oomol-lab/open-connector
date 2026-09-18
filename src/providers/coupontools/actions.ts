import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "coupontools";
const rawObjectSchema = s.looseObject("The raw Coupontools API object.");

const listCouponsAction = defineProviderAction(service, {
  name: "list_coupons",
  operationType: "read",
  description: "List coupon campaigns available to the authenticated Coupontools account.",
  inputSchema: s.object(
    "Optional filters for listing Coupontools coupon campaigns.",
    {
      only_active: s.boolean("Whether to return only active coupon campaigns."),
      folder: s.nonEmptyString("The Coupontools folder ID to match."),
      tags: s.nonEmptyString("A comma-separated list of coupon tags to match."),
      category: s.nonEmptyString("The Coupontools category ID to match."),
    },
    { optional: ["only_active", "folder", "tags", "category"] },
  ),
  outputSchema: s.requiredObject("The coupon campaigns returned by Coupontools.", {
    coupons: s.array("The matching coupon campaigns.", rawObjectSchema),
    raw: rawObjectSchema,
  }),
});

const getCouponAction = defineProviderAction(service, {
  name: "get_coupon",
  operationType: "read",
  description: "Get a Coupontools coupon campaign by ID.",
  inputSchema: s.object(
    "The Coupontools coupon lookup input.",
    {
      campaign: s.nonEmptyString("The coupon campaign ID, such as cam_123456."),
      show_usage_stats: s.boolean("Whether to include coupon usage statistics."),
    },
    { optional: ["show_usage_stats"] },
  ),
  outputSchema: s.requiredObject("The Coupontools coupon campaign result.", {
    coupon: rawObjectSchema,
    raw: rawObjectSchema,
  }),
});

const createSingleUseUrlAction = defineProviderAction(service, {
  name: "create_single_use_url",
  operationType: "write",
  description: "Create a single-use URL for a Coupontools coupon campaign.",
  inputSchema: s.object(
    "The recipient data and settings for a single-use coupon URL.",
    {
      campaign: s.nonEmptyString("The coupon campaign ID, such as cam_123456."),
      firstname: s.nonEmptyString("The recipient's first name."),
      lastname: s.nonEmptyString("The recipient's last name."),
      email: s.nonEmptyString("The recipient's email address.", { format: "email" }),
      phone: s.nonEmptyString("The recipient's phone number."),
      customid: s.nonEmptyString("A custom recipient ID of at most 50 characters.", {
        maxLength: 50,
      }),
      customvalcode: s.nonEmptyString("A custom validation code of at most 100 characters.", {
        maxLength: 100,
      }),
      customfield1: s.nonEmptyString("Custom recipient field 1, with at most 50 characters.", {
        maxLength: 50,
      }),
      customfield2: s.nonEmptyString("Custom recipient field 2, with at most 50 characters.", {
        maxLength: 50,
      }),
      customfield3: s.nonEmptyString("Custom recipient field 3, with at most 50 characters.", {
        maxLength: 50,
      }),
      customfield4: s.nonEmptyString("Custom recipient field 4, with at most 50 characters.", {
        maxLength: 50,
      }),
      customfield5: s.nonEmptyString("Custom recipient field 5, with at most 50 characters.", {
        maxLength: 50,
      }),
      customfield6: s.nonEmptyString("Custom recipient field 6, with at most 50 characters.", {
        maxLength: 50,
      }),
      customfield7: s.nonEmptyString("Custom recipient field 7, with at most 50 characters.", {
        maxLength: 50,
      }),
      autovalcode: s.stringEnum("The length of an automatically generated validation code.", [
        "6digits",
        "8digits",
        "10digits",
      ]),
      duplicate_check: s.stringEnum("The recipient field used to detect an existing single-use URL.", [
        "email",
        "phone",
        "customid",
      ]),
      expiry_date: s.nonEmptyString("The expiry datetime in yyyy-MM-dd HH:mm:ss format, using the campaign timezone."),
      utm_campaign: s.nonEmptyString("The Google Analytics campaign tag."),
      utm_source: s.nonEmptyString("The Google Analytics source tag."),
      utm_medium: s.nonEmptyString("The Google Analytics medium tag."),
      utm_term: s.nonEmptyString("The Google Analytics term tag."),
      utm_content: s.nonEmptyString("The Google Analytics content tag."),
    },
    {
      optional: [
        "firstname",
        "lastname",
        "email",
        "phone",
        "customid",
        "customvalcode",
        "customfield1",
        "customfield2",
        "customfield3",
        "customfield4",
        "customfield5",
        "customfield6",
        "customfield7",
        "autovalcode",
        "duplicate_check",
        "expiry_date",
        "utm_campaign",
        "utm_source",
        "utm_medium",
        "utm_term",
        "utm_content",
      ],
    },
  ),
  outputSchema: s.requiredObject("The single-use coupon URL created by Coupontools.", {
    single_use_url: s.nonEmptyString("The generated single-use coupon URL."),
    single_use_code: s.nonEmptyString("The generated single-use coupon code."),
    raw: rawObjectSchema,
  }),
});

export const coupontoolsActions: ProviderActionDefinition[] = [
  listCouponsAction,
  getCouponAction,
  createSingleUseUrlAction,
];

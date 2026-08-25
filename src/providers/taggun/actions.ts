import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "taggun" as const;

const languageSchema = s.stringEnum("Optional language hint for Taggun OCR. Leave unset for automatic detection.", [
  "en",
  "es",
  "fr",
  "jp",
  "he",
  "iw",
  "et",
  "lv",
  "lt",
  "fi",
  "el",
  "zh",
  "th",
]);

const httpsFileUrlSchema = s.string({
  description: "Public HTTPS URL containing the receipt or invoice file.",
  format: "uri",
  minLength: 1,
  pattern: "^https://",
});

const forwardedHeadersSchema = s.record(
  "Optional headers Taggun should forward while downloading the receipt URL.",
  s.string("A header value to send while Taggun downloads the receipt URL."),
);

const optionalOcrInputFields = {
  headers: forwardedHeadersSchema,
  extractTime: s.boolean(
    "Whether Taggun should return the receipt time when it is found instead of defaulting to noon.",
  ),
  ipAddress: s.string("The end user's IP address associated with this receipt request.", { minLength: 1 }),
  near: s.string("A geographic hint such as city, state, or country to help merchant search.", { minLength: 1 }),
  language: languageSchema,
  ignoreMerchantName: s.string("Merchant name Taggun should ignore if detected on the receipt.", { minLength: 1 }),
  refresh: s.boolean("Whether Taggun should reprocess a receipt that is already stored."),
  incognito: s.boolean("Whether Taggun should avoid saving the receipt in storage."),
  subAccountId: s.string("Sub-account ID used by Taggun for billing or reporting segmentation.", {
    minLength: 1,
    maxLength: 100,
  }),
  referenceId: s.string("Unique reference ID used by Taggun for feedback or training.", {
    minLength: 1,
    maxLength: 50,
  }),
};

const optionalOcrInputKeys = [
  "headers",
  "extractTime",
  "ipAddress",
  "near",
  "language",
  "ignoreMerchantName",
  "refresh",
  "incognito",
  "subAccountId",
  "referenceId",
] as const;

const receiptExtractionOutputSchema = s.object(
  "Normalized Taggun receipt OCR output with the full upstream receipt payload preserved.",
  {
    receipt: s.looseObject("The full receipt OCR payload returned by Taggun."),
    trackingId: s.nullable(s.string("Taggun tracking ID when returned.")),
    confidenceLevel: s.nullable(s.number("Overall Taggun confidence level when returned.")),
    totalAmount: s.nullable(s.number("Extracted receipt total amount when returned.")),
    taxAmount: s.nullable(s.number("Extracted receipt tax amount when returned.")),
    merchantName: s.nullable(s.string("Extracted merchant name when returned.")),
    merchantCountryCode: s.nullable(s.string("Extracted merchant country code when returned.")),
    date: s.nullable(s.string("Extracted receipt transaction date when returned.")),
    rawText: s.nullable(s.string("Raw OCR text when returned.")),
  },
);

const campaignIdSchema = s.string("The Taggun campaign ID.", { minLength: 1, maxLength: 50 });

const validationInputSchema = s.object(
  "Input parameters for validating a receipt URL against Taggun campaign settings.",
  {
    url: httpsFileUrlSchema,
    campaignId: campaignIdSchema,
    headers: forwardedHeadersSchema,
    referenceId: s.string("Receipt reference ID for duplicate handling and tracking.", {
      minLength: 1,
      maxLength: 50,
    }),
    userId: s.string("End-user identifier used by Taggun fraud checks.", { minLength: 1, maxLength: 50 }),
    subAccountId: s.string("Sub-account ID used by Taggun for reporting or billing segmentation.", {
      minLength: 1,
      maxLength: 100,
    }),
    incognito: s.boolean("Whether Taggun should avoid saving the receipt in storage."),
    ipAddress: s.string("The end user's IP address associated with this validation request.", { minLength: 1 }),
    near: s.string("A geographic hint such as city, state, or country to help merchant search.", { minLength: 1 }),
    language: languageSchema,
  },
  {
    optional: ["headers", "referenceId", "userId", "subAccountId", "incognito", "ipAddress", "near", "language"],
  },
);

const validationOutputSchema = s.object(
  "Normalized Taggun receipt validation output with the full upstream validation payload preserved.",
  {
    validation: s.looseObject("The full validation payload returned by Taggun."),
    successful: s.nullable(s.boolean("Whether all enabled campaign validation checks passed.")),
    failedValidations: s.array(
      "Validation keys that failed.",
      s.string("One failed validation key returned by Taggun."),
    ),
    passedValidations: s.array(
      "Validation keys that passed.",
      s.string("One passed validation key returned by Taggun."),
    ),
    trackingId: s.nullable(s.string("Taggun tracking ID for this validation request.")),
  },
);

const extractReceiptSimpleUrlAction = defineProviderAction(service, {
  name: "extract_receipt_simple_url",
  description: "Extract basic receipt or invoice data from a public HTTPS file URL with Taggun.",
  inputSchema: s.object(
    "Input parameters for extracting basic receipt or invoice data by URL.",
    {
      url: httpsFileUrlSchema,
      ...optionalOcrInputFields,
    },
    { optional: optionalOcrInputKeys },
  ),
  outputSchema: receiptExtractionOutputSchema,
});

const extractReceiptVerboseUrlAction = defineProviderAction(service, {
  name: "extract_receipt_verbose_url",
  description: "Extract detailed receipt or invoice OCR data from a public HTTPS file URL with Taggun.",
  inputSchema: s.object(
    "Input parameters for extracting detailed receipt or invoice data by URL.",
    {
      url: httpsFileUrlSchema,
      extractLineItems: s.boolean("Whether Taggun should return product line items when found on the receipt."),
      ...optionalOcrInputFields,
    },
    { optional: ["extractLineItems", ...optionalOcrInputKeys] },
  ),
  outputSchema: receiptExtractionOutputSchema,
});

const listCampaignIdsAction = defineProviderAction(service, {
  name: "list_campaign_ids",
  description: "List Taggun campaign IDs linked to the connected account.",
  inputSchema: s.object("Input parameters for listing Taggun campaign IDs.", {}),
  outputSchema: s.object(
    "The campaign ID list returned by Taggun.",
    {
      campaignIds: s.array("Campaign IDs linked to the connected Taggun account.", s.string("One Taggun campaign ID.")),
    },
    { required: ["campaignIds"] },
  ),
});

const getCampaignSettingsAction = defineProviderAction(service, {
  name: "get_campaign_settings",
  description: "Get Taggun validation settings for an existing campaign ID.",
  inputSchema: s.object(
    "Input parameters for retrieving Taggun campaign settings.",
    {
      campaignId: campaignIdSchema,
    },
    { required: ["campaignId"] },
  ),
  outputSchema: s.object(
    "The campaign settings returned by Taggun.",
    {
      campaignId: s.string("The Taggun campaign ID that was requested."),
      settings: s.looseObject("The Taggun campaign settings object."),
    },
    { required: ["campaignId", "settings"] },
  ),
});

const validateReceiptUrlAction = defineProviderAction(service, {
  name: "validate_receipt_url",
  description: "Validate a public HTTPS receipt or invoice URL against existing Taggun campaign settings.",
  inputSchema: validationInputSchema,
  outputSchema: validationOutputSchema,
});

export const taggunActions: ActionDefinition[] = [
  extractReceiptSimpleUrlAction,
  extractReceiptVerboseUrlAction,
  listCampaignIdsAction,
  getCampaignSettingsAction,
  validateReceiptUrlAction,
];

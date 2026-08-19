import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "eagle_doc" as const;

const extractedFieldValueSchema = s.object("One normalized Eagle Doc extracted field value.", {
  value: s.unknown("The extracted field value returned by Eagle Doc."),
  polygon: s.nullable(
    s.object("The polygon coordinates returned for the extracted field when polygon mode is enabled.", {
      p1: s.array("The first polygon point as a `[x, y]` coordinate pair.", s.number("One polygon coordinate value."), {
        minItems: 2,
        maxItems: 2,
      }),
      p2: s.array(
        "The second polygon point as a `[x, y]` coordinate pair.",
        s.number("One polygon coordinate value."),
        { minItems: 2, maxItems: 2 },
      ),
      p3: s.array("The third polygon point as a `[x, y]` coordinate pair.", s.number("One polygon coordinate value."), {
        minItems: 2,
        maxItems: 2,
      }),
      p4: s.array(
        "The fourth polygon point as a `[x, y]` coordinate pair.",
        s.number("One polygon coordinate value."),
        { minItems: 2, maxItems: 2 },
      ),
    }),
  ),
  page: s.nullable(s.integer("The 1-based page number where Eagle Doc found this field when returned.")),
  confidence: s.nullable(s.number("The confidence score returned by Eagle Doc for this field when available.")),
});

const extractedFieldMapSchema = s.record(
  "A keyed collection of extracted Eagle Doc fields normalized into `{ value, polygon, page, confidence }` objects.",
  extractedFieldValueSchema,
);

const pageSizeSchema = s.object("The width and height of one processed page.", {
  width: s.number("The page width returned by Eagle Doc."),
  height: s.number("The page height returned by Eagle Doc."),
});

const signatureSchema = s.looseObject(
  "One signature object returned by Eagle Doc when `signature=true` is requested.",
  {
    image: s.string("The Base64-encoded signature image when returned."),
    binary: s.string("The Base64-encoded binary signature image when returned."),
    boundingBox: s.array(
      "The signature bounding box as `[left, top, right, bottom]` coordinates when returned.",
      s.number("One bounding box coordinate."),
      { minItems: 4, maxItems: 4 },
    ),
    page: s.integer("The 1-based page number where the signature was detected."),
  },
);

const usageAdditionalInfoSchema = s.looseObject("Additional monthly pricing metadata returned by Eagle Doc.", {
  PricePerPageOverUsage: s.number("The over-usage price per page when returned."),
  ContractQuota: s.integer("The contract quota for that month when returned."),
  PricePerPage: s.number("The in-contract price per page when returned."),
});

export const eagleDocActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "process_finance_document",
    description:
      "Upload one invoice, receipt, or PDF to Eagle Doc Finance OCR and return the structured extraction result.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for processing one finance document with Eagle Doc.",
      {
        contentBase64: s.string("The Base64-encoded content of the uploaded invoice, receipt, image, or PDF.", {
          minLength: 1,
        }),
        fileName: s.string("The file name sent to Eagle Doc for the uploaded document.", {
          minLength: 1,
        }),
        mimeType: s.string("The MIME type sent to Eagle Doc for the uploaded document.", {
          minLength: 1,
        }),
        privacy: s.boolean(
          "Whether Eagle Doc should avoid storing the uploaded file on the server. Eagle Doc defaults this to true.",
        ),
        polygon: s.boolean("Whether Eagle Doc should include polygon coordinates for extracted fields."),
        fullText: s.boolean("Whether Eagle Doc should include the full OCR text grouped by page."),
        signature: s.boolean("Whether Eagle Doc should detect signatures inside the uploaded document."),
      },
      { optional: ["mimeType", "privacy", "polygon", "fullText", "signature"] },
    ),
    outputSchema: s.object("The normalized Eagle Doc finance OCR result.", {
      docType: s.nullable(s.string("The top-level document type returned by Eagle Doc.")),
      general: s.nullable(
        s.record("The normalized `general` field collection returned by Eagle Doc.", extractedFieldValueSchema),
      ),
      productItems: s.array("The normalized product item rows returned by Eagle Doc.", extractedFieldMapSchema),
      taxes: s.nullable(s.array("The normalized tax summary rows returned by Eagle Doc.", extractedFieldMapSchema)),
      payments: s.nullable(
        s.array("The normalized payment rows returned by Eagle Doc when present.", extractedFieldMapSchema),
      ),
      paymentBanks: s.nullable(
        s.array("The normalized bank payment rows returned by Eagle Doc when present.", extractedFieldMapSchema),
      ),
      signatures: s.nullable(
        s.array("The signature objects returned by Eagle Doc when `signature=true` is enabled.", signatureSchema),
      ),
      signatureImages: s.nullable(
        s.array(
          "The additional signature image payloads returned by Eagle Doc when present.",
          s.unknown("One signature image payload returned by Eagle Doc."),
        ),
      ),
      qrCodes: s.nullable(
        s.array(
          "The QR code objects returned by Eagle Doc when present.",
          s.looseObject("One QR code object returned by Eagle Doc."),
        ),
      ),
      performanceOption: s.nullable(s.string("The Eagle Doc processing mode such as `ACCURACY` or `FALLBACK`.")),
      fileHash: s.nullable(s.string("The MD5 hash returned by Eagle Doc for the uploaded file.")),
      version: s.nullable(s.string("The Eagle Doc algorithm version used for the extraction.")),
      numberOfPages: s.nullable(s.integer("The number of pages Eagle Doc processed for the uploaded document.")),
      pages: s.array("The processed page size metadata returned by Eagle Doc.", pageSizeSchema),
      fullText: s.nullable(
        s.array(
          "The page-grouped OCR text returned when `fullText=true` is requested.",
          s.array("The OCR text lines returned for one page.", s.string("One OCR text line.")),
        ),
      ),
      languages: s.array(
        "The language codes Eagle Doc detected in the document.",
        s.string("One detected language code."),
      ),
      mainLanguage: s.nullable(s.string("The primary language code Eagle Doc detected in the document.")),
      templateId: s.nullable(s.unknown("The template identifier returned by Eagle Doc when present.")),
    }),
  }),
  defineProviderAction(service, {
    name: "get_current_usage",
    description: "Fetch the current billing-month usage counters for the connected Eagle Doc API key.",
    requiredScopes: [],
    inputSchema: s.object("No input parameters are required for the current usage endpoint.", {}),
    outputSchema: s.object("The current Eagle Doc usage counters for the active billing month.", {
      currentMonth: s.string("The current billing month in `YYYY-MM` format."),
      contractQuota: s.integer("The contract quota returned by Eagle Doc."),
      quotaUsed: s.integer("The number of processed pages used in the current month."),
      overUsageAllowed: s.boolean("Whether over-usage beyond the contract quota is allowed."),
      hardLimit: s.nullable(s.integer("The optional hard limit on processed pages for the current month.")),
      overUsage: s.integer("The number of pages above the contract quota."),
      pricePerPageOverUsage: s.number("The price per page applied to over-usage when returned by Eagle Doc."),
      overUsageCost: s.number("The current over-usage cost calculated by Eagle Doc for this month."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_monthly_usage",
    description: "List Eagle Doc monthly usage history together with pricing metadata for each month returned.",
    requiredScopes: [],
    inputSchema: s.object("No input parameters are required for the monthly usage history endpoint.", {}),
    outputSchema: s.object("The monthly Eagle Doc usage history returned by the connector.", {
      months: s.array(
        "The monthly usage rows returned by Eagle Doc.",
        s.object("One Eagle Doc monthly usage row.", {
          quotaUsed: s.integer("The number of processed pages used in that month."),
          quotaDate: s.string("The month identifier returned by Eagle Doc in `YYYY-MM` format."),
          additionalInfo: usageAdditionalInfoSchema,
        }),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "list_usage_logs",
    description: "List recent Eagle Doc request log rows with processed page counts and timestamps.",
    requiredScopes: [],
    inputSchema: s.object("No input parameters are required for the usage logs endpoint.", {}),
    outputSchema: s.object("The recent Eagle Doc request logs returned by the connector.", {
      logs: s.array(
        "The recent request log rows returned by Eagle Doc.",
        s.object("One Eagle Doc request log row.", {
          pages: s.integer("The number of pages processed by that request."),
          time: s.string("The time when Eagle Doc finished processing the request."),
          timeRequested: s.string("The time when Eagle Doc received the request for processing."),
        }),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "get_quota",
    description: "Fetch the overall Eagle Doc management quota summary tied to the connected API key.",
    requiredScopes: [],
    inputSchema: s.object("No input parameters are required for the management quota endpoint.", {}),
    outputSchema: s.object("The Eagle Doc management quota summary returned by the connector.", {
      quota: s.nullable(s.integer("The quota value returned by Eagle Doc when one is configured.")),
      quotaUsed: s.integer("The number of processed pages counted against the quota."),
      currentMonth: s.string("The month identifier returned by Eagle Doc for the quota summary."),
    }),
  }),
];

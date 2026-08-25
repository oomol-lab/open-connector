import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "cloudlayer";

const nonEmptyString = (description: string): JsonSchema => s.nonEmptyString(description);
const positiveInteger = (description: string): JsonSchema => s.positiveInteger(description);

const marginSchema = s.object(
  "The optional page margin overrides forwarded to cloudlayer.io.",
  {
    top: nonEmptyString("The top page margin, such as `0.5in` or `20px`."),
    right: nonEmptyString("The right page margin, such as `0.5in` or `20px`."),
    bottom: nonEmptyString("The bottom page margin, such as `0.5in` or `20px`."),
    left: nonEmptyString("The left page margin, such as `0.5in` or `20px`."),
  },
  { optional: ["top", "right", "bottom", "left"] },
);

const baseCreatePdfJobFields = {
  format: nonEmptyString("The output page format such as `a4` or `letter`."),
  margin: marginSchema,
  printBackground: s.boolean("Whether the generated PDF should include background graphics and colors."),
  waitUntil: nonEmptyString("The page load event to wait for before rendering, such as `load` or `networkidle0`."),
  timeout: positiveInteger("The maximum page load time in milliseconds before rendering fails."),
  filename: nonEmptyString("The optional output filename hint for the generated PDF."),
};

const baseCreatePdfOptional = ["format", "margin", "printBackground", "waitUntil", "timeout", "filename"];

const accountSchema = s.object(
  "The normalized cloudlayer.io account usage snapshot.",
  {
    uid: nonEmptyString("The unique cloudlayer.io account identifier."),
    subscription: nonEmptyString("The subscription price identifier for the current account."),
    subType: nonEmptyString("The billing model reported by cloudlayer.io, such as `limit` or `usage`."),
    subActive: s.boolean("Whether the current subscription is active."),
    calls: s.integer("The API calls used in the current billing period."),
    callsLimit: s.integer("The maximum API calls allowed in the current billing period."),
    credit: s.number("The remaining API credits when the account uses usage-based billing."),
    bytesTotal: s.integer("The total generated output bytes in the current billing period."),
    bytesLimit: s.integer("The maximum generated output bytes allowed in the current billing period."),
    computeTimeTotal: s.integer(
      "The total rendering compute time used in milliseconds for the current billing period.",
    ),
    computeTimeLimit: s.integer(
      "The maximum rendering compute time allowed in milliseconds for the current billing period.",
    ),
    storageUsed: s.integer("The currently used cloud storage in bytes for stored generated assets."),
    storageLimit: s.integer("The maximum cloud storage allowed in bytes for stored generated assets."),
    totalJobs: s.integer("The total completed jobs for the current billing period."),
    successJobs: s.integer("The number of successfully completed jobs."),
    errorJobs: s.integer("The number of failed jobs."),
  },
  { optional: ["credit"] },
);

const jobSchema = s.object(
  "The normalized cloudlayer.io job payload.",
  {
    id: nonEmptyString("The cloudlayer.io job identifier."),
    uid: nonEmptyString("The cloudlayer.io user identifier that owns the job."),
    type: nonEmptyString("The upstream job type such as `html-pdf` or `url-pdf`."),
    status: nonEmptyString("The current job status such as `pending`, `success`, or `error`."),
    params: s.looseObject("The upstream request parameters recorded for the job when available."),
    size: s.integer("The generated output size in bytes when available."),
    processTime: s.integer("The upstream processing time in milliseconds when available."),
    apiCreditCost: s.integer("The upstream API credit cost charged for this job when available."),
    workerName: nonEmptyString("The upstream worker identifier that processed the job."),
    timestamp: s.integer("The Unix epoch timestamp in milliseconds when the job was created."),
  },
  {
    required: ["id", "status"],
    optional: ["uid", "type", "params", "size", "processTime", "apiCreditCost", "workerName", "timestamp"],
  },
);

const assetSchema = s.object("The normalized cloudlayer.io asset payload.", {
  id: nonEmptyString("The cloudlayer.io asset identifier."),
  jobId: nonEmptyString("The job identifier that produced the asset."),
  ext: nonEmptyString("The generated file extension such as `pdf` or `png`."),
  type: nonEmptyString("The generated file MIME type."),
  size: s.integer("The generated file size in bytes."),
  url: s.url("The pre-authenticated download URL for the generated file."),
  timestamp: s.integer("The Unix epoch timestamp in milliseconds when the asset was created."),
});

export const cloudlayerActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    description: "Get the current cloudlayer.io account usage, limits, and job totals for the API key.",
    inputSchema: s.object("No input parameters are required for retrieving the current account.", {}),
    outputSchema: s.object("The normalized output payload for retrieving the current cloudlayer.io account.", {
      account: accountSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_html_pdf_job",
    description:
      "Create an asynchronous cloudlayer.io HTML-to-PDF job from base64-encoded HTML and return the new job status.",
    inputSchema: s.object(
      "Input parameters for creating a cloudlayer.io HTML-to-PDF job.",
      {
        ...baseCreatePdfJobFields,
        html: nonEmptyString("The base64-encoded HTML document to render as a PDF."),
      },
      { required: ["html"], optional: baseCreatePdfOptional },
    ),
    outputSchema: jobSchema,
  }),
  defineProviderAction(service, {
    name: "create_url_pdf_job",
    description:
      "Create an asynchronous cloudlayer.io URL-to-PDF job for one public webpage and return the new job status.",
    inputSchema: s.object(
      "Input parameters for creating a cloudlayer.io URL-to-PDF job.",
      {
        ...baseCreatePdfJobFields,
        url: s.url("The public webpage URL to render as a PDF."),
      },
      { required: ["url"], optional: baseCreatePdfOptional },
    ),
    outputSchema: jobSchema,
  }),
  defineProviderAction(service, {
    name: "create_template_pdf_job",
    description:
      "Create an asynchronous cloudlayer.io template-to-PDF job from a base64-encoded template and JSON data.",
    inputSchema: s.object(
      "Input parameters for creating a cloudlayer.io template-to-PDF job.",
      {
        ...baseCreatePdfJobFields,
        template: nonEmptyString("The base64-encoded template source to render as a PDF."),
        data: s.looseObject("The JSON object used to populate the Nunjucks template variables."),
      },
      { required: ["template", "data"], optional: baseCreatePdfOptional },
    ),
    outputSchema: jobSchema,
  }),
  defineProviderAction(service, {
    name: "get_job",
    description: "Get one cloudlayer.io job by job ID to inspect status, timing, and request metadata.",
    inputSchema: s.object(
      "Input parameters for retrieving one cloudlayer.io job.",
      {
        jobId: nonEmptyString("The cloudlayer.io job identifier to retrieve."),
      },
      { required: ["jobId"] },
    ),
    outputSchema: s.object("The normalized output payload for retrieving one cloudlayer.io job.", {
      job: jobSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_jobs",
    description: "List recent cloudlayer.io jobs for the current account with optional cursor pagination.",
    inputSchema: s.object(
      "Input parameters for listing recent cloudlayer.io jobs.",
      {
        limit: s.integer("The number of jobs to return, between 1 and 100.", { minimum: 1, maximum: 100 }),
        startAfterId: nonEmptyString("The job ID to paginate after for cursor-based listing."),
      },
      { optional: ["limit", "startAfterId"] },
    ),
    outputSchema: s.object("The normalized output payload for listing cloudlayer.io jobs.", {
      jobs: s.array("The recent cloudlayer.io jobs returned by the API.", jobSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_asset",
    description: "Get one generated cloudlayer.io asset by asset ID, including its direct download URL.",
    inputSchema: s.object(
      "Input parameters for retrieving one generated cloudlayer.io asset.",
      {
        assetId: nonEmptyString("The cloudlayer.io asset identifier to retrieve."),
      },
      { required: ["assetId"] },
    ),
    outputSchema: s.object("The normalized output payload for retrieving one cloudlayer.io asset.", {
      asset: assetSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_assets",
    description: "List recent generated cloudlayer.io assets for the current account with optional cursor pagination.",
    inputSchema: s.object(
      "Input parameters for listing recent cloudlayer.io assets.",
      {
        limit: s.integer("The number of assets to return, between 1 and 100.", { minimum: 1, maximum: 100 }),
        startAfterId: nonEmptyString("The asset ID to paginate after for cursor-based listing."),
      },
      { optional: ["limit", "startAfterId"] },
    ),
    outputSchema: s.object("The normalized output payload for listing cloudlayer.io assets.", {
      assets: s.array("The recent cloudlayer.io assets returned by the API.", assetSchema),
    }),
  }),
];

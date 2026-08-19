import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "renderform";
const renderDataSchema = s.looseObject("Template data object forwarded to RenderForm for placeholder replacement.");
const metadataSchema = s.looseObject("Arbitrary metadata object stored together with the generated RenderForm result.");
const sortableSchema = s.object("Sort flags returned by RenderForm pagination responses.", {
  empty: s.boolean("Whether the sort definition is empty."),
  sorted: s.boolean("Whether the result set is sorted."),
  unsorted: s.boolean("Whether the result set is unsorted."),
});
const pageableSchema = s.object("Page metadata returned by RenderForm for paginated responses.", {
  sort: sortableSchema,
  offset: s.integer("Zero-based item offset for the current page."),
  pageNumber: s.integer("Zero-based page number."),
  pageSize: s.integer("Configured page size."),
  unpaged: s.boolean("Whether pagination is disabled."),
  paged: s.boolean("Whether pagination is enabled."),
});
const templateSchema = s.looseRequiredObject(
  "RenderForm template summary returned by the API.",
  {
    identifier: s.nonEmptyString("Unique template identifier."),
    name: s.nonEmptyString("Template display name."),
    preview: s.nullable(s.url("Preview URL for the template when available.")),
    width: s.nullableInteger("Template width in pixels when available."),
    height: s.nullableInteger("Template height in pixels when available."),
    outputFormat: s.nullableString("Configured output format such as `jpg`, `png`, or `pdf`."),
    outputExtension: s.nullableString("Configured file extension such as `.jpg` or `.pdf`."),
    createdAt: s.nullableString("Template creation timestamp when available."),
    tags: s.array("Template tags.", s.string("One template tag string.")),
    raw: s.looseObject("Raw template payload returned by RenderForm."),
  },
  { optional: ["preview", "width", "height", "outputFormat", "outputExtension", "createdAt", "tags", "raw"] },
);
const resultSchema = s.looseRequiredObject(
  "RenderForm render result summary returned by the API.",
  {
    identifier: s.nonEmptyString("Unique result identifier."),
    href: s.url("Download URL for the generated file."),
    width: s.nullableInteger("Generated width in pixels when available."),
    height: s.nullableInteger("Generated height in pixels when available."),
    fileName: s.nullableString("Generated file name when RenderForm returns one."),
    createdAt: s.nullableString("Result creation timestamp when available."),
    deletedAt: s.nullableString("Deletion timestamp when the result has been removed."),
    templateName: s.nullableString("Template name used for the render when available."),
    templateIdentifier: s.nullableString("Template identifier used for the render when available."),
    raw: s.looseObject("Raw result payload returned by RenderForm."),
  },
  { optional: ["width", "height", "fileName", "createdAt", "deletedAt", "templateName", "templateIdentifier", "raw"] },
);
const pageFields = {
  page: s.integer("Current zero-based page number."),
  size: s.integer("Requested page size."),
  totalPages: s.nullableInteger("Total page count when RenderForm returns one."),
  totalElements: s.nullableInteger("Total item count when RenderForm returns one."),
  numberOfElements: s.nullableInteger("Number of items present in the current page when available."),
  first: s.boolean("Whether this page is the first page."),
  last: s.boolean("Whether this page is the last page."),
  empty: s.boolean("Whether this page is empty."),
  pageable: s.nullable(pageableSchema),
  sort: s.nullable(sortableSchema),
};
const requestOutputSchema = s.object("Normalized RenderForm async render response.", {
  requestId: s.nonEmptyString("Unique request identifier."),
  href: s.url("URL of the generated image, PDF, or screenshot file."),
  request: s.looseObject("Echoed request payload returned by RenderForm when available."),
});

export const renderformActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_usage",
    description: "Get current RenderForm credit usage for the API key and return a normalized usage summary.",
    inputSchema: s.object("This action does not require any input parameters.", {}),
    outputSchema: s.object("Normalized RenderForm usage response.", {
      usage: s.object("Current RenderForm usage counters for the authenticated account.", {
        identifier: s.nullableString("Unique RenderForm organization identifier for the authenticated API key."),
        credits: s.object("RenderForm credit usage summary.", {
          used: s.integer("Credits already used in the current billing period."),
          total: s.integer("Total credits available in the current billing period."),
          nextRenewalAt: s.nullableString("Date or timestamp when credits will be renewed when available."),
          renewalAmount: s.nullableInteger("Number of credits to be granted on the next renewal when available."),
        }),
        uploads: s.object("RenderForm upload storage usage summary.", {
          used: s.integer("Current upload storage used in bytes."),
          total: s.integer("Maximum upload storage available in bytes."),
        }),
        plan: s.nullable(
          s.object("Current RenderForm subscription plan summary.", {
            name: s.nullableString("Current RenderForm plan name when available."),
            status: s.nullableString("Current RenderForm plan status when available."),
            nextBillingAt: s.nullableString("Date or timestamp of the next billing event when available."),
          }),
        ),
        raw: s.looseObject("Raw usage payload returned by RenderForm."),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "list_templates",
    description:
      "List RenderForm templates with optional pagination and filters for name, tags, and source template ID.",
    inputSchema: s.object(
      "Input parameters for listing RenderForm templates.",
      {
        name: s.nonEmptyString("Optional template name filter."),
        page: s.nonNegativeInteger("Zero-based page number."),
        size: s.integer("Number of templates to return per page.", { minimum: 1, maximum: 50 }),
        tags: s.stringArray("Template tags used to filter the template list.", { minItems: 1 }),
        sourceTemplateId: s.nonEmptyString("Optional source template identifier used to filter cloned templates."),
      },
      { optional: ["name", "page", "size", "tags", "sourceTemplateId"] },
    ),
    outputSchema: s.object("Paginated RenderForm template list.", {
      templates: s.array("Template summaries returned by RenderForm.", templateSchema),
      ...pageFields,
    }),
  }),
  defineProviderAction(service, {
    name: "get_template",
    description: "Get one RenderForm template by identifier and return its normalized template details.",
    inputSchema: s.object("Input parameters for getting one RenderForm template.", {
      templateId: s.nonEmptyString("Template identifier to retrieve."),
    }),
    outputSchema: s.object("Single RenderForm template response.", { template: templateSchema }),
  }),
  defineProviderAction(service, {
    name: "render_image",
    description:
      "Render one RenderForm image or PDF from a template and return the request identifier, file URL, and echoed request.",
    inputSchema: s.object(
      "Input parameters for rendering one RenderForm image or PDF.",
      {
        template: s.nonEmptyString("Template identifier to render."),
        data: renderDataSchema,
        fileName: s.nonEmptyString("Optional custom output file name."),
        webhookUrl: s.url("Optional webhook URL called by RenderForm after rendering completes."),
        metadata: metadataSchema,
        version: s.nonEmptyString("Optional cache-busting version string used to force a fresh render."),
        width: s.positiveInteger("Optional output width in pixels."),
        height: s.positiveInteger("Optional output height in pixels."),
        waitTime: s.nonNegativeInteger("Optional wait time in milliseconds before rendering begins.", {
          maximum: 5000,
        }),
      },
      { optional: ["data", "fileName", "webhookUrl", "metadata", "version", "width", "height", "waitTime"] },
    ),
    outputSchema: requestOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_results",
    description: "List RenderForm generated results with pagination and optional template or batch filters.",
    inputSchema: s.object(
      "Input parameters for listing RenderForm results.",
      {
        page: s.nonNegativeInteger("Zero-based page number."),
        size: s.integer("Number of results to return per page.", { minimum: 1, maximum: 50 }),
        batch: s.nonEmptyString("Optional batch identifier filter."),
        template: s.nonEmptyString("Optional template identifier filter."),
      },
      { optional: ["page", "size", "batch", "template"] },
    ),
    outputSchema: s.object("Paginated RenderForm result list.", {
      results: s.array("RenderForm results returned by the page.", resultSchema),
      ...pageFields,
    }),
  }),
  defineProviderAction(service, {
    name: "take_screenshot",
    description:
      "Capture one website screenshot with RenderForm and return the request identifier, file URL, and echoed request.",
    inputSchema: s.object(
      "Input parameters for taking one website screenshot with RenderForm.",
      {
        url: s.url("Website URL to capture."),
        width: s.positiveInteger("Screenshot width in pixels."),
        height: s.positiveInteger("Screenshot height in pixels."),
        waitTime: s.integer("Optional wait time in milliseconds before capture.", { minimum: 500, maximum: 5000 }),
      },
      { optional: ["waitTime"] },
    ),
    outputSchema: requestOutputSchema,
  }),
];

import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "docmosis";

const noInputSchema = s.object("No input parameters are required for this action.", {});

const environmentSummarySchema = s.object("A normalized Docmosis environment summary.", {
  environmentName: s.nullableString("The Docmosis environment name."),
  ready: s.nullableBoolean("Whether the environment is ready to service document requests."),
  planName: s.nullableString("The Docmosis plan name."),
  isActivated: s.nullableBoolean("Whether the environment is activated."),
  isDeleted: s.nullableBoolean("Whether the environment is deleted."),
  isDisabled: s.nullableBoolean("Whether the environment is disabled."),
  lastUpdatedByUser: s.nullableString("The user who last updated the environment when available."),
  lastUpdatedTime: s.nullableInteger("The Unix epoch timestamp in milliseconds when the environment was last updated."),
  pageQuota: s.nullable(
    s.object("The environment page quota details when available.", {
      quota: s.nullableInteger("The total page quota."),
      used: s.nullableInteger("The used page quota."),
      pctUsed: s.nullableNumber("The percentage of the quota that has been used."),
      pctUsedStr: s.nullableString("The human-readable quota usage percentage."),
      isHardLimited: s.nullableBoolean("Whether the page quota is hard limited."),
    }),
  ),
  raw: s.looseObject("The raw environment summary payload returned by Docmosis."),
});

const templateDetailsSchema = s.object("One Docmosis template summary.", {
  name: s.nonEmptyString("The template path in the selected Docmosis environment."),
  lastModifiedMillisSinceEpoch: s.nullableInteger(
    "The Unix epoch timestamp in milliseconds when the template was last modified.",
  ),
  lastModifiedISO8601: s.nullableString("The ISO 8601 timestamp when the template was last modified."),
  sizeBytes: s.nullableInteger("The template size in bytes."),
  md5: s.nullableString("The MD5 hash of the template file."),
  templatePlainTextFieldPrefix: s.nullableString(
    "The plain-text field prefix configured when the template was uploaded.",
  ),
  templatePlainTextFieldSuffix: s.nullableString(
    "The plain-text field suffix configured when the template was uploaded.",
  ),
  templateHasErrors: s.nullableBoolean("Whether Docmosis detected template errors."),
  templateDevMode: s.nullableBoolean("Whether the template was uploaded in development mode."),
  templateDescription: s.nullableString("The uploaded template description when available."),
  raw: s.looseObject("The raw template details object returned by Docmosis."),
});

const templateStructureNodeSchema = s.looseObject("One node from the Docmosis template structure tree.", {});

const queueSchema = s.nullable(
  s.object("The Docmosis render queue state when returned.", {
    rejected: s.nullableBoolean("Whether the current render queue rejected the request."),
    availablePct: s.nullableInteger("The percentage of queue capacity still available."),
    delaySeconds: s.nullableInteger("The suggested backoff delay in seconds."),
  }),
);

const renderHeadersSchema = s.object("The selected Docmosis response headers.", {
  requestId: s.nullableString("The Docmosis request identifier header when present."),
  pagesRendered: s.nullableInteger("The number of rendered pages when present."),
  zipCreated: s.nullableBoolean("Whether Docmosis created a ZIP archive."),
  documentErrorsDetected: s.nullableBoolean("Whether Docmosis detected document errors during rendering."),
  queueRejected: s.nullableBoolean("Whether the render queue rejected the request."),
  queueAvailablePct: s.nullableInteger("The percentage of queue capacity still available."),
  queueDelaySeconds: s.nullableInteger("The suggested render queue delay in seconds."),
  retryAfter: s.nullableInteger("The Retry-After header value in seconds when present."),
  server: s.nullableString("The Docmosis server identifier header when present."),
});

export const docmosisActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_environment_summary",
    description:
      "Get Docmosis environment plan, quota, and readiness information for the selected processing location.",
    inputSchema: noInputSchema,
    outputSchema: s.object("The Docmosis environment summary response.", {
      succeeded: s.boolean("Whether Docmosis reported the request as successful."),
      shortMsg: s.nullableString("The short Docmosis response message."),
      longMsg: s.nullableString("The long Docmosis response message."),
      summary: environmentSummarySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "check_environment_ready",
    description: "Check whether the selected Docmosis environment is currently ready to service render requests.",
    inputSchema: noInputSchema,
    outputSchema: s.object("The Docmosis environment ready response.", {
      ready: s.boolean("Whether the selected Docmosis environment is ready."),
      succeeded: s.boolean("Whether Docmosis reported the request as successful."),
      shortMsg: s.nullableString("The short Docmosis response message."),
      longMsg: s.nullableString("The long Docmosis response message."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_templates",
    description:
      "List Docmosis templates available in the selected processing location with optional folder and paging controls.",
    inputSchema: s.object(
      "Input parameters for listing Docmosis templates.",
      {
        includeDetail: s.boolean("Whether to include extra template detail such as template error status."),
        folder: s.nonEmptyString("The optional starting folder path to list."),
        includeSubFolders: s.boolean("Whether template results should include templates inside sub-folders."),
        paging: s.boolean("Whether Docmosis should return paged results."),
        pageToken: s.nonEmptyString("The pagination token previously returned by Docmosis."),
        pageSize: s.integer("The page size to request when paging is enabled.", { minimum: 1, maximum: 1000 }),
      },
      { optional: ["includeDetail", "folder", "includeSubFolders", "paging", "pageToken", "pageSize"] },
    ),
    outputSchema: s.object("The Docmosis template list response.", {
      templateListStale: s.nullableBoolean("Whether Docmosis detected a temporary stale template list during updates."),
      nextPageToken: s.nullableString("The token for the next template page when available."),
      pageSize: s.nullableInteger("The effective page size returned by Docmosis."),
      templates: s.array("The templates returned by Docmosis.", templateDetailsSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_template_details",
    description: "Get the stored metadata for one uploaded Docmosis template without downloading the template file.",
    inputSchema: s.object("Input parameters for retrieving Docmosis template details.", {
      templateName: s.nonEmptyString("The template path to inspect."),
    }),
    outputSchema: s.object("The Docmosis template details response.", {
      succeeded: s.boolean("Whether Docmosis reported the request as successful."),
      shortMsg: s.nullableString("The short Docmosis response message."),
      longMsg: s.nullableString("The long Docmosis response message."),
      template: templateDetailsSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_template_structure",
    description:
      "Get the Docmosis template structure tree that describes fields, repeats, conditions, and other data references.",
    inputSchema: s.object("Input parameters for retrieving Docmosis template structure.", {
      templateName: s.nonEmptyString("The template path to inspect."),
    }),
    outputSchema: s.object("The Docmosis template structure response.", {
      templateHasErrors: s.nullableBoolean("Whether Docmosis detected template errors."),
      templateErrorMessage: s.nullableString("The first template error message when one exists."),
      templateStructure: s.array(
        "The Docmosis template structure tree returned by the API.",
        templateStructureNodeSchema,
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "render_document",
    description:
      "Render one Docmosis template with JSON data and return JSON-safe delivery metadata or an explicit base64 result file.",
    inputSchema: s.object(
      "Input parameters for rendering one Docmosis document.",
      {
        templateName: s.nonEmptyString("The Docmosis template path to render."),
        outputName: s.nonEmptyString("The output filename including the preferred extension."),
        data: s.unknown("The JSON data payload merged into the template."),
        outputFormat: s.stringEnum("The optional output format override.", ["PDF", "DOCX", "ODT", "TXT"]),
        storeTo: s.nonEmptyString(
          "The optional Docmosis delivery target such as `mailto:person@example.com` or `s3:bucket,key`.",
        ),
        tags: s.nonEmptyString("The optional semicolon-delimited tags recorded against the render."),
        requestId: s.nonEmptyString("The optional request identifier echoed by Docmosis."),
        sourceId: s.nonEmptyString("The optional source identifier associated with the render."),
        mailSubject: s.nonEmptyString("The optional email subject when using mailto delivery."),
        mailBodyHtml: s.nonEmptyString("The optional HTML email body when using mailto delivery."),
        mailBodyText: s.nonEmptyString("The optional plain-text email body when using mailto delivery."),
        devMode: s.boolean("Whether Docmosis should render in development mode instead of strict production mode."),
        returnResultFileBase64: s.boolean(
          "Whether the streamed result should be returned as base64 in the connector response.",
        ),
      },
      {
        optional: [
          "outputFormat",
          "storeTo",
          "tags",
          "requestId",
          "sourceId",
          "mailSubject",
          "mailBodyHtml",
          "mailBodyText",
          "devMode",
          "returnResultFileBase64",
        ],
      },
    ),
    outputSchema: s.object("The normalized Docmosis render response.", {
      succeeded: s.boolean("Whether Docmosis reported the render as successful."),
      shortMsg: s.nullableString("The short Docmosis render message."),
      longMsg: s.nullableString("The long Docmosis render message."),
      requestId: s.nullableString("The render request identifier when returned by Docmosis."),
      resultFileBase64: s.nullableString("The rendered document content encoded as base64 when explicitly requested."),
      queue: queueSchema,
      headers: renderHeadersSchema,
      webHookResults: s.array(
        "The webhook delivery results returned by Docmosis when mail or webhooks are involved.",
        s.looseObject("One Docmosis webhook delivery result.", {}),
      ),
    }),
  }),
];

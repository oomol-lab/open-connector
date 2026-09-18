import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "docsautomator" as const;

const trimmedNonEmptyString = (description: string) =>
  s.string(description, {
    minLength: 1,
  });

const buildAutomationSelectorSchema = (
  description: string,
  properties: Record<string, Record<string, unknown>>,
  optional: readonly string[],
) => s.object(description, properties, { optional });

const documentDataSchema = s.record(
  "Template placeholder values forwarded to DocsAutomator. Keys should match your template placeholders.",
  s.unknown("Any JSON value supported by the target template placeholder."),
);

const webhookParamsSchema = s.record(
  "Custom webhook parameters forwarded to DocsAutomator as additionalParams.",
  s.unknown("Any JSON value to attach to webhook notifications."),
);

const urlArraySchema = s.array(
  "A list of publicly accessible PDF URLs used by DocsAutomator for merge operations.",
  s.url("A publicly accessible PDF URL."),
  { minItems: 1 },
);

const signingLinkSchema = s.object("A signing link returned for one signer.", {
  signerIndex: s.nullable(s.integer("The zero-based signer index returned by DocsAutomator.")),
  email: s.nullable(s.string("The signer email returned by DocsAutomator.")),
  name: s.nullable(s.string("The signer name returned by DocsAutomator.")),
  signingUrl: s.nullable(s.url("The signer URL returned by DocsAutomator.")),
  status: s.nullable(s.string("The signer status returned by DocsAutomator.")),
});

const documentSchema = s.object("The normalized DocsAutomator document creation result.", {
  message: s.nullable(s.string("The status message returned by DocsAutomator.")),
  pdfUrl: s.nullable(s.url("The generated PDF URL when DocsAutomator returns one.")),
  documentName: s.nullable(s.string("The generated document name returned by DocsAutomator.")),
  googleDocUrl: s.nullable(s.url("The saved Google Doc URL when the automation is configured to save it.")),
  googleDrivePdfUrl: s.nullable(s.url("The saved Google Drive PDF URL when DocsAutomator returns it.")),
  googleDrivePdfFileId: s.nullable(
    s.string("The saved Google Drive PDF file identifier when DocsAutomator returns it."),
  ),
  signingSessionId: s.nullable(s.string("The e-signature session identifier when the automation creates one.")),
  signingStatus: s.nullable(s.string("The signing session status returned by DocsAutomator.")),
  signingLinks: s.array("The signing links returned by DocsAutomator for each signer.", signingLinkSchema),
  raw: s.looseObject("The raw document creation payload returned by DocsAutomator."),
});

const asyncJobHandleSchema = s.object("The DocsAutomator async job handle.", {
  message: s.nullable(s.string("The queue acknowledgement message returned by DocsAutomator.")),
  jobId: trimmedNonEmptyString("The DocsAutomator job identifier used for polling."),
  logId: s.nullable(s.string("The DocsAutomator request log identifier when returned.")),
  raw: s.looseObject("The raw async queue payload returned by DocsAutomator."),
});

const documentJobSchema = s.object("The normalized DocsAutomator document job state.", {
  jobId: trimmedNonEmptyString("The DocsAutomator job identifier."),
  status: trimmedNonEmptyString("The current job status returned by DocsAutomator."),
  progress: s.nullable(s.integer("The job progress percentage returned by DocsAutomator.")),
  createdAt: s.nullable(s.dateTime("The timestamp when the job was created.")),
  processedOn: s.nullable(s.dateTime("The timestamp when the job started processing.")),
  finishedOn: s.nullable(s.dateTime("The timestamp when the job finished processing.")),
  attempts: s.nullable(s.integer("The number of processing attempts reported by DocsAutomator.")),
  error: s.nullable(s.string("The job error string when DocsAutomator reports a failure.")),
  raw: s.looseObject("The raw job payload returned by DocsAutomator."),
});

const queueStatsSchema = s.object("The DocsAutomator workspace queue statistics.", {
  waiting: s.integer("The number of queued jobs waiting to be processed."),
  active: s.integer("The number of jobs currently being processed."),
  completed: s.integer("The number of completed jobs reported by DocsAutomator."),
  failed: s.integer("The number of failed jobs reported by DocsAutomator."),
  delayed: s.integer("The number of delayed jobs reported by DocsAutomator."),
  raw: s.looseObject("The raw queue statistics payload returned by DocsAutomator."),
});

const automationSchema = s.object("A normalized DocsAutomator automation summary.", {
  id: trimmedNonEmptyString("The automation identifier returned by DocsAutomator."),
  title: s.nullable(s.string("The automation title returned by DocsAutomator.")),
  dataSourceName: s.nullable(s.string("The automation data source name returned by DocsAutomator.")),
  dataSource: s.nullable(s.looseObject("The raw automation data source object returned by DocsAutomator.")),
  docTemplateLink: s.nullable(s.url("The Google Doc template URL configured on the automation.")),
  newDocumentNameField: s.nullable(s.string("The document naming field configured on the automation.")),
  isActive: s.nullable(s.boolean("Whether the automation is active.")),
  saveGoogleDoc: s.nullable(s.boolean("Whether the automation saves a Google Doc copy when generating documents.")),
  locale: s.nullable(s.string("The locale configured on the automation.")),
  formatNumbersWithLocale: s.nullable(s.boolean("Whether DocsAutomator formats numbers using the automation locale.")),
  pdfExpiration: s.nullable(s.string("The PDF expiration setting configured on the automation.")),
  dateCreated: s.nullable(s.dateTime("The automation creation timestamp.")),
  lastPreviewPdf: s.nullable(s.url("The last preview PDF URL when DocsAutomator returns one.")),
  raw: s.looseObject("The raw automation object returned by DocsAutomator."),
});

const placeholdersSchema = s.record(
  "The DocsAutomator placeholder groups keyed by main or line item group names.",
  s.array("The placeholder names found for one group.", s.string("A placeholder name.")),
);

const createDocumentSharedFields = {
  automationId: trimmedNonEmptyString("The DocsAutomator automation ID to execute."),
  docId: trimmedNonEmptyString("Alias for automationId accepted by DocsAutomator."),
  data: documentDataSchema,
  documentName: s.string("An optional output document name override.", {
    minLength: 1,
  }),
  webhookParams: webhookParamsSchema,
  existingPdfs: urlArraySchema,
  docTemplateLink: s.url("An optional Google Doc template URL override used for this request only."),
} as const;

const createDocumentInputSchema = buildAutomationSelectorSchema(
  "The request fields used to create a DocsAutomator document synchronously.",
  createDocumentSharedFields,
  ["automationId", "docId", "data", "documentName", "webhookParams", "existingPdfs", "docTemplateLink"],
);

const createDocumentAsyncInputSchema = buildAutomationSelectorSchema(
  "The request fields used to create a DocsAutomator document asynchronously.",
  createDocumentSharedFields,
  ["automationId", "docId", "data", "documentName", "webhookParams", "existingPdfs", "docTemplateLink"],
);

const automationIdInputSchema = buildAutomationSelectorSchema(
  "The automation selector accepted by DocsAutomator endpoints that support automationId or docId.",
  {
    automationId: trimmedNonEmptyString("The DocsAutomator automation ID to target for this request."),
    docId: trimmedNonEmptyString("Alias for automationId accepted by the DocsAutomator API."),
  },
  ["automationId", "docId"],
);

export type DocsautomatorActionName =
  | "create_document"
  | "create_document_async"
  | "get_document_job"
  | "get_queue_stats"
  | "list_automations"
  | "get_automation"
  | "list_template_placeholders";

export const docsautomatorActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_document",
    operationType: "write",
    description:
      "Generate one DocsAutomator document synchronously and return the resulting file URLs plus signing metadata when available.",
    requiredScopes: [],
    inputSchema: createDocumentInputSchema,
    outputSchema: s.object("The response returned by synchronous DocsAutomator document creation.", {
      document: documentSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_document_async",
    operationType: "write",
    description: "Queue one DocsAutomator document generation job and return the job handle for later polling.",
    requiredScopes: [],
    followUpActions: ["docsautomator.get_document_job"],
    asyncLifecycle: {
      startActionId: "docsautomator.create_document_async",
      statusActionId: "docsautomator.get_document_job",
    },
    inputSchema: createDocumentAsyncInputSchema,
    outputSchema: s.object("The queued DocsAutomator document job response.", {
      job: asyncJobHandleSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_document_job",
    operationType: "read",
    description:
      "Get the current status of a DocsAutomator async document generation job and return the finished document result when available.",
    requiredScopes: [],
    asyncLifecycle: {
      startActionId: "docsautomator.create_document_async",
      statusActionId: "docsautomator.get_document_job",
    },
    inputSchema: s.object("The input payload for retrieving one DocsAutomator job.", {
      jobId: trimmedNonEmptyString("The DocsAutomator job identifier returned by create_document_async."),
    }),
    outputSchema: s.object("The DocsAutomator job status response.", {
      job: documentJobSchema,
      document: s.nullable(documentSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_queue_stats",
    operationType: "read",
    description: "Return current DocsAutomator queue statistics for the connected workspace.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving DocsAutomator queue statistics.", {}),
    outputSchema: s.object("The DocsAutomator queue statistics response.", {
      queue: queueStatsSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_automations",
    operationType: "read",
    description:
      "List DocsAutomator automations in the current workspace with the core fields needed for document generation setup.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing DocsAutomator automations.", {}),
    outputSchema: s.object("The DocsAutomator automation list response.", {
      automations: s.array("The automations returned by DocsAutomator.", automationSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_automation",
    operationType: "read",
    description:
      "Get one DocsAutomator automation by automationId or docId and return its current generation-related settings.",
    requiredScopes: [],
    inputSchema: automationIdInputSchema,
    outputSchema: s.object("The DocsAutomator automation detail response.", {
      automation: automationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_template_placeholders",
    operationType: "read",
    description: "List the placeholder groups extracted from a DocsAutomator Google Doc template for one automation.",
    requiredScopes: [],
    inputSchema: automationIdInputSchema,
    outputSchema: s.object("The DocsAutomator placeholder extraction response.", {
      placeholders: placeholdersSchema,
    }),
  }),
];

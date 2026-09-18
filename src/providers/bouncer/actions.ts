import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "bouncer";

const triStateSchema = s.stringEnum("A tri-state value returned by Bouncer.", ["yes", "no", "unknown"]);
const emailSchema = s.email("The email address to verify with Bouncer.");
const emailListSchema = s.array("The email addresses to verify with Bouncer.", emailSchema, { minItems: 1 });
const domainNameSchema = s.nonEmptyString("The domain name to verify with Bouncer.");
const batchIdSchema = s.nonEmptyString("The batch identifier returned by Bouncer.");

const dnsSchema = s.object(
  "The DNS details returned by Bouncer.",
  {
    type: s.string("The DNS record type returned by Bouncer."),
    record: s.string("The DNS record value returned by Bouncer."),
  },
  { required: ["type"] },
);

const domainInfoSchema = s.object(
  "The domain details returned by Bouncer.",
  {
    name: s.string("The domain name returned by Bouncer."),
    acceptAll: triStateSchema,
    disposable: triStateSchema,
    free: triStateSchema,
  },
  { required: ["name", "acceptAll", "disposable", "free"] },
);

const accountInfoSchema = s.object(
  "The mailbox details returned by Bouncer.",
  {
    role: triStateSchema,
    disabled: triStateSchema,
    fullMailbox: triStateSchema,
  },
  { required: ["role", "disabled", "fullMailbox"] },
);

const verifyStatusSchema = s.stringEnum("The verification status returned by Bouncer.", [
  "deliverable",
  "risky",
  "undeliverable",
  "unknown",
]);
const batchDownloadSchema = s.stringEnum("The batch download filter supported by Bouncer.", [
  "all",
  "deliverable",
  "risky",
  "undeliverable",
  "unknown",
]);

const getCreditsInputSchema = s.object("Input payload for retrieving the current Bouncer credit balance.", {});
const getCreditsOutputSchema = s.object(
  "The Bouncer credit balance response.",
  {
    credits: s.nonNegativeInteger("The available credits returned by Bouncer."),
  },
  { required: ["credits"] },
);

const verifyEmailInputSchema = s.object(
  "Input payload for verifying a single email address with Bouncer.",
  {
    email: emailSchema,
  },
  { required: ["email"] },
);

const verifyEmailOutputSchema = s.object(
  "The single-email verification result returned by Bouncer.",
  {
    email: s.email("The normalized email address returned by Bouncer."),
    status: verifyStatusSchema,
    reason: s.string("The provider reason returned by Bouncer."),
    score: s.integer("The Bouncer quality score from 0 to 100.", { minimum: 0, maximum: 100 }),
    toxic: triStateSchema,
    domain: domainInfoSchema,
    account: accountInfoSchema,
    dns: dnsSchema,
    provider: s.string("The provider name returned by Bouncer."),
    toxicity: s.integer("The Bouncer toxicity score from 0 to 5.", { minimum: 0, maximum: 5 }),
  },
  {
    required: ["email", "status", "reason", "score", "toxic"],
    optional: ["domain", "account", "dns", "provider", "toxicity"],
  },
);

const verifyDomainInputSchema = s.object(
  "Input payload for verifying a domain with Bouncer.",
  {
    domain: domainNameSchema,
  },
  { required: ["domain"] },
);

const verifyDomainOutputSchema = s.object(
  "The domain verification result returned by Bouncer.",
  {
    domain: domainInfoSchema,
    dns: dnsSchema,
    provider: s.string("The provider name returned by Bouncer."),
    toxic: triStateSchema,
  },
  { required: ["domain", "dns", "provider", "toxic"] },
);

const verifyEmailsBatchSyncInputSchema = s.object(
  "Input payload for verifying multiple email addresses with Bouncer batch sync.",
  {
    emails: emailListSchema,
  },
  { required: ["emails"] },
);

const verifyEmailsBatchSyncOutputSchema = s.object(
  "The batch sync verification results returned by Bouncer.",
  {
    results: s.array("The email verification results returned by Bouncer batch sync.", verifyEmailOutputSchema),
  },
  { required: ["results"] },
);

const createBatchRequestInputSchema = s.object(
  "Input payload for creating a Bouncer async batch verification request.",
  {
    emails: emailListSchema,
    callbackUrl: s.url("The callback URL Bouncer should notify after batch processing completes."),
  },
  { required: ["emails"] },
);

const createBatchRequestOutputSchema = s.object(
  "The normalized response returned after creating a Bouncer batch verification request.",
  {
    batchId: batchIdSchema,
    created: s.boolean("Whether the Bouncer batch request was accepted."),
  },
  { required: ["batchId", "created"] },
);

const batchStatsSchema = s.object(
  "The batch verification counters returned by Bouncer.",
  {
    deliverable: s.nonNegativeInteger("The number of deliverable email addresses reported by Bouncer."),
    risky: s.nonNegativeInteger("The number of risky email addresses reported by Bouncer."),
    undeliverable: s.nonNegativeInteger("The number of undeliverable email addresses reported by Bouncer."),
    unknown: s.nonNegativeInteger("The number of unknown email addresses reported by Bouncer."),
  },
  { required: ["deliverable", "risky", "undeliverable", "unknown"] },
);

const toxicityListResultSchema = s.object(
  "A toxicity list result row returned by Bouncer.",
  {
    email: s.email("The email address returned by Bouncer toxicity list results."),
    toxicity: s.nonNegativeInteger("The toxicity score returned by Bouncer for the email address."),
  },
  { required: ["email", "toxicity"] },
);

const getBatchStatusInputSchema = s.object(
  "Input payload for retrieving the status of a Bouncer batch verification request.",
  {
    batchId: batchIdSchema,
    includeStats: s.boolean("Whether Bouncer should include batch statistics in the status response."),
  },
  { required: ["batchId"] },
);

const getBatchStatusOutputSchema = s.object(
  "The normalized status response returned by Bouncer for a batch verification request.",
  {
    batchId: batchIdSchema,
    status: s.string("The current batch status returned by Bouncer."),
    processed: s.nonNegativeInteger("The number of processed email addresses reported by Bouncer."),
    credits: s.nonNegativeInteger("The number of credits consumed by the batch as reported by Bouncer."),
    stats: batchStatsSchema,
  },
  { required: ["batchId", "status"], optional: ["processed", "credits", "stats"] },
);

const finishBatchInputSchema = s.object(
  "Input payload for finishing a Bouncer batch verification request.",
  {
    batchId: batchIdSchema,
  },
  { required: ["batchId"] },
);

const finishBatchOutputSchema = s.object(
  "The normalized response returned after finishing a Bouncer batch verification request.",
  {
    batchId: batchIdSchema,
    finishRequested: s.literal(true, { description: "Whether the batch finish request was accepted by Bouncer." }),
  },
  { required: ["batchId", "finishRequested"] },
);

const getBatchResultsInputSchema = s.object(
  "Input payload for downloading Bouncer batch verification results.",
  {
    batchId: batchIdSchema,
    download: batchDownloadSchema,
  },
  { required: ["batchId"] },
);

const getBatchResultsOutputSchema = s.object(
  "The normalized batch verification results returned by Bouncer.",
  {
    batchId: batchIdSchema,
    download: batchDownloadSchema,
    results: s.array("The email verification results returned by Bouncer batch download.", verifyEmailOutputSchema),
  },
  { required: ["batchId", "download", "results"] },
);

const deleteBatchRequestInputSchema = s.object(
  "Input payload for deleting a Bouncer batch verification request.",
  {
    batchId: batchIdSchema,
  },
  { required: ["batchId"] },
);

const deleteBatchRequestOutputSchema = s.object(
  "The normalized response returned after deleting a Bouncer batch verification request.",
  {
    batchId: batchIdSchema,
    deleted: s.literal(true, { description: "Whether the Bouncer batch verification request was deleted." }),
  },
  { required: ["batchId", "deleted"] },
);

const toxicityJobIdSchema = s.nonEmptyString("The toxicity list job identifier returned by Bouncer.");
const createToxicityListJobInputSchema = s.object(
  "Input payload for creating a Bouncer toxicity list job.",
  {
    emails: emailListSchema,
  },
  { required: ["emails"] },
);

const createToxicityListJobOutputSchema = s.object(
  "The normalized response returned after creating a Bouncer toxicity list job.",
  {
    id: toxicityJobIdSchema,
    status: s.string("The toxicity list job status returned by Bouncer."),
  },
  { required: ["id", "status"] },
);

const getToxicityListJobStatusInputSchema = s.object(
  "Input payload for retrieving the status of a Bouncer toxicity list job.",
  {
    id: toxicityJobIdSchema,
  },
  { required: ["id"] },
);

const getToxicityListJobStatusOutputSchema = s.object(
  "The normalized response returned by Bouncer for a toxicity list job status request.",
  {
    id: toxicityJobIdSchema,
    status: s.string("The toxicity list job status returned by Bouncer."),
    processed: s.nonNegativeInteger("The number of processed emails reported by Bouncer for the toxicity list job."),
  },
  { required: ["id", "status"], optional: ["processed"] },
);

const getToxicityListResultsInputSchema = s.object(
  "Input payload for downloading Bouncer toxicity list results.",
  {
    id: toxicityJobIdSchema,
  },
  { required: ["id"] },
);

const getToxicityListResultsOutputSchema = s.object(
  "The normalized toxicity list results returned by Bouncer.",
  {
    id: toxicityJobIdSchema,
    results: s.array("The toxicity list rows returned by Bouncer.", toxicityListResultSchema),
  },
  { required: ["id", "results"] },
);

const deleteToxicityListJobInputSchema = s.object(
  "Input payload for deleting a Bouncer toxicity list job.",
  {
    id: toxicityJobIdSchema,
  },
  { required: ["id"] },
);

const deleteToxicityListJobOutputSchema = s.object(
  "The normalized response returned after deleting a Bouncer toxicity list job.",
  {
    id: toxicityJobIdSchema,
    deleted: s.literal(true, { description: "Whether the Bouncer toxicity list job was deleted." }),
  },
  { required: ["id", "deleted"] },
);

export const bouncerActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_credits",
    operationType: "read",
    description: "Get the current Bouncer credit balance.",
    inputSchema: getCreditsInputSchema,
    outputSchema: getCreditsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "verify_email",
    operationType: "read",
    description: "Verify a single email address with Bouncer in real time.",
    inputSchema: verifyEmailInputSchema,
    outputSchema: verifyEmailOutputSchema,
  }),
  defineProviderAction(service, {
    name: "verify_domain",
    operationType: "read",
    description: "Verify one domain with Bouncer and inspect its DNS and catch-all signals.",
    inputSchema: verifyDomainInputSchema,
    outputSchema: verifyDomainOutputSchema,
  }),
  defineProviderAction(service, {
    name: "verify_emails_batch_sync",
    operationType: "read",
    description: "Verify multiple email addresses with Bouncer batch sync in a single request.",
    inputSchema: verifyEmailsBatchSyncInputSchema,
    outputSchema: verifyEmailsBatchSyncOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_batch_request",
    operationType: "write",
    description: "Create an async Bouncer batch verification request for multiple email addresses.",
    inputSchema: createBatchRequestInputSchema,
    outputSchema: createBatchRequestOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_batch_status",
    operationType: "read",
    description: "Get the current processing status of a Bouncer batch verification request.",
    inputSchema: getBatchStatusInputSchema,
    outputSchema: getBatchStatusOutputSchema,
  }),
  defineProviderAction(service, {
    name: "finish_batch",
    operationType: "write",
    description: "Request early completion for a Bouncer batch verification request.",
    inputSchema: finishBatchInputSchema,
    outputSchema: finishBatchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_batch_results",
    operationType: "read",
    description: "Download normalized results from a completed Bouncer batch verification request.",
    inputSchema: getBatchResultsInputSchema,
    outputSchema: getBatchResultsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_batch_request",
    operationType: "destructive",
    description: "Delete a Bouncer batch verification request and its stored results.",
    inputSchema: deleteBatchRequestInputSchema,
    outputSchema: deleteBatchRequestOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_toxicity_list_job",
    operationType: "write",
    description: "Create a Bouncer toxicity list job for multiple email addresses.",
    inputSchema: createToxicityListJobInputSchema,
    outputSchema: createToxicityListJobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_toxicity_list_job_status",
    operationType: "read",
    description: "Get the current processing status of a Bouncer toxicity list job.",
    inputSchema: getToxicityListJobStatusInputSchema,
    outputSchema: getToxicityListJobStatusOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_toxicity_list_results",
    operationType: "read",
    description: "Download normalized results from a completed Bouncer toxicity list job.",
    inputSchema: getToxicityListResultsInputSchema,
    outputSchema: getToxicityListResultsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_toxicity_list_job",
    operationType: "destructive",
    description: "Delete a Bouncer toxicity list job and its stored results.",
    inputSchema: deleteToxicityListJobInputSchema,
    outputSchema: deleteToxicityListJobOutputSchema,
  }),
];

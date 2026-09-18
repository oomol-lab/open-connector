import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "sanity";
const datasetSchema = s.nonEmptyString("Sanity dataset name.");
const documentSchema = s.looseRequiredObject(
  "A Sanity document with its system fields and schema-defined content.",
  {},
);
const mutationSchema = s.looseRequiredObject(
  "A Sanity create, createOrReplace, createIfNotExists, delete, or patch mutation.",
  {},
);

export const sanityActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "query_documents",
    operationType: "read",
    description: "Run a GROQ query against a Sanity Content Lake dataset.",
    inputSchema: s.object(
      "A GROQ query and optional parameters for a Sanity dataset.",
      {
        dataset: datasetSchema,
        query: s.nonEmptyString("GROQ query to execute."),
        params: s.record(
          "Named GROQ parameters without the leading dollar sign.",
          s.unknown("A JSON-compatible GROQ parameter value."),
        ),
        perspective: s.string("Query perspective, such as published, drafts, raw, or a release stack."),
        tag: s.string("Request tag used in Sanity Content Lake request logs."),
        resultSourceMap: s.boolean("Whether to include content source map metadata."),
        returnQuery: s.boolean("Whether the response should include the submitted query."),
      },
      { optional: ["params", "perspective", "tag", "resultSourceMap", "returnQuery"] },
    ),
    outputSchema: s.looseRequiredObject(
      "The Sanity query response, including its JSON result.",
      {
        result: s.unknown("The JSON value produced by the GROQ query."),
        ms: s.number("Server-side query processing time in milliseconds."),
        query: s.string("The submitted GROQ query when returned by Sanity."),
        syncTags: s.array("Synchronization tags associated with the query result.", s.string("A synchronization tag.")),
      },
      { optional: ["ms", "query", "syncTags"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_documents",
    operationType: "read",
    description: "Retrieve the latest Sanity documents by ID while bypassing the query cache.",
    inputSchema: s.object(
      "Dataset and document identifiers for a direct Sanity document read.",
      {
        dataset: datasetSchema,
        documentIds: s.array(
          "One or more Sanity document identifiers to retrieve.",
          s.nonEmptyString("Sanity document identifier."),
          { minItems: 1 },
        ),
        includeAllVersions: s.boolean(
          "Whether to include drafts and release versions matching published document IDs.",
        ),
      },
      { optional: ["includeAllVersions"] },
    ),
    outputSchema: s.requiredObject("Documents returned by the direct Sanity document endpoint.", {
      documents: s.array("Matching Sanity documents.", documentSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "mutate_documents",
    operationType: "destructive",
    description: "Execute an atomic transaction of Sanity document mutations.",
    inputSchema: s.object(
      "A Sanity dataset, mutation transaction, and response options.",
      {
        dataset: datasetSchema,
        mutations: s.array("Ordered mutations in the atomic transaction.", mutationSchema, {
          minItems: 1,
        }),
        returnIds: s.boolean("Whether to return identifiers of modified documents."),
        returnDocuments: s.boolean("Whether to return the changed documents."),
        autoGenerateArrayKeys: s.boolean("Whether Sanity should add unique _key values to array items."),
        transactionId: s.nonEmptyString("Caller-supplied transaction identifier."),
        skipCrossDatasetReferencesValidation: s.boolean(
          "Whether to treat cross-dataset references as weak during validation.",
        ),
        visibility: s.stringEnum("When committed mutations become visible to queries.", ["sync", "async", "deferred"]),
        dryRun: s.boolean("Whether to validate the transaction without committing it."),
        tag: s.string("Request tag used in Sanity Content Lake request logs."),
      },
      {
        optional: [
          "returnIds",
          "returnDocuments",
          "autoGenerateArrayKeys",
          "transactionId",
          "skipCrossDatasetReferencesValidation",
          "visibility",
          "dryRun",
          "tag",
        ],
      },
    ),
    outputSchema: s.looseRequiredObject("The committed Sanity mutation transaction response.", {
      transactionId: s.string("Unique identifier of the mutation transaction."),
      results: s.array(
        "Mutation results in transaction order.",
        s.looseRequiredObject("A Sanity mutation result.", {
          operation: s.string("Mutation operation performed."),
          documentId: s.string("Identifier of the affected document."),
        }),
      ),
    }),
  }),
];

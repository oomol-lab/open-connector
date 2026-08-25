import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "contentstack_content_management";

const branchSchema = s.nonEmptyString("The optional Contentstack branch UID passed with the branch request header.");
const contentTypeUidSchema = s.nonEmptyString("The Contentstack content type UID identifying the entry collection.");
const entryUidSchema = s.nonEmptyString("The Contentstack entry UID identifying one entry.");
const localeSchema = s.nonEmptyString("The optional Contentstack locale code.");
const querySchema = s.looseObject("A Contentstack query object serialized into the query URL parameter.");
const limitSchema = s.integer("The maximum number of items to return. Contentstack returns at most 100 items.", {
  minimum: 1,
  maximum: 100,
});
const skipSchema = s.integer("The number of items to skip for pagination.", { minimum: 0 });
const includeCountSchema = s.boolean("Whether Contentstack should include the total item count.");
const includeBranchSchema = s.boolean("Whether Contentstack should include the _branch field.");
const includeGlobalFieldSchema = s.boolean(
  "Whether Contentstack should include global field schemas in content type responses.",
);
const entrySchema = s.looseObject("The Contentstack entry object.");
const contentTypeSchema = s.looseObject("The Contentstack content type object.");
const looseRecordSchema = s.looseObject("The raw Contentstack JSON object.");

export const contentstackContentManagementActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_content_types",
    description: "List content types available in a Contentstack stack.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing Contentstack content types through the Content Management API.",
      {
        branch: branchSchema,
        query: querySchema,
        limit: limitSchema,
        skip: skipSchema,
        includeCount: includeCountSchema,
        includeBranch: includeBranchSchema,
        includeGlobalFieldSchema,
      },
      { optional: ["branch", "query", "limit", "skip", "includeCount", "includeBranch", "includeGlobalFieldSchema"] },
    ),
    outputSchema: s.object("Contentstack content types response.", {
      contentTypes: s.array("Contentstack content type objects.", contentTypeSchema),
      count: s.nullable(s.integer("The total content type count when included by Contentstack.")),
      raw: looseRecordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_content_type",
    description: "Retrieve one Contentstack content type schema by UID.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for retrieving one Contentstack content type through the Content Management API.",
      {
        contentTypeUid: contentTypeUidSchema,
        branch: branchSchema,
        includeBranch: includeBranchSchema,
        includeGlobalFieldSchema,
      },
      { optional: ["branch", "includeBranch", "includeGlobalFieldSchema"] },
    ),
    outputSchema: s.object("Contentstack content type response.", {
      contentType: contentTypeSchema,
      raw: looseRecordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_entries",
    description: "List Contentstack entries for a content type.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing Contentstack entries of one content type.",
      {
        contentTypeUid: contentTypeUidSchema,
        branch: branchSchema,
        locale: localeSchema,
        query: querySchema,
        limit: limitSchema,
        skip: skipSchema,
        includeCount: includeCountSchema,
        includeBranch: includeBranchSchema,
      },
      { optional: ["branch", "locale", "query", "limit", "skip", "includeCount", "includeBranch"] },
    ),
    outputSchema: s.object("Contentstack entries response.", {
      entries: s.array("Contentstack entry objects.", entrySchema),
      count: s.nullable(s.integer("The total entry count when included by Contentstack.")),
      raw: looseRecordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_entry",
    description: "Retrieve one Contentstack entry for a content type.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for retrieving one Contentstack entry.",
      {
        contentTypeUid: contentTypeUidSchema,
        entryUid: entryUidSchema,
        branch: branchSchema,
        locale: localeSchema,
        includeBranch: includeBranchSchema,
      },
      { optional: ["branch", "locale", "includeBranch"] },
    ),
    outputSchema: s.object("Contentstack entry response.", {
      entry: entrySchema,
      raw: looseRecordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_entry",
    description: "Create one Contentstack entry for a content type.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for creating one Contentstack entry.",
      {
        contentTypeUid: contentTypeUidSchema,
        entry: entrySchema,
        branch: branchSchema,
        locale: localeSchema,
      },
      { optional: ["branch", "locale"] },
    ),
    outputSchema: s.object("Contentstack entry response.", {
      entry: entrySchema,
      raw: looseRecordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_entry",
    description: "Update one Contentstack entry for a content type.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for updating one Contentstack entry.",
      {
        contentTypeUid: contentTypeUidSchema,
        entryUid: entryUidSchema,
        entry: entrySchema,
        branch: branchSchema,
        locale: localeSchema,
      },
      { optional: ["branch", "locale"] },
    ),
    outputSchema: s.object("Contentstack entry response.", {
      entry: entrySchema,
      raw: looseRecordSchema,
    }),
  }),
];

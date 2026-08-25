import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "contentstack_content_delivery";

const environmentSchema = s.nonEmptyString("The Contentstack publishing environment to read published content from.");
const branchSchema = s.nonEmptyString("The optional Contentstack branch UID passed with the branch request header.");
const localeSchema = s.nonEmptyString("The optional Contentstack locale code for localized content.");
const uidSchema = s.nonEmptyString("The Contentstack UID identifying the requested resource.");
const querySchema = s.looseObject("A Contentstack query object serialized into the query URL parameter.");
const limitSchema = s.integer("The maximum number of items to return. Contentstack returns at most 100 items.", {
  minimum: 1,
  maximum: 100,
});
const skipSchema = s.integer("The number of items to skip for pagination.", { minimum: 0 });
const includeCountSchema = s.boolean("Whether Contentstack should include the total item count.");
const includeBranchSchema = s.boolean("Whether Contentstack should include the _branch field.");
const includeMetadataSchema = s.boolean("Whether Contentstack should include extension metadata.");
const includePublishDetailsSchema = s.boolean(
  "Whether Contentstack should include publish details in entry responses.",
);
const includeFallbackSchema = s.boolean(
  "Whether Contentstack should return fallback locale content when localized content is missing.",
);
const includeDimensionSchema = s.boolean(
  "Whether Contentstack should include image dimension details in asset responses.",
);
const includeGlobalFieldSchema = s.boolean(
  "Whether Contentstack should include global field schemas in content type responses.",
);
const fieldListSchema = s.array(
  "Contentstack field UIDs to include or exclude in the response.",
  s.nonEmptyString("A Contentstack field UID."),
  {
    minItems: 1,
  },
);
const orderFieldSchema = s.nonEmptyString("A Contentstack field UID used to sort the returned items.");
const looseRecordSchema = s.looseObject("The raw Contentstack JSON object.");

export const contentstackContentDeliveryActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_content_types",
    description: "List content types available in a Contentstack stack.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing Contentstack content types.",
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
      contentTypes: s.array("Contentstack content type objects.", looseRecordSchema),
      count: s.nullable(s.integer("The total content type count when included by Contentstack.")),
      raw: looseRecordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_content_type",
    description: "Retrieve one Contentstack content type schema by UID.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for retrieving one Contentstack content type.",
      {
        contentTypeUid: uidSchema,
        branch: branchSchema,
        includeBranch: includeBranchSchema,
        includeGlobalFieldSchema,
      },
      { optional: ["branch", "includeBranch", "includeGlobalFieldSchema"] },
    ),
    outputSchema: s.object("Contentstack content type response.", {
      contentType: looseRecordSchema,
      raw: looseRecordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_entries",
    description: "List published Contentstack entries for a content type.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing Contentstack entries of one content type.",
      {
        contentTypeUid: uidSchema,
        environment: environmentSchema,
        branch: branchSchema,
        locale: localeSchema,
        query: querySchema,
        limit: limitSchema,
        skip: skipSchema,
        includeCount: includeCountSchema,
        includeMetadata: includeMetadataSchema,
        includePublishDetails: includePublishDetailsSchema,
        includeFallback: includeFallbackSchema,
        includeBranch: includeBranchSchema,
        includeFields: fieldListSchema,
        excludeFields: fieldListSchema,
        asc: orderFieldSchema,
        desc: orderFieldSchema,
      },
      {
        optional: [
          "branch",
          "locale",
          "query",
          "limit",
          "skip",
          "includeCount",
          "includeMetadata",
          "includePublishDetails",
          "includeFallback",
          "includeBranch",
          "includeFields",
          "excludeFields",
          "asc",
          "desc",
        ],
      },
    ),
    outputSchema: s.object("Contentstack entries response.", {
      entries: s.array("Contentstack entry objects.", looseRecordSchema),
      count: s.nullable(s.integer("The total entry count when included by Contentstack.")),
      raw: looseRecordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_entry",
    description: "Retrieve one published Contentstack entry for a content type.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for retrieving one Contentstack entry.",
      {
        contentTypeUid: uidSchema,
        entryUid: uidSchema,
        environment: environmentSchema,
        branch: branchSchema,
        locale: localeSchema,
        query: querySchema,
        includeMetadata: includeMetadataSchema,
        includePublishDetails: includePublishDetailsSchema,
        includeFallback: includeFallbackSchema,
        includeBranch: includeBranchSchema,
        includeFields: fieldListSchema,
        excludeFields: fieldListSchema,
      },
      {
        optional: [
          "branch",
          "locale",
          "query",
          "includeMetadata",
          "includePublishDetails",
          "includeFallback",
          "includeBranch",
          "includeFields",
          "excludeFields",
        ],
      },
    ),
    outputSchema: s.object("Contentstack entry response.", {
      entry: looseRecordSchema,
      raw: looseRecordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_assets",
    description: "List published Contentstack assets in a stack.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing Contentstack assets.",
      {
        environment: environmentSchema,
        branch: branchSchema,
        locale: localeSchema,
        query: querySchema,
        limit: limitSchema,
        skip: skipSchema,
        includeCount: includeCountSchema,
        includeMetadata: includeMetadataSchema,
        includeFallback: includeFallbackSchema,
        includeBranch: includeBranchSchema,
        includeDimension: includeDimensionSchema,
        asc: orderFieldSchema,
        desc: orderFieldSchema,
      },
      {
        optional: [
          "branch",
          "locale",
          "query",
          "limit",
          "skip",
          "includeCount",
          "includeMetadata",
          "includeFallback",
          "includeBranch",
          "includeDimension",
          "asc",
          "desc",
        ],
      },
    ),
    outputSchema: s.object("Contentstack assets response.", {
      assets: s.array("Contentstack asset objects.", looseRecordSchema),
      count: s.nullable(s.integer("The total asset count when included by Contentstack.")),
      raw: looseRecordSchema,
    }),
  }),
];

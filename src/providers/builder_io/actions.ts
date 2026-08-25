import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "builder_io";

const builderObjectSchema = s.looseObject("A Builder.io object with provider-defined fields.");
const builderDataObjectSchema = s.looseObject("The Builder.io content data object.");
const queryObjectSchema = s.looseObject(
  "A MongoDB-style Builder.io query object. Use Builder.io field names and operators.",
);
const sortObjectSchema = s.looseObject("A Builder.io sort object, such as { createdDate: -1 } or { name: 1 }.");

const contentSchema = s.object(
  "A normalized Builder.io content entry.",
  {
    id: s.string("The Builder.io content ID."),
    name: s.nullableString("The Builder.io content name, when returned."),
    modelId: s.nullableString("The Builder.io model ID, when returned."),
    published: s.nullableString("The Builder.io published state, when returned."),
    data: builderDataObjectSchema,
    raw: builderObjectSchema,
  },
  {
    required: ["id", "data", "raw"],
    additionalProperties: true,
  },
);

export const builderIoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_content",
    description: "List Builder.io content entries for a model using the Content API.",
    inputSchema: s.object(
      "Filters and pagination controls for listing Builder.io content.",
      {
        model: s.nonEmptyString("The Builder.io model name, such as `page` or `announcement-bar`."),
        publicKey: s.nonEmptyString(
          "The Builder.io public API key for Content API reads. If omitted, the connected private key is used.",
        ),
        query: queryObjectSchema,
        userAttributes: s.looseObject("User attributes used by Builder.io targeting when resolving content."),
        options: s.looseObject("Additional Builder.io Content API options."),
        limit: s.integer({
          minimum: 1,
          maximum: 100,
          description: "The maximum number of content entries to return.",
        }),
        offset: s.nonNegativeInteger("The number of entries to skip."),
        includeRefs: s.boolean("Whether Builder.io should include referenced content."),
        noTargeting: s.boolean("Whether to bypass Builder.io targeting rules."),
        sort: sortObjectSchema,
      },
      {
        required: ["model"],
      },
    ),
    outputSchema: s.object(
      "A Builder.io content list result.",
      {
        results: s.array("The content entries returned by Builder.io.", contentSchema),
        count: s.integer("The number of content entries returned in this response."),
        raw: builderObjectSchema,
      },
      {
        required: ["results", "count", "raw"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_content",
    description: "Fetch a single Builder.io content entry by model and content ID.",
    inputSchema: s.object(
      "Input for fetching a single Builder.io content entry.",
      {
        model: s.nonEmptyString("The Builder.io model name, such as `page` or `announcement-bar`."),
        id: s.nonEmptyString("The Builder.io content ID."),
        publicKey: s.nonEmptyString(
          "The Builder.io public API key for Content API reads. If omitted, the connected private key is used.",
        ),
        userAttributes: s.looseObject("User attributes used by Builder.io targeting when resolving content."),
        options: s.looseObject("Additional Builder.io Content API options."),
        includeRefs: s.boolean("Whether Builder.io should include referenced content."),
        noTargeting: s.boolean("Whether to bypass Builder.io targeting rules."),
      },
      {
        required: ["model", "id"],
      },
    ),
    outputSchema: s.object(
      "A Builder.io content entry result.",
      {
        content: contentSchema,
      },
      {
        required: ["content"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "create_content",
    description: "Create a Builder.io content entry for a model using the Write API.",
    inputSchema: s.object(
      "Input for creating a Builder.io content entry through the Write API.",
      {
        model: s.nonEmptyString("The Builder.io model name to create content under."),
        name: s.nonEmptyString("The human-readable Builder.io content name."),
        data: builderDataObjectSchema,
        published: s.string("The Builder.io published state to set on the content."),
        query: queryObjectSchema,
      },
      {
        required: ["model", "name", "data"],
      },
    ),
    outputSchema: s.object(
      "A Builder.io content entry result.",
      {
        content: contentSchema,
      },
      {
        required: ["content"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "update_content",
    description: "Update a Builder.io content entry by model and content ID using the Write API.",
    inputSchema: s.object(
      "Input for updating a Builder.io content entry through the Write API.",
      {
        model: s.nonEmptyString("The Builder.io model name that owns the content entry."),
        id: s.nonEmptyString("The Builder.io content ID to update."),
        name: s.nonEmptyString("The updated human-readable Builder.io content name."),
        data: builderDataObjectSchema,
        published: s.string("The updated Builder.io published state."),
        query: queryObjectSchema,
      },
      {
        required: ["model", "id"],
      },
    ),
    outputSchema: s.object(
      "A Builder.io content entry result.",
      {
        content: contentSchema,
      },
      {
        required: ["content"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "delete_content",
    description: "Delete a Builder.io content entry by model and content ID using the Write API.",
    inputSchema: s.object(
      "Input for deleting a Builder.io content entry.",
      {
        model: s.nonEmptyString("The Builder.io model name that owns the content entry."),
        id: s.nonEmptyString("The Builder.io content ID to delete."),
      },
      {
        required: ["model", "id"],
      },
    ),
    outputSchema: s.object(
      "A Builder.io content delete result.",
      {
        id: s.string("The Builder.io content ID that was deleted."),
        deleted: s.boolean("Whether the connector sent the delete request successfully."),
        raw: builderObjectSchema,
      },
      {
        required: ["id", "deleted", "raw"],
      },
    ),
  }),
];

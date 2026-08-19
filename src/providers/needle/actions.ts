import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "needle";

const nonEmptyString = (description: string) => s.nonEmptyString(description);

const needleCollectionSchema = s.looseRequiredObject(
  "A Needle collection object.",
  {
    id: s.string("The unique identifier of the collection."),
    name: s.string("The collection name."),
    embedding_model: s.string("The embedding model configured for the collection."),
    embedding_dimensions: s.number("The embedding vector dimension configured for the collection."),
    search_queries: s.number("The number of search queries performed against the collection."),
    created_at: s.string("The ISO 8601 timestamp when the collection was created."),
    updated_at: s.string("The ISO 8601 timestamp when the collection was last updated."),
  },
  {
    optional: ["embedding_model", "embedding_dimensions", "search_queries", "created_at", "updated_at"],
  },
);

const needleCollectionFileSchema = s.looseRequiredObject(
  "A file attached to a Needle collection.",
  {
    id: s.string("The unique identifier of the file."),
    name: s.string("The file name."),
    type: s.string("The MIME type of the file."),
    url: s.string("The source or signed URL for the file."),
    user_id: s.nullable(s.string("The Needle user identifier that owns the file.")),
    connector_id: s.nullable(s.string("The upstream connector identifier when the file is connector-managed.")),
    size: s.number("The size of the file in bytes."),
    md5_hash: s.nullable(s.string("The MD5 hash of the file content.")),
    created_at: s.string("The ISO 8601 timestamp when the file was created."),
    updated_at: s.string("The ISO 8601 timestamp when the file was last updated."),
    status: s.string("The current indexing status of the file."),
  },
  { optional: ["user_id", "connector_id", "md5_hash"] },
);

const needleCollectionDataStatsSchema = s.looseRequiredObject(
  "One collection data statistics bucket.",
  {
    status: s.string("The status bucket represented by this stats row."),
    files: s.number("The number of files in this stats bucket."),
    bytes: s.number("The total byte size in this stats bucket."),
  },
  { optional: ["status"] },
);

const needleSearchResultSchema = s.looseRequiredObject(
  "A Needle collection search result.",
  {
    id: s.string("The unique identifier of the search result or chunk."),
    file_id: s.string("The identifier of the source file for this result."),
    content: s.string("The retrieved content returned by Needle."),
    distance: s.number("The distance or similarity score returned by Needle."),
  },
  { optional: ["id", "file_id", "distance"] },
);

const needleFileToAddSchema = s.requiredObject("A file reference to add into a Needle collection.", {
  name: nonEmptyString("The display name for the file inside Needle."),
  url: s.url("The public or signed URL that Needle should import."),
});

export const needleActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_collections",
    description: "List the Needle collections that the API key can access.",
    inputSchema: s.object({}, { description: "No input is required for listing Needle collections." }),
    outputSchema: s.requiredObject("The collections visible to the API key.", {
      collections: s.array("The collections returned by Needle.", needleCollectionSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_collection",
    description: "Create a Needle collection and optionally attach existing Needle file IDs.",
    inputSchema: s.object(
      "The input payload for creating a Needle collection.",
      {
        name: nonEmptyString("The name of the collection to create."),
        file_ids: s.array(
          "Existing Needle file IDs to attach when the collection is created.",
          s.string("An existing Needle file ID to attach to the collection."),
        ),
      },
      { optional: ["file_ids"] },
    ),
    outputSchema: s.requiredObject("The created Needle collection.", {
      collection: needleCollectionSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_collection",
    description: "Get the details of a single Needle collection.",
    inputSchema: s.requiredObject("The collection identifier for the requested Needle collection.", {
      collection_id: nonEmptyString("The Needle collection ID."),
    }),
    outputSchema: s.requiredObject("The requested Needle collection.", {
      collection: needleCollectionSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_collection_stats",
    description: "Get indexing and storage statistics for a Needle collection.",
    inputSchema: s.requiredObject("The collection identifier used to fetch Needle collection statistics.", {
      collection_id: nonEmptyString("The Needle collection ID."),
    }),
    outputSchema: s.object(
      "Statistics for a Needle collection.",
      {
        data_stats: s.array("The file and byte distribution returned by Needle.", needleCollectionDataStatsSchema),
        chunks_count: s.number("The total chunk count in the collection."),
        characters: s.number("The total character count in the collection."),
        users: s.number("The total user count in the collection."),
      },
      { optional: ["chunks_count", "characters", "users"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_collection_files",
    description: "List the files currently attached to a Needle collection.",
    inputSchema: s.requiredObject("The collection identifier used to list Needle collection files.", {
      collection_id: nonEmptyString("The Needle collection ID."),
    }),
    outputSchema: s.requiredObject("The files attached to a Needle collection.", {
      files: s.array("The files attached to the Needle collection.", needleCollectionFileSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "add_files_to_collection",
    description: "Import one or more URL-backed files into a Needle collection for indexing.",
    inputSchema: s.requiredObject("The input payload for importing files into a Needle collection.", {
      collection_id: nonEmptyString("The Needle collection ID."),
      files: s.array("The URL-backed files that Needle should import.", needleFileToAddSchema, { minItems: 1 }),
    }),
    outputSchema: s.requiredObject("The files accepted for indexing by Needle.", {
      files: s.array("The files that Needle accepted for indexing.", needleCollectionFileSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "search_collection",
    description: "Search a Needle collection for the most relevant retrieved content.",
    inputSchema: s.object(
      "The input payload for a Needle collection search.",
      {
        collection_id: nonEmptyString("The Needle collection ID."),
        text: nonEmptyString("The search query text."),
        top_k: s.positiveInteger("The maximum number of results to return."),
        offset: s.nonNegativeInteger("The zero-based result offset."),
      },
      { optional: ["top_k", "offset"] },
    ),
    outputSchema: s.requiredObject("The retrieved search results.", {
      results: s.array("The retrieved search results returned by Needle.", needleSearchResultSchema),
    }),
  }),
];

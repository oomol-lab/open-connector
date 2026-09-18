import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "elasticsearch";
export const elasticsearchExpandWildcardValues = ["open", "closed", "hidden", "none", "all"] as const;

const looseObjectSchema = s.looseRequiredObject("A loose JSON object returned by Elasticsearch.", {});
const indexNameField = s.nonEmptyString("The Elasticsearch index name.");
const exactIndexNameField = s.string({
  minLength: 1,
  pattern: "^[^*?,]+$",
  description: "One exact Elasticsearch index name. Wildcards and comma-separated lists are rejected.",
});
const documentIdField = s.nonEmptyString("The Elasticsearch document identifier.");
const optionalIndexPatternField = s.optional(
  s.nonEmptyString("A comma-separated list of index names or wildcard expressions to limit the returned indices."),
);
const paginationFromField = s.optional(
  s.withDefault(s.nonNegativeInteger("The starting offset for search pagination."), 0),
);
const paginationSizeField = s.optional(
  s.withDefault(
    s.integer("The number of search results to return, capped at 1000.", {
      minimum: 1,
      maximum: 1000,
    }),
    10,
  ),
);
const sortOrderField = s.optional(
  s.withDefault(s.stringEnum("The sort order for this field.", ["asc", "desc"]), "asc"),
);
const expandWildcardsField = s.optional(
  s.string({
    minLength: 1,
    pattern: "^(open|closed|hidden|none|all)(,(open|closed|hidden|none|all))*$",
    description: "The comma-separated wildcard expansion modes for index patterns.",
  }),
);
const refreshField = s.optional(
  s.withDefault(
    s.stringEnum(
      "Whether to refresh the affected shards before returning: true refreshes immediately, wait_for waits for the next scheduled refresh, and false skips refreshing.",
      ["true", "false", "wait_for"],
    ),
    "false",
  ),
);
const conflictsField = s.optional(
  s.withDefault(
    s.stringEnum("Whether to abort on the first version conflict or keep processing the remaining documents.", [
      "abort",
      "proceed",
    ]),
    "abort",
  ),
);
const comparableValueSchema = s.anyOf("A string or number accepted by Elasticsearch range queries.", [
  s.string("A union variant."),
  s.number("A union variant."),
]);
const termValueSchema = s.anyOf("The exact value to match in a term query.", [
  s.string("A union variant."),
  s.number("A union variant."),
  s.boolean("A union variant."),
]);
const termFilterSchema = s.object("One exact term filter.", {
  field: s.nonEmptyString("The field to filter on."),
  value: termValueSchema,
});
const rangeFilterSchema = s.object(
  "A range filter for numeric, keyword, or date fields.",
  {
    field: s.nonEmptyString("The field to filter on."),
    gt: s.optional(s.describe(comparableValueSchema, "Match values greater than this value.")),
    gte: s.optional(s.describe(comparableValueSchema, "Match values greater than or equal to this value.")),
    lt: s.optional(s.describe(comparableValueSchema, "Match values less than this value.")),
    lte: s.optional(s.describe(comparableValueSchema, "Match values less than or equal to this value.")),
  },
  { optional: ["gt", "gte", "lt", "lte"] },
);
const timeFilterSchema = s.object(
  "A time-based range filter for timestamp fields.",
  {
    field: s.nonEmptyString("The timestamp field to filter on."),
    gt: s.optional(s.string("Match timestamps greater than this ISO 8601 value.")),
    gte: s.optional(s.string("Match timestamps greater than or equal to this ISO 8601 value.")),
    lt: s.optional(s.string("Match timestamps less than this ISO 8601 value.")),
    lte: s.optional(s.string("Match timestamps less than or equal to this ISO 8601 value.")),
  },
  { optional: ["gt", "gte", "lt", "lte"] },
);
const freeTextQueryField = s.optional(s.nonEmptyString("A free-text query_string query."));
const termFiltersField = s.optional(
  s.array("Exact term filters for specific field values.", termFilterSchema, { minItems: 1 }),
);
const rangeFiltersField = s.optional(s.array("Range filters for fields.", rangeFilterSchema, { minItems: 1 }));
const timeFilterField = s.optional(s.describe(timeFilterSchema, "A time-based range filter for timestamp fields."));

// Reuse one filter contract across query_index, count_documents, delete_by_query, and reindex.
const searchFilterProperties = {
  query: freeTextQueryField,
  termFilters: termFiltersField,
  rangeFilters: rangeFiltersField,
  timeFilter: timeFilterField,
};

const aggregationRequestSchema = s.object("One aggregation to compute over the matching documents.", {
  name: s.nonEmptyString("The aggregation name, used as the key in the aggregations output."),
  type: s.stringEnum("The aggregation type to run.", [
    "terms",
    "date_histogram",
    "stats",
    "cardinality",
    "min",
    "max",
    "avg",
    "sum",
    "value_count",
  ]),
  field: s.nonEmptyString("The document field to aggregate on."),
  size: s.optional(
    s.withDefault(
      s.integer("The maximum number of buckets to return. Only used by terms aggregations.", {
        minimum: 1,
        maximum: 1000,
      }),
      10,
    ),
  ),
  interval: s.optional(
    s.nonEmptyString(
      "The bucket interval for date_histogram aggregations, such as 1d or month. Required when type is date_histogram.",
    ),
  ),
  intervalType: s.optional(
    s.withDefault(
      s.stringEnum("Whether the date_histogram interval is a calendar interval or a fixed interval.", [
        "calendar",
        "fixed",
      ]),
      "calendar",
    ),
  ),
  order: s.optional(
    s.withDefault(
      s.stringEnum("The bucket sort order by document count. Only used by terms aggregations.", ["asc", "desc"]),
      "desc",
    ),
  ),
});
const aggregationsField = s.optional(
  s.array("Aggregations to compute alongside the search hits.", aggregationRequestSchema, {
    minItems: 1,
  }),
);

const indexInfoSchema = s.looseRequiredObject("An Elasticsearch index summary.", {
  index: s.string("The index name."),
  health: s.nullable(s.string("The index health status, or null when unavailable.")),
  status: s.nullable(s.string("The index open or closed status, or null when unavailable.")),
  uuid: s.nullable(s.string("The index UUID, or null when unavailable.")),
  primaryShards: s.nullable(s.string("The number of primary shards, or null when unavailable.")),
  replicaShards: s.nullable(s.string("The number of replica shards, or null when unavailable.")),
  docsCount: s.nullable(s.string("The number of documents in the index, or null when unavailable.")),
  docsDeleted: s.nullable(s.string("The number of deleted documents in the index, or null when unavailable.")),
  storeSize: s.nullable(s.string("The total index store size, or null when unavailable.")),
  primaryStoreSize: s.nullable(s.string("The primary shard store size, or null when unavailable.")),
  creationDate: s.nullable(s.string("The index creation timestamp, or null when unavailable.")),
  creationDateString: s.nullable(s.string("The index creation date string, or null when unavailable.")),
});

const fieldStatisticsSchema = s.object("Statistics derived from the index mappings.", {
  totalFields: s.nonNegativeInteger("The total number of mapped fields."),
  fieldTypes: s.record(
    "A count of mapped fields by Elasticsearch field type.",
    s.nonNegativeInteger("A record value."),
  ),
});

const searchHitSchema = s.looseRequiredObject(
  "A normalized Elasticsearch search hit.",
  {
    index: s.string("The index that contains the hit."),
    id: s.string("The document identifier."),
    score: s.nullable(s.number("The search score, or null when Elasticsearch omits it.")),
    source: s.describe(looseObjectSchema, "The document source payload."),
    highlight: s.optional(
      s.record("Highlighted snippets keyed by field name.", s.array("A record value.", s.string("An array item."))),
    ),
  },
  { optional: ["highlight"] },
);

const indexStatsEntrySchema = s.object("Statistics for one Elasticsearch index.", {
  index: s.string("The index name."),
  health: s.nullable(s.string("The index health status, or null when unavailable.")),
  status: s.nullable(s.string("The index open or closed status, or null when unavailable.")),
  uuid: s.nullable(s.string("The index UUID, or null when unavailable.")),
  docsCount: s.nullable(s.integer("The number of live documents in the index, or null when unavailable.")),
  docsDeleted: s.nullable(s.integer("The number of deleted documents not yet merged away, or null when unavailable.")),
  storeSizeBytes: s.nullable(
    s.integer("The total store size in bytes across all shard copies, or null when unavailable."),
  ),
  searchQueryTotal: s.nullable(
    s.integer("The cumulative number of search queries since node start, or null when unavailable."),
  ),
  searchQueryTimeMs: s.nullable(
    s.integer("The cumulative search query time in milliseconds, or null when unavailable."),
  ),
  searchFetchTotal: s.nullable(s.integer("The cumulative number of search fetch phases, or null when unavailable.")),
  getTotal: s.nullable(s.integer("The cumulative number of get-by-id requests, or null when unavailable.")),
  getTimeMs: s.nullable(s.integer("The cumulative get-by-id time in milliseconds, or null when unavailable.")),
  indexingIndexTotal: s.nullable(s.integer("The cumulative number of indexing operations, or null when unavailable.")),
  indexingDeleteTotal: s.nullable(s.integer("The cumulative number of delete operations, or null when unavailable.")),
});

const counterWindowSchema = s.object("Context needed to interpret the cumulative counters in this response.", {
  note: s.string("An explanation of how the cumulative counters should be read."),
  nodes: s.array(
    "The cluster nodes and how long each has been running.",
    s.object("One node uptime entry.", {
      name: s.string("The node name."),
      uptimeMs: s.nullable(s.integer("The node JVM uptime in milliseconds, or null when unavailable.")),
    }),
  ),
});

const aliasEntrySchema = s.object("One alias assignment on one index.", {
  alias: s.string("The alias name."),
  index: s.string("The index the alias points at."),
  isWriteIndex: s.nullable(
    s.boolean("Whether this index is the write index for the alias, or null when not configured."),
  ),
  filter: s.nullable(s.describe(looseObjectSchema, "The alias filter query, or null when the alias has no filter.")),
  indexRouting: s.nullable(s.string("The alias index routing value, or null when not configured.")),
  searchRouting: s.nullable(s.string("The alias search routing value, or null when not configured.")),
});

const shardEntrySchema = s.object("One Elasticsearch shard row returned by the cat API.", {
  index: s.nullable(s.string("The index the shard belongs to, or null when unavailable.")),
  shard: s.nullable(s.string("The shard number, or null when unavailable.")),
  prirep: s.nullable(s.string("Whether the shard is a primary (p) or replica (r), or null when unavailable.")),
  state: s.nullable(s.string("The shard state, or null when unavailable.")),
  docs: s.nullable(s.string("The number of documents in the shard, or null when unavailable.")),
  store: s.nullable(s.string("The shard store size, or null when unavailable.")),
  node: s.nullable(s.string("The node hosting the shard, or null when unassigned.")),
  unassignedReason: s.nullable(s.string("Why the shard is unassigned, or null when the shard is assigned.")),
});

const clusterNodeSchema = s.object("One Elasticsearch cluster node.", {
  id: s.string("The node identifier."),
  name: s.string("The node name."),
  host: s.nullable(s.string("The node host address, or null when unavailable.")),
  roles: s.array("The roles assigned to the node.", s.string("One node role.")),
  uptimeMs: s.nullable(s.integer("The node JVM uptime in milliseconds, or null when unavailable.")),
  heapUsedPercent: s.nullable(s.integer("The percentage of JVM heap in use, or null when unavailable.")),
  cpuPercent: s.nullable(s.integer("The percentage of CPU in use on the node, or null when unavailable.")),
  diskTotalBytes: s.nullable(s.integer("The total file system size in bytes, or null when unavailable.")),
  diskFreeBytes: s.nullable(s.integer("The free file system space in bytes, or null when unavailable.")),
});

const clusterHealthIndexSchema = s.object("Health for one index in the cluster.", {
  index: s.string("The index name."),
  status: s.string("The index health status."),
  numberOfShards: s.integer("The number of primary shards configured for the index."),
  numberOfReplicas: s.integer("The number of replicas configured for the index."),
  activePrimaryShards: s.integer("The number of active primary shards."),
  activeShards: s.integer("The number of active shards including replicas."),
  relocatingShards: s.integer("The number of relocating shards."),
  initializingShards: s.integer("The number of initializing shards."),
  unassignedShards: s.integer("The number of unassigned shards."),
});

const bulkItemSchema = s.object("The outcome of one bulk operation.", {
  action: s.string("The bulk action that was applied."),
  index: s.string("The index the operation targeted."),
  id: s.string("The document identifier assigned or used by the operation."),
  status: s.nullable(s.integer("The HTTP status code for this operation, or null when unavailable.")),
  result: s.nullable(s.string("The Elasticsearch result for this operation, or null when unavailable.")),
  error: s.nullable(s.string("The failure reason, or null when the operation succeeded.")),
});

const taskProgressSchema = s.object("The progress counters reported by the task.", {
  total: s.nullable(s.integer("The total number of documents to process, or null when unknown.")),
  created: s.nullable(s.integer("The number of documents created, or null when unknown.")),
  updated: s.nullable(s.integer("The number of documents updated, or null when unknown.")),
  deleted: s.nullable(s.integer("The number of documents deleted, or null when unknown.")),
  batches: s.nullable(s.integer("The number of batches processed, or null when unknown.")),
  versionConflicts: s.nullable(s.integer("The number of version conflicts encountered, or null when unknown.")),
  noops: s.nullable(s.integer("The number of documents skipped as no-ops, or null when unknown.")),
});

const pingCluster = defineProviderAction(service, {
  name: "ping_cluster",
  operationType: "read",
  description: "Check whether the Elasticsearch cluster is reachable and return its health status.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for checking Elasticsearch cluster health.", {}),
  outputSchema: s.object("The cluster health response.", {
    isRunning: s.boolean("Whether the cluster health endpoint returned successfully."),
    statusCode: s.integer("The HTTP status code returned by Elasticsearch."),
    status: s.nullable(s.string("The cluster health status, or null when unavailable.")),
    clusterName: s.nullable(s.string("The Elasticsearch cluster name, or null when unavailable.")),
    message: s.string("A human-readable summary of the cluster status."),
  }),
});

const listIndices = defineProviderAction(service, {
  name: "list_indices",
  operationType: "read",
  description: "List Elasticsearch indices visible to the connected user.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Elasticsearch indices.",
    {
      index: optionalIndexPatternField,
      health: s.optional(s.stringEnum("Filter indices by health status.", ["green", "yellow", "red"])),
      sortBy: s.optional(
        s.nonEmptyString("A comma-separated list of cat indices columns to sort by, such as index or docs.count:desc."),
      ),
      expandWildcards: expandWildcardsField,
      includePrimaryShardsOnly: s.optional(
        s.withDefault(s.boolean("Whether to return only primary shard information."), false),
      ),
    },
    { optional: ["health", "sortBy", "includePrimaryShardsOnly"] },
  ),
  outputSchema: s.object("The normalized Elasticsearch indices list.", {
    indices: s.array("The list of Elasticsearch index summaries.", indexInfoSchema),
  }),
});

const getIndexSchema = defineProviderAction(service, {
  name: "get_index_schema",
  operationType: "read",
  description: "Get mappings, settings, aliases, and field statistics for one Elasticsearch index.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for reading one Elasticsearch index schema.", {
    indexName: indexNameField,
  }),
  outputSchema: s.object("The normalized Elasticsearch index schema response.", {
    indexName: s.describe(indexNameField, "The resolved index name."),
    schema: s.object("The index schema payload returned by Elasticsearch.", {
      aliases: s.describe(looseObjectSchema, "Aliases configured for the index."),
      mappings: s.describe(looseObjectSchema, "Mappings configured for the index."),
      settings: s.describe(looseObjectSchema, "Settings configured for the index."),
    }),
    statistics: fieldStatisticsSchema,
  }),
});

const queryIndex = defineProviderAction(service, {
  name: "query_index",
  operationType: "read",
  description: "Search an Elasticsearch index with text queries, filters, pagination, sorting, and aggregations.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for searching one Elasticsearch index.", {
    indexName: indexNameField,
    query: freeTextQueryField,
    from: paginationFromField,
    size: paginationSizeField,
    fields: s.optional(
      s.array(
        "Specific document source fields to return.",
        s.nonEmptyString("A source field to include in search hits."),
        { minItems: 1 },
      ),
    ),
    highlight: s.optional(s.withDefault(s.boolean("Whether to request highlights for the search query."), false)),
    sort: s.optional(
      s.array(
        "Sort order for search results.",
        s.object("One Elasticsearch sort field.", {
          field: s.nonEmptyString("The field to sort by."),
          order: sortOrderField,
        }),
        { minItems: 1 },
      ),
    ),
    termFilters: termFiltersField,
    rangeFilters: rangeFiltersField,
    timeFilter: timeFilterField,
    aggregations: aggregationsField,
  }),
  outputSchema: s.object(
    "The normalized Elasticsearch search response.",
    {
      indexName: s.describe(indexNameField, "The queried index name."),
      totalHits: s.nonNegativeInteger("The total number of matching documents."),
      hits: s.array("The normalized search hits.", searchHitSchema),
      pagination: s.object("Pagination metadata for the search response.", {
        from: s.nonNegativeInteger("The starting offset used for this search."),
        size: s.positiveInteger("The requested page size."),
        returned: s.nonNegativeInteger("The number of hits returned in this page."),
        hasMore: s.boolean("Whether more hits likely exist after this page."),
      }),
      took: s.nullable(s.integer("The search duration in milliseconds, or null when unavailable.")),
      timedOut: s.nullable(s.boolean("Whether the search timed out, or null when unavailable.")),
      maxScore: s.nullable(s.number("The maximum score in the page, or null when unavailable.")),
      aggregations: s.optional(
        s.array(
          "Aggregation results returned by Elasticsearch, when present.",
          s.object("One Elasticsearch aggregation result.", {
            name: s.string("The aggregation name."),
            result: s.describe(looseObjectSchema, "The raw aggregation result."),
          }),
        ),
      ),
    },
    { optional: ["aggregations"] },
  ),
});

const createIndex = defineProviderAction(service, {
  name: "create_index",
  operationType: "write",
  description: "Create one Elasticsearch index with explicit mappings, settings, and aliases.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for creating one Elasticsearch index.", {
    indexName: s.describe(exactIndexNameField, "The exact name of the index to create."),
    mappings: s.optional(
      s.describe(looseObjectSchema, "The mapping definition for the new index, such as a properties object."),
    ),
    settings: s.optional(
      s.describe(
        looseObjectSchema,
        "The index settings for the new index, such as number_of_shards and number_of_replicas.",
      ),
    ),
    aliases: s.optional(s.describe(looseObjectSchema, "The aliases to attach to the new index, keyed by alias name.")),
  }),
  outputSchema: s.object("The normalized Elasticsearch index creation response.", {
    indexName: s.describe(indexNameField, "The created index name."),
    acknowledged: s.boolean("Whether Elasticsearch acknowledged the index creation."),
    shardsAcknowledged: s.boolean("Whether the required number of shard copies started before the request returned."),
  }),
});

const deleteIndex = defineProviderAction(service, {
  name: "delete_index",
  operationType: "destructive",
  description:
    "Permanently delete one or more Elasticsearch indices by exact name. This destroys data and cannot be undone, so wildcards, comma-separated lists, and _all are rejected, and expectedCount must equal the number of names supplied.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for permanently deleting Elasticsearch indices.", {
    indices: s.array(
      "The exact index names to delete. Wildcards and _all are rejected.",
      s.nonEmptyString("One exact index name to delete."),
      { minItems: 1, maxItems: 100 },
    ),
    expectedCount: s.positiveInteger(
      "The number of indices the caller expects to delete. It must equal the length of indices, so a mistyped request fails instead of deleting the wrong data.",
    ),
    ignoreUnavailable: s.optional(
      s.withDefault(s.boolean("Whether to ignore index names that do not exist instead of failing."), false),
    ),
  }),
  outputSchema: s.object("The normalized Elasticsearch index deletion response.", {
    acknowledged: s.boolean("Whether Elasticsearch acknowledged the deletion."),
    deletedIndices: s.array("The index names that were submitted for deletion.", s.string("One deleted index name.")),
  }),
});

const updateIndexMappings = defineProviderAction(service, {
  name: "update_index_mappings",
  operationType: "write",
  description:
    "Add or update field mappings on an existing Elasticsearch index. Existing field types cannot be changed in place, so incompatible changes require a new index and a reindex.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for updating Elasticsearch index mappings.", {
    indexName: s.describe(indexNameField, "The index whose mappings are updated."),
    properties: s.describe(looseObjectSchema, "The field mappings to add or update, keyed by field name."),
    dynamic: s.optional(
      s.stringEnum("How Elasticsearch should treat fields that are not mapped explicitly.", [
        "true",
        "false",
        "strict",
        "runtime",
      ]),
    ),
  }),
  outputSchema: s.object("The normalized Elasticsearch mapping update response.", {
    indexName: s.describe(indexNameField, "The index whose mappings were updated."),
    acknowledged: s.boolean("Whether Elasticsearch acknowledged the mapping update."),
  }),
});

const getIndexStats = defineProviderAction(service, {
  name: "get_index_stats",
  operationType: "read",
  description:
    "Get document, store, search, get, and indexing statistics for Elasticsearch indices. Counters such as searchQueryTotal are cumulative since each node started rather than a time window, so compare them against the node uptime in counterWindow before concluding that a zero means the index is never queried.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for reading Elasticsearch index statistics.", {
    index: optionalIndexPatternField,
    includeCounterWindow: s.optional(
      s.withDefault(
        s.boolean("Whether to also fetch node uptime so the cumulative counters can be interpreted."),
        true,
      ),
    ),
  }),
  outputSchema: s.object("The normalized Elasticsearch index statistics response.", {
    indices: s.array("The per-index statistics.", indexStatsEntrySchema),
    counterWindow: s.nullable(
      s.describe(
        counterWindowSchema,
        "Node uptime context for the cumulative counters, or null when it was not requested.",
      ),
    ),
  }),
});

const listAliases = defineProviderAction(service, {
  name: "list_aliases",
  operationType: "read",
  description: "List Elasticsearch aliases and the indices behind them, optionally filtered by alias or index pattern.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for listing Elasticsearch aliases.", {
    alias: s.optional(s.nonEmptyString("An alias name or wildcard pattern to filter by.")),
    index: optionalIndexPatternField,
  }),
  outputSchema: s.object("The normalized Elasticsearch alias list.", {
    aliases: s.array("One row per alias and index pair.", aliasEntrySchema),
  }),
});

const updateAliases = defineProviderAction(service, {
  name: "update_aliases",
  operationType: "destructive",
  description:
    "Atomically add or remove Elasticsearch alias assignments in a single request, which is how an alias is switched between indices without downtime. This action cannot delete an index; use delete_index for that.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for updating Elasticsearch aliases.", {
    actions: s.array(
      "The alias changes to apply atomically.",
      s.object("One alias change.", {
        type: s.stringEnum("Whether to add or remove the alias assignment.", ["add", "remove"]),
        index: s.nonEmptyString(
          "The index or index pattern the alias assignment applies to. Patterns are useful when removing an alias from every index behind it.",
        ),
        alias: s.nonEmptyString("The alias name."),
        isWriteIndex: s.optional(
          s.boolean("Whether this index becomes the write index for the alias. Only used when type is add."),
        ),
        filter: s.optional(
          s.describe(
            looseObjectSchema,
            "A query that restricts the documents visible through the alias. Only used when type is add.",
          ),
        ),
        indexRouting: s.optional(
          s.nonEmptyString("The routing value used for indexing through the alias. Only used when type is add."),
        ),
        searchRouting: s.optional(
          s.nonEmptyString("The routing value used for searching through the alias. Only used when type is add."),
        ),
      }),
      { minItems: 1, maxItems: 100 },
    ),
  }),
  outputSchema: s.object("The normalized Elasticsearch alias update response.", {
    acknowledged: s.boolean("Whether Elasticsearch acknowledged the alias changes."),
    appliedActions: s.nonNegativeInteger("The number of alias changes submitted in the request."),
  }),
});

const getClusterHealth = defineProviderAction(service, {
  name: "get_cluster_health",
  operationType: "read",
  description: "Get detailed Elasticsearch cluster health including shard counts and an optional per-index breakdown.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for reading Elasticsearch cluster health.", {
    index: optionalIndexPatternField,
    level: s.optional(
      s.withDefault(
        s.stringEnum("How much detail to return in the health response.", ["cluster", "indices", "shards"]),
        "cluster",
      ),
    ),
  }),
  outputSchema: s.object("The normalized Elasticsearch cluster health response.", {
    clusterName: s.string("The cluster name."),
    status: s.string("The overall cluster health status."),
    timedOut: s.boolean("Whether the health request timed out before the cluster stabilized."),
    numberOfNodes: s.integer("The number of nodes in the cluster."),
    numberOfDataNodes: s.integer("The number of data nodes in the cluster."),
    activePrimaryShards: s.integer("The number of active primary shards."),
    activeShards: s.integer("The number of active shards including replicas."),
    relocatingShards: s.integer("The number of shards being relocated."),
    initializingShards: s.integer("The number of shards being initialized."),
    unassignedShards: s.integer("The number of unassigned shards."),
    delayedUnassignedShards: s.integer("The number of unassigned shards whose allocation is delayed."),
    numberOfPendingTasks: s.integer("The number of cluster-level tasks waiting to be executed."),
    activeShardsPercent: s.nullable(s.number("The percentage of shards that are active, or null when unavailable.")),
    indices: s.nullable(
      s.array("The per-index health breakdown, or null when level is cluster.", clusterHealthIndexSchema),
    ),
  }),
});

const getClusterNodes = defineProviderAction(service, {
  name: "get_cluster_nodes",
  operationType: "read",
  description:
    "List Elasticsearch cluster nodes with uptime, heap, disk, and role information. Node uptime is what makes the cumulative counters from get_index_stats interpretable.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for listing Elasticsearch cluster nodes.", {}),
  outputSchema: s.object("The normalized Elasticsearch cluster node list.", {
    clusterName: s.nullable(s.string("The cluster name, or null when unavailable.")),
    nodes: s.array("The nodes in the cluster, sorted by name.", clusterNodeSchema),
  }),
});

const listShards = defineProviderAction(service, {
  name: "list_shards",
  operationType: "read",
  description:
    "List Elasticsearch shard placement, state, and size, optionally limited to an index pattern or a shard state.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for listing Elasticsearch shards.", {
    index: optionalIndexPatternField,
    sortBy: s.optional(
      s.nonEmptyString("A comma-separated list of cat shards columns to sort by, such as index or store:desc."),
    ),
    state: s.optional(
      s.stringEnum("Only return shards in this state.", ["STARTED", "INITIALIZING", "RELOCATING", "UNASSIGNED"]),
    ),
  }),
  outputSchema: s.object("The normalized Elasticsearch shard list.", {
    shards: s.array("The shard rows returned by Elasticsearch.", shardEntrySchema),
  }),
});

const getDocument = defineProviderAction(service, {
  name: "get_document",
  operationType: "read",
  description:
    "Get one Elasticsearch document by id. A missing document returns found as false instead of raising an error.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for reading one Elasticsearch document.", {
    indexName: s.describe(indexNameField, "The index that holds the document."),
    documentId: s.describe(documentIdField, "The identifier of the document to read."),
    fields: s.optional(
      s.array(
        "Specific source fields to return instead of the whole document.",
        s.nonEmptyString("A source field to include in the response."),
        { minItems: 1 },
      ),
    ),
  }),
  outputSchema: s.object("The normalized Elasticsearch document response.", {
    index: s.string("The index that was queried."),
    id: s.string("The document identifier that was requested."),
    found: s.boolean("Whether the document exists."),
    version: s.nullable(s.integer("The document version, or null when the document is missing.")),
    source: s.nullable(s.describe(looseObjectSchema, "The document source, or null when the document is missing.")),
  }),
});

const indexDocument = defineProviderAction(service, {
  name: "index_document",
  operationType: "destructive",
  description:
    "Index or replace one document in an Elasticsearch index. Supplying documentId replaces that document, while omitting it lets Elasticsearch generate an id.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for indexing one Elasticsearch document.", {
    indexName: s.describe(indexNameField, "The index to write the document into."),
    document: s.describe(looseObjectSchema, "The document body to index."),
    documentId: s.optional(
      s.describe(
        documentIdField,
        "The identifier to write the document under. Elasticsearch generates one when this is omitted.",
      ),
    ),
    opType: s.optional(
      s.withDefault(
        s.stringEnum("Whether to overwrite an existing document (index) or fail when the id already exists (create).", [
          "index",
          "create",
        ]),
        "index",
      ),
    ),
    refresh: refreshField,
  }),
  outputSchema: s.object("The normalized Elasticsearch index document response.", {
    index: s.string("The index the document was written to."),
    id: s.string("The identifier of the written document."),
    result: s.string("The Elasticsearch write result, such as created or updated."),
    version: s.nullable(s.integer("The document version, or null when unavailable.")),
    successfulShards: s.nullable(
      s.integer("The number of shard copies that acknowledged the write, or null when unavailable."),
    ),
    failedShards: s.nullable(s.integer("The number of shard copies that failed the write, or null when unavailable.")),
  }),
});

const deleteDocument = defineProviderAction(service, {
  name: "delete_document",
  operationType: "destructive",
  description:
    "Delete one Elasticsearch document by id. A missing document returns a not_found result instead of raising an error.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for deleting one Elasticsearch document.", {
    indexName: s.describe(indexNameField, "The index that holds the document."),
    documentId: s.describe(documentIdField, "The identifier of the document to delete."),
    refresh: refreshField,
  }),
  outputSchema: s.object("The normalized Elasticsearch delete document response.", {
    index: s.string("The index the delete targeted."),
    id: s.string("The document identifier that was requested."),
    result: s.string("The Elasticsearch delete result, such as deleted or not_found."),
    version: s.nullable(s.integer("The document version, or null when unavailable.")),
  }),
});

const bulkIndexDocuments = defineProviderAction(service, {
  name: "bulk_index_documents",
  operationType: "destructive",
  description:
    "Apply many Elasticsearch document writes in one bulk request. Each operation names its own index, and per-operation failures are reported in the response instead of failing the whole request.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for a bulk Elasticsearch write.", {
    operations: s.array(
      "The document writes to apply in order.",
      s.object("One bulk operation.", {
        action: s.stringEnum("The bulk action to apply for this document.", ["index", "create", "update", "delete"]),
        indexName: s.describe(indexNameField, "The index this operation targets."),
        documentId: s.optional(
          s.describe(
            documentIdField,
            "The document identifier. Required for delete operations and optional otherwise.",
          ),
        ),
        document: s.optional(
          s.describe(
            looseObjectSchema,
            "The document body. Required for index, create, and update operations, and ignored for delete.",
          ),
        ),
      }),
      { minItems: 1, maxItems: 1000 },
    ),
    refresh: refreshField,
  }),
  outputSchema: s.object("The normalized Elasticsearch bulk response.", {
    took: s.nullable(s.integer("The bulk duration in milliseconds, or null when unavailable.")),
    errors: s.boolean("Whether at least one operation failed."),
    successCount: s.nonNegativeInteger("The number of operations that succeeded."),
    failureCount: s.nonNegativeInteger("The number of operations that failed."),
    items: s.array("The per-operation outcomes in request order.", bulkItemSchema),
  }),
});

const countDocuments = defineProviderAction(service, {
  name: "count_documents",
  operationType: "read",
  description:
    "Count Elasticsearch documents matching a query without returning any hits, which is cheaper than a search when only the size of a result set matters.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for counting Elasticsearch documents.", {
    indexName: s.describe(indexNameField, "The index or index pattern to count documents in."),
    ...searchFilterProperties,
  }),
  outputSchema: s.object("The normalized Elasticsearch count response.", {
    indexName: s.describe(indexNameField, "The index the count ran against."),
    count: s.nonNegativeInteger("The number of documents matching the query."),
    successfulShards: s.nullable(s.integer("The number of shards that answered the count, or null when unavailable.")),
    failedShards: s.nullable(s.integer("The number of shards that failed the count, or null when unavailable.")),
  }),
});

const deleteByQuery = defineProviderAction(service, {
  name: "delete_by_query",
  operationType: "destructive",
  description:
    "Delete Elasticsearch documents matching a query. This destroys data and cannot be undone, so a bounded maxDocs and at least one of query, termFilters, rangeFilters, or timeFilter are required, the index name must be exact, and _all is rejected. That makes it impossible to empty an entire index by accident. The action waits for the deletion to finish, and a large maxDocs can outlast that wait: a timeout does not cancel the deletion, which keeps running on the cluster with no task id to poll, so a retry after a timeout deletes a further batch.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for deleting Elasticsearch documents by query.", {
    indexName: s.describe(
      exactIndexNameField,
      "The exact index to delete documents from. Wildcards, comma-separated lists, and _all are rejected.",
    ),
    maxDocs: s.positiveInteger(
      "The maximum number of documents this request may delete. Elasticsearch stops once the limit is reached.",
    ),
    ...searchFilterProperties,
    conflicts: conflictsField,
    refresh: s.optional(
      s.withDefault(s.boolean("Whether to refresh the affected shards after the deletion completes."), false),
    ),
  }),
  outputSchema: s.object("The normalized Elasticsearch delete by query response.", {
    indexName: s.describe(indexNameField, "The index the deletion ran against."),
    took: s.nullable(s.integer("The request duration in milliseconds, or null when unavailable.")),
    timedOut: s.nullable(s.boolean("Whether the request timed out, or null when unavailable.")),
    total: s.nullable(s.integer("The number of documents matched by the query, or null when unavailable.")),
    deleted: s.nullable(s.integer("The number of documents deleted, or null when unavailable.")),
    batches: s.nullable(s.integer("The number of batches processed, or null when unavailable.")),
    versionConflicts: s.nullable(s.integer("The number of version conflicts encountered, or null when unavailable.")),
    failures: s.array(
      "The failures reported by Elasticsearch, as readable messages.",
      s.string("One failure message."),
    ),
  }),
});

const reindex = defineProviderAction(service, {
  name: "reindex",
  operationType: "write",
  description:
    "Start an Elasticsearch reindex from one index to another and return a task id to poll with get_task. The copy runs in the background, so this action returns before the data has moved.",
  requiredScopes: [],
  asyncLifecycle: { startActionId: "elasticsearch.reindex", statusActionId: "elasticsearch.get_task" },
  inputSchema: s.object("The input payload for starting an Elasticsearch reindex.", {
    sourceIndex: s.describe(indexNameField, "The index or index pattern to copy documents from."),
    destIndex: s.describe(indexNameField, "The index to copy documents into."),
    ...searchFilterProperties,
    maxDocs: s.optional(
      s.positiveInteger("The maximum number of documents to copy. All documents are copied when omitted."),
    ),
    opType: s.optional(
      s.stringEnum(
        "Whether to overwrite documents that already exist in the destination (index) or skip them as conflicts (create).",
        ["index", "create"],
      ),
    ),
    conflicts: conflictsField,
    requestsPerSecond: s.optional(s.positiveInteger("The throttle applied to the reindex, in requests per second.")),
  }),
  outputSchema: s.object("The submitted Elasticsearch reindex task.", {
    taskId: s.string("The task identifier to poll with get_task."),
    sourceIndex: s.string("The index documents are copied from."),
    destIndex: s.string("The index documents are copied into."),
  }),
});

const getTask = defineProviderAction(service, {
  name: "get_task",
  operationType: "read",
  description: "Get the state and progress of one Elasticsearch task, such as a reindex started by the reindex action.",
  requiredScopes: [],
  asyncLifecycle: { startActionId: "elasticsearch.reindex", statusActionId: "elasticsearch.get_task" },
  inputSchema: s.object("The input payload for reading one Elasticsearch task.", {
    taskId: s.nonEmptyString("The task identifier returned when the task was submitted."),
  }),
  outputSchema: s.object("The normalized Elasticsearch task response.", {
    taskId: s.string("The task identifier that was polled."),
    state: s.stringEnum("The normalized task state.", ["running", "completed", "failed"]),
    completed: s.boolean("Whether Elasticsearch reports the task as finished."),
    action: s.nullable(s.string("The Elasticsearch action the task runs, or null when unavailable.")),
    description: s.nullable(s.string("The human-readable task description, or null when unavailable.")),
    startTimeMs: s.nullable(s.integer("The task start time in epoch milliseconds, or null when unavailable.")),
    runningTimeMs: s.nullable(
      s.integer("How long the task has been running in milliseconds, or null when unavailable."),
    ),
    progress: taskProgressSchema,
    failures: s.array("The failures reported by the task, as readable messages.", s.string("One failure message.")),
  }),
});

// Keep grouped arrays private because the catalog collects every exported action array and rejects duplicate IDs.
const indexLifecycleActions = [createIndex, deleteIndex, updateIndexMappings, getIndexStats];
const aliasActions = [listAliases, updateAliases];
const clusterObservabilityActions = [getClusterHealth, getClusterNodes, listShards];
const documentActions = [getDocument, indexDocument, deleteDocument, bulkIndexDocuments, countDocuments];
const maintenanceActions = [deleteByQuery, reindex, getTask];

export const elasticsearchActions: ActionDefinition[] = [
  pingCluster,
  listIndices,
  getIndexSchema,
  queryIndex,
  ...indexLifecycleActions,
  ...aliasActions,
  ...clusterObservabilityActions,
  ...documentActions,
  ...maintenanceActions,
];

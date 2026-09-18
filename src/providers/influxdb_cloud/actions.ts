import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "influxdb_cloud";

const retentionRuleSchema = s.looseObject("An InfluxDB bucket retention rule.", {
  type: s.string("The retention rule type."),
  everySeconds: s.nonNegativeInteger("The retention period in seconds, or zero for infinite retention."),
  shardGroupDurationSeconds: s.nonNegativeInteger("The shard group duration in seconds."),
});
const bucketSchema = s.looseObject("An InfluxDB Cloud bucket.", {
  id: s.nonEmptyString("The bucket ID."),
  orgID: s.nonEmptyString("The organization ID that owns the bucket."),
  name: s.nonEmptyString("The bucket name."),
  description: s.string("The bucket description."),
  type: s.string("The bucket type."),
  retentionRules: s.array("Retention rules configured for the bucket.", retentionRuleSchema),
  createdAt: s.dateTime("The bucket creation timestamp."),
  updatedAt: s.dateTime("The bucket update timestamp."),
});
const linksSchema = s.looseObject("Pagination and resource links returned by InfluxDB Cloud.", {
  self: s.string("The link to the current resource or page."),
  next: s.string("The link to the next page when available."),
  prev: s.string("The link to the previous page when available."),
});
const querySeriesSchema = s.looseObject("One InfluxQL series result.", {
  name: s.string("The measurement name."),
  columns: s.stringArray("Column names for each returned row."),
  values: s.array("Rows returned for the series.", s.array("One result row.", s.unknown("One column value."))),
});
const queryResultSchema = s.looseObject("One InfluxQL statement result returned by InfluxDB Cloud.", {
  statement_id: s.nonNegativeInteger("The zero-based statement index."),
  series: s.array("Series returned by the statement.", querySeriesSchema),
  error: s.string("An InfluxQL statement error."),
});
const rejectedWriteSchema = s.looseObject(
  "Details about points rejected from a partially successful line protocol write.",
  {
    code: s.string("The provider error code."),
    message: s.string("The partial write error message."),
  },
);

const bucketPageInputSchema = s.object(
  "Input for listing InfluxDB Cloud buckets.",
  {
    limit: s.positiveInteger("Maximum number of buckets to return.", { maximum: 100 }),
    offset: s.nonNegativeInteger("Number of buckets to skip before returning results."),
    after: s.string("Bucket ID after which to begin the page.", { minLength: 1 }),
    name: s.string("Return only buckets with this exact name.", { minLength: 1 }),
    id: s.string("Return only the bucket with this ID.", { minLength: 1 }),
  },
  { optional: ["limit", "offset", "after", "name", "id"] },
);

export type InfluxdbCloudActionName = "list_buckets" | "get_bucket" | "query_influxql" | "write_line_protocol";

export const influxdbCloudActions: ProviderActionDefinition<InfluxdbCloudActionName>[] = [
  defineProviderAction(service, {
    name: "list_buckets",
    operationType: "read",
    description: "List InfluxDB Cloud Serverless buckets visible to the connected API token.",
    followUpActions: ["influxdb_cloud.get_bucket"],
    inputSchema: bucketPageInputSchema,
    outputSchema: s.requiredObject("A page of InfluxDB Cloud buckets.", {
      buckets: s.array("Buckets returned by InfluxDB Cloud.", bucketSchema),
      links: linksSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_bucket",
    operationType: "read",
    description: "Retrieve one InfluxDB Cloud Serverless bucket by ID.",
    inputSchema: s.requiredObject("Input for retrieving an InfluxDB Cloud bucket.", {
      bucketId: s.string("The InfluxDB bucket ID.", { minLength: 1 }),
    }),
    outputSchema: s.requiredObject("An InfluxDB Cloud bucket response.", {
      bucket: bucketSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "query_influxql",
    operationType: "read",
    description: "Query an InfluxDB Cloud Serverless bucket with the v1-compatible InfluxQL HTTP API.",
    inputSchema: s.object(
      "Input for querying InfluxDB Cloud with InfluxQL.",
      {
        database: s.string("Bucket name mapped to the InfluxDB v1 database parameter.", { minLength: 1 }),
        query: s.string("InfluxQL query to execute.", { minLength: 1 }),
        retentionPolicy: s.string("Optional retention policy name for the database-retention policy mapping.", {
          minLength: 1,
        }),
        epoch: s.stringEnum("Optional timestamp precision for unix epoch results.", ["ns", "us", "ms", "s", "m", "h"]),
      },
      { optional: ["retentionPolicy", "epoch"] },
    ),
    outputSchema: s.requiredObject("InfluxQL statement results returned by InfluxDB Cloud.", {
      results: s.array("InfluxQL statement results.", queryResultSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "write_line_protocol",
    operationType: "write",
    description: "Synchronously write line protocol data to an InfluxDB Cloud Serverless bucket.",
    followUpActions: ["influxdb_cloud.query_influxql"],
    inputSchema: s.object(
      "Input for writing line protocol data to InfluxDB Cloud.",
      {
        database: s.string("Bucket name mapped to the InfluxDB v1 database parameter.", { minLength: 1 }),
        lineProtocol: s.string("One or more newline-delimited line protocol points.", { minLength: 1 }),
        retentionPolicy: s.string("Optional retention policy name.", { minLength: 1 }),
        precision: s.stringEnum("Timestamp precision used by the line protocol body.", ["ns", "us", "ms", "s"]),
      },
      { optional: ["retentionPolicy", "precision"] },
    ),
    outputSchema: s.requiredObject("The synchronous InfluxDB Cloud write result.", {
      written: s.boolean("Whether at least one point was written."),
      partial: s.boolean("Whether InfluxDB rejected some points from the batch."),
      rejected: s.nullable(rejectedWriteSchema),
    }),
  }),
];

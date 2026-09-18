import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  cloudflareR2BucketJobSchema,
  cloudflareR2BucketJobStatuses,
  cloudflareR2BucketNameSchema,
  cloudflareR2JurisdictionSchema,
  cloudflareR2ObjectKeySchema,
  cloudflareR2ReadPermissions,
  cloudflareR2StorageClassSchema,
  cloudflareR2WritePermissions,
} from "./schemas.ts";

const cloudflareR2ObjectHttpMetadataSchema = s.object(
  "HTTP metadata stored with an R2 object.",
  {
    contentType: s.optional(s.string("The object MIME type.")),
    contentLanguage: s.optional(s.string("The language of the object content.")),
    contentDisposition: s.optional(s.string("Presentational information for the object.")),
    contentEncoding: s.optional(s.string("The content encoding applied to the object.")),
    cacheControl: s.optional(s.string("The caching behavior for the object.")),
    cacheExpiry: s.optional(s.string("When the object cache entry expires.")),
  },
  {
    optional: [
      "contentType",
      "contentLanguage",
      "contentDisposition",
      "contentEncoding",
      "cacheControl",
      "cacheExpiry",
    ],
  },
);

const cloudflareR2ObjectSchema = s.object(
  "An R2 object summary.",
  {
    key: s.string("The object key."),
    size: s.optional(s.integer("The object size in bytes.")),
    etag: s.optional(s.string("The object entity tag as a raw hex digest without quotes.")),
    lastModified: s.optional(s.string("When the object was last modified.")),
    storageClass: s.optional(s.describe(cloudflareR2StorageClassSchema, "The object storage class.")),
    ssec: s.optional(s.boolean("Whether the object is encrypted with a customer-supplied encryption key.")),
    httpMetadata: s.optional(cloudflareR2ObjectHttpMetadataSchema),
    customMetadata: s.optional(
      s.record("Custom metadata key-value pairs stored with the object.", s.string("A custom metadata value.")),
    ),
  },
  {
    optional: ["size", "etag", "lastModified", "storageClass", "ssec", "httpMetadata", "customMetadata"],
  },
);

const cloudflareR2BucketJobTypeSchema = s.stringEnum("The bucket job kind.", ["prefixDelete"]);

export const cloudflareR2ObjectActions: ActionDefinition[] = [
  defineProviderAction("cloudflare_r2", {
    name: "list_objects",
    operationType: "read",
    description: "List objects in an R2 bucket with optional prefix, delimiter grouping, and cursor pagination.",
    requiredScopes: ["workers-r2.read"],
    providerPermissions: [...cloudflareR2ReadPermissions],
    inputSchema: s.object(
      "Input for listing R2 objects.",
      {
        bucketName: cloudflareR2BucketNameSchema,
        prefix: s.optional(s.string("Only return objects whose keys begin with this prefix.")),
        delimiter: s.optional(
          s.string(
            "A single character used to group keys. Keys sharing the same prefix up to the delimiter are returned as common prefixes.",
            { minLength: 1, maxLength: 1 },
          ),
        ),
        startAfter: s.optional(s.string("Only return objects whose keys sort after this key in lexicographic order.")),
        cursor: s.optional(s.string("Pagination cursor returned by a previous list_objects call.")),
        perPage: s.optional(
          s.integer("The maximum number of objects to return per page.", {
            minimum: 1,
            maximum: 1000,
          }),
        ),
        jurisdiction: s.optional(cloudflareR2JurisdictionSchema),
      },
      { optional: ["prefix", "delimiter", "startAfter", "cursor", "perPage", "jurisdiction"] },
    ),
    outputSchema: s.object(
      "The listed R2 objects.",
      {
        objects: s.array("The objects in the current page.", cloudflareR2ObjectSchema),
        commonPrefixes: s.array(
          "Common prefixes grouped by the delimiter, equivalent to S3 CommonPrefixes.",
          s.string("A common prefix."),
        ),
        isTruncated: s.boolean("Whether more objects remain after this page."),
        cursor: s.optional(s.string("The pagination cursor for the next page, when truncated.")),
      },
      { optional: ["cursor"] },
    ),
  }),
  defineProviderAction("cloudflare_r2", {
    name: "delete_object",
    operationType: "destructive",
    description: "Delete one R2 object by key.",
    requiredScopes: ["workers-r2.write"],
    providerPermissions: [...cloudflareR2WritePermissions],
    inputSchema: s.object(
      "Input for deleting one R2 object.",
      {
        bucketName: cloudflareR2BucketNameSchema,
        objectKey: cloudflareR2ObjectKeySchema,
        jurisdiction: s.optional(cloudflareR2JurisdictionSchema),
      },
      { optional: ["jurisdiction"] },
    ),
    outputSchema: s.requiredObject("The deleted R2 object.", {
      bucketName: s.string("The bucket the object was deleted from."),
      objectKey: s.string("The deleted object key."),
      deleted: s.boolean("Whether the delete request succeeded."),
    }),
  }),
  defineProviderAction("cloudflare_r2", {
    name: "delete_objects",
    operationType: "destructive",
    description: "Delete a list of R2 objects by key in one request.",
    requiredScopes: ["workers-r2.write"],
    providerPermissions: [...cloudflareR2WritePermissions],
    inputSchema: s.object(
      "Input for deleting several R2 objects.",
      {
        bucketName: cloudflareR2BucketNameSchema,
        objectKeys: s.array("The object keys to delete.", cloudflareR2ObjectKeySchema, {
          minItems: 1,
        }),
        jurisdiction: s.optional(cloudflareR2JurisdictionSchema),
      },
      { optional: ["jurisdiction"] },
    ),
    outputSchema: s.requiredObject("The delete results reported by R2.", {
      bucketName: s.string("The bucket the objects were deleted from."),
      results: s.array(
        "Per-key delete results returned by R2, including any per-key error details.",
        s.looseObject("One delete result.", {
          key: s.optional(s.string("The object key.")),
        }),
      ),
    }),
  }),
  defineProviderAction("cloudflare_r2", {
    name: "delete_objects_by_prefix",
    operationType: "destructive",
    description: "Start a background job that deletes every object under a key prefix, or empties the whole bucket.",
    requiredScopes: ["workers-r2.write"],
    providerPermissions: [...cloudflareR2WritePermissions],
    asyncLifecycle: {
      startActionId: "cloudflare_r2.delete_objects_by_prefix",
      statusActionId: "cloudflare_r2.get_bucket_job",
    },
    inputSchema: s.object(
      "Input for a prefix delete or empty bucket job.",
      {
        bucketName: cloudflareR2BucketNameSchema,
        prefix: s.optional(
          s.nonEmptyString(
            "The key prefix to delete. Must end with a slash. Omit and set emptyBucket to delete everything.",
          ),
        ),
        emptyBucket: s.optional(s.boolean("Set to true to delete every object in the bucket instead of a prefix.")),
        rejectWhenDataCatalogEnabled: s.optional(
          s.boolean("Reject the job when R2 Data Catalog is enabled for the bucket."),
        ),
        jurisdiction: s.optional(cloudflareR2JurisdictionSchema),
      },
      { optional: ["prefix", "emptyBucket", "rejectWhenDataCatalogEnabled", "jurisdiction"] },
    ),
    outputSchema: s.describe(cloudflareR2BucketJobSchema, "The background job created for the delete request."),
  }),
  defineProviderAction("cloudflare_r2", {
    name: "list_bucket_jobs",
    operationType: "read",
    description: "List background jobs for an R2 bucket, such as prefix delete jobs.",
    requiredScopes: ["workers-r2.read"],
    providerPermissions: [...cloudflareR2ReadPermissions],
    inputSchema: s.object(
      "Input for listing R2 bucket jobs.",
      {
        bucketName: cloudflareR2BucketNameSchema,
        jobType: s.optional(cloudflareR2BucketJobTypeSchema),
        status: s.optional(
          s.stringEnum("Only return jobs with this status. Requires jobType.", cloudflareR2BucketJobStatuses),
        ),
        maxKeys: s.optional(s.integer("The maximum number of jobs to return.")),
        continuationToken: s.optional(
          s.string("Pagination token returned as nextContinuationToken by a previous call."),
        ),
        jurisdiction: s.optional(cloudflareR2JurisdictionSchema),
      },
      { optional: ["jobType", "status", "maxKeys", "continuationToken", "jurisdiction"] },
    ),
    outputSchema: s.object(
      "The listed R2 bucket jobs.",
      {
        jobs: s.array("The jobs in the current page.", cloudflareR2BucketJobSchema),
        nextContinuationToken: s.optional(s.string("The token to pass as continuationToken for the next page.")),
      },
      { optional: ["nextContinuationToken"] },
    ),
  }),
  defineProviderAction("cloudflare_r2", {
    name: "get_bucket_job",
    operationType: "read",
    description: "Get the current status of one R2 bucket background job.",
    requiredScopes: ["workers-r2.read"],
    providerPermissions: [...cloudflareR2ReadPermissions],
    asyncLifecycle: {
      startActionId: "cloudflare_r2.delete_objects_by_prefix",
      statusActionId: "cloudflare_r2.get_bucket_job",
    },
    inputSchema: s.object(
      "Input for reading one R2 bucket job.",
      {
        bucketName: cloudflareR2BucketNameSchema,
        jobId: s.nonEmptyString("The job identifier returned when the job was submitted."),
        jurisdiction: s.optional(cloudflareR2JurisdictionSchema),
      },
      { optional: ["jurisdiction"] },
    ),
    outputSchema: s.describe(cloudflareR2BucketJobSchema, "The current job status."),
  }),
];

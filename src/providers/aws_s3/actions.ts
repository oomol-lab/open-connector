import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "aws_s3";

const regionField = s.nonEmptyString(
  "The AWS region, for example `us-east-1`. Connections can omit it on each call to reuse the connected default region.",
);
const bucketNameField = s.nonEmptyString("The S3 bucket name.");
const objectKeyField = s.nonEmptyString("The S3 object key.");
const maxBucketKeysField = s.integer("The maximum number of buckets to return.", { minimum: 1, maximum: 10000 });
const maxObjectKeysField = s.integer("The maximum number of objects to return.", { minimum: 1, maximum: 1000 });

const ownerSchema = s.object("The bucket or object owner.", {
  id: s.string("The owner identifier."),
  displayName: s.nullable(s.string("The owner display name, or null when S3 omitted it.")),
});

const bucketSchema = s.object("An S3 bucket summary.", {
  name: s.string("The bucket name."),
  region: s.nullable(s.string("The bucket region, or null when S3 omitted it.")),
  creationDate: s.string("The bucket creation timestamp."),
  storageClass: s.nullable(s.string("The bucket storage class, or null when S3 did not expose one.")),
});

const objectSchema = s.object("An S3 object summary.", {
  name: s.string("The object key."),
  url: s.string("The canonical S3 URL for the object."),
  lastModified: s.string("The object's last modified timestamp."),
  etag: s.string("The object's ETag."),
  type: s.string("The S3 object type."),
  size: s.integer("The object size in bytes."),
  storageClass: s.nullable(s.string("The object storage class.")),
  owner: s.nullable(ownerSchema),
});

const objectMetadataSchema = s.object("Structured S3 object metadata.", {
  bucket: s.string("The bucket that stores the object."),
  objectKey: s.string("The object key."),
  etag: s.nullable(s.string("The object ETag, or null when S3 did not return it.")),
  contentLength: s.nullable(s.integer("The object size in bytes, or null when S3 did not return it.")),
  contentType: s.nullable(s.string("The object Content-Type, or null when S3 did not return it.")),
  lastModified: s.nullable(s.string("The object last modified timestamp, or null when S3 did not return it.")),
  cacheControl: s.nullable(s.string("The Cache-Control header, or null when S3 did not return it.")),
  contentDisposition: s.nullable(s.string("The Content-Disposition header, or null when S3 did not return it.")),
  contentEncoding: s.nullable(s.string("The Content-Encoding header, or null when S3 did not return it.")),
  storageClass: s.nullable(s.string("The object storage class, or null when S3 did not return it.")),
  versionId: s.nullable(s.string("The object version ID, or null when S3 did not return it.")),
  metadata: s.record("The user-defined `x-amz-meta-*` metadata attached to the object.", s.string("One metadata value.")),
  headers: s.record("The raw response headers returned by S3 for this object metadata request.", s.string("One header value.")),
});

const putObjectInputSchema = s.object(
  "The input payload for this action.",
  {
    bucket: bucketNameField,
    objectKey: objectKeyField,
    region: regionField,
    sourceUrl: s.url("A public URL that the connector can fetch and upload to S3."),
    contentText: s.string("The plain-text content to upload."),
    contentBase64: s.string("Base64-encoded binary content to upload."),
    contentType: s.string("The Content-Type header to store on the object."),
    cacheControl: s.string("The Cache-Control header to store on the object."),
    contentDisposition: s.string("The Content-Disposition header to store on the object."),
    metadata: s.record("The user-defined metadata to store under `x-amz-meta-*`.", s.string("One metadata value.")),
  },
  {
    optional: [
      "bucket",
      "region",
      "sourceUrl",
      "contentText",
      "contentBase64",
      "contentType",
      "cacheControl",
      "contentDisposition",
      "metadata",
    ],
  },
);
putObjectInputSchema.oneOf = [{ required: ["sourceUrl"] }, { required: ["contentText"] }, { required: ["contentBase64"] }];

export const awsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_buckets",
    description: "List Amazon S3 buckets visible to the connected AWS credential.",
    inputSchema: s.object(
      "The input payload for this action.",
      {
        region: regionField,
        prefix: s.string("Filter buckets by name prefix."),
        marker: s.string("Continue listing buckets from the continuation token returned by S3."),
        maxKeys: maxBucketKeysField,
      },
      { optional: ["region", "prefix", "marker", "maxKeys"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      buckets: s.array("The returned bucket summaries.", bucketSchema),
      owner: s.nullable(ownerSchema),
      isTruncated: s.boolean("Whether more buckets are available."),
      nextMarker: s.nullable(s.string("The continuation token for the next page, or null when the list is complete.")),
    }),
  }),
  defineProviderAction(service, {
    name: "list_objects",
    description: "List objects in an S3 bucket with the ListObjectsV2 API.",
    inputSchema: s.object(
      "The input payload for this action.",
      {
        bucket: bucketNameField,
        region: regionField,
        prefix: s.string("Filter objects by key prefix."),
        delimiter: s.string("Group keys by this delimiter, for example `/` to emulate folders."),
        continuationToken: s.string("Continue listing from the continuation token returned by S3."),
        startAfter: s.string("Start listing after this object key."),
        fetchOwner: s.boolean("Whether to include owner information for each object."),
        maxKeys: maxObjectKeysField,
      },
      {
        optional: ["region", "prefix", "delimiter", "continuationToken", "startAfter", "fetchOwner", "maxKeys"],
      },
    ),
    outputSchema: s.object("The output payload for this action.", {
      objects: s.array("The listed objects.", objectSchema),
      prefixes: s.array("The common prefixes returned by S3.", s.string("One common prefix.")),
      isTruncated: s.boolean("Whether more objects are available."),
      keyCount: s.integer("The number of keys returned in this page."),
      continuationToken: s.nullable(s.string("The continuation token echoed by S3, or null when absent.")),
      nextContinuationToken: s.nullable(
        s.string("The continuation token for the next page, or null when the list is complete."),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "head_object",
    description: "Fetch structured metadata for one S3 object.",
    inputSchema: s.object(
      "The input payload for this action.",
      {
        bucket: bucketNameField,
        objectKey: objectKeyField,
        region: regionField,
        versionId: s.string("The optional object version ID."),
      },
      { optional: ["bucket", "region", "versionId"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      object: objectMetadataSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "put_object",
    description: "Upload one object to S3 from a public URL, plain text, or base64-encoded content.",
    inputSchema: putObjectInputSchema,
    outputSchema: s.object("The output payload for this action.", {
      bucket: s.string("The bucket that received the object."),
      objectKey: s.string("The uploaded object key."),
      url: s.string("The canonical S3 URL for the uploaded object."),
      etag: s.nullable(s.string("The uploaded object ETag, or null when S3 omitted it.")),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_object",
    description: "Delete one S3 object.",
    inputSchema: s.object(
      "The input payload for this action.",
      {
        bucket: bucketNameField,
        objectKey: objectKeyField,
        region: regionField,
        versionId: s.string("The optional object version ID."),
      },
      { optional: ["bucket", "region", "versionId"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      bucket: s.string("The bucket that contained the deleted object."),
      objectKey: s.string("The deleted object key."),
      deleted: s.boolean("Whether the delete request completed successfully."),
    }),
  }),
  defineProviderAction(service, {
    name: "generate_presigned_url",
    description: "Generate a pre-signed S3 URL for reading, uploading, or deleting one object.",
    inputSchema: s.object(
      "The input payload for this action.",
      {
        bucket: bucketNameField,
        objectKey: objectKeyField,
        region: regionField,
        method: s.stringEnum("The HTTP method that the signed URL should allow.", ["GET", "PUT", "DELETE"]),
        expiresSeconds: s.integer("How long the signed URL remains valid, in seconds.", { minimum: 1, maximum: 604800 }),
        contentType: s.string("The Content-Type that must be used with the signed request."),
      },
      { optional: ["bucket", "region", "method", "expiresSeconds", "contentType"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      bucket: s.string("The bucket used to build the signed URL."),
      objectKey: s.string("The object key used to build the signed URL."),
      method: s.string("The signed HTTP method."),
      expiresSeconds: s.integer("The URL validity duration in seconds."),
      url: s.string("The generated pre-signed URL."),
    }),
  }),
];

export type AwsActionName = (typeof awsActions)[number]["name"];

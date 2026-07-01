import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "aliyun_oss";

const endpointSchema = s.string(
  "The OSS endpoint, for example `oss-cn-hangzhou.aliyuncs.com`. Actions can omit it to reuse the connected default endpoint.",
  { minLength: 1 },
);
const bucketNameSchema = s.string("The OSS bucket name.", { minLength: 1 });
const objectKeySchema = s.string("The OSS object key.", { minLength: 1 });
const maxKeysSchema = s.integer("The maximum number of items to return.", { minimum: 1, maximum: 1000 });

const ownerSchema = s.object("The bucket or object owner.", {
  id: s.string("The owner identifier."),
  displayName: s.string("The owner display name."),
});

const bucketSchema = s.object("An OSS bucket summary.", {
  name: s.string("The bucket name."),
  region: s.string("The bucket region."),
  creationDate: s.string("The bucket creation timestamp."),
  storageClass: s.nullable(s.string("The bucket storage class.")),
});

const objectSchema = s.object("An OSS object summary.", {
  name: s.string("The object key."),
  url: s.string("The canonical OSS URL for the object."),
  lastModified: s.string("The object's last modified timestamp."),
  etag: s.string("The object's ETag."),
  type: s.string("The OSS object type."),
  size: s.integer("The object size in bytes."),
  storageClass: s.nullable(s.string("The object storage class.")),
  owner: s.nullable(ownerSchema),
});

const objectMetadataSchema = s.object("Structured OSS object metadata.", {
  bucket: s.string("The bucket that stores the object."),
  objectKey: s.string("The object key."),
  etag: s.nullable(s.string("The object ETag, or null when OSS did not return it.")),
  contentLength: s.nullable(s.integer("The object size in bytes, or null when OSS did not return it.")),
  contentType: s.nullable(s.string("The object Content-Type, or null when OSS did not return it.")),
  lastModified: s.nullable(s.string("The object last modified timestamp, or null when OSS did not return it.")),
  cacheControl: s.nullable(s.string("The Cache-Control header, or null when OSS did not return it.")),
  contentDisposition: s.nullable(s.string("The Content-Disposition header, or null when OSS did not return it.")),
  contentEncoding: s.nullable(s.string("The Content-Encoding header, or null when OSS did not return it.")),
  storageClass: s.nullable(s.string("The object storage class, or null when OSS did not return it.")),
  versionId: s.nullable(s.string("The object version ID, or null when OSS did not return it.")),
  metadata: s.record(s.string("One user-defined metadata value."), {
    description: "The user-defined `x-oss-meta-*` metadata attached to the object.",
  }),
  headers: s.record(s.string("One raw response header value."), {
    description: "The raw response headers returned by OSS for this object metadata request.",
  }),
});

export const aliyunOssActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_buckets",
    description: "List OSS buckets visible to the connected Alibaba Cloud credential.",
    inputSchema: s.object(
      "The input payload for this action.",
      {
        endpoint: endpointSchema,
        prefix: s.string("Filter buckets by name prefix."),
        marker: s.string("Continue listing buckets from this marker."),
        maxKeys: maxKeysSchema,
      },
      { optional: ["endpoint", "prefix", "marker", "maxKeys"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      buckets: s.array("The returned bucket summaries.", bucketSchema),
      owner: s.nullable(ownerSchema),
      isTruncated: s.boolean("Whether more buckets are available."),
      nextMarker: s.nullable(s.string("The next pagination marker, or null when the list is complete.")),
    }),
  }),
  defineProviderAction(service, {
    name: "list_objects",
    description: "List objects in an OSS bucket with the ListObjectsV2 API.",
    inputSchema: s.object(
      "The input payload for this action.",
      {
        bucket: bucketNameSchema,
        endpoint: endpointSchema,
        prefix: s.string("Filter objects by key prefix."),
        delimiter: s.string("Group keys by this delimiter, for example `/` to emulate folders."),
        continuationToken: s.string("Continue listing from the continuation token returned by OSS."),
        startAfter: s.string("Start listing after this object key."),
        fetchOwner: s.boolean("Whether to include owner information for each object."),
        maxKeys: maxKeysSchema,
      },
      {
        optional: [
          "endpoint",
          "prefix",
          "delimiter",
          "continuationToken",
          "startAfter",
          "fetchOwner",
          "maxKeys",
        ],
      },
    ),
    outputSchema: s.object("The output payload for this action.", {
      objects: s.array("The listed objects.", objectSchema),
      prefixes: s.array("The common prefixes returned by OSS.", s.string("One common prefix.")),
      isTruncated: s.boolean("Whether more objects are available."),
      keyCount: s.integer("The number of keys returned in this page."),
      continuationToken: s.nullable(s.string("The continuation token echoed by OSS, or null when absent.")),
      nextContinuationToken: s.nullable(
        s.string("The continuation token for the next page, or null when the list is complete."),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "head_object",
    description: "Fetch structured metadata for one OSS object.",
    inputSchema: s.object(
      "The input payload for this action.",
      {
        bucket: bucketNameSchema,
        objectKey: objectKeySchema,
        endpoint: endpointSchema,
        versionId: s.string("The optional object version ID."),
      },
      { optional: ["bucket", "endpoint", "versionId"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      object: { ...objectMetadataSchema, description: "The normalized OSS object metadata." },
    }),
  }),
  defineProviderAction(service, {
    name: "put_object",
    description: "Upload one object to OSS from a public URL, plain text, or base64-encoded content.",
    inputSchema: {
      ...s.object(
        "The input payload for this action.",
        {
          bucket: bucketNameSchema,
          objectKey: objectKeySchema,
          endpoint: endpointSchema,
          sourceUrl: s.url("A public URL that the connector can fetch and upload to OSS."),
          contentText: s.string("The plain-text content to upload."),
          contentBase64: s.string("Base64-encoded binary content to upload."),
          contentType: s.string("The Content-Type header to store on the object."),
          cacheControl: s.string("The Cache-Control header to store on the object."),
          contentDisposition: s.string("The Content-Disposition header to store on the object."),
          metadata: s.record(s.string("One user-defined metadata value."), {
            description: "The user-defined metadata to store under `x-oss-meta-*`.",
          }),
        },
        {
          optional: [
            "bucket",
            "endpoint",
            "sourceUrl",
            "contentText",
            "contentBase64",
            "contentType",
            "cacheControl",
            "contentDisposition",
            "metadata",
          ],
        },
      ),
      anyOf: [{ required: ["sourceUrl"] }, { required: ["contentText"] }, { required: ["contentBase64"] }],
    },
    outputSchema: s.object("The output payload for this action.", {
      bucket: s.string("The bucket that received the object."),
      objectKey: s.string("The uploaded object key."),
      url: s.string("The canonical OSS URL for the uploaded object."),
      etag: s.nullable(s.string("The uploaded object ETag, or null when OSS did not return it.")),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_object",
    description: "Delete one OSS object.",
    inputSchema: s.object(
      "The input payload for this action.",
      {
        bucket: bucketNameSchema,
        objectKey: objectKeySchema,
        endpoint: endpointSchema,
        versionId: s.string("The optional object version ID."),
      },
      { optional: ["bucket", "endpoint", "versionId"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      bucket: s.string("The bucket that contained the deleted object."),
      objectKey: s.string("The deleted object key."),
      deleted: s.boolean("Whether the delete request completed successfully."),
    }),
  }),
  defineProviderAction(service, {
    name: "generate_presigned_url",
    description: "Generate a pre-signed OSS URL for reading, uploading, or deleting one object.",
    inputSchema: s.object(
      "The input payload for this action.",
      {
        bucket: bucketNameSchema,
        objectKey: objectKeySchema,
        endpoint: endpointSchema,
        method: s.stringEnum("The HTTP method that the signed URL should allow.", ["GET", "PUT", "DELETE"]),
        expiresSeconds: s.integer("How long the signed URL remains valid, in seconds.", {
          minimum: 1,
          maximum: 604800,
        }),
        contentType: s.string("The Content-Type that must be used with the signed request."),
      },
      { optional: ["bucket", "endpoint", "method", "expiresSeconds", "contentType"] },
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

export type AliyunOssActionName = (typeof aliyunOssActions)[number]["name"];

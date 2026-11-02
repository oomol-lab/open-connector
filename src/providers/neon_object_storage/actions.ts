import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "neon_object_storage";

const projectIdSchema = s.nonEmptyString("The Neon project ID.");
const branchIdSchema = s.nonEmptyString(
  "The Neon branch ID (br-...). Each branch has its own buckets, and child branches inherit their parent's objects.",
);

const bucketNameSchema = s.string({
  minLength: 1,
  maxLength: 255,
  description: "The Neon Object Storage bucket name on the branch.",
});
const objectKeySchema = s.nonEmptyString(
  "The complete object key. Slashes are part of the key and act as folder delimiters.",
);
const accessLevelSchema = s.stringEnum(
  "Bucket access level. private requires signed requests; public_read allows anonymous GET and HEAD on objects.",
  ["private", "public_read"],
);

const bucketSchema = s.object(
  "A Neon Object Storage bucket.",
  {
    name: s.string("The bucket name, unique within the branch."),
    accessLevel: s.string("The bucket access level, such as private or public_read."),
    createdAt: s.string(
      "When the bucket was created. A bucket inherited from a parent branch reports the parent creation time.",
    ),
  },
  { optional: ["createdAt"], additionalProperties: true },
);

const bucketObjectSchema = s.object(
  "An object stored in a Neon Object Storage bucket.",
  {
    key: s.string("The full object key."),
    size: s.nonNegativeInteger("The object size in bytes."),
    lastModified: s.string("When the object was last modified."),
    etag: s.string("The object entity tag."),
  },
  { optional: ["lastModified", "etag"], additionalProperties: true },
);

const transitFileOutputSchema = s.requiredObject("The downloaded object in local transit file storage.", {
  fileId: s.nonEmptyString("The local transit file identifier."),
  downloadUrl: s.url("The local transit URL for downloading the stored object."),
  sizeBytes: s.nonNegativeInteger("The stored transit file size in bytes."),
  name: s.nonEmptyString("The stored transit file name."),
  mimeType: s.nonEmptyString("The stored transit file MIME type."),
});

const putObjectInputSchema = {
  ...s.actionInput(
    {
      projectId: projectIdSchema,
      branchId: branchIdSchema,
      bucketName: bucketNameSchema,
      objectKey: objectKeySchema,
      file: s.transitFile(
        "A file previously uploaded to the local transit file API. Provide exactly one of file, sourceUrl, contentText, or contentBase64.",
      ),
      sourceUrl: s.url(
        "A public URL that the connector fetches and uploads. Provide exactly one of file, sourceUrl, contentText, or contentBase64.",
      ),
      contentText: s.string(
        "Plain-text content to upload as UTF-8. Provide exactly one of file, sourceUrl, contentText, or contentBase64.",
      ),
      contentBase64: s.string(
        "Base64-encoded binary content to upload. Provide exactly one of file, sourceUrl, contentText, or contentBase64.",
      ),
      contentType: s.nonEmptyString(
        "The Content-Type to store on the object. Defaults to the transit file or source URL type, then text/plain for contentText and application/octet-stream otherwise.",
      ),
    },
    ["projectId", "branchId", "bucketName", "objectKey"],
  ),
  oneOf: [
    { required: ["file"] },
    { required: ["sourceUrl"] },
    { required: ["contentText"] },
    { required: ["contentBase64"] },
  ],
} satisfies JsonSchema;

export const neonObjectStorageActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_branch_storage",
    operationType: "read",
    description:
      "Get the Neon Object Storage S3 endpoint, signing region, and addressing style for a branch. Use these values to configure any S3 client against the branch.",
    inputSchema: s.actionInput({ projectId: projectIdSchema, branchId: branchIdSchema }, ["projectId", "branchId"]),
    outputSchema: s.actionOutput(
      {
        enabled: s.boolean("Whether object storage is usable on the branch."),
        s3Endpoint: s.url("The S3-compatible endpoint URL for the branch."),
        region: s.string("The S3 signing region for the branch."),
        forcePathStyle: s.boolean("Whether S3 clients must use path-style addressing. Neon always returns true."),
      },
      "Neon Object Storage settings for a branch.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_buckets",
    operationType: "read",
    description:
      "List Neon Object Storage buckets visible on a branch, including buckets inherited from parent branches.",
    inputSchema: s.actionInput({ projectId: projectIdSchema, branchId: branchIdSchema }, ["projectId", "branchId"]),
    outputSchema: s.actionOutput({ buckets: s.array("Buckets visible on the branch.", bucketSchema) }),
  }),
  defineProviderAction(service, {
    name: "create_bucket",
    operationType: "write",
    description: "Create a Neon Object Storage bucket on a branch.",
    inputSchema: s.actionInput(
      {
        projectId: projectIdSchema,
        branchId: branchIdSchema,
        name: bucketNameSchema,
        accessLevel: accessLevelSchema,
      },
      ["projectId", "branchId", "name"],
    ),
    outputSchema: s.actionOutput({ bucket: bucketSchema }),
  }),
  defineProviderAction(service, {
    name: "delete_bucket",
    operationType: "destructive",
    description: "Delete a Neon Object Storage bucket from a branch.",
    inputSchema: s.actionInput({ projectId: projectIdSchema, branchId: branchIdSchema, bucketName: bucketNameSchema }, [
      "projectId",
      "branchId",
      "bucketName",
    ]),
    outputSchema: s.actionOutput({
      deleted: s.literal(true, { description: "Whether the delete bucket request succeeded." }),
      bucketName: s.string("The deleted bucket name."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_objects",
    operationType: "read",
    description:
      "List objects in a Neon Object Storage bucket, including objects inherited from parent branches. Pass delimiter / to group keys into folders.",
    inputSchema: s.actionInput(
      {
        projectId: projectIdSchema,
        branchId: branchIdSchema,
        bucketName: bucketNameSchema,
        prefix: s.string("Only list objects whose key starts with this prefix."),
        delimiter: s.nonEmptyString("Collapse keys that share a prefix up to this delimiter, usually /, into folders."),
        cursor: s.nonEmptyString("The nextCursor value returned by a previous list_objects call."),
        limit: s.integer("Maximum number of objects plus folders to return.", { minimum: 1, maximum: 1000 }),
      },
      ["projectId", "branchId", "bucketName"],
    ),
    outputSchema: s.actionOutput(
      {
        objects: s.array("Objects whose keys did not collapse into a folder.", bucketObjectSchema),
        folders: s.stringArray("Common prefixes collapsed under the delimiter. Empty without a delimiter."),
        prefix: s.string("The prefix applied to the listing."),
        nextCursor: s.nullable(s.string("Cursor for the next page, or null when the listing is complete.")),
        isTruncated: s.boolean("Whether more results exist beyond this page."),
      },
      "One page of Neon Object Storage objects.",
    ),
  }),
  defineProviderAction(service, {
    name: "download_object",
    operationType: "read",
    description:
      "Download one Neon Object Storage object into local transit file storage, keeping its stored Content-Type.",
    inputSchema: s.actionInput(
      {
        projectId: projectIdSchema,
        branchId: branchIdSchema,
        bucketName: bucketNameSchema,
        objectKey: objectKeySchema,
        fileName: s.nonEmptyString("Optional filename for the transit file. Defaults to the last key segment."),
      },
      ["projectId", "branchId", "bucketName", "objectKey"],
    ),
    outputSchema: s.actionOutput(
      {
        bucketName: s.string("The bucket the object was read from."),
        objectKey: s.string("The downloaded object key."),
        name: s.nonEmptyString("The filename used for the transit file."),
        mimeType: s.nonEmptyString("The object Content-Type."),
        sizeBytes: s.nonNegativeInteger("The downloaded object size in bytes."),
        file: transitFileOutputSchema,
      },
      "A Neon Object Storage object stored in local transit storage.",
    ),
  }),
  defineProviderAction(service, {
    name: "put_object",
    operationType: "destructive",
    description:
      "Upload one Neon Object Storage object from a transit file, a public URL, plain text, or base64 content, replacing any object with the same key. For large files prefer generate_presigned_url with operation upload so the bytes go straight to Neon.",
    inputSchema: putObjectInputSchema,
    outputSchema: s.actionOutput({
      bucketName: s.string("The bucket that received the object."),
      objectKey: s.string("The uploaded object key."),
      contentType: s.string("The Content-Type stored on the object."),
      sizeBytes: s.nonNegativeInteger("The uploaded object size in bytes."),
      etag: s.nullable(s.string("The uploaded object ETag, or null when Neon did not return one.")),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_object",
    operationType: "destructive",
    description: "Delete one object from a Neon Object Storage bucket.",
    inputSchema: s.actionInput(
      {
        projectId: projectIdSchema,
        branchId: branchIdSchema,
        bucketName: bucketNameSchema,
        objectKey: objectKeySchema,
      },
      ["projectId", "branchId", "bucketName", "objectKey"],
    ),
    outputSchema: s.actionOutput({
      deleted: s.literal(true, { description: "Whether the delete object request succeeded." }),
      bucketName: s.string("The bucket the object was deleted from."),
      objectKey: s.string("The deleted object key."),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_objects_by_prefix",
    operationType: "destructive",
    description:
      "Delete every object under a folder prefix in a Neon Object Storage bucket. Only objects written on this branch are removed; objects still inherited from a parent branch are left in place.",
    inputSchema: s.actionInput(
      {
        projectId: projectIdSchema,
        branchId: branchIdSchema,
        bucketName: bucketNameSchema,
        prefix: s.string({
          minLength: 1,
          maxLength: 1024,
          pattern: "/$",
          description: "The folder prefix to delete. It must end with /, for example app/avatars/.",
        }),
      },
      ["projectId", "branchId", "bucketName", "prefix"],
    ),
    outputSchema: s.actionOutput({
      bucketName: s.string("The bucket the objects were deleted from."),
      prefix: s.string("The deleted folder prefix."),
      deletedCount: s.nonNegativeInteger("The number of objects deleted. 0 when nothing matched on this branch."),
    }),
  }),
  defineProviderAction(service, {
    name: "generate_presigned_url",
    operationType: "write",
    description:
      "Generate a presigned Neon Object Storage URL so the caller uploads (PUT) or downloads (GET) bytes directly, without S3 credentials. Preferred over put_object and download_object for large files.",
    inputSchema: s.actionInput(
      {
        projectId: projectIdSchema,
        branchId: branchIdSchema,
        bucketName: bucketNameSchema,
        objectKey: objectKeySchema,
        operation: s.stringEnum("upload returns a PUT URL and download returns a GET URL.", ["upload", "download"], {
          default: "download",
        }),
        contentType: s.nonEmptyString(
          "Content-Type to bind into an upload signature. The PUT must then send the same header. Ignored for download.",
        ),
        expiresInSeconds: s.integer("How long the URL stays valid, in seconds.", {
          minimum: 1,
          maximum: 604800,
          default: 900,
        }),
      },
      ["projectId", "branchId", "bucketName", "objectKey"],
    ),
    outputSchema: s.actionOutput({
      bucketName: s.string("The bucket used to build the URL."),
      objectKey: s.string("The object key used to build the URL."),
      method: s.string("The HTTP method to use with the URL: PUT for upload, GET for download."),
      url: s.url("The presigned URL."),
      requiredHeaders: s.record(
        "Headers that must be sent verbatim with the request, such as a signed Content-Type.",
        s.string("A required header value."),
      ),
      expiresAt: s.string("When the presigned URL stops working."),
    }),
  }),
];

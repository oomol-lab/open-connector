import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "cloudflare_r2";

const r2ReadScope = "workers-r2.read";
const r2WriteScope = "workers-r2.write";
const r2ReadPermission = "Workers R2 Storage Read";
const r2WritePermission = "Workers R2 Storage Write";

const accountIdSchema = s.nonEmptyString(
  "The Cloudflare account ID. Custom-credential connections reuse the connected account ID when this is omitted.",
);
const bucketNameSchema = s.string("The R2 bucket name.", { minLength: 3, maxLength: 64 });
const jurisdictionSchema = s.stringEnum("The jurisdiction where objects in the bucket are guaranteed to be stored.", [
  "default",
  "eu",
  "fedramp",
]);
const locationSchema = s.stringEnum("The R2 bucket region hint.", ["apac", "eeur", "enam", "weur", "wnam", "oc"]);
const storageClassSchema = s.stringEnum("The default storage class for newly uploaded objects.", [
  "Standard",
  "InfrequentAccess",
]);
const corsMethodSchema = s.stringEnum("An HTTP method allowed by a CORS rule.", [
  "GET",
  "PUT",
  "POST",
  "DELETE",
  "HEAD",
]);

const accountSchema = s.object(
  "A Cloudflare account summary.",
  {
    id: s.string("The Cloudflare account ID."),
    name: s.string("The Cloudflare account name."),
    type: s.string("The Cloudflare account type."),
  },
  { required: ["id"], optional: ["name", "type"] },
);

const resultInfoSchema = s.object(
  "Cloudflare pagination metadata.",
  {
    page: s.integer("The current page number."),
    perPage: s.integer("The page size."),
    count: s.integer("The number of items in the current page."),
    totalCount: s.integer("The total number of matching items."),
    totalPages: s.integer("The total number of pages."),
  },
  { optional: ["page", "perPage", "count", "totalCount", "totalPages"] },
);

const bucketSchema = s.object(
  "A Cloudflare R2 bucket.",
  {
    name: s.string("The bucket name."),
    creationDate: s.string("The bucket creation timestamp."),
    location: locationSchema,
    jurisdiction: jurisdictionSchema,
    storageClass: storageClassSchema,
  },
  { required: ["name"], optional: ["creationDate", "location", "jurisdiction", "storageClass"] },
);

const corsRuleSchema = s.object(
  "A bucket-level R2 CORS rule.",
  {
    allowed: s.object(
      "The allowed origins, methods, and headers for this CORS rule.",
      {
        methods: s.array("The methods allowed by this CORS rule.", corsMethodSchema, { minItems: 1 }),
        origins: s.stringArray("The allowed origins for this CORS rule.", { minItems: 1 }),
        headers: s.stringArray("The allowed request headers for this CORS rule."),
      },
      { optional: ["headers"] },
    ),
    id: s.string("The optional identifier for this CORS rule."),
    exposeHeaders: s.stringArray("The response headers exposed to browser clients."),
    maxAgeSeconds: s.nonNegativeInteger("The browser preflight cache duration in seconds."),
  },
  { required: ["allowed"], optional: ["id", "exposeHeaders", "maxAgeSeconds"] },
);

const downloadedObjectSchema = s.requiredObject("A downloaded R2 object stored in local transit storage.", {
  fileId: s.nonEmptyString("The R2 object key."),
  name: s.nonEmptyString("The filename used for the local transit file."),
  mimeType: s.nonEmptyString("The downloaded object MIME type."),
  sizeBytes: s.nonNegativeInteger("The downloaded object size in bytes."),
  file: s.requiredObject("The downloaded object in local transit file storage.", {
    fileId: s.nonEmptyString("The local transit file identifier."),
    downloadUrl: s.url("The local transit URL for downloading the stored object."),
    sizeBytes: s.nonNegativeInteger("The stored transit file size in bytes."),
    name: s.nonEmptyString("The stored transit file name."),
    mimeType: s.nonEmptyString("The stored transit file MIME type."),
  }),
});

const updateBucketInputSchema = s.object(
  "The input payload for this action.",
  {
    accountId: accountIdSchema,
    bucketName: bucketNameSchema,
    storageClass: storageClassSchema,
    jurisdiction: jurisdictionSchema,
  },
  { required: ["bucketName"], optional: ["accountId", "storageClass", "jurisdiction"] },
) as JsonSchema;
updateBucketInputSchema.anyOf = [{ required: ["storageClass"] }, { required: ["jurisdiction"] }];

export const cloudflareR2Actions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_accounts",
    description: "List Cloudflare accounts visible to the current credential.",
    requiredScopes: [r2ReadScope],
    providerPermissions: [r2ReadPermission],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        page: s.positiveInteger("The result page number."),
        perPage: s.positiveInteger("The page size."),
      },
      { optional: ["page", "perPage"] },
    ),
    outputSchema: s.object(
      "The output payload for this action.",
      {
        accounts: s.array("The visible Cloudflare accounts.", accountSchema),
        resultInfo: resultInfoSchema,
      },
      { optional: ["resultInfo"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_buckets",
    description: "List the R2 buckets in a Cloudflare account.",
    requiredScopes: [r2ReadScope],
    providerPermissions: [r2ReadPermission],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        accountId: accountIdSchema,
        cursor: s.string("Pagination cursor returned by a previous list_buckets call."),
        direction: s.stringEnum("The sort direction.", ["asc", "desc"]),
        nameContains: s.string("Filters buckets whose names contain this phrase."),
        order: s.stringEnum("The field used to order results.", ["name"]),
        perPage: s.integer("The maximum number of buckets to return.", { minimum: 1, maximum: 1000 }),
      },
      { optional: ["accountId", "cursor", "direction", "nameContains", "order", "perPage"] },
    ),
    outputSchema: s.object(
      "The output payload for this action.",
      {
        buckets: s.array("The returned R2 buckets.", bucketSchema),
        cursor: s.string("The pagination cursor for the next page, if the response is truncated."),
      },
      { optional: ["cursor"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_bucket",
    description: "Get one R2 bucket by name.",
    requiredScopes: [r2ReadScope],
    providerPermissions: [r2ReadPermission],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        accountId: accountIdSchema,
        bucketName: bucketNameSchema,
        jurisdiction: jurisdictionSchema,
      },
      { required: ["bucketName"], optional: ["accountId", "jurisdiction"] },
    ),
    outputSchema: s.object("The output payload for this action.", { bucket: bucketSchema }),
  }),
  defineProviderAction(service, {
    name: "download_object",
    description: "Download one R2 object into local transit file storage.",
    requiredScopes: [r2ReadScope],
    providerPermissions: [r2ReadPermission],
    inputSchema: s.object(
      "The input payload for downloading one R2 object.",
      {
        accountId: accountIdSchema,
        bucketName: bucketNameSchema,
        objectKey: s.nonEmptyString("The complete R2 object key. Slashes are preserved as key delimiters."),
        fileName: s.nonEmptyString("An optional filename override for the local transit file."),
        jurisdiction: jurisdictionSchema,
      },
      { required: ["bucketName", "objectKey"], optional: ["accountId", "fileName", "jurisdiction"] },
    ),
    outputSchema: downloadedObjectSchema,
  }),
  defineProviderAction(service, {
    name: "create_bucket",
    description: "Create an R2 bucket in a Cloudflare account.",
    requiredScopes: [r2WriteScope],
    providerPermissions: [r2WritePermission],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        accountId: accountIdSchema,
        name: bucketNameSchema,
        locationHint: locationSchema,
        storageClass: storageClassSchema,
        jurisdiction: jurisdictionSchema,
      },
      { required: ["name"], optional: ["accountId", "locationHint", "storageClass", "jurisdiction"] },
    ),
    outputSchema: s.object("The output payload for this action.", { bucket: bucketSchema }),
  }),
  defineProviderAction(service, {
    name: "update_bucket",
    description: "Update mutable R2 bucket properties such as default storage class or jurisdiction.",
    requiredScopes: [r2WriteScope],
    providerPermissions: [r2WritePermission],
    inputSchema: updateBucketInputSchema,
    outputSchema: s.object("The output payload for this action.", { bucket: bucketSchema }),
  }),
  defineProviderAction(service, {
    name: "delete_bucket",
    description: "Delete an R2 bucket by name.",
    requiredScopes: [r2WriteScope],
    providerPermissions: [r2WritePermission],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        accountId: accountIdSchema,
        bucketName: bucketNameSchema,
        jurisdiction: jurisdictionSchema,
      },
      { required: ["bucketName"], optional: ["accountId", "jurisdiction"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      bucketName: s.string("The deleted bucket name."),
      deleted: s.boolean("Whether the bucket delete request succeeded."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_bucket_cors_policy",
    description: "Fetch the bucket-level CORS policy for an R2 bucket.",
    requiredScopes: [r2ReadScope],
    providerPermissions: [r2ReadPermission],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        accountId: accountIdSchema,
        bucketName: bucketNameSchema,
        jurisdiction: jurisdictionSchema,
      },
      { required: ["bucketName"], optional: ["accountId", "jurisdiction"] },
    ),
    outputSchema: s.object(
      "The output payload for this action.",
      {
        rules: s.array("The bucket CORS rules.", corsRuleSchema),
      },
      { optional: ["rules"] },
    ),
  }),
  defineProviderAction(service, {
    name: "update_bucket_cors_policy",
    description: "Replace the bucket-level CORS policy for an R2 bucket.",
    requiredScopes: [r2WriteScope],
    providerPermissions: [r2WritePermission],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        accountId: accountIdSchema,
        bucketName: bucketNameSchema,
        rules: s.array("The full CORS rule set to store.", corsRuleSchema),
        jurisdiction: jurisdictionSchema,
      },
      { required: ["bucketName", "rules"], optional: ["accountId", "jurisdiction"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      bucketName: s.string("The bucket whose CORS policy was updated."),
      updated: s.boolean("Whether the update request succeeded."),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_bucket_cors_policy",
    description: "Delete the bucket-level CORS policy for an R2 bucket.",
    requiredScopes: [r2WriteScope],
    providerPermissions: [r2WritePermission],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        accountId: accountIdSchema,
        bucketName: bucketNameSchema,
        jurisdiction: jurisdictionSchema,
      },
      { required: ["bucketName"], optional: ["accountId", "jurisdiction"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      bucketName: s.string("The bucket whose CORS policy was removed."),
      deleted: s.boolean("Whether the delete request succeeded."),
    }),
  }),
];

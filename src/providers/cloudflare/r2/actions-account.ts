import type { ActionDefinition } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";
import { bucketNameSchema, readPermissions, writePermissions } from "./schemas.ts";

const service = "cloudflare";

const sizeMetricsSchema = s.object(
  "Object count and storage usage for one object state.",
  {
    objects: s.optional(s.number("The number of objects stored.")),
    payloadSize: s.optional(s.number("The storage used by object data, in bytes.")),
    metadataSize: s.optional(s.number("The storage used by object metadata, in bytes.")),
  },
  { optional: ["objects", "payloadSize", "metadataSize"] },
);

const classMetricsSchema = s.object(
  "Metrics for one storage class, split by whether objects are uploaded or published.",
  {
    uploaded: s.optional(sizeMetricsSchema),
    published: s.optional(sizeMetricsSchema),
  },
  { optional: ["uploaded", "published"] },
);

export const actions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account_metrics",
    operationType: "read",
    description:
      "Get object count and storage usage metrics across all R2 buckets in the account. Metrics may lag behind the latest data.",
    requiredScopes: ["workers-r2.read"],
    providerPermissions: [...readPermissions],
    inputSchema: s.requiredObject("No input is required beyond the connected account.", {
      accountId: s.optional(s.string("The Cloudflare account ID. Defaults to the connection account.")),
    }),
    outputSchema: s.object(
      "Account-level R2 metrics grouped by storage class.",
      {
        standard: s.optional(classMetricsSchema),
        infrequentAccess: s.optional(classMetricsSchema),
      },
      { optional: ["standard", "infrequentAccess"] },
    ),
  }),
  defineProviderAction(service, {
    name: "create_temporary_access_credentials",
    operationType: "write",
    description:
      "Create short-lived S3-compatible credentials scoped to one R2 bucket and optionally to prefixes or objects.",
    requiredScopes: ["workers-r2.write"],
    providerPermissions: [...writePermissions],
    inputSchema: s.object(
      "Input for creating temporary access credentials.",
      {
        accountId: s.optional(s.string("The Cloudflare account ID. Defaults to the connection account.")),
        bucketName: bucketNameSchema,
        permission: s.stringEnum("The permissions granted to the temporary credentials.", [
          "admin-read-write",
          "admin-read-only",
          "object-read-write",
          "object-read-only",
        ]),
        ttlSeconds: s.optional(
          s.integer("How long the credentials stay valid, in seconds. Defaults to 900.", {
            minimum: 1,
            maximum: 604800,
          }),
        ),
        parentAccessKeyId: s.optional(
          s.nonEmptyString(
            "The Access Key ID of the R2 API token used to sign the credentials. Defaults to the connected API token.",
          ),
        ),
        prefixes: s.optional(s.array("Key prefixes the credentials are limited to.", s.string("A key prefix."))),
        objects: s.optional(s.array("Object keys the credentials are limited to.", s.string("An object key."))),
      },
      { optional: ["ttlSeconds", "parentAccessKeyId", "prefixes", "objects"] },
    ),
    outputSchema: s.requiredObject("The temporary S3-compatible credentials.", {
      accessKeyId: s.string("The temporary Access Key ID."),
      secretAccessKey: s.string("The temporary Secret Access Key."),
      sessionToken: s.string("The session token that must accompany the credentials."),
      estimatedExpiresAt: s.dateTime(
        "A local estimate of when the credentials expire, computed from the request time plus ttlSeconds. Cloudflare starts the TTL when it issues the credentials, so the real expiry is slightly later, and revoking the parent token expires them early.",
      ),
    }),
  }),
];

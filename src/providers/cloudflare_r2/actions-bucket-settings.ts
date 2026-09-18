import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  cloudflareR2BucketNameSchema,
  cloudflareR2JurisdictionSchema,
  cloudflareR2ReadPermissions,
  cloudflareR2WritePermissions,
} from "./schemas.ts";

const cloudflareR2LifecycleAgeConditionSchema = s.requiredObject(
  "Apply the transition once an object reaches an age in seconds.",
  {
    type: s.literal("Age", { description: "The condition type." }),
    maxAge: s.nonNegativeInteger("The object age in seconds after which the transition applies."),
  },
);

const cloudflareR2LifecycleDateConditionSchema = s.requiredObject("Apply the transition on a specific date.", {
  type: s.literal("Date", { description: "The condition type." }),
  date: s.dateTime("The date and time when the transition applies."),
});

const cloudflareR2LifecycleConditionSchema = s.oneOf(
  [cloudflareR2LifecycleAgeConditionSchema, cloudflareR2LifecycleDateConditionSchema],
  { description: "The condition that triggers the transition." },
);

const cloudflareR2LifecycleRuleSchema = s.object(
  "An object lifecycle rule.",
  {
    id: s.nonEmptyString("The unique identifier of the rule."),
    enabled: s.boolean("Whether the rule is in effect."),
    conditions: s.requiredObject("Conditions that apply to every transition of this rule.", {
      prefix: s.string(
        "Only objects and uploads whose keys start with this prefix are affected. Use an empty prefix to match everything.",
      ),
    }),
    deleteObjectsTransition: s.optional(
      s.requiredObject("Transition that deletes matching objects.", {
        condition: cloudflareR2LifecycleConditionSchema,
      }),
    ),
    abortMultipartUploadsTransition: s.optional(
      s.requiredObject("Transition that aborts ongoing multipart uploads.", {
        condition: s.describe(cloudflareR2LifecycleAgeConditionSchema, "Abort multipart uploads older than this age."),
      }),
    ),
    storageClassTransitions: s.optional(
      s.array(
        "Transitions that change the storage class of matching objects.",
        s.requiredObject("A storage class transition.", {
          condition: cloudflareR2LifecycleConditionSchema,
          storageClass: s.stringEnum("The target storage class.", ["InfrequentAccess"]),
        }),
      ),
    ),
  },
  {
    optional: ["deleteObjectsTransition", "abortMultipartUploadsTransition", "storageClassTransitions"],
  },
);

const cloudflareR2LockConditionSchema = s.oneOf(
  [
    s.requiredObject("Lock each object for a number of seconds after upload.", {
      type: s.literal("Age", { description: "The condition type." }),
      maxAgeSeconds: s.nonNegativeInteger("The lock duration in seconds."),
    }),
    s.requiredObject("Lock each object until a specific date.", {
      type: s.literal("Date", { description: "The condition type." }),
      date: s.dateTime("The date and time until which objects stay locked."),
    }),
    s.requiredObject("Lock each object indefinitely.", {
      type: s.literal("Indefinite", { description: "The condition type." }),
    }),
  ],
  { description: "The condition that defines the lock duration." },
);

const cloudflareR2LockRuleSchema = s.object(
  "A bucket lock rule.",
  {
    id: s.nonEmptyString("The unique identifier of the rule."),
    enabled: s.boolean("Whether the rule is in effect."),
    prefix: s.optional(
      s.string(
        "Only objects and uploads whose keys start with this prefix are affected. Use an empty prefix to match everything.",
      ),
    ),
    condition: cloudflareR2LockConditionSchema,
  },
  { optional: ["prefix"] },
);

const cloudflareR2SippyDestinationSchema = s.requiredObject(
  "The R2 credentials Sippy uses to write objects into this bucket. Defaults to the connected API token when omitted.",
  {
    accessKeyId: s.nonEmptyString("The Access Key ID of an R2 API token scoped to this bucket."),
    secretAccessKey: s.nonEmptyString("The Secret Access Key of the same R2 API token."),
  },
);

const cloudflareR2SippySourceSchema = s.oneOf(
  [
    s.requiredObject("An AWS S3 source bucket.", {
      provider: s.literal("aws", { description: "The source provider." }),
      bucket: s.nonEmptyString("The AWS S3 bucket name."),
      region: s.nonEmptyString("The AWS region of the bucket."),
      accessKeyId: s.nonEmptyString("The Access Key ID of an IAM credential scoped to the bucket."),
      secretAccessKey: s.nonEmptyString("The Secret Access Key of the same IAM credential."),
    }),
    s.requiredObject("A Google Cloud Storage source bucket.", {
      provider: s.literal("gcs", { description: "The source provider." }),
      bucket: s.nonEmptyString("The GCS bucket name."),
      clientEmail: s.nonEmptyString("The client email of a service account scoped to the bucket."),
      privateKey: s.nonEmptyString("The private key of the same service account."),
    }),
    s.requiredObject("A generic S3-compatible source bucket.", {
      provider: s.literal("s3", { description: "The source provider." }),
      bucketUrl: s.url("The URL of the S3-compatible API endpoint for the bucket."),
      accessKeyId: s.nonEmptyString("The Access Key ID of a credential scoped to the bucket."),
      secretAccessKey: s.nonEmptyString("The Secret Access Key of the same credential."),
    }),
    s.object(
      "An Azure Blob Storage source container. Provide exactly one of accountKey or sasToken.",
      {
        provider: s.literal("azure", { description: "The source provider." }),
        accountName: s.nonEmptyString("The Azure Storage account name."),
        container: s.nonEmptyString("The Azure Blob Storage container name."),
        accountKey: s.optional(s.nonEmptyString("The access key of the storage account.")),
        sasToken: s.optional(s.nonEmptyString("A Shared Access Signature token for the storage account.")),
      },
      { optional: ["accountKey", "sasToken"] },
    ),
  ],
  { description: "The source bucket Sippy copies objects from." },
);

const cloudflareR2SippyConfigSchema = s.object(
  "The Sippy configuration of an R2 bucket.",
  {
    enabled: s.boolean("Whether Sippy is enabled for the bucket."),
    source: s.optional(
      s.object(
        "The configured source bucket.",
        {
          provider: s.string("The source provider: aws, gcs, s3, or azure."),
          bucket: s.optional(s.nullableString("The source bucket name for AWS and GCS.")),
          bucketUrl: s.optional(s.nullableString("The S3-compatible endpoint URL for generic S3 sources.")),
          container: s.optional(s.nullableString("The Azure Blob Storage container name.")),
          region: s.optional(s.nullableString("The AWS region of the source bucket.")),
        },
        { optional: ["bucket", "bucketUrl", "container", "region"] },
      ),
    ),
    destination: s.optional(
      s.object(
        "The configured R2 destination.",
        {
          provider: s.string("The destination provider, always r2."),
          account: s.optional(s.string("The Cloudflare account ID.")),
          bucket: s.optional(s.string("The destination bucket name.")),
          accessKeyId: s.optional(s.string("The Access Key ID of the R2 API token Sippy writes with.")),
        },
        { optional: ["account", "bucket", "accessKeyId"] },
      ),
    ),
  },
  { optional: ["source", "destination"] },
);

function bucketScopedInputSchema(description: string) {
  return s.object(
    description,
    {
      bucketName: cloudflareR2BucketNameSchema,
      jurisdiction: s.optional(cloudflareR2JurisdictionSchema),
    },
    { optional: ["jurisdiction"] },
  );
}

export const cloudflareR2BucketSettingsActions: ActionDefinition[] = [
  defineProviderAction("cloudflare_r2", {
    name: "get_bucket_lifecycle",
    operationType: "read",
    description: "Get the object lifecycle rules of an R2 bucket.",
    requiredScopes: ["workers-r2.read"],
    providerPermissions: [...cloudflareR2ReadPermissions],
    inputSchema: bucketScopedInputSchema("Input for reading lifecycle rules."),
    outputSchema: s.requiredObject("The lifecycle rules of the bucket.", {
      rules: s.array("The configured lifecycle rules.", cloudflareR2LifecycleRuleSchema),
    }),
  }),
  defineProviderAction("cloudflare_r2", {
    name: "update_bucket_lifecycle",
    operationType: "destructive",
    description: "Replace the object lifecycle rules of an R2 bucket with the given rule set.",
    requiredScopes: ["workers-r2.write"],
    providerPermissions: [...cloudflareR2WritePermissions],
    inputSchema: s.object(
      "Input for replacing lifecycle rules.",
      {
        bucketName: cloudflareR2BucketNameSchema,
        rules: s.array(
          "The full lifecycle rule set to store. An empty array removes all rules.",
          cloudflareR2LifecycleRuleSchema,
        ),
        jurisdiction: s.optional(cloudflareR2JurisdictionSchema),
      },
      { optional: ["jurisdiction"] },
    ),
    outputSchema: s.requiredObject("The lifecycle update result.", {
      bucketName: s.string("The bucket whose lifecycle rules were replaced."),
      updated: s.boolean("Whether the update request succeeded."),
    }),
  }),
  defineProviderAction("cloudflare_r2", {
    name: "get_bucket_lock",
    operationType: "read",
    description: "Get the object lock rules of an R2 bucket.",
    requiredScopes: ["workers-r2.read"],
    providerPermissions: [...cloudflareR2ReadPermissions],
    inputSchema: bucketScopedInputSchema("Input for reading lock rules."),
    outputSchema: s.requiredObject("The lock rules of the bucket.", {
      rules: s.array("The configured lock rules.", cloudflareR2LockRuleSchema),
    }),
  }),
  defineProviderAction("cloudflare_r2", {
    name: "update_bucket_lock",
    operationType: "destructive",
    description: "Replace the object lock rules of an R2 bucket with the given rule set.",
    requiredScopes: ["workers-r2.write"],
    providerPermissions: [...cloudflareR2WritePermissions],
    inputSchema: s.object(
      "Input for replacing lock rules.",
      {
        bucketName: cloudflareR2BucketNameSchema,
        rules: s.array(
          "The full lock rule set to store. An empty array removes all rules.",
          cloudflareR2LockRuleSchema,
        ),
        jurisdiction: s.optional(cloudflareR2JurisdictionSchema),
      },
      { optional: ["jurisdiction"] },
    ),
    outputSchema: s.requiredObject("The lock update result.", {
      bucketName: s.string("The bucket whose lock rules were replaced."),
      updated: s.boolean("Whether the update request succeeded."),
    }),
  }),
  defineProviderAction("cloudflare_r2", {
    name: "get_bucket_local_uploads",
    operationType: "read",
    description:
      "Get whether local uploads are enabled, which writes objects to the nearest region before replicating to the primary region.",
    requiredScopes: ["workers-r2.read"],
    providerPermissions: [...cloudflareR2ReadPermissions],
    inputSchema: s.requiredObject("Input for reading the local uploads setting.", {
      bucketName: cloudflareR2BucketNameSchema,
    }),
    outputSchema: s.requiredObject("The local uploads setting of the bucket.", {
      enabled: s.boolean("Whether local uploads are enabled for the bucket."),
    }),
  }),
  defineProviderAction("cloudflare_r2", {
    name: "update_bucket_local_uploads",
    operationType: "destructive",
    description: "Enable or disable local uploads for an R2 bucket.",
    requiredScopes: ["workers-r2.write"],
    providerPermissions: [...cloudflareR2WritePermissions],
    inputSchema: s.requiredObject("Input for updating the local uploads setting.", {
      bucketName: cloudflareR2BucketNameSchema,
      enabled: s.boolean("Whether to enable local uploads for the bucket."),
    }),
    outputSchema: s.requiredObject("The local uploads update result.", {
      bucketName: s.string("The bucket whose setting was updated."),
      enabled: s.boolean("The stored local uploads setting."),
    }),
  }),
  defineProviderAction("cloudflare_r2", {
    name: "get_sippy_config",
    operationType: "read",
    description: "Get the Sippy incremental migration configuration of an R2 bucket.",
    requiredScopes: ["workers-r2.read"],
    providerPermissions: [...cloudflareR2ReadPermissions],
    inputSchema: bucketScopedInputSchema("Input for reading the Sippy configuration."),
    outputSchema: cloudflareR2SippyConfigSchema,
  }),
  defineProviderAction("cloudflare_r2", {
    name: "enable_sippy",
    operationType: "write",
    description:
      "Enable Sippy so that objects missing from the R2 bucket are copied on demand from a source bucket on AWS S3, Google Cloud Storage, an S3-compatible service, or Azure Blob Storage.",
    requiredScopes: ["workers-r2.write"],
    providerPermissions: [...cloudflareR2WritePermissions],
    inputSchema: s.object(
      "Input for enabling Sippy.",
      {
        bucketName: cloudflareR2BucketNameSchema,
        source: cloudflareR2SippySourceSchema,
        destination: s.optional(cloudflareR2SippyDestinationSchema),
        jurisdiction: s.optional(cloudflareR2JurisdictionSchema),
      },
      { optional: ["destination", "jurisdiction"] },
    ),
    outputSchema: cloudflareR2SippyConfigSchema,
  }),
  defineProviderAction("cloudflare_r2", {
    name: "disable_sippy",
    operationType: "destructive",
    description: "Disable Sippy on an R2 bucket.",
    requiredScopes: ["workers-r2.write"],
    providerPermissions: [...cloudflareR2WritePermissions],
    inputSchema: bucketScopedInputSchema("Input for disabling Sippy."),
    outputSchema: s.requiredObject("The Sippy disable result.", {
      bucketName: s.string("The bucket Sippy was disabled on."),
      enabled: s.boolean("The Sippy state after the request, always false."),
    }),
  }),
];

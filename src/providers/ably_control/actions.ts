import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ably_control";

const accountIdField = s.string({
  description: "The Ably account ID.",
  minLength: 1,
});
const appIdField = s.string({
  description: "The Ably application ID.",
  minLength: 1,
});
const keyIdField = s.string({
  description: "The Ably API key ID.",
  minLength: 1,
});
const queueIdField = s.string({
  description: "The Ably queue ID.",
  minLength: 1,
});
const timestampField = s.integer({
  description: "A Unix timestamp in milliseconds.",
});
const rawObjectField = (description: string) => s.looseObject({}, { description });

const capabilityField = s.record(
  {
    type: "array",
    items: {
      type: "string",
      minLength: 1,
      description: "A capability operation such as publish, subscribe, or history.",
    },
    description: "Capability operations granted for this channel or resource.",
  },
  { description: "Ably channel capabilities keyed by channel or resource name." },
);

const appSchema = s.object(
  {
    id: appIdField,
    accountId: s.nullable(s.string({ description: "The Ably account ID that owns the app." })),
    name: s.nullable(s.string({ description: "The app name." })),
    status: s.nullable(s.string({ description: "The app status." })),
    tlsOnly: s.nullable(s.boolean({ description: "Whether TLS is enforced for this app." })),
    apnsUseSandboxEndpoint: s.nullable(
      s.boolean({ description: "Whether APNs uses the sandbox endpoint for this app." }),
    ),
    raw: rawObjectField("The raw app object returned by Ably."),
  },
  {
    required: ["id", "raw"],
    description: "A normalized Ably app.",
  },
);

const keySchema = s.object(
  {
    id: keyIdField,
    appId: s.nullable(s.string({ description: "The Ably app ID that owns the key." })),
    name: s.nullable(s.string({ description: "The key name." })),
    status: s.nullable(s.integer({ description: "The Ably key status code." })),
    key: s.nullable(s.string({ description: "The complete API key returned by Ably when available." })),
    capability: s.nullable(capabilityField),
    created: s.nullable(timestampField),
    modified: s.nullable(timestampField),
    raw: rawObjectField("The raw key object returned by Ably."),
  },
  {
    required: ["id", "raw"],
    description: "A normalized Ably API key.",
  },
);

const queueSchema = s.object(
  {
    id: queueIdField,
    appId: s.nullable(s.string({ description: "The Ably app ID that owns the queue." })),
    name: s.nullable(s.string({ description: "The queue name." })),
    region: s.nullable(s.string({ description: "The Ably queue region." })),
    state: s.nullable(s.string({ description: "The queue state." })),
    ttl: s.nullable(s.integer({ description: "The queue message TTL in seconds." })),
    maxLength: s.nullable(s.integer({ description: "The maximum queue length." })),
    deadletter: s.nullable(s.boolean({ description: "Whether this queue uses dead-letter handling." })),
    raw: rawObjectField("The raw queue object returned by Ably."),
  },
  {
    required: ["id", "raw"],
    description: "A normalized Ably queue.",
  },
);

const statsRecordSchema = s.looseObject(
  {
    intervalId: s.string({ description: "The Ably statistics interval identifier." }),
    unit: s.string({ description: "The statistics aggregation unit." }),
  },
  { description: "An Ably statistics record." },
);

const meSchema = s.object(
  {
    token: s.looseObject(
      {
        id: s.anyOf(
          [
            s.string({ description: "The token ID as a string." }),
            s.integer({ description: "The token ID as a number." }),
          ],
          { description: "The token ID returned by Ably." },
        ),
        name: s.string({ description: "The token friendly name." }),
        capabilities: s.array(s.string({ description: "A token capability." }), {
          description: "The token capabilities.",
        }),
      },
      { description: "The Control API access token details." },
    ),
    user: s.looseObject(
      {
        id: s.anyOf(
          [
            s.string({ description: "The user ID as a string." }),
            s.integer({ description: "The user ID as a number." }),
          ],
          { description: "The user ID returned by Ably." },
        ),
        email: s.string({ description: "The user email address." }),
      },
      { description: "The Ably user associated with the token." },
    ),
    account: s.object(
      {
        id: accountIdField,
        name: s.string({ description: "The account name." }),
      },
      {
        required: ["id", "name"],
        description: "The Ably account associated with the token.",
      },
    ),
  },
  {
    required: ["token", "user", "account"],
    description: "The normalized Ably Control API identity response.",
  },
);

const appInputFields = {
  name: s.string({ description: "The app name.", minLength: 1 }),
  status: s.stringEnum(["enabled", "disabled"], { description: "The app status." }),
  tlsOnly: s.boolean({ description: "Whether to enforce TLS for all connections." }),
  fcmKey: s.nullable(s.string({ description: "The Firebase Cloud Messaging key." })),
  fcmServiceAccount: s.nullable(s.string({ description: "The Firebase Cloud Messaging service account credentials." })),
  fcmProjectId: s.nullable(s.string({ description: "The Firebase Cloud Messaging project ID." })),
  apnsCertificate: s.nullable(s.string({ description: "The Apple Push Notification service certificate." })),
  apnsPrivateKey: s.nullable(s.string({ description: "The Apple Push Notification service private key." })),
  apnsUseSandboxEndpoint: s.nullable(
    s.boolean({ description: "Whether APNs uses the sandbox endpoint for this app." }),
  ),
};

const statsInputSchema = s.object(
  {
    accountId: accountIdField,
    appId: appIdField,
    start: timestampField,
    end: timestampField,
    limit: s.integer({
      description: "The maximum number of statistics records to return.",
      minimum: 1,
      maximum: 1000,
    }),
    unit: s.stringEnum(["minute", "hour", "day", "month"], {
      description: "The statistics aggregation unit.",
    }),
    direction: s.stringEnum(["backwards", "forwards"], {
      description: "The pagination direction.",
    }),
  },
  { description: "Query parameters for retrieving Ably statistics." },
);

export const ablyControlActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_account",
    description: "Retrieve the Ably Control API token, user, and account associated with the access token.",
    inputSchema: s.object({}, { description: "No input is required to retrieve the current Ably account." }),
    outputSchema: s.requiredObject("The current Ably Control API account response.", {
      me: meSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_account_stats",
    description: "Retrieve account-level Ably statistics for the connected account or account ID.",
    inputSchema: statsInputSchema,
    outputSchema: s.requiredObject("The normalized Ably account statistics response.", {
      stats: s.array(statsRecordSchema, {
        description: "Statistics records returned by Ably.",
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "get_app_stats",
    description: "Retrieve app-level Ably statistics for an Ably app.",
    inputSchema: statsInputSchema,
    outputSchema: s.requiredObject("The normalized Ably app statistics response.", {
      stats: s.array(statsRecordSchema, {
        description: "Statistics records returned by Ably.",
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "list_apps",
    description: "List Ably apps in the connected account or supplied account ID.",
    inputSchema: s.object({ accountId: accountIdField }, { description: "Input for listing Ably apps." }),
    outputSchema: s.requiredObject("The normalized Ably app list response.", {
      apps: s.array(appSchema, { description: "Apps returned by Ably." }),
    }),
  }),
  defineProviderAction(service, {
    name: "create_app",
    description: "Create an Ably app in the connected account or supplied account ID.",
    inputSchema: s.object(
      { accountId: accountIdField, ...appInputFields },
      {
        required: ["name"],
        description: "App fields forwarded to Ably's create app endpoint.",
      },
    ),
    outputSchema: s.requiredObject("The normalized Ably app creation response.", { app: appSchema }),
  }),
  defineProviderAction(service, {
    name: "update_app",
    description: "Update editable settings for an Ably app.",
    inputSchema: s.object(
      { appId: appIdField, ...appInputFields },
      {
        required: ["appId"],
        description: "App fields forwarded to Ably's update app endpoint.",
      },
    ),
    outputSchema: s.requiredObject("The normalized Ably app update response.", { app: appSchema }),
  }),
  defineProviderAction(service, {
    name: "delete_app",
    description: "Delete an Ably app by app ID.",
    inputSchema: s.requiredObject("Input for deleting an Ably app.", { appId: appIdField }),
    outputSchema: s.requiredObject("The normalized Ably app delete response.", {
      success: s.boolean({ description: "Whether Ably accepted the delete request." }),
    }),
  }),
  defineProviderAction(service, {
    name: "list_keys",
    description: "List API keys for an Ably app.",
    inputSchema: s.requiredObject("Input for listing Ably API keys.", { appId: appIdField }),
    outputSchema: s.requiredObject("The normalized Ably key list response.", {
      keys: s.array(keySchema, { description: "API keys returned by Ably." }),
    }),
  }),
  defineProviderAction(service, {
    name: "create_key",
    description: "Create an API key for an Ably app.",
    inputSchema: s.requiredObject("Key fields forwarded to Ably's create key endpoint.", {
      appId: appIdField,
      name: s.string({ description: "The key name.", minLength: 1 }),
      capability: capabilityField,
    }),
    outputSchema: s.requiredObject("The normalized Ably key creation response.", { key: keySchema }),
  }),
  defineProviderAction(service, {
    name: "update_key",
    description: "Update an Ably API key name or capability.",
    inputSchema: s.object(
      {
        appId: appIdField,
        keyId: keyIdField,
        name: s.string({ description: "The key name.", minLength: 1 }),
        capability: capabilityField,
      },
      {
        required: ["appId", "keyId"],
        description: "Key fields forwarded to Ably's update key endpoint.",
      },
    ),
    outputSchema: s.requiredObject("The normalized Ably key update response.", { key: keySchema }),
  }),
  defineProviderAction(service, {
    name: "revoke_key",
    description: "Revoke an Ably API key by key ID.",
    inputSchema: s.requiredObject("Input for revoking an Ably API key.", {
      appId: appIdField,
      keyId: keyIdField,
    }),
    outputSchema: s.requiredObject("The normalized Ably key revocation response.", {
      success: s.boolean({ description: "Whether Ably accepted the revoke request." }),
    }),
  }),
  defineProviderAction(service, {
    name: "list_queues",
    description: "List queues for an Ably app.",
    inputSchema: s.requiredObject("Input for listing Ably queues.", { appId: appIdField }),
    outputSchema: s.requiredObject("The normalized Ably queue list response.", {
      queues: s.array(queueSchema, { description: "Queues returned by Ably." }),
    }),
  }),
  defineProviderAction(service, {
    name: "create_queue",
    description: "Create a queue for an Ably app.",
    inputSchema: s.object(
      {
        appId: appIdField,
        name: s.string({ description: "The queue name.", minLength: 1 }),
        region: s.string({
          description: "The queue region, such as eu-west-1-a.",
          minLength: 1,
        }),
        ttl: s.integer({ description: "The message TTL in seconds.", minimum: 0 }),
        maxLength: s.integer({ description: "The maximum queue length.", minimum: 0 }),
      },
      {
        required: ["appId", "name", "region"],
        description: "Queue fields forwarded to Ably's create queue endpoint.",
      },
    ),
    outputSchema: s.requiredObject("The normalized Ably queue creation response.", { queue: queueSchema }),
  }),
  defineProviderAction(service, {
    name: "delete_queue",
    description: "Delete an Ably queue by queue ID.",
    inputSchema: s.requiredObject("Input for deleting an Ably queue.", {
      appId: appIdField,
      queueId: queueIdField,
    }),
    outputSchema: s.requiredObject("The normalized Ably queue delete response.", {
      success: s.boolean({ description: "Whether Ably accepted the delete request." }),
    }),
  }),
];

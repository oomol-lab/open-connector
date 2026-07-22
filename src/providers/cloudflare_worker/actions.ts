import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "cloudflare_worker";

const workersReadScope = "workers-scripts.read";
const workersWriteScope = "workers-scripts.write";
const workersReadPermission = "Workers Scripts Read";
const workersWritePermission = "Workers Scripts Write";

const accountIdSchema = s.nonEmptyString(
  "The Cloudflare account ID. Omit this when the connection can uniquely determine the account. This field is required for multi-account OAuth connections; use list_accounts to find an accessible account ID.",
);
const workerIdSchema = s.nonEmptyString("The Cloudflare Worker ID.");
const workerNameSchema = s.nonEmptyString("The Worker name.");
const scriptNameSchema = s.nonEmptyString("The Cloudflare Worker script name.");
const secretNameSchema = s.nonEmptyString("The Cloudflare Worker secret name.");
const looseObjectSchema = s.looseObject("A free-form object accepted by the Cloudflare API.");
const looseObjectArraySchema = (description: string): JsonSchema => s.array(description, looseObjectSchema);

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

const accountSchema = s.object(
  "A Cloudflare account summary.",
  {
    id: s.string("The Cloudflare account ID."),
    name: s.string("The Cloudflare account name."),
    type: s.string("The Cloudflare account type."),
  },
  { required: ["id"], optional: ["name", "type"] },
);

const workerSchema = s.object(
  "A Cloudflare Worker managed by the Workers beta API.",
  {
    id: s.string("The immutable Worker ID."),
    name: s.string("The Worker name."),
    createdOn: s.string("The Worker creation timestamp."),
    updatedOn: s.string("The last Worker update timestamp."),
    deployedOn: s.nullable(s.string("The latest deployment timestamp, or null when undeployed.")),
    logpush: s.boolean("Whether logpush is enabled for the Worker."),
    observability: looseObjectSchema,
    references: looseObjectSchema,
    subdomain: looseObjectSchema,
    tags: s.stringArray("Tags associated with the Worker."),
    tailConsumers: looseObjectArraySchema("Other Workers that should consume logs from the Worker."),
  },
  {
    required: ["id", "name"],
    optional: [
      "createdOn",
      "updatedOn",
      "deployedOn",
      "logpush",
      "observability",
      "references",
      "subdomain",
      "tags",
      "tailConsumers",
    ],
  },
);

const workerScriptSchema = s.object(
  "A Cloudflare Worker script summary.",
  {
    name: s.string("The Worker script name."),
    scriptTag: s.string("The Worker script tag identifier."),
    createdOn: s.string("The script creation timestamp."),
    modifiedOn: s.string("The last script update timestamp."),
    compatibilityDate: s.string("The compatibility date."),
    compatibilityFlags: s.stringArray("The compatibility flags."),
    entrypoint: s.string("The entrypoint module."),
    handlers: s.stringArray("The Worker handlers."),
    usageModel: s.string("The Worker usage model."),
    placementMode: s.string("The placement mode."),
    logpush: s.boolean("Whether logpush is enabled."),
    environmentName: s.string("The environment name."),
    environmentIsDefault: s.boolean("Whether the environment is the default environment."),
    serviceName: s.string("The Worker service name."),
    tags: s.stringArray("The Worker tags."),
    observability: looseObjectSchema,
  },
  {
    optional: [
      "name",
      "scriptTag",
      "createdOn",
      "modifiedOn",
      "compatibilityDate",
      "compatibilityFlags",
      "entrypoint",
      "handlers",
      "usageModel",
      "placementMode",
      "logpush",
      "environmentName",
      "environmentIsDefault",
      "serviceName",
      "tags",
      "observability",
    ],
    additionalProperties: true,
  },
);

const workerScriptSettingsSchema = s.object(
  "Cloudflare Worker script settings.",
  {
    bindings: looseObjectArraySchema("The script bindings."),
    compatibilityDate: s.string("The compatibility date."),
    compatibilityFlags: s.stringArray("The compatibility flags."),
    logpush: s.boolean("Whether logpush is enabled."),
    observability: looseObjectSchema,
    placementMode: s.string("The placement mode."),
    tags: s.stringArray("The script tags."),
    tailConsumers: looseObjectArraySchema("Tail consumer definitions."),
    usageModel: s.string("The usage model."),
    limits: looseObjectSchema,
    migrations: looseObjectSchema,
  },
  {
    optional: [
      "bindings",
      "compatibilityDate",
      "compatibilityFlags",
      "logpush",
      "observability",
      "placementMode",
      "tags",
      "tailConsumers",
      "usageModel",
      "limits",
      "migrations",
    ],
    additionalProperties: true,
  },
);

const workerSecretSchema = s.object(
  "A Cloudflare Worker secret binding.",
  {
    name: s.string("The secret binding name."),
    type: s.string("The secret binding type."),
    text: s.nullable(s.string("The redacted secret text field.")),
    algorithm: s.string("The key algorithm for key secrets."),
    format: s.string("The key format for key secrets."),
    publicKey: s.string("The public key for key secrets."),
    iv: s.string("The initialization vector for key secrets."),
  },
  { required: ["name"], optional: ["type", "text", "algorithm", "format", "publicKey", "iv"] },
);

const workerModuleSchema = s.object(
  "A module file to upload with a Worker script.",
  {
    name: s.nonEmptyString("The multipart part name and file name for this Worker module."),
    content: s.string("The source content for this Worker module."),
    contentType: s.string("The MIME type for this Worker module part."),
  },
  { required: ["name", "content"], optional: ["contentType"] },
);

const workerMutationFields = {
  name: workerNameSchema,
  logpush: s.boolean("Whether logpush should be enabled for the Worker."),
  observability: looseObjectSchema,
  subdomain: looseObjectSchema,
  tags: s.stringArray("Tags to set on the Worker."),
  tailConsumers: looseObjectArraySchema("Tail consumer definitions to set on the Worker."),
};

const workerUploadMetadataFields = {
  bindings: looseObjectArraySchema("Bindings to expose in the Worker."),
  compatibilityDate: s.string("The compatibility date."),
  compatibilityFlags: s.stringArray("The compatibility flags."),
  logpush: s.boolean("Whether logpush should be enabled for the Worker."),
  placement: looseObjectSchema,
  tags: s.stringArray("Tags to attach to the Worker."),
  tailConsumers: looseObjectArraySchema("Tail consumer definitions."),
  migrations: looseObjectArraySchema("Durable Object migrations to apply."),
  annotations: looseObjectSchema,
  assets: looseObjectSchema,
  keepAssets: s.boolean("Whether to retain assets from the previously uploaded Worker version."),
};

const editWorkerInputSchema = s.object(
  "The input payload for this action.",
  {
    accountId: accountIdSchema,
    workerId: workerIdSchema,
    ...workerMutationFields,
  },
  {
    required: ["workerId"],
    optional: ["accountId", "name", "logpush", "observability", "subdomain", "tags", "tailConsumers"],
  },
) as JsonSchema;
editWorkerInputSchema.anyOf = ["name", "logpush", "observability", "subdomain", "tags", "tailConsumers"].map(
  (field) => ({ required: [field] }),
);

const searchWorkerScriptsInputSchema = s.object(
  "The input payload for this action.",
  {
    accountId: accountIdSchema,
    id: s.nonEmptyString("Search by exact Worker script tag."),
    name: s.nonEmptyString("Search by Worker script name."),
    orderBy: s.stringEnum("The search sort field.", ["created_on", "modified_on", "name"]),
    page: s.positiveInteger("The result page number."),
    perPage: s.positiveInteger("The page size."),
  },
  { optional: ["accountId", "id", "name", "orderBy", "page", "perPage"] },
) as JsonSchema;
searchWorkerScriptsInputSchema.anyOf = [{ required: ["id"] }, { required: ["name"] }];

const patchWorkerScriptSettingsInputSchema = s.object(
  "The input payload for this action.",
  {
    accountId: accountIdSchema,
    scriptName: scriptNameSchema,
    bindings: looseObjectArraySchema("The full bindings array to set on the script."),
    compatibilityDate: s.string("The compatibility date."),
    compatibilityFlags: s.stringArray("The compatibility flags."),
    logpush: s.boolean("Whether logpush should be enabled."),
    observability: looseObjectSchema,
    placementMode: s.string("The placement mode."),
    tags: s.stringArray("The script tags."),
    tailConsumers: looseObjectArraySchema("Tail consumer definitions."),
    usageModel: s.string("The usage model."),
    limits: looseObjectSchema,
    migrations: looseObjectSchema,
  },
  {
    required: ["scriptName"],
    optional: [
      "accountId",
      "bindings",
      "compatibilityDate",
      "compatibilityFlags",
      "logpush",
      "observability",
      "placementMode",
      "tags",
      "tailConsumers",
      "usageModel",
      "limits",
      "migrations",
    ],
  },
) as JsonSchema;
patchWorkerScriptSettingsInputSchema.anyOf = [
  "bindings",
  "compatibilityDate",
  "compatibilityFlags",
  "logpush",
  "observability",
  "placementMode",
  "tags",
  "tailConsumers",
  "usageModel",
  "limits",
  "migrations",
].map((field) => ({ required: [field] }));

export type CloudflareWorkerActionName =
  | "list_accounts"
  | "list_workers"
  | "get_worker"
  | "create_worker"
  | "update_worker"
  | "edit_worker"
  | "delete_worker"
  | "list_worker_scripts"
  | "search_worker_scripts"
  | "upload_worker_script"
  | "put_worker_script_content"
  | "get_worker_script_content"
  | "get_worker_script_settings"
  | "patch_worker_script_settings"
  | "list_worker_script_secrets"
  | "get_worker_script_secret"
  | "put_worker_script_secret"
  | "delete_worker_script_secret"
  | "delete_worker_script";

export const cloudflareWorkerActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_accounts",
    description: "List Cloudflare accounts visible to the current credential.",
    requiredScopes: [workersReadScope],
    providerPermissions: [workersReadPermission],
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
    name: "list_workers",
    description: "List Workers in a Cloudflare account using the Workers beta API.",
    requiredScopes: [workersReadScope],
    providerPermissions: [workersReadPermission],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        accountId: accountIdSchema,
        page: s.positiveInteger("The result page number."),
        perPage: s.positiveInteger("The page size."),
        order: s.stringEnum("The sort direction.", ["asc", "desc"]),
        orderBy: s.nonEmptyString("The field to order by."),
      },
      { optional: ["accountId", "page", "perPage", "order", "orderBy"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      workers: s.array("The list of Workers.", workerSchema),
      resultInfo: s.nullable(resultInfoSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_worker",
    description: "Get one Worker by Worker ID using the Workers beta API.",
    requiredScopes: [workersReadScope],
    providerPermissions: [workersReadPermission],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        accountId: accountIdSchema,
        workerId: workerIdSchema,
      },
      { required: ["workerId"], optional: ["accountId"] },
    ),
    outputSchema: s.object("The output payload for this action.", { worker: workerSchema }),
  }),
  defineProviderAction(service, {
    name: "create_worker",
    description: "Create a Cloudflare Worker using the Workers beta API.",
    requiredScopes: [workersWriteScope],
    providerPermissions: [workersWritePermission],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        accountId: accountIdSchema,
        ...workerMutationFields,
      },
      { required: ["name"], optional: ["accountId", "logpush", "observability", "subdomain", "tags", "tailConsumers"] },
    ),
    outputSchema: s.object("The output payload for this action.", { worker: workerSchema }),
  }),
  defineProviderAction(service, {
    name: "update_worker",
    description: "Replace a Cloudflare Worker using the Workers beta API, setting omitted fields to API defaults.",
    requiredScopes: [workersWriteScope],
    providerPermissions: [workersWritePermission],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        accountId: accountIdSchema,
        workerId: workerIdSchema,
        ...workerMutationFields,
      },
      {
        required: ["workerId", "name"],
        optional: ["accountId", "logpush", "observability", "subdomain", "tags", "tailConsumers"],
      },
    ),
    outputSchema: s.object("The output payload for this action.", { worker: workerSchema }),
  }),
  defineProviderAction(service, {
    name: "edit_worker",
    description:
      "Partially update a Cloudflare Worker using the Workers beta API while leaving omitted fields unchanged.",
    requiredScopes: [workersWriteScope],
    providerPermissions: [workersWritePermission],
    inputSchema: editWorkerInputSchema,
    outputSchema: s.object("The output payload for this action.", { worker: workerSchema }),
  }),
  defineProviderAction(service, {
    name: "delete_worker",
    description: "Delete a Cloudflare Worker and its associated resources using the Workers beta API.",
    requiredScopes: [workersWriteScope],
    providerPermissions: [workersWritePermission],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        accountId: accountIdSchema,
        workerId: workerIdSchema,
      },
      { required: ["workerId"], optional: ["accountId"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      id: s.string("The deleted Worker ID."),
      deleted: s.boolean("Whether the delete request succeeded."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_worker_scripts",
    description: "List Worker scripts in a Cloudflare account.",
    requiredScopes: [workersReadScope],
    providerPermissions: [workersReadPermission],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        accountId: accountIdSchema,
        page: s.positiveInteger("The result page number."),
        perPage: s.positiveInteger("The page size."),
      },
      { optional: ["accountId", "page", "perPage"] },
    ),
    outputSchema: s.object(
      "The output payload for this action.",
      {
        scripts: s.array("The list of Worker scripts.", workerScriptSchema),
        resultInfo: resultInfoSchema,
      },
      { optional: ["resultInfo"] },
    ),
  }),
  defineProviderAction(service, {
    name: "search_worker_scripts",
    description: "Search Worker scripts in a Cloudflare account by name or script tag.",
    requiredScopes: [workersReadScope],
    providerPermissions: [workersReadPermission],
    inputSchema: searchWorkerScriptsInputSchema,
    outputSchema: s.object(
      "The output payload for this action.",
      {
        scripts: s.array("The matching Worker scripts.", workerScriptSchema),
        resultInfo: resultInfoSchema,
      },
      { optional: ["resultInfo"] },
    ),
  }),
  defineProviderAction(service, {
    name: "upload_worker_script",
    description: "Create or replace a Cloudflare Worker script by uploading a module bundle as multipart/form-data.",
    requiredScopes: [workersWriteScope],
    providerPermissions: [workersWritePermission],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        accountId: accountIdSchema,
        scriptName: scriptNameSchema,
        mainModuleName: s.nonEmptyString("The multipart part name and file name for the Worker entry module.", {
          default: "main.js",
        }),
        mainModuleContent: s.string("The source content for the Worker entry module."),
        mainModuleContentType: s.string("The MIME type for the Worker entry module part.", {
          default: "application/javascript+module",
        }),
        bindingsInherit: s.stringEnum("Require inherited bindings to resolve against the previous Worker version.", [
          "strict",
        ]),
        modules: s.array("Additional module files to upload with the Worker script.", workerModuleSchema),
        ...workerUploadMetadataFields,
      },
      {
        required: ["scriptName", "mainModuleContent"],
        optional: [
          "accountId",
          "mainModuleName",
          "mainModuleContentType",
          "bindingsInherit",
          "modules",
          "bindings",
          "compatibilityDate",
          "compatibilityFlags",
          "logpush",
          "placement",
          "tags",
          "tailConsumers",
          "migrations",
          "annotations",
          "assets",
          "keepAssets",
        ],
      },
    ),
    outputSchema: s.object("The output payload for this action.", { script: workerScriptSchema }),
  }),
  defineProviderAction(service, {
    name: "put_worker_script_content",
    description: "Replace only the content of a Cloudflare Worker script without changing metadata.",
    requiredScopes: [workersWriteScope],
    providerPermissions: [workersWritePermission],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        accountId: accountIdSchema,
        scriptName: scriptNameSchema,
        mainModuleName: s.nonEmptyString("The multipart part name and file name for the Worker entry module.", {
          default: "main.js",
        }),
        content: s.string("The raw Worker script content."),
        contentType: s.string("The MIME type for the Worker entry module part.", {
          default: "application/javascript+module",
        }),
      },
      { required: ["scriptName", "content"], optional: ["accountId", "mainModuleName", "contentType"] },
    ),
    outputSchema: s.object("The output payload for this action.", { script: workerScriptSchema }),
  }),
  defineProviderAction(service, {
    name: "get_worker_script_content",
    description: "Fetch the raw source content for a Cloudflare Worker script.",
    requiredScopes: [workersReadScope],
    providerPermissions: [workersReadPermission],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        accountId: accountIdSchema,
        scriptName: scriptNameSchema,
      },
      { required: ["scriptName"], optional: ["accountId"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      content: s.string("The raw Worker script content."),
      contentType: s.nullable(s.string("The HTTP content type returned by Cloudflare.")),
    }),
  }),
  defineProviderAction(service, {
    name: "get_worker_script_settings",
    description: "Get Worker metadata and configuration for a Cloudflare Worker script.",
    requiredScopes: [workersReadScope],
    providerPermissions: [workersReadPermission],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        accountId: accountIdSchema,
        scriptName: scriptNameSchema,
      },
      { required: ["scriptName"], optional: ["accountId"] },
    ),
    outputSchema: s.object("The output payload for this action.", { settings: workerScriptSettingsSchema }),
  }),
  defineProviderAction(service, {
    name: "patch_worker_script_settings",
    description: "Patch Worker metadata and configuration for a Cloudflare Worker script.",
    requiredScopes: [workersWriteScope],
    providerPermissions: [workersWritePermission],
    inputSchema: patchWorkerScriptSettingsInputSchema,
    outputSchema: s.object("The output payload for this action.", { settings: workerScriptSettingsSchema }),
  }),
  defineProviderAction(service, {
    name: "list_worker_script_secrets",
    description: "List secret bindings attached to a Cloudflare Worker script.",
    requiredScopes: [workersReadScope],
    providerPermissions: [workersReadPermission],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        accountId: accountIdSchema,
        scriptName: scriptNameSchema,
      },
      { required: ["scriptName"], optional: ["accountId"] },
    ),
    outputSchema: s.object(
      "The output payload for this action.",
      {
        secrets: s.array("The list of Worker secrets.", workerSecretSchema),
        resultInfo: resultInfoSchema,
      },
      { optional: ["resultInfo"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_worker_script_secret",
    description: "Get one secret binding attached to a Cloudflare Worker script.",
    requiredScopes: [workersReadScope],
    providerPermissions: [workersReadPermission],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        accountId: accountIdSchema,
        scriptName: scriptNameSchema,
        secretName: secretNameSchema,
      },
      { required: ["scriptName", "secretName"], optional: ["accountId"] },
    ),
    outputSchema: s.object("The output payload for this action.", { secret: workerSecretSchema }),
  }),
  defineProviderAction(service, {
    name: "put_worker_script_secret",
    description: "Add or replace a secret_text binding on a Cloudflare Worker script.",
    requiredScopes: [workersWriteScope],
    providerPermissions: [workersWritePermission],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        accountId: accountIdSchema,
        scriptName: scriptNameSchema,
        name: secretNameSchema,
        text: s.string("The secret text value."),
        type: s.literal("secret_text", { description: "The Worker secret binding type." }),
      },
      { required: ["scriptName", "name", "text"], optional: ["accountId", "type"] },
    ),
    outputSchema: s.object("The output payload for this action.", { secret: workerSecretSchema }),
  }),
  defineProviderAction(service, {
    name: "delete_worker_script_secret",
    description: "Delete a secret binding from a Cloudflare Worker script.",
    requiredScopes: [workersWriteScope],
    providerPermissions: [workersWritePermission],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        accountId: accountIdSchema,
        scriptName: scriptNameSchema,
        secretName: secretNameSchema,
      },
      { required: ["scriptName", "secretName"], optional: ["accountId"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      name: s.string("The deleted secret binding name."),
      deleted: s.boolean("Whether the delete request succeeded."),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_worker_script",
    description: "Delete a Cloudflare Worker script.",
    requiredScopes: [workersWriteScope],
    providerPermissions: [workersWritePermission],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        accountId: accountIdSchema,
        scriptName: scriptNameSchema,
        force: s.boolean(
          "Whether to force deletion of associated service bindings, Durable Objects, or other bindings.",
        ),
      },
      { required: ["scriptName"], optional: ["accountId", "force"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      scriptName: s.string("The deleted Worker script name."),
      deleted: s.boolean("Whether the delete request succeeded."),
    }),
  }),
];

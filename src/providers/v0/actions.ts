import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

type SchemaProperties = Record<string, JsonSchema>;

const service = "v0";

const emptyInputSchema = s.object("The input payload for this action.", {});
const timestampSchema = s.string("ISO 8601 timestamp returned by v0.");
const objectTypeField = s.string("Object type returned by v0.");
const idField = s.string("Unique identifier returned by v0.");
const projectIdField = s.string("v0 project ID.");
const chatIdField = s.string("v0 chat ID.");
const messageIdField = s.string("v0 message ID.");
const versionIdField = s.string("v0 version ID.");
const deploymentIdField = s.string("v0 deployment ID.");
const environmentVariableIdField = s.string("v0 environment variable ID.");
const hookIdField = s.string("v0 hook ID.");
const responseModeField = s.stringEnum(
  "How v0 should return the result. `sync` waits for the full response, `async` returns the accepted task state.",
  ["sync", "async"],
);
const chatPrivacyField = s.stringEnum("Chat visibility setting.", [
  "public",
  "private",
  "team",
  "team-edit",
  "unlisted",
]);
const limitField = s.integer("Maximum number of results to return.", {
  minimum: 1,
  maximum: 100,
});
const offsetField = s.integer("Offset for paginated list results.", { minimum: 0 });
const cursorField = s.string("Cursor returned by a previous v0 list response.");
const decryptedField = s.boolean("When true, request decrypted environment variable values.");

function inputObject<const TProperties extends SchemaProperties>(
  properties: TProperties,
  optional?: readonly (keyof TProperties & string)[],
) {
  return s.object("The input payload for this action.", properties, optional ? { optional } : {});
}

function outputObject<const TProperties extends SchemaProperties>(
  properties: TProperties,
  optional?: readonly (keyof TProperties & string)[],
) {
  return s.object("The output payload for this action.", properties, optional ? { optional } : {});
}

function described(schema: JsonSchema, description: string): JsonSchema {
  return {
    ...schema,
    description,
  };
}

function stringArray(itemDescription: string, description: string, minItems?: number) {
  return s.array(description, s.string(itemDescription), minItems ? { minItems } : {});
}

function requireAtLeastOneUpdateField(schema: JsonSchema, _fieldNames: readonly string[]): JsonSchema {
  return schema;
}

const paginationSchema = s.looseObject("Pagination metadata returned by v0.", {
  hasMore: s.boolean("Whether more results are available."),
  nextCursor: s.nullable(s.string("Cursor for the next page, or null when there are no more results.")),
  nextUrl: s.nullable(s.string("Full URL for the next page when v0 returns one.")),
  offset: s.integer("Offset for the next page."),
  total: s.integer("Total number of items reported by v0."),
  count: s.integer("Number of items in the current page."),
});

const attachmentSchema = s.object(
  "Attachment payload returned by v0.",
  {
    url: s.string("Attachment URL."),
    name: s.string("Attachment file name."),
    contentType: s.string("Attachment MIME type."),
    size: s.integer("Attachment size in bytes."),
    content: s.string("Inline attachment content when v0 returns it."),
    type: s.string("Attachment type reported by v0."),
  },
  { optional: ["url", "name", "contentType", "size", "content", "type"] },
);

const fileSchema = s.object(
  "File payload returned by v0.",
  {
    object: objectTypeField,
    name: s.string("File path."),
    content: s.string("File content."),
    locked: s.boolean("Whether the file is locked in v0."),
    origin: s.string("Origin of the file."),
    language: s.string("Programming language detected by v0."),
    metadata: s.record("Additional file metadata returned by v0.", s.unknown("A metadata value returned by v0.")),
  },
  { optional: ["object", "name", "content", "locked", "origin", "language", "metadata"] },
);

const versionSchema = s.object(
  "Version payload returned by v0.",
  {
    id: idField,
    object: objectTypeField,
    status: s.string("Version generation status."),
    demoUrl: s.string("Preview URL for the version."),
    screenshotUrl: s.string("Screenshot URL for the version."),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    files: s.array("Files included in the version.", fileSchema),
  },
  { optional: ["object", "status", "demoUrl", "screenshotUrl", "createdAt", "updatedAt", "files"] },
);

const messageSchema = s.object(
  "Message payload returned by v0.",
  {
    id: idField,
    object: objectTypeField,
    chatId: s.string("Owning chat ID."),
    role: s.string("Message role such as `user` or `assistant`."),
    type: s.string("Message type reported by v0."),
    content: s.string("Message text content."),
    finishReason: s.string("Why the generation finished."),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    apiUrl: s.string("API URL for the message."),
    modelConfiguration: s.looseObject("Model configuration returned by v0."),
    attachments: s.array("Attachments associated with the message.", attachmentSchema),
    experimentalContent: s.unknown("Experimental rich content payload returned by v0."),
  },
  {
    optional: [
      "object",
      "chatId",
      "role",
      "type",
      "content",
      "finishReason",
      "createdAt",
      "updatedAt",
      "apiUrl",
      "modelConfiguration",
      "attachments",
      "experimentalContent",
    ],
  },
);

const chatSummaryProperties = {
  id: idField,
  object: objectTypeField,
  name: s.string("Chat title or display name."),
  privacy: s.string("Chat visibility setting."),
  favorite: s.boolean("Whether the chat is marked as favorite."),
  authorId: s.string("Author user ID."),
  projectId: s.string("Linked project ID."),
  vercelProjectId: s.string("Linked Vercel project ID."),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  apiUrl: s.string("API URL for the chat."),
  webUrl: s.string("Web URL for the chat."),
} satisfies SchemaProperties;

const chatSummaryOptional = [
  "object",
  "name",
  "privacy",
  "favorite",
  "authorId",
  "projectId",
  "vercelProjectId",
  "createdAt",
  "updatedAt",
  "apiUrl",
  "webUrl",
] as const;

const chatSummarySchema = s.object("Chat summary payload returned by v0.", chatSummaryProperties, {
  optional: chatSummaryOptional,
});

const chatSchema = s.object(
  "Chat payload returned by v0.",
  {
    ...chatSummaryProperties,
    metadata: s.looseObject("Chat metadata payload returned by v0."),
    latestVersion: described(versionSchema, "Latest version attached to the chat."),
    messages: s.array("Messages currently returned with the chat.", messageSchema),
  },
  { optional: [...chatSummaryOptional, "metadata", "latestVersion", "messages"] },
);

const projectSchema = s.object(
  "Project payload returned by v0.",
  {
    id: idField,
    object: objectTypeField,
    name: s.string("Project name."),
    description: s.string("Project description."),
    instructions: s.string("Project-level instructions for v0."),
    icon: s.string("Project icon or emoji."),
    privacy: s.string("Project visibility setting."),
    vercelProjectId: s.string("Linked Vercel project ID."),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    apiUrl: s.string("API URL for the project."),
    webUrl: s.string("Web URL for the project."),
    chats: s.array("Chats currently linked to the project.", chatSummarySchema),
  },
  {
    optional: [
      "object",
      "name",
      "description",
      "instructions",
      "icon",
      "privacy",
      "vercelProjectId",
      "createdAt",
      "updatedAt",
      "apiUrl",
      "webUrl",
      "chats",
    ],
  },
);

const envVarSchema = s.object(
  "Environment variable payload returned by v0.",
  {
    id: idField,
    object: objectTypeField,
    key: s.string("Environment variable key."),
    value: s.string("Environment variable value."),
    decrypted: s.boolean("Whether the returned value is decrypted."),
    createdAt: s.integer("Creation timestamp in milliseconds."),
    updatedAt: s.integer("Last update timestamp in milliseconds."),
    deleted: s.boolean("Whether the environment variable was deleted."),
  },
  { optional: ["object", "key", "value", "decrypted", "createdAt", "updatedAt", "deleted"] },
);

const deploymentSchema = s.object(
  "Deployment payload returned by v0.",
  {
    id: idField,
    object: objectTypeField,
    inspectorUrl: s.string("Inspector URL for the deployment."),
    chatId: s.string("Linked chat ID."),
    projectId: s.string("Linked project ID."),
    versionId: s.string("Linked version ID."),
    apiUrl: s.string("API URL for the deployment."),
    webUrl: s.string("Public deployment URL."),
  },
  { optional: ["object", "inspectorUrl", "chatId", "projectId", "versionId", "apiUrl", "webUrl"] },
);

const deploymentLogSchema = s.object(
  "Deployment log payload returned by v0.",
  {
    id: idField,
    object: objectTypeField,
    deploymentId: s.string("Owning deployment ID."),
    createdAt: timestampSchema,
    text: s.string("Log text."),
    type: s.string("Log type reported by v0."),
    level: s.string("Log level reported by v0."),
  },
  { optional: ["object", "deploymentId", "createdAt", "text", "type", "level"] },
);

const deploymentErrorsSchema = s.object(
  "Deployment error details.",
  {
    error: s.string("Short deployment error summary."),
    fullErrorText: s.string("Full deployment error text."),
    errorType: s.string("Deployment error type."),
    formattedError: s.string("Formatted deployment error message."),
  },
  { optional: ["error", "fullErrorText", "errorType", "formattedError"] },
);

const userSchema = s.object(
  "User payload returned by v0.",
  {
    id: idField,
    object: objectTypeField,
    name: s.string("User display name."),
    email: s.string("User email address."),
    avatar: s.string("Avatar URL."),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  },
  { optional: ["object", "name", "email", "avatar", "createdAt", "updatedAt"] },
);

const assignmentSchema = s.object(
  "Assignment result returned by v0.",
  {
    id: idField,
    object: objectTypeField,
    assigned: s.boolean("Whether the chat was assigned to the project."),
  },
  { optional: ["object", "assigned"] },
);

const deletedResourceSchema = s.object(
  "Deletion result returned by v0.",
  {
    id: idField,
    object: objectTypeField,
    deleted: s.boolean("Whether the resource was deleted."),
  },
  { optional: ["object", "deleted"] },
);

const favoriteSchema = s.object(
  "Favorite status returned by v0.",
  {
    id: idField,
    object: objectTypeField,
    favorited: s.boolean("Whether the chat is now marked as favorite."),
  },
  { optional: ["object", "favorited"] },
);

const hookEventSchema = s.stringEnum("One v0 webhook event type.", [
  "chat.created",
  "chat.updated",
  "chat.deleted",
  "message.created",
  "message.updated",
  "message.deleted",
  "message.finished",
]);

const hookSchema = s.object(
  "Webhook hook payload returned by v0.",
  {
    id: idField,
    object: objectTypeField,
    name: s.string("Webhook display name."),
    events: s.array("Webhook events subscribed in v0.", s.string("One subscribed webhook event.")),
    chatId: s.string("Optional chat ID scoped to the hook."),
    projectId: s.string("Optional project ID scoped to the hook."),
    url: s.string("Target URL that receives webhook payloads."),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    description: s.string("Optional description returned by v0."),
    active: s.boolean("Whether the hook is currently active."),
  },
  {
    optional: [
      "object",
      "name",
      "events",
      "chatId",
      "projectId",
      "url",
      "createdAt",
      "updatedAt",
      "description",
      "active",
    ],
  },
);

const rateLimitWindowSchema = s.object(
  "Rate-limit window information returned by v0.",
  {
    limit: s.number("Maximum number of requests allowed in the current window."),
    remaining: s.number("Remaining number of requests in the current window."),
    reset: s.number("Reset timestamp in milliseconds."),
    isWithinGracePeriod: s.boolean("Whether the limit is still inside v0's grace period."),
  },
  { optional: ["remaining", "reset", "isWithinGracePeriod"] },
);

const rateLimitSchema = s.object(
  "Rate-limit information returned by v0.",
  {
    limit: s.number("Maximum number of requests allowed in the current window."),
    remaining: s.number("Remaining number of requests in the current window."),
    reset: s.number("Reset timestamp in milliseconds."),
    dailyLimit: described(rateLimitWindowSchema, "Daily message limit information for free-tier usage."),
  },
  { optional: ["remaining", "reset", "dailyLimit"] },
);

const billingBalanceSchema = s.object("Billing balance returned by v0.", {
  remaining: s.number("Remaining billing balance."),
  total: s.number("Total billing balance."),
});

const billingCycleSchema = s.object("Billing cycle returned by v0.", {
  start: s.number("Billing cycle start timestamp."),
  end: s.number("Billing cycle end timestamp."),
});

const billingSchema = s.object(
  "Billing information returned by v0.",
  {
    billingType: s.string("Billing model currently active in v0."),
    data: s.looseObject("Raw billing payload returned by v0."),
    remaining: s.number("Remaining request quota when v0 returns it."),
    reset: s.number("Quota reset timestamp when v0 returns it."),
    limit: s.number("Quota limit when v0 returns it."),
  },
  { optional: ["billingType", "data", "remaining", "reset", "limit"] },
);

const planSchema = s.object(
  "Subscription plan returned by v0.",
  {
    object: objectTypeField,
    plan: s.string("Subscription plan name."),
    billingCycle: billingCycleSchema,
    balance: billingBalanceSchema,
  },
  { optional: ["object", "billingCycle", "balance"] },
);

const scopeSchema = s.object(
  "Scope returned by v0.",
  {
    id: idField,
    object: objectTypeField,
    name: s.string("Scope display name."),
  },
  { optional: ["object", "name"] },
);

const usageUserSchema = s.object(
  "User information associated with the usage event.",
  {
    id: s.string("User ID associated with the usage event."),
    object: objectTypeField,
    name: s.string("User display name associated with the usage event."),
    email: s.string("User email associated with the usage event."),
  },
  { optional: ["id", "object", "name", "email"] },
);

const usageEventSchema = s.object(
  "Usage event returned by v0.",
  {
    id: idField,
    object: objectTypeField,
    type: s.string("Usage event type reported by v0."),
    promptCost: s.string("Prompt-side cost for the usage event."),
    completionCost: s.string("Completion-side cost for the usage event."),
    totalCost: s.string("Total cost for the usage event."),
    chatId: s.string("Chat ID associated with the usage event."),
    messageId: s.string("Message ID associated with the usage event."),
    userId: s.string("User ID associated with the usage event."),
    user: usageUserSchema,
    createdAt: timestampSchema,
  },
  {
    optional: [
      "object",
      "type",
      "promptCost",
      "completionCost",
      "totalCost",
      "chatId",
      "messageId",
      "userId",
      "user",
      "createdAt",
    ],
  },
);

const usageMetaSchema = s.object("Usage report metadata returned by v0.", {
  totalCount: s.integer("Total number of usage events in the current response."),
});

const vercelProjectSchema = s.object(
  "Linked Vercel project returned by v0.",
  {
    id: idField,
    object: objectTypeField,
    name: s.string("Linked Vercel project name."),
  },
  { optional: ["object", "name"] },
);

const projectEnvironmentVariableInputSchema = s.object("Environment variable input.", {
  key: s.string("Environment variable key."),
  value: s.string("Environment variable value."),
});

const projectEnvironmentVariableUpdateInputSchema = s.object(
  "Environment variable update input.",
  {
    id: environmentVariableIdField,
    key: s.string("Updated environment variable key."),
    value: s.string("Updated environment variable value."),
  },
  { optional: ["key", "value"] },
);

const inputFileSchema = s.object(
  "File input payload.",
  {
    name: s.string("File path."),
    content: s.string("File content."),
    locked: s.boolean("Whether the file should be locked in v0."),
  },
  { optional: ["locked"] },
);

const repoInputSchema = s.object(
  "Repository source used when `type` is `repo`.",
  {
    url: s.string("Git repository URL."),
    branch: s.string("Git branch to clone."),
  },
  { optional: ["branch"] },
);

const registryInputSchema = s.object("Registry source used when `type` is `registry`.", {
  url: s.string("Component registry URL."),
});

const zipInputSchema = s.object(
  "Zip source used when `type` is `zip`.",
  {
    url: s.string("Zip archive URL."),
    lockAllFiles: s.boolean("Whether all imported files should be locked."),
  },
  { optional: ["lockAllFiles"] },
);

const sendMessageActionSchema = s.object("Optional follow-up action.", {
  type: s.literal("fix-with-v0", { description: "Follow-up action type." }),
});

const createChatInputSchema = inputObject(
  {
    message: s.string("Initial user message to send to v0."),
    projectId: projectIdField,
    chatPrivacy: chatPrivacyField,
    responseMode: responseModeField,
    metadata: s.looseObject("Chat metadata to attach."),
    modelId: s.string("Model ID to use when supported by v0."),
    modelConfiguration: s.looseObject("Model configuration overrides."),
    designSystemId: s.string("Design system ID to reuse."),
    mcpServerIds: stringArray("One MCP server ID to attach.", "MCP server IDs to attach."),
    attachedSkillIds: stringArray("One skill ID to attach.", "Attached skill IDs."),
    action: sendMessageActionSchema,
  },
  [
    "projectId",
    "chatPrivacy",
    "responseMode",
    "metadata",
    "modelId",
    "modelConfiguration",
    "designSystemId",
    "mcpServerIds",
    "attachedSkillIds",
    "action",
  ],
);

const initChatInputSchema = inputObject(
  {
    name: s.string("Chat name shown in v0."),
    projectId: projectIdField,
    type: s.stringEnum("Initialization source type.", ["files", "repo", "registry", "zip", "template"]),
    files: s.array("Inline files used when `type` is `files`.", inputFileSchema),
    repo: repoInputSchema,
    registry: registryInputSchema,
    zip: zipInputSchema,
    templateId: s.string("Template ID used when `type` is `template`."),
    chatPrivacy: chatPrivacyField,
    metadata: s.looseObject("Chat metadata to attach."),
  },
  ["name", "projectId", "files", "repo", "registry", "zip", "templateId", "chatPrivacy", "metadata"],
);

const sendMessageInputSchema = inputObject(
  {
    chatId: chatIdField,
    message: s.string("Message text to send to v0."),
    responseMode: responseModeField,
    system: s.string("System instruction appended to the message."),
    attachments: s.array("Attachments sent with the message.", attachmentSchema),
    modelId: s.string("Model ID to use when supported by v0."),
    modelConfiguration: s.looseObject("Model configuration overrides."),
    mcpServerIds: stringArray("One MCP server ID to attach.", "MCP server IDs to attach."),
    attachedSkillIds: stringArray("One skill ID to attach.", "Attached skill IDs."),
    action: sendMessageActionSchema,
  },
  [
    "responseMode",
    "system",
    "attachments",
    "modelId",
    "modelConfiguration",
    "mcpServerIds",
    "attachedSkillIds",
    "action",
  ],
);

const usageReportInputSchema = inputObject(
  {
    limit: limitField,
    cursor: cursorField,
    chatId: chatIdField,
    userId: s.string("Filter usage events by user ID."),
    messageId: messageIdField,
    startDate: s.string("Only include events on or after this ISO timestamp."),
    endDate: s.string("Only include events on or before this ISO timestamp."),
  },
  ["limit", "cursor", "chatId", "userId", "messageId", "startDate", "endDate"],
);

export const v0Actions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_user",
    operationType: "read",
    description: "Get the authenticated v0 user profile for the connected API key.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: outputObject({ user: described(userSchema, "The authenticated v0 user.") }),
  }),
  defineProviderAction(service, {
    name: "find_projects",
    operationType: "read",
    description: "List v0 projects available to the connected account.",
    requiredScopes: [],
    inputSchema: inputObject({ limit: limitField, offset: offsetField }, ["limit", "offset"]),
    outputSchema: outputObject(
      {
        projects: s.array("Projects returned by v0.", projectSchema),
        pagination: paginationSchema,
      },
      ["pagination"],
    ),
  }),
  defineProviderAction(service, {
    name: "create_project",
    operationType: "write",
    description: "Create a new v0 project container for chats, environment variables, and deployments.",
    requiredScopes: [],
    inputSchema: inputObject(
      {
        name: s.string("Project name."),
        description: s.string("Project description."),
        icon: s.string("Project icon or emoji."),
        instructions: s.string("Project-level instructions for v0."),
        privacy: s.stringEnum("Project visibility setting.", ["private", "team"]),
        vercelProjectId: s.string("Linked Vercel project ID."),
        environmentVariables: s.array(
          "Environment variables to create together with the project.",
          projectEnvironmentVariableInputSchema,
        ),
      },
      ["description", "icon", "instructions", "privacy", "vercelProjectId", "environmentVariables"],
    ),
    outputSchema: outputObject({ project: described(projectSchema, "The created project.") }),
  }),
  defineProviderAction(service, {
    name: "get_project",
    operationType: "read",
    description: "Get a single v0 project by project ID.",
    requiredScopes: [],
    inputSchema: inputObject({ projectId: projectIdField }),
    outputSchema: outputObject({ project: described(projectSchema, "The requested project.") }),
  }),
  defineProviderAction(service, {
    name: "update_project",
    operationType: "write",
    description: "Update a v0 project's metadata, instructions, visibility, or linked Vercel project.",
    requiredScopes: [],
    inputSchema: requireAtLeastOneUpdateField(
      inputObject(
        {
          projectId: projectIdField,
          name: s.string("Updated project name."),
          description: s.string("Updated project description."),
          icon: s.string("Updated project icon or emoji."),
          instructions: s.string("Updated project instructions."),
          privacy: s.stringEnum("Updated project visibility.", ["private", "team"]),
          vercelProjectId: s.string("Updated linked Vercel project ID."),
        },
        ["name", "description", "icon", "instructions", "privacy", "vercelProjectId"],
      ),
      ["name", "description", "icon", "instructions", "privacy", "vercelProjectId"],
    ),
    outputSchema: outputObject({ project: described(projectSchema, "The updated project.") }),
  }),
  defineProviderAction(service, {
    name: "get_project_by_chat",
    operationType: "read",
    description: "Get the v0 project currently linked to a chat.",
    requiredScopes: [],
    inputSchema: inputObject({ chatId: chatIdField }),
    outputSchema: outputObject({
      project: described(projectSchema, "The project linked to the chat."),
    }),
  }),
  defineProviderAction(service, {
    name: "assign_project_to_chat",
    operationType: "write",
    description: "Assign an existing v0 chat to a project container.",
    requiredScopes: [],
    inputSchema: inputObject({ projectId: projectIdField, chatId: chatIdField }),
    outputSchema: outputObject({ assignment: assignmentSchema }),
  }),
  defineProviderAction(service, {
    name: "delete_project",
    operationType: "destructive",
    description: "Delete a v0 project by project ID.",
    requiredScopes: [],
    inputSchema: inputObject({ projectId: projectIdField }),
    outputSchema: outputObject({
      deletedProject: described(deletedResourceSchema, "Deletion result returned by v0."),
    }),
  }),
  defineProviderAction(service, {
    name: "find_env_vars",
    operationType: "read",
    description: "List environment variables configured on a v0 project.",
    requiredScopes: [],
    inputSchema: inputObject({ projectId: projectIdField, decrypted: decryptedField }, ["decrypted"]),
    outputSchema: outputObject({
      envVars: s.array("Environment variables returned by v0.", envVarSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_env_var",
    operationType: "read",
    description: "Get a single environment variable from a v0 project.",
    requiredScopes: [],
    inputSchema: inputObject(
      {
        projectId: projectIdField,
        environmentVariableId: environmentVariableIdField,
        decrypted: decryptedField,
      },
      ["decrypted"],
    ),
    outputSchema: outputObject({
      envVar: described(envVarSchema, "The requested environment variable."),
    }),
  }),
  defineProviderAction(service, {
    name: "create_env_vars",
    operationType: "write",
    description: "Create one or more environment variables on a v0 project.",
    requiredScopes: [],
    inputSchema: inputObject(
      {
        projectId: projectIdField,
        decrypted: decryptedField,
        upsert: s.boolean("When true, allow overwriting keys that already exist."),
        environmentVariables: s.array("Environment variables to create.", projectEnvironmentVariableInputSchema, {
          minItems: 1,
        }),
      },
      ["decrypted", "upsert"],
    ),
    outputSchema: outputObject({
      envVars: s.array("The created environment variables.", envVarSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "update_env_vars",
    operationType: "write",
    description: "Update existing environment variables on a v0 project.",
    requiredScopes: [],
    inputSchema: inputObject(
      {
        projectId: projectIdField,
        decrypted: decryptedField,
        environmentVariables: s.array("Environment variables to update.", projectEnvironmentVariableUpdateInputSchema, {
          minItems: 1,
        }),
      },
      ["decrypted"],
    ),
    outputSchema: outputObject({
      envVars: s.array("The updated environment variables.", envVarSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_env_vars",
    operationType: "destructive",
    description: "Delete one or more environment variables from a v0 project.",
    requiredScopes: [],
    inputSchema: inputObject({
      projectId: projectIdField,
      environmentVariableIds: stringArray(
        "One environment variable ID to delete.",
        "Environment variable IDs to delete.",
        1,
      ),
    }),
    outputSchema: outputObject({
      deletedEnvVars: s.array("Deletion results returned by v0.", envVarSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_chat",
    operationType: "write",
    description: "Create a new v0 chat and immediately send the first message.",
    requiredScopes: [],
    inputSchema: createChatInputSchema,
    outputSchema: outputObject({ chat: described(chatSchema, "The created chat.") }),
  }),
  defineProviderAction(service, {
    name: "init_chat",
    operationType: "write",
    description: "Initialize a new v0 chat from files, a repository, a registry, a zip archive, or a template.",
    requiredScopes: [],
    inputSchema: initChatInputSchema,
    outputSchema: outputObject({ chat: described(chatSchema, "The initialized chat.") }),
  }),
  defineProviderAction(service, {
    name: "send_message",
    operationType: "write",
    description: "Send a follow-up message to an existing v0 chat.",
    requiredScopes: [],
    inputSchema: sendMessageInputSchema,
    outputSchema: outputObject({
      chat: described(chatSchema, "The updated chat state returned by v0."),
    }),
  }),
  defineProviderAction(service, {
    name: "find_chats",
    operationType: "read",
    description: "List chats in the connected v0 workspace with optional filters.",
    requiredScopes: [],
    inputSchema: inputObject(
      {
        projectId: projectIdField,
        vercelProjectId: s.string("Filter by linked Vercel project ID."),
        branch: s.string("Filter by Git branch."),
        isFavorite: s.boolean("Filter by favorite status."),
        limit: limitField,
        offset: offsetField,
      },
      ["projectId", "vercelProjectId", "branch", "isFavorite", "limit", "offset"],
    ),
    outputSchema: outputObject(
      {
        chats: s.array("Chats returned by v0.", chatSummarySchema),
        pagination: paginationSchema,
      },
      ["pagination"],
    ),
  }),
  defineProviderAction(service, {
    name: "get_chat",
    operationType: "read",
    description: "Get a single v0 chat, including the current messages when v0 returns them.",
    requiredScopes: [],
    inputSchema: inputObject({ chatId: chatIdField }),
    outputSchema: outputObject({ chat: described(chatSchema, "The requested chat.") }),
  }),
  defineProviderAction(service, {
    name: "update_chat",
    operationType: "write",
    description: "Update a v0 chat's metadata such as its name or privacy.",
    requiredScopes: [],
    inputSchema: requireAtLeastOneUpdateField(
      inputObject(
        {
          chatId: chatIdField,
          name: s.string("Updated chat name."),
          privacy: described(chatPrivacyField, "Updated chat privacy."),
        },
        ["name", "privacy"],
      ),
      ["name", "privacy"],
    ),
    outputSchema: outputObject({ chat: described(chatSchema, "The updated chat.") }),
  }),
  defineProviderAction(service, {
    name: "favorite_chat",
    operationType: "write",
    description: "Mark or unmark a v0 chat as favorite.",
    requiredScopes: [],
    inputSchema: inputObject({
      chatId: chatIdField,
      isFavorite: s.boolean("Whether the chat should be favorited."),
    }),
    outputSchema: outputObject({ favorite: favoriteSchema }),
  }),
  defineProviderAction(service, {
    name: "fork_chat",
    operationType: "write",
    description: "Fork an existing v0 chat into a new chat workspace.",
    requiredScopes: [],
    inputSchema: inputObject(
      {
        chatId: chatIdField,
        privacy: described(chatPrivacyField, "Privacy for the forked chat."),
        versionId: versionIdField,
      },
      ["privacy", "versionId"],
    ),
    outputSchema: outputObject({ chat: described(chatSchema, "The forked chat.") }),
  }),
  defineProviderAction(service, {
    name: "delete_chat",
    operationType: "destructive",
    description: "Delete a v0 chat by chat ID.",
    requiredScopes: [],
    inputSchema: inputObject({ chatId: chatIdField }),
    outputSchema: outputObject({
      deletedChat: described(deletedResourceSchema, "Deletion result returned by v0."),
    }),
  }),
  defineProviderAction(service, {
    name: "find_messages",
    operationType: "read",
    description: "List messages for a v0 chat.",
    requiredScopes: [],
    inputSchema: inputObject(
      {
        chatId: chatIdField,
        limit: limitField,
        cursor: cursorField,
      },
      ["limit", "cursor"],
    ),
    outputSchema: outputObject(
      {
        messages: s.array("Messages returned by v0.", messageSchema),
        pagination: paginationSchema,
      },
      ["pagination"],
    ),
  }),
  defineProviderAction(service, {
    name: "get_message",
    operationType: "read",
    description: "Get a single message from a v0 chat.",
    requiredScopes: [],
    inputSchema: inputObject({ chatId: chatIdField, messageId: messageIdField }),
    outputSchema: outputObject({ message: described(messageSchema, "The requested message.") }),
  }),
  defineProviderAction(service, {
    name: "resume_message",
    operationType: "write",
    description: "Resume a previously asynchronous v0 message generation.",
    requiredScopes: [],
    inputSchema: inputObject({ chatId: chatIdField, messageId: messageIdField }),
    outputSchema: outputObject({
      message: described(messageSchema, "The resumed message state returned by v0."),
    }),
  }),
  defineProviderAction(service, {
    name: "find_versions",
    operationType: "read",
    description: "List generated versions for a v0 chat.",
    requiredScopes: [],
    inputSchema: inputObject(
      {
        chatId: chatIdField,
        limit: limitField,
        cursor: cursorField,
      },
      ["limit", "cursor"],
    ),
    outputSchema: outputObject(
      {
        versions: s.array("Versions returned by v0.", versionSchema),
        pagination: paginationSchema,
      },
      ["pagination"],
    ),
  }),
  defineProviderAction(service, {
    name: "get_version",
    operationType: "read",
    description: "Get a single v0 chat version, optionally including default deployment files.",
    requiredScopes: [],
    inputSchema: inputObject(
      {
        chatId: chatIdField,
        versionId: versionIdField,
        includeDefaultFiles: s.boolean("Whether to include default deployment files."),
      },
      ["includeDefaultFiles"],
    ),
    outputSchema: outputObject({ version: described(versionSchema, "The requested version.") }),
  }),
  defineProviderAction(service, {
    name: "update_version",
    operationType: "write",
    description: "Update the files of an existing v0 chat version.",
    requiredScopes: [],
    inputSchema: inputObject({
      chatId: chatIdField,
      versionId: versionIdField,
      files: s.array("Files to update on the version.", inputFileSchema, { minItems: 1 }),
    }),
    outputSchema: outputObject({ version: described(versionSchema, "The updated version.") }),
  }),
  defineProviderAction(service, {
    name: "create_deployment",
    operationType: "write",
    description: "Create a deployment for a specific v0 chat version.",
    requiredScopes: [],
    inputSchema: inputObject({
      projectId: projectIdField,
      chatId: chatIdField,
      versionId: versionIdField,
    }),
    outputSchema: outputObject({
      deployment: described(deploymentSchema, "The created deployment."),
    }),
  }),
  defineProviderAction(service, {
    name: "find_deployments",
    operationType: "read",
    description: "List deployments for a specific project, chat, and version combination.",
    requiredScopes: [],
    inputSchema: inputObject({
      projectId: projectIdField,
      chatId: chatIdField,
      versionId: versionIdField,
    }),
    outputSchema: outputObject({
      deployments: s.array("Deployments returned by v0.", deploymentSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_deployment",
    operationType: "read",
    description: "Get a single deployment by deployment ID.",
    requiredScopes: [],
    inputSchema: inputObject({ deploymentId: deploymentIdField }),
    outputSchema: outputObject({
      deployment: described(deploymentSchema, "The requested deployment."),
    }),
  }),
  defineProviderAction(service, {
    name: "find_deployment_logs",
    operationType: "read",
    description: "List logs for a v0 deployment, optionally continuing from a previous timestamp.",
    requiredScopes: [],
    inputSchema: inputObject(
      {
        deploymentId: deploymentIdField,
        since: s.integer("Only return logs after this timestamp."),
      },
      ["since"],
    ),
    outputSchema: outputObject(
      {
        logs: s.array("Deployment logs returned by v0.", deploymentLogSchema),
        nextSince: s.integer("Timestamp token for the next log query."),
      },
      ["nextSince"],
    ),
  }),
  defineProviderAction(service, {
    name: "find_deployment_errors",
    operationType: "read",
    description: "Get the current error summary for a v0 deployment.",
    requiredScopes: [],
    inputSchema: inputObject({ deploymentId: deploymentIdField }),
    outputSchema: outputObject({ errors: deploymentErrorsSchema }),
  }),
  defineProviderAction(service, {
    name: "find_hooks",
    operationType: "read",
    description: "List webhook hooks configured in the connected v0 workspace.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: outputObject({ hooks: s.array("Hooks returned by v0.", hookSchema) }),
  }),
  defineProviderAction(service, {
    name: "create_hook",
    operationType: "write",
    description: "Create a webhook hook in v0 for chat or message events.",
    requiredScopes: [],
    inputSchema: inputObject(
      {
        name: s.string("Webhook display name."),
        url: s.string("Target URL that receives webhook payloads."),
        events: s.array("Event types to subscribe to.", hookEventSchema, { minItems: 1 }),
        chatId: chatIdField,
        projectId: projectIdField,
      },
      ["chatId", "projectId"],
    ),
    outputSchema: outputObject({ hook: described(hookSchema, "The created hook.") }),
  }),
  defineProviderAction(service, {
    name: "get_hook",
    operationType: "read",
    description: "Get a single webhook hook by hook ID.",
    requiredScopes: [],
    inputSchema: inputObject({ hookId: hookIdField }),
    outputSchema: outputObject({ hook: described(hookSchema, "The requested hook.") }),
  }),
  defineProviderAction(service, {
    name: "update_hook",
    operationType: "write",
    description: "Update an existing webhook hook in v0.",
    requiredScopes: [],
    inputSchema: requireAtLeastOneUpdateField(
      inputObject(
        {
          hookId: hookIdField,
          name: s.string("Updated webhook display name."),
          url: s.string("Updated target URL."),
          events: s.array("Updated event subscriptions.", hookEventSchema),
        },
        ["name", "url", "events"],
      ),
      ["name", "url", "events"],
    ),
    outputSchema: outputObject({ hook: described(hookSchema, "The updated hook.") }),
  }),
  defineProviderAction(service, {
    name: "delete_hook",
    operationType: "destructive",
    description: "Delete a webhook hook by hook ID.",
    requiredScopes: [],
    inputSchema: inputObject({ hookId: hookIdField }),
    outputSchema: outputObject({
      deletedHook: described(deletedResourceSchema, "Deletion result returned by v0."),
    }),
  }),
  defineProviderAction(service, {
    name: "find_rate_limit",
    operationType: "read",
    description: "Get current v0 rate-limit information for the workspace or a specific scope.",
    requiredScopes: [],
    inputSchema: inputObject({ scope: s.string("Workspace, project, or billing scope in v0.") }, ["scope"]),
    outputSchema: outputObject({ rateLimit: rateLimitSchema }),
  }),
  defineProviderAction(service, {
    name: "get_billing",
    operationType: "read",
    description: "Get current v0 billing and quota information.",
    requiredScopes: [],
    inputSchema: inputObject({ scope: s.string("Workspace, project, or billing scope in v0.") }, ["scope"]),
    outputSchema: outputObject({ billing: billingSchema }),
  }),
  defineProviderAction(service, {
    name: "get_plan",
    operationType: "read",
    description: "Get the current subscription plan for the connected v0 user.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: outputObject({ plan: planSchema }),
  }),
  defineProviderAction(service, {
    name: "get_user_scopes",
    operationType: "read",
    description: "List workspaces and scopes accessible to the connected v0 user.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: outputObject({ scopes: s.array("Scopes returned by v0.", scopeSchema) }),
  }),
  defineProviderAction(service, {
    name: "get_usage_report",
    operationType: "read",
    description: "Get usage events and pagination information from the v0 usage report API.",
    requiredScopes: [],
    inputSchema: usageReportInputSchema,
    outputSchema: outputObject(
      {
        usageEvents: s.array("Usage events returned by v0.", usageEventSchema),
        pagination: paginationSchema,
        meta: usageMetaSchema,
      },
      ["pagination", "meta"],
    ),
  }),
  defineProviderAction(service, {
    name: "create_vercel_project",
    operationType: "write",
    description: "Create and link a Vercel project from a v0 project.",
    requiredScopes: [],
    inputSchema: inputObject({
      projectId: projectIdField,
      name: s.string("Name to assign to the linked Vercel project."),
    }),
    outputSchema: outputObject({
      vercelProject: described(vercelProjectSchema, "The linked Vercel project returned by v0."),
    }),
  }),
  defineProviderAction(service, {
    name: "find_vercel_projects",
    operationType: "read",
    description: "List Vercel projects linked to the connected v0 workspace.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: outputObject({
      vercelProjects: s.array("Linked Vercel projects returned by v0.", vercelProjectSchema),
    }),
  }),
];

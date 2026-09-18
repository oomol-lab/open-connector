import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "browserbase";

const browserbaseRegionSchema = s.stringEnum("The Browserbase region where the session runs.", [
  "us-west-2",
  "us-east-1",
  "eu-central-1",
  "ap-southeast-1",
]);

const browserbaseSessionStatusSchema = s.stringEnum("The current Browserbase session status.", [
  "PENDING",
  "RUNNING",
  "ERROR",
  "TIMED_OUT",
  "COMPLETED",
]);

const browserbaseUserMetadataSchema = s.record(
  "Arbitrary user metadata attached to the Browserbase session.",
  s.unknown("A JSON-compatible metadata value."),
);

const browserbaseProjectSchema = s.object(
  "A Browserbase project.",
  {
    id: s.nonEmptyString("The Browserbase project identifier."),
    createdAt: s.dateTime("When the Browserbase project was created."),
    updatedAt: s.dateTime("When the Browserbase project was last updated."),
    name: s.string("The Browserbase project name."),
    ownerId: s.nonEmptyString("The owner identifier of the Browserbase project."),
    defaultTimeout: s.integer("The default session timeout in seconds for the Browserbase project."),
    concurrency: s.integer("The concurrent session limit configured for the Browserbase project."),
  },
  { optional: ["concurrency"] },
);

const browserbaseProjectUsageSchema = s.actionOutput(
  {
    browserMinutes: s.integer("The browser minutes consumed by the Browserbase project."),
    proxyBytes: s.integer("The proxy bytes consumed by the Browserbase project."),
  },
  "Browserbase project usage statistics.",
);

const browserbaseContextSchema = s.object("A Browserbase context.", {
  id: s.nonEmptyString("The Browserbase context identifier."),
  createdAt: s.dateTime("When the Browserbase context was created."),
  updatedAt: s.dateTime("When the Browserbase context was last updated."),
  projectId: s.nonEmptyString("The Browserbase project identifier linked to the context."),
});

const browserbaseContextUploadSchema = s.object("The Browserbase context upload credentials.", {
  id: s.nonEmptyString("The Browserbase context identifier."),
  uploadUrl: s.url("The upload URL for the encrypted user-data directory archive."),
  publicKey: s.nonEmptyString("The public key used to encrypt the context archive."),
  cipherAlgorithm: s.nonEmptyString("The cipher algorithm required by Browserbase."),
  initializationVectorSize: s.integer("The initialization vector size required by Browserbase."),
});

const browserbaseSessionSchema = s.object(
  "A Browserbase session.",
  {
    id: s.nonEmptyString("The Browserbase session identifier."),
    createdAt: s.dateTime("When the Browserbase session was created."),
    updatedAt: s.dateTime("When the Browserbase session was last updated."),
    projectId: s.nonEmptyString("The Browserbase project identifier linked to the session."),
    startedAt: s.dateTime("When the Browserbase session started."),
    expiresAt: s.dateTime("When the Browserbase session expires."),
    status: browserbaseSessionStatusSchema,
    proxyBytes: s.integer("The proxy bytes consumed by the Browserbase session."),
    keepAlive: s.boolean("Whether the Browserbase session stays alive after disconnections."),
    region: browserbaseRegionSchema,
    endedAt: s.dateTime("When the Browserbase session ended."),
    contextId: s.nonEmptyString("The linked Browserbase context identifier."),
    connectUrl: s.url("The WebSocket URL used to connect to the Browserbase session."),
    seleniumRemoteUrl: s.url("The Selenium Remote URL used to connect to the Browserbase session."),
    signingKey: s.nonEmptyString("The signing key required for Browserbase HTTP connections."),
    userMetadata: browserbaseUserMetadataSchema,
  },
  {
    optional: ["endedAt", "contextId", "connectUrl", "seleniumRemoteUrl", "signingKey", "userMetadata"],
  },
);

const browserbaseProjectIdInputSchema = s.actionInput(
  {
    id: s.nonEmptyString("The Browserbase project identifier."),
  },
  ["id"],
  "The input payload for reading one Browserbase project.",
);

const browserbaseOptionalProjectIdInputSchema = s.actionInput(
  {
    id: s.nonEmptyString("The Browserbase project identifier. When omitted, the connected project is used."),
  },
  [],
  "The input payload for project-scoped Browserbase actions.",
);

const browserbaseContextIdInputSchema = s.actionInput(
  {
    id: s.nonEmptyString("The Browserbase context identifier."),
  },
  ["id"],
  "The input payload for a Browserbase context identifier.",
);

const browserbaseCreateContextInputSchema = s.actionInput(
  {
    projectId: s.nonEmptyString("The Browserbase project identifier. When omitted, the connected project is used."),
  },
  [],
  "The input payload for creating a Browserbase context.",
);

const browserbaseCreateSessionInputSchema: JsonSchema = {
  ...s.actionInput(
    {
      projectId: s.nonEmptyString("The Browserbase project identifier. When omitted, the connected project is used."),
      timeout: s.integer("The session timeout in seconds.", { minimum: 60, maximum: 21600 }),
      keepAlive: s.boolean("Whether the Browserbase session stays alive after disconnections."),
      region: browserbaseRegionSchema,
      userMetadata: browserbaseUserMetadataSchema,
      contextId: s.nonEmptyString("The Browserbase context identifier to attach to the session."),
      persist: s.boolean("Whether Browserbase should persist updates back into the attached context."),
    },
    [],
    "The input payload for creating a Browserbase session.",
  ),
  allOf: [
    {
      if: { properties: { persist: { const: true } }, required: ["persist"] },
      then: { required: ["contextId"] },
    },
  ],
};

const browserbaseListSessionsInputSchema = s.actionInput(
  {
    status: browserbaseSessionStatusSchema,
    q: s.nonEmptyString("The Browserbase metadata query string used to filter sessions."),
  },
  [],
  "The input payload for listing Browserbase sessions.",
);

const browserbaseRequestSessionReleaseInputSchema = s.actionInput(
  {
    id: s.nonEmptyString("The Browserbase session identifier."),
    projectId: s.nonEmptyString("The Browserbase project identifier. When omitted, the connected project is used."),
  },
  ["id"],
  "The input payload for requesting Browserbase session release.",
);

export const browserbaseActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_projects",
    operationType: "read",
    description: "List the Browserbase projects visible to the current API key.",
    inputSchema: s.actionInput({}, [], "This action does not require any input."),
    outputSchema: s.actionOutput(
      {
        projects: s.array("The Browserbase projects returned.", browserbaseProjectSchema),
      },
      "The Browserbase projects returned by the API.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_project",
    operationType: "read",
    description: "Get one Browserbase project by project identifier.",
    inputSchema: browserbaseProjectIdInputSchema,
    outputSchema: s.actionOutput(
      {
        project: browserbaseProjectSchema,
      },
      "The Browserbase project payload.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_project_usage",
    operationType: "read",
    description:
      "Get Browserbase browser minute and proxy byte usage for one project, defaulting to the connected project.",
    inputSchema: browserbaseOptionalProjectIdInputSchema,
    outputSchema: browserbaseProjectUsageSchema,
  }),
  defineProviderAction(service, {
    name: "create_context",
    operationType: "write",
    description: "Create a Browserbase context and return the upload credentials for an encrypted user-data directory.",
    inputSchema: browserbaseCreateContextInputSchema,
    outputSchema: browserbaseContextUploadSchema,
  }),
  defineProviderAction(service, {
    name: "get_context",
    operationType: "read",
    description: "Get one Browserbase context by context identifier.",
    inputSchema: browserbaseContextIdInputSchema,
    outputSchema: s.actionOutput(
      {
        context: browserbaseContextSchema,
      },
      "The Browserbase context payload.",
    ),
  }),
  defineProviderAction(service, {
    name: "refresh_context_upload_credentials",
    operationType: "write",
    description:
      "Refresh the Browserbase upload credentials for an existing context so a new encrypted archive can be uploaded.",
    inputSchema: browserbaseContextIdInputSchema,
    outputSchema: browserbaseContextUploadSchema,
  }),
  defineProviderAction(service, {
    name: "delete_context",
    operationType: "destructive",
    description: "Delete one Browserbase context by context identifier.",
    inputSchema: browserbaseContextIdInputSchema,
    outputSchema: s.actionOutput(
      {
        success: s.boolean("Whether Browserbase confirmed the context deletion."),
      },
      "The Browserbase context deletion result.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_session",
    operationType: "write",
    description:
      "Create a Browserbase session using the connected project by default, with optional context reuse and persistence.",
    followUpActions: ["browserbase.get_session", "browserbase.request_session_release"],
    inputSchema: browserbaseCreateSessionInputSchema,
    outputSchema: s.actionOutput(
      {
        session: browserbaseSessionSchema,
      },
      "The Browserbase session creation payload.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_sessions",
    operationType: "read",
    description: "List Browserbase sessions with optional status or metadata query filters.",
    inputSchema: browserbaseListSessionsInputSchema,
    outputSchema: s.actionOutput(
      {
        sessions: s.array("The Browserbase sessions returned.", browserbaseSessionSchema),
      },
      "The Browserbase sessions returned by the API.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_session",
    operationType: "read",
    description: "Get one Browserbase session by session identifier.",
    inputSchema: s.actionInput(
      {
        id: s.nonEmptyString("The Browserbase session identifier."),
      },
      ["id"],
      "The input payload for reading one Browserbase session.",
    ),
    outputSchema: s.actionOutput(
      {
        session: browserbaseSessionSchema,
      },
      "The Browserbase session payload.",
    ),
  }),
  defineProviderAction(service, {
    name: "request_session_release",
    operationType: "destructive",
    description: "Request that Browserbase releases a session before timeout by sending status REQUEST_RELEASE.",
    inputSchema: browserbaseRequestSessionReleaseInputSchema,
    outputSchema: s.actionOutput(
      {
        session: browserbaseSessionSchema,
      },
      "The Browserbase session release payload.",
    ),
  }),
];

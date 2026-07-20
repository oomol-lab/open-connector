import type { ActionDefinition, JsonSchema, ProviderDefinition } from "../../core/types.ts";

import { jsonSchema } from "../../core/json-schema.ts";
import {
  actionInputMaxDepth,
  idempotencyKeyMaxBytes,
  idempotencyRetentionHours,
} from "../actions/action-idempotency.ts";
import { policyRequestMaxBytes, policyRuleListMaxItems, policyRuleMaxBytes } from "./policy-input.ts";

/**
 * Minimal OpenAPI document shape returned by the local runtime.
 */
export type OpenApiDocument = {
  openapi: "3.1.0";
  info: {
    title: string;
    version: string;
  };
  tags: Array<{
    name: string;
    description: string;
  }>;
  paths: Record<string, unknown>;
  components: {
    schemas: Record<string, JsonSchema>;
  };
};

/**
 * Controls how much provider action detail is embedded in the OpenAPI document.
 */
export type OpenApiDocumentOptions = {
  actionId?: string;
};

const errorPayloadSchema = jsonSchema.object(
  {
    code: jsonSchema.string({ description: "Stable machine-readable error code." }),
    message: jsonSchema.string({ description: "Human-readable error message." }),
    details: {},
  },
  {
    required: ["code", "message"],
    description: "Error payload.",
  },
);

const errorResponseSchema = jsonSchema.object(
  {
    error: errorPayloadSchema,
  },
  {
    required: ["error"],
    description: "Standard error response.",
  },
);

const actionResultMetaSchema = jsonSchema.object(
  {
    executionId: jsonSchema.string({ description: "Action execution identifier." }),
    actionId: jsonSchema.string({ description: "Executed action identifier." }),
    auditPersisted: jsonSchema.boolean({ description: "Whether the run audit record was stored." }),
  },
  {
    required: ["executionId", "actionId", "auditPersisted"],
    description: "Action execution metadata.",
  },
);

const actionFailureMetaSchema = jsonSchema.object(
  {
    executionId: jsonSchema.string({ description: "Execution identifier when action execution began." }),
    actionId: jsonSchema.string({ description: "Requested action identifier." }),
    auditPersisted: jsonSchema.boolean({ description: "Whether the run audit record was stored." }),
  },
  {
    required: ["actionId"],
    description: "Action failure metadata. Execution fields are omitted when execution did not begin.",
  },
);

const oauthClientConfigRequestSchema = jsonSchema.object(
  {
    clientId: jsonSchema.string({ description: "OAuth app client id." }),
    clientSecret: jsonSchema.string({
      description: "OAuth app client secret. Optional only for public-client providers.",
    }),
    extra: {
      type: "object",
      additionalProperties: { type: "string" },
      description: "Additional OAuth client config values keyed by provider-declared field ids.",
    },
    secretExtra: {
      type: "object",
      additionalProperties: { type: "string" },
      description: "Sensitive OAuth client config values keyed by provider-declared field ids.",
    },
  },
  {
    required: ["clientId"],
    description: "User-provided OAuth app client configuration.",
  },
);

const actionIdempotencyDescription =
  `Requests with the same Idempotency-Key, action, input, effective connection, and stored runtime token identity replay the original HTTP status and body of completed successes and failures during the ${idempotencyRetentionHours}-hour replay window. ` +
  "Requests that are still in progress, or whose outcome is uncertain, are not automatically dispatched again. " +
  "Duplicate suppression does not guarantee exactly-once execution by the provider.";

const actionIdParameter = {
  name: "actionId",
  in: "path",
  required: true,
  schema: jsonSchema.string({ description: "Action id, usually <service>.<name>." }),
};

const idempotencyKeyParameter = {
  name: "Idempotency-Key",
  in: "header",
  required: false,
  schema: { type: "string", minLength: 1 },
  description: `Optional runtime-wide key for deduplicating retries of the same action request. Leading and trailing whitespace is trimmed; the remaining value must be non-empty and must not exceed ${idempotencyKeyMaxBytes} UTF-8 bytes. Reuse a key only for retries with the same action, input, effective connection, and stored runtime token. When this header is present, the action input must not exceed an object/array nesting depth of ${actionInputMaxDepth} levels.`,
};

const idempotencyConflictDescription =
  "For idempotency, idempotency_request_in_progress means the original request is still running or its outcome is uncertain, while idempotency_key_conflict means the key was reused for a different action, input, effective connection, or stored runtime token. Other runtime conflicts may return their own error code with the same status.";

/**
 * Build OpenAPI docs from the generated catalog.
 *
 * The action catalog remains the source of truth for provider-specific input
 * and output schemas. The default document stays compact and exposes one
 * generic run creation route. Pass `actionId` to embed one concrete action schema for
 * tool importers that need a small strongly typed OpenAPI document.
 */
export function createOpenApiDocument(
  providers: ProviderDefinition[],
  options: OpenApiDocumentOptions = {},
): OpenApiDocument {
  const actions = providers.flatMap((provider) => provider.actions);
  const concreteAction = options.actionId ? actions.find((action) => action.id === options.actionId) : undefined;
  const runPath = createRunPath();
  if (concreteAction) {
    runPath.post = createConcreteRunOperation(concreteAction);
  }

  const paths: Record<string, unknown> = {
    "/health": getOperation("System", "Runtime health check.", { ok: jsonSchema.boolean() }),
    "/api/auth/session": getOperation("System", "Read local admin auth session state.", {
      $ref: "#/components/schemas/LocalAuthSession",
    }),
    "/api/auth/logout": {
      post: {
        tags: ["System"],
        summary: "Clear the local admin auth cookie.",
        responses: {
          200: jsonResponse(
            jsonSchema.object(
              { ok: jsonSchema.boolean() },
              { required: ["ok"], description: "Local auth logout response." },
            ),
          ),
        },
      },
    },
    "/api/providers": getOperation("Catalog", "List provider catalog entries.", {
      type: "array",
      items: { $ref: "#/components/schemas/ProviderDefinition" },
    }),
    "/api/providers/{service}": getOperation("Catalog", "Get one provider catalog entry.", {
      $ref: "#/components/schemas/ProviderDefinition",
    }),
    "/api/actions": getOperation("Catalog", "List all catalog actions.", {
      type: "array",
      items: { $ref: "#/components/schemas/ActionDefinition" },
    }),
    "/api/actions/search": getOperation("Catalog", "Fuzzy keyword search over the action catalog.", {
      type: "array",
      items: { $ref: "#/components/schemas/ActionSearchResult" },
    }),
    "/v1/actions/search": getOperation("Catalog", "Fuzzy keyword search over the action catalog.", {
      type: "object",
      properties: {
        success: { type: "boolean" },
        message: { type: "string" },
        data: { type: "array", items: { $ref: "#/components/schemas/ActionSearchRuntimeResult" } },
        meta: { type: "object", additionalProperties: true },
      },
      required: ["success", "message", "data", "meta"],
    }),
    "/api/actions/{actionId}": getOperation("Catalog", "Get one catalog action.", {
      $ref: "#/components/schemas/ActionDefinition",
    }),
    "/api/actions/{actionId}/agent.md": getOperation("Catalog", "Get one markdown action guide.", {
      type: "string",
      description: "Markdown guide for one action.",
    }),
    "/api/connections": getOperation("Connections", "List local provider connections.", {
      type: "array",
      items: { $ref: "#/components/schemas/ConnectionSummary" },
    }),
    "/api/connections/{service}": createConnectionPath(),
    "/api/oauth/configs": getOperation("OAuth", "List local OAuth client configurations.", {
      type: "array",
      items: { $ref: "#/components/schemas/OAuthClientConfigSummary" },
    }),
    "/api/oauth/configs/{service}": createOAuthConfigPath(),
    "/api/oauth/authorizations": createOAuthAuthorizationPath(),
    "/api/runtime-tokens": createRuntimeTokensPath(),
    "/api/runtime-tokens/{id}": createRuntimeTokenPath(),
    "/api/runtime-policy": createRuntimePolicyPath(),
    "/api/files": createTransitFilesPath(),
    "/api/files/{fileId}": createTransitFilePath(),
    "/v1/actions/{actionId}": runPath,
    "/v1/proxy/{service}": createProxyPath(),
    "/api/runs": createRunsPath(),
    "/api/runs/{id}": createRunDetailPath(),
    "/mcp": createMcpPath(),
    "/mcp/tools": getOperation("MCP", "List discovery-oriented MCP tool summaries.", {
      type: "object",
      properties: {
        tools: { type: "array", items: { type: "object", additionalProperties: true } },
      },
      required: ["tools"],
    }),
  };

  return {
    openapi: "3.1.0",
    info: {
      title: "OOMOL Connect Local Runtime",
      version: "0.1.0",
    },
    tags: [
      { name: "System", description: "Runtime health and server-level status." },
      { name: "Catalog", description: "Provider and action metadata used by users and agents." },
      { name: "Connections", description: "Local provider credentials and connection state." },
      { name: "OAuth", description: "Local OAuth client configuration and authorization flow." },
      { name: "Access", description: "Runtime execution policy and bearer tokens for /v1 and MCP clients." },
      { name: "Files", description: "Local temporary file transit for provider actions." },
      { name: "Runs", description: "Local action execution and recent run history." },
      { name: "Proxy", description: "Provider API proxy requests through local credentials." },
      { name: "MCP", description: "Stateless MCP POST endpoint and tool metadata." },
    ],
    paths,
    components: {
      schemas: {
        ActionDefinition: jsonSchema.unknownObject("Public action catalog definition with runtime execution status."),
        LocalAuthSession: jsonSchema.object(
          {
            adminAuthConfigured: jsonSchema.boolean({
              description: "Whether the local admin API requires an admin bearer token.",
            }),
            authenticated: jsonSchema.boolean({
              description: "Whether this request is authenticated for local admin APIs.",
            }),
          },
          {
            required: ["adminAuthConfigured", "authenticated"],
            description: "Local web console admin authentication state.",
          },
        ),
        ActionSearchResult: jsonSchema.object(
          {
            id: jsonSchema.string({ description: "The unique action identifier." }),
            service: jsonSchema.string({ description: "The provider service that owns the action." }),
            name: jsonSchema.string({ description: "The provider-scoped action name." }),
            description: jsonSchema.string({ description: "The action description." }),
            authenticated: jsonSchema.boolean({
              description: "Whether the provider service has an authenticated local connection.",
            }),
            inputSchema: jsonSchema.unknownObject("The normalized JSON Schema for the action input."),
            outputSchema: jsonSchema.unknownObject("The normalized JSON Schema for the action output."),
          },
          {
            required: ["id", "service", "name", "description", "authenticated", "inputSchema", "outputSchema"],
            description: "A single action returned by fuzzy keyword search.",
          },
        ),
        ActionSearchRuntimeResult: jsonSchema.object(
          {
            service: jsonSchema.string({ description: "The provider service that owns the action." }),
            name: jsonSchema.string({ description: "The provider-scoped action name." }),
            description: jsonSchema.string({ description: "The action description." }),
            authenticated: jsonSchema.boolean({
              description: "Whether the provider service has an authenticated local connection.",
            }),
            inputSchema: jsonSchema.unknownObject("The normalized JSON Schema for the action input."),
            outputSchema: jsonSchema.unknownObject("The normalized JSON Schema for the action output."),
          },
          {
            required: ["service", "name", "description", "authenticated", "inputSchema", "outputSchema"],
            description: "A single action returned by the /v1 keyword search endpoint.",
          },
        ),
        ConnectionSummary: jsonSchema.object(
          {
            id: jsonSchema.string({ description: "Stable local connection identifier." }),
            service: jsonSchema.string({ description: "Provider service identifier." }),
            authType: jsonSchema.string({ description: "Connection authentication type." }),
            configured: jsonSchema.boolean({ description: "Whether the provider is connected." }),
            virtual: jsonSchema.boolean({
              description: "Whether the connection needs no stored secret.",
            }),
            profile: jsonSchema.object(
              {
                accountId: jsonSchema.string({
                  description: "Provider-side account, user, workspace, bot, or token identifier.",
                }),
                displayName: jsonSchema.string({
                  description: "Human-readable account label shown to users and agents.",
                }),
                grantedScopes: {
                  type: "array",
                  items: { type: "string" },
                  description: "Provider-native scopes granted to the stored credential, when known.",
                },
              },
              {
                required: ["accountId", "displayName", "grantedScopes"],
                description: "Stable provider account identity safe for users and agents.",
              },
            ),
          },
          {
            required: ["id", "service", "authType", "configured", "virtual", "profile"],
            description: "Local provider connection summary.",
          },
        ),
        ErrorResponse: errorResponseSchema,
        ConnectionUpsertRequest: createConnectionUpsertRequestSchema(),
        OAuthClientConfigSummary: jsonSchema.object(
          {
            service: jsonSchema.string({ description: "Provider service identifier." }),
            configured: jsonSchema.boolean({
              description: "Whether a local OAuth client config is configured.",
            }),
            clientId: jsonSchema.nullable(jsonSchema.string({ description: "Configured OAuth client id." })),
            expectedRedirectUri: jsonSchema.string({
              description: "Callback URL to configure in the provider OAuth app.",
            }),
            auth: jsonSchema.unknownObject("Provider OAuth capability metadata."),
          },
          {
            required: ["service", "configured", "clientId", "expectedRedirectUri", "auth"],
            description: "OAuth client config summary safe for the local console.",
          },
        ),
        OAuthClientConfigRequest: oauthClientConfigRequestSchema,
        RuntimeTokenSummary: jsonSchema.object(
          {
            id: jsonSchema.string({ description: "Runtime token identifier." }),
            name: jsonSchema.string({ description: "User-facing token label." }),
            allowedActions: policyRuleArraySchema("Action allow rules applied to this stored runtime token."),
            blockedActions: policyRuleArraySchema("Action block rules applied to this stored runtime token."),
            createdAt: jsonSchema.string({ description: "Creation timestamp." }),
            lastUsedAt: jsonSchema.string({ description: "Last successful use timestamp." }),
          },
          {
            required: ["id", "name", "allowedActions", "blockedActions", "createdAt"],
            description: "Runtime API token summary. Plaintext tokens and token hashes are not returned.",
          },
        ),
        RuntimeTokenCreateRequest: jsonSchema.object(
          {
            name: jsonSchema.string({ description: "User-facing token label." }),
            allowedActions: policyRuleArraySchema("Optional action allow rules for the new token."),
            blockedActions: policyRuleArraySchema("Optional action block rules for the new token."),
          },
          {
            required: ["name"],
            description: "Runtime token creation request.",
          },
        ),
        TokenActionPolicy: jsonSchema.object(
          {
            allowedActions: policyRuleArraySchema("Action allow rules for this token."),
            blockedActions: policyRuleArraySchema("Action block rules for this token."),
          },
          {
            required: ["allowedActions", "blockedActions"],
            description: "Complete replacement of one stored runtime token's action policy.",
          },
        ),
        PolicyRules: policyRulesSchema(),
        RuntimePolicyState: jsonSchema.object(
          {
            deployment: { $ref: "#/components/schemas/PolicyRules" },
            runtime: { $ref: "#/components/schemas/PolicyRules" },
            updatedAt: jsonSchema.string({ description: "Last Runtime policy update timestamp, when configured." }),
          },
          {
            required: ["deployment", "runtime"],
            description: "Deployment and persisted Runtime policy layers. Deployment rules are read-only.",
          },
        ),
        PolicyCheck: jsonSchema.object(
          {
            source: { type: "string", enum: ["deployment", "runtime", "token"] },
            outcome: { type: "string", enum: ["allow_match", "block_match", "allow_miss"] },
            rule: jsonSchema.string({ description: "First matching policy rule, when one matched." }),
          },
          {
            required: ["source", "outcome"],
            description: "One policy layer's decisive or matching check.",
          },
        ),
        PolicyDecision: jsonSchema.object(
          {
            allowed: jsonSchema.boolean({ description: "Whether policy permits execution." }),
            code: {
              type: "string",
              enum: ["action_not_allowed", "action_blocked", "proxy_not_allowed", "proxy_blocked"],
            },
            message: jsonSchema.string({ description: "Policy denial message." }),
            checks: {
              type: "array",
              maxItems: 3,
              items: { $ref: "#/components/schemas/PolicyCheck" },
            },
          },
          {
            required: ["allowed", "checks"],
            description: "Layered execution policy decision. code and message are present on denial.",
          },
        ),
        TransitFileUpload: jsonSchema.object(
          {
            fileId: jsonSchema.string({ description: "Opaque local transit file identifier." }),
            downloadUrl: jsonSchema.string({ description: "URL that serves the uploaded file." }),
            sizeBytes: jsonSchema.number({ description: "Uploaded file size in bytes." }),
            name: jsonSchema.string({ description: "Original uploaded filename." }),
            mimeType: jsonSchema.string({ description: "Uploaded file MIME type." }),
          },
          {
            required: ["fileId", "downloadUrl", "sizeBytes", "name", "mimeType"],
            description: "Local transit file upload response.",
          },
        ),
        ProviderDefinition: jsonSchema.unknownObject("Public provider catalog definition."),
        RunLog: jsonSchema.object(
          {
            id: jsonSchema.string({ description: "Run identifier." }),
            service: jsonSchema.string({ description: "Provider service that owns the executed action." }),
            actionId: jsonSchema.string({ description: "Executed action id." }),
            caller: jsonSchema.string({
              description: "Runtime entry point that executed the run.",
            }),
            startedAt: jsonSchema.string({ description: "Start timestamp." }),
            completedAt: jsonSchema.string({ description: "Completion timestamp." }),
            durationMs: jsonSchema.number({ description: "Run duration in milliseconds." }),
            ok: jsonSchema.boolean({ description: "Whether the run succeeded." }),
            connectionName: jsonSchema.string({ description: "Named provider connection used by the action." }),
            connectionProfile: jsonSchema.unknownObject(
              "Provider account identity that the action used, when a connection was available.",
            ),
            connectionId: jsonSchema.string({ description: "Stable connection identifier used by the run." }),
            runtimeTokenId: jsonSchema.string({ description: "Stored runtime token identifier used by the run." }),
            policy: { $ref: "#/components/schemas/PolicyDecision" },
            inputSummary: {
              description: "Redacted action input summary.",
            },
            outputSummary: {
              description: "Redacted action output summary.",
            },
            errorCode: jsonSchema.string({ description: "Error code when the run failed." }),
            errorMessage: jsonSchema.string({ description: "Error message when the run failed." }),
          },
          {
            required: ["id", "service", "actionId", "caller", "startedAt", "completedAt", "durationMs", "ok"],
            description: "Recent action run entry.",
          },
        ),
        RunLogPage: jsonSchema.object(
          {
            items: {
              type: "array",
              items: { $ref: "#/components/schemas/RunLog" },
              description: "Run entries for this page.",
            },
            nextCursor: jsonSchema.string({ description: "Cursor for the next page, when more runs are available." }),
          },
          {
            required: ["items"],
            description: "Paginated action run list.",
          },
        ),
      },
    },
  };
}

function createTransitFilesPath(): Record<string, unknown> {
  return {
    post: {
      tags: ["Files"],
      summary: "Upload one local transit file.",
      description: "Stores one temporary local file and returns a download URL for connector actions.",
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: jsonSchema.object(
              {
                file: { type: "string", format: "binary", description: "File content to upload." },
              },
              {
                required: ["file"],
                description: "Transit file upload request.",
              },
            ),
          },
        },
      },
      responses: {
        200: jsonResponse({ $ref: "#/components/schemas/TransitFileUpload" }),
        400: jsonResponse({ $ref: "#/components/schemas/ErrorResponse" }),
        413: jsonResponse({ $ref: "#/components/schemas/ErrorResponse" }),
      },
    },
  };
}

function createTransitFilePath(): Record<string, unknown> {
  return {
    get: {
      tags: ["Files"],
      summary: "Download one local transit file.",
      parameters: [
        {
          name: "fileId",
          in: "path",
          required: true,
          schema: jsonSchema.string({ description: "Opaque local transit file identifier." }),
        },
      ],
      responses: {
        200: {
          description: "Transit file bytes.",
          content: {
            "application/octet-stream": {
              schema: { type: "string", format: "binary" },
            },
          },
        },
        404: jsonResponse({ $ref: "#/components/schemas/ErrorResponse" }),
      },
    },
    delete: {
      tags: ["Files"],
      summary: "Delete one local transit file.",
      parameters: [
        {
          name: "fileId",
          in: "path",
          required: true,
          schema: jsonSchema.string({ description: "Opaque local transit file identifier." }),
        },
      ],
      responses: {
        200: jsonResponse(
          jsonSchema.object(
            {
              fileId: jsonSchema.string(),
              deleted: jsonSchema.boolean(),
            },
            {
              required: ["fileId", "deleted"],
              description: "Transit file deletion response.",
            },
          ),
        ),
        404: jsonResponse({ $ref: "#/components/schemas/ErrorResponse" }),
      },
    },
  };
}

function createRuntimeTokensPath(): Record<string, unknown> {
  return {
    get: {
      tags: ["Access"],
      summary: "List runtime API token summaries.",
      responses: {
        200: jsonResponse({
          type: "array",
          items: { $ref: "#/components/schemas/RuntimeTokenSummary" },
        }),
      },
    },
    post: {
      tags: ["Access"],
      summary: "Create a runtime API token.",
      description: `The plaintext token is returned once. Only a hash is stored locally. Policy request bodies must not exceed ${policyRequestMaxBytes} bytes.`,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/RuntimeTokenCreateRequest" },
          },
        },
      },
      responses: {
        200: jsonResponse(
          jsonSchema.object(
            {
              token: jsonSchema.string({ description: "Plaintext runtime bearer token. Store it now." }),
              record: { $ref: "#/components/schemas/RuntimeTokenSummary" },
            },
            {
              required: ["token", "record"],
              description: "Runtime token creation response.",
            },
          ),
        ),
        400: jsonResponse({ $ref: "#/components/schemas/ErrorResponse" }),
        413: jsonResponse({ $ref: "#/components/schemas/ErrorResponse" }),
      },
    },
  };
}

function createRuntimeTokenPath(): Record<string, unknown> {
  return {
    put: {
      tags: ["Access"],
      summary: "Replace one stored runtime token's action policy.",
      description: `Policy request bodies must not exceed ${policyRequestMaxBytes} bytes.`,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/TokenActionPolicy" },
          },
        },
      },
      responses: {
        200: jsonResponse({ $ref: "#/components/schemas/RuntimeTokenSummary" }),
        400: jsonResponse({ $ref: "#/components/schemas/ErrorResponse" }),
        404: jsonResponse({ $ref: "#/components/schemas/ErrorResponse" }),
        413: jsonResponse({ $ref: "#/components/schemas/ErrorResponse" }),
      },
    },
    delete: {
      tags: ["Access"],
      summary: "Revoke a runtime API token.",
      responses: {
        200: jsonResponse(
          jsonSchema.object(
            {
              id: jsonSchema.string(),
              revoked: jsonSchema.boolean(),
            },
            {
              required: ["id", "revoked"],
              description: "Runtime token revocation response.",
            },
          ),
        ),
        404: jsonResponse({ $ref: "#/components/schemas/ErrorResponse" }),
      },
    },
  };
}

function createRuntimePolicyPath(): Record<string, unknown> {
  return {
    get: {
      tags: ["Access"],
      summary: "Read deployment and persisted Runtime policy layers.",
      responses: {
        200: jsonResponse({ $ref: "#/components/schemas/RuntimePolicyState" }),
        500: jsonResponse({ $ref: "#/components/schemas/ErrorResponse" }),
      },
    },
    put: {
      tags: ["Access"],
      summary: "Replace the persisted Runtime action and proxy policy.",
      description: `Deployment policy remains read-only. Block rules take precedence and non-empty allowlists intersect. Policy request bodies must not exceed ${policyRequestMaxBytes} bytes.`,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/PolicyRules" },
          },
        },
      },
      responses: {
        200: jsonResponse({ $ref: "#/components/schemas/RuntimePolicyState" }),
        400: jsonResponse({ $ref: "#/components/schemas/ErrorResponse" }),
        413: jsonResponse({ $ref: "#/components/schemas/ErrorResponse" }),
        500: jsonResponse({ $ref: "#/components/schemas/ErrorResponse" }),
      },
    },
  };
}

function policyRulesSchema(): JsonSchema {
  return jsonSchema.object(
    {
      allowedActions: policyRuleArraySchema("Action allow rules."),
      blockedActions: policyRuleArraySchema("Action block rules."),
      allowedProxies: policyRuleArraySchema("Proxy service allow rules."),
      blockedProxies: policyRuleArraySchema("Proxy service block rules."),
    },
    {
      required: ["allowedActions", "blockedActions", "allowedProxies", "blockedProxies"],
      description: "One complete action and proxy policy layer.",
    },
  );
}

function policyRuleArraySchema(description: string): JsonSchema {
  return {
    type: "array",
    maxItems: policyRuleListMaxItems,
    items: {
      type: "string",
      minLength: 1,
      maxLength: policyRuleMaxBytes,
      description: `Policy rule. The server enforces a ${policyRuleMaxBytes}-byte UTF-8 limit.`,
    },
    description,
  };
}

function createMcpPath(): unknown {
  return {
    post: {
      tags: ["MCP"],
      summary: "Handle stateless MCP JSON-RPC POST requests.",
      responses: {
        "200": {
          description: "MCP JSON-RPC response.",
          content: {
            "application/json": {
              schema: { type: "object", additionalProperties: true },
            },
          },
        },
      },
    },
  };
}

function createRunsPath(): Record<string, unknown> {
  return {
    get: {
      tags: ["Runs"],
      summary: "List recent local action runs.",
      parameters: [
        {
          name: "limit",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
          description: "Maximum number of runs to return.",
        },
        {
          name: "cursor",
          in: "query",
          required: false,
          schema: { type: "string" },
          description: "Cursor returned by the previous page.",
        },
        {
          name: "service",
          in: "query",
          required: false,
          schema: { type: "string" },
          description: "Only return runs whose action id belongs to this service.",
        },
        {
          name: "actionId",
          in: "query",
          required: false,
          schema: { type: "string", maxLength: 256 },
          description: "Only return runs for this exact action id.",
        },
        {
          name: "caller",
          in: "query",
          required: false,
          schema: { type: "string", enum: ["http", "mcp", "web"] },
          description: "Only return runs from this runtime entry point.",
        },
        {
          name: "ok",
          in: "query",
          required: false,
          schema: { type: "boolean" },
          description: "Only return successful or failed runs.",
        },
      ],
      responses: {
        200: jsonResponse({ $ref: "#/components/schemas/RunLogPage" }),
      },
    },
  };
}

function createRunDetailPath(): Record<string, unknown> {
  return {
    get: {
      tags: ["Runs"],
      summary: "Get one local action run.",
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string" },
          description: "Action execution identifier.",
        },
      ],
      responses: {
        200: jsonResponse({ $ref: "#/components/schemas/RunLog" }),
        404: jsonResponse({ type: "object", additionalProperties: true }),
      },
    },
  };
}

function createRunPath(): Record<string, unknown> {
  return {
    post: {
      tags: ["Runs"],
      summary: "Execute a runtime action.",
      description:
        "Use the action catalog to discover provider-specific input and output schemas. For a compact strongly typed OpenAPI document for one action, request /openapi.json?actionId=<actionId>. " +
        actionIdempotencyDescription,
      parameters: [actionIdParameter, idempotencyKeyParameter],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: jsonSchema.object(
              {
                input: jsonSchema.unknownObject("Action input matching the catalog schema."),
              },
              {
                required: ["input"],
                description: "Generic action run creation request.",
              },
            ),
          },
        },
      },
      responses: {
        200: jsonResponse(
          runtimeSuccessSchema(
            jsonSchema.unknown("Action output matching the catalog schema."),
            actionResultMetaSchema,
          ),
        ),
        400: jsonResponse(runtimeFailureSchema(actionFailureMetaSchema)),
        403: jsonResponse(runtimeFailureSchema(actionFailureMetaSchema)),
        404: jsonResponse(runtimeFailureSchema(actionFailureMetaSchema)),
        409: jsonResponse(runtimeFailureSchema(actionFailureMetaSchema), idempotencyConflictDescription),
        429: jsonResponse(runtimeFailureSchema(actionFailureMetaSchema)),
        500: jsonResponse(runtimeFailureSchema(actionFailureMetaSchema)),
      },
    },
  };
}

function createProxyPath(): Record<string, unknown> {
  return {
    post: {
      tags: ["Proxy"],
      summary: "Proxy one provider API request.",
      description:
        "For providers with a local proxy executor, forwards a provider-relative HTTP request and applies stored provider credentials locally.",
      parameters: [
        {
          name: "service",
          in: "path",
          required: true,
          schema: jsonSchema.string({ description: "Provider service identifier." }),
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: jsonSchema.object(
              {
                endpoint: jsonSchema.string({ description: "Provider-relative path beginning with /." }),
                method: jsonSchema.string({
                  description: "HTTP method: DELETE, GET, HEAD, PATCH, POST, or PUT.",
                }),
                query: {
                  type: "object",
                  additionalProperties: true,
                  description: "Provider query parameters. Scalar values are forwarded.",
                },
                headers: {
                  type: "object",
                  additionalProperties: { type: "string" },
                  description: "Provider request headers. Hop-by-hop and auth headers are not forwarded.",
                },
                body: jsonSchema.unknown("Provider request body."),
                connectionName: jsonSchema.string({
                  description: "Optional local connection name. Defaults to default.",
                }),
              },
              {
                required: ["endpoint", "method"],
                description: "Provider proxy request.",
              },
            ),
          },
        },
      },
      responses: {
        200: jsonResponse(
          runtimeSuccessSchema(
            jsonSchema.object(
              {
                status: { type: "integer", description: "Provider HTTP response status." },
                headers: {
                  type: "object",
                  additionalProperties: { type: "string" },
                  description: "Provider response headers.",
                },
                bodyEncoding: jsonSchema.string({
                  description: "Present as base64 when the provider response is binary.",
                }),
                data: jsonSchema.unknown("Provider response payload."),
              },
              {
                required: ["status", "headers", "data"],
                description: "Provider proxy response.",
              },
            ),
          ),
        ),
        400: jsonResponse(runtimeFailureSchema()),
        403: jsonResponse(runtimeFailureSchema()),
        404: jsonResponse(runtimeFailureSchema()),
        409: jsonResponse(runtimeFailureSchema()),
        413: jsonResponse(runtimeFailureSchema()),
        429: jsonResponse(runtimeFailureSchema()),
        500: jsonResponse(runtimeFailureSchema()),
        501: jsonResponse(runtimeFailureSchema()),
      },
    },
  };
}

function createConnectionPath(): Record<string, unknown> {
  return {
    put: {
      tags: ["Connections"],
      summary: "Create or replace a local provider connection.",
      description:
        "The accepted auth type and credential field keys are declared by the provider catalog auth metadata. Unknown fields are rejected.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ConnectionUpsertRequest" },
          },
        },
      },
      responses: {
        200: jsonResponse({ $ref: "#/components/schemas/ConnectionSummary" }),
        400: jsonResponse({ $ref: "#/components/schemas/ErrorResponse" }),
        404: jsonResponse({ $ref: "#/components/schemas/ErrorResponse" }),
      },
    },
    delete: {
      tags: ["Connections"],
      summary: "Disconnect a provider.",
      responses: {
        200: jsonResponse({
          anyOf: [
            { $ref: "#/components/schemas/ConnectionSummary" },
            jsonSchema.object(
              {
                service: jsonSchema.string(),
                configured: { const: false, type: "boolean" },
              },
              {
                required: ["service", "configured"],
                description: "Disconnected provider summary.",
              },
            ),
          ],
        }),
        404: jsonResponse({ $ref: "#/components/schemas/ErrorResponse" }),
      },
    },
  };
}

function createOAuthAuthorizationPath(): Record<string, unknown> {
  return {
    post: {
      tags: ["OAuth"],
      summary: "Start provider OAuth authorization.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: jsonSchema.object(
              {
                service: jsonSchema.string({ description: "Provider service identifier." }),
                connectionName: jsonSchema.string({
                  description: "Optional local connection name. Defaults to default.",
                }),
              },
              {
                required: ["service"],
                description: "OAuth authorization creation request.",
              },
            ),
          },
        },
      },
      responses: {
        200: jsonResponse(
          jsonSchema.object(
            {
              service: jsonSchema.string(),
              authorizationUrl: jsonSchema.string(),
              state: jsonSchema.string(),
            },
            {
              required: ["service", "authorizationUrl", "state"],
              description: "OAuth authorization start response.",
            },
          ),
        ),
        400: jsonResponse({ $ref: "#/components/schemas/ErrorResponse" }),
        404: jsonResponse({ $ref: "#/components/schemas/ErrorResponse" }),
      },
    },
  };
}

function createOAuthConfigPath(): Record<string, unknown> {
  return {
    put: {
      tags: ["OAuth"],
      summary: "Upsert local OAuth client configuration.",
      description:
        "Open-source users provide their own OAuth app. Additional extra fields are declared by provider catalog auth metadata.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/OAuthClientConfigRequest" },
          },
        },
      },
      responses: {
        200: jsonResponse({ $ref: "#/components/schemas/OAuthClientConfigSummary" }),
        400: jsonResponse({ $ref: "#/components/schemas/ErrorResponse" }),
        404: jsonResponse({ $ref: "#/components/schemas/ErrorResponse" }),
      },
    },
    delete: {
      tags: ["OAuth"],
      summary: "Delete local OAuth client configuration.",
      responses: {
        200: jsonResponse(
          jsonSchema.object(
            {
              service: jsonSchema.string(),
              configured: { const: false, type: "boolean" },
            },
            {
              required: ["service", "configured"],
              description: "Deleted OAuth client config summary.",
            },
          ),
        ),
        404: jsonResponse({ $ref: "#/components/schemas/ErrorResponse" }),
      },
    },
  };
}

function getOperation(tag: string, summary: string, schema: JsonSchema): Record<string, unknown> {
  return {
    get: {
      tags: [tag],
      summary,
      responses: {
        200: jsonResponse(schema),
        404: jsonResponse({ $ref: "#/components/schemas/ErrorResponse" }),
      },
    },
  };
}

function createConnectionUpsertRequestSchema(): JsonSchema {
  return jsonSchema.object(
    {
      authType: jsonSchema.string({
        description: "Connection auth type: no_auth, api_key, or custom_credential.",
      }),
      connectionName: jsonSchema.string({
        description: "Optional local connection name. Defaults to default.",
      }),
      values: {
        type: "object",
        additionalProperties: { type: "string" },
        description: "Credential values keyed by provider-declared field ids.",
      },
    },
    {
      required: ["authType"],
      description: "Connection upsert request.",
    },
  );
}

function createConcreteRunOperation(action: ActionDefinition): Record<string, unknown> {
  return {
    tags: ["Runs"],
    summary: `Execute ${action.id}.`,
    description: `${action.description} ${actionIdempotencyDescription}`,
    parameters: [actionIdParameter, idempotencyKeyParameter],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: jsonSchema.object(
            {
              input: action.inputSchema,
            },
            {
              required: ["input"],
              description: `Run creation request for ${action.id}.`,
            },
          ),
        },
      },
    },
    responses: {
      200: jsonResponse(runtimeSuccessSchema(action.outputSchema, actionResultMetaSchema)),
      400: jsonResponse(runtimeFailureSchema(actionFailureMetaSchema)),
      403: jsonResponse(runtimeFailureSchema(actionFailureMetaSchema)),
      404: jsonResponse(runtimeFailureSchema(actionFailureMetaSchema)),
      409: jsonResponse(runtimeFailureSchema(actionFailureMetaSchema), idempotencyConflictDescription),
      429: jsonResponse(runtimeFailureSchema(actionFailureMetaSchema)),
      500: jsonResponse(runtimeFailureSchema(actionFailureMetaSchema)),
    },
  };
}

function runtimeSuccessSchema(
  data: JsonSchema,
  meta: JsonSchema = { type: "object", additionalProperties: true },
): JsonSchema {
  return jsonSchema.object(
    {
      success: { const: true, type: "boolean" },
      message: { const: "OK", type: "string" },
      data,
      meta,
    },
    {
      required: ["success", "message", "data", "meta"],
      description: "Runtime success envelope.",
    },
  );
}

function runtimeFailureSchema(meta: JsonSchema = { type: "object", additionalProperties: true }): JsonSchema {
  return jsonSchema.object(
    {
      success: { const: false, type: "boolean" },
      message: jsonSchema.string({ description: "Human-readable error message." }),
      data: jsonSchema.unknown("Provider or validation error details."),
      errorCode: jsonSchema.string({ description: "Stable machine-readable error code." }),
      meta,
    },
    {
      required: ["success", "message", "data", "errorCode", "meta"],
      description: "Runtime failure envelope.",
    },
  );
}

function jsonResponse(schema: JsonSchema, description = "JSON response."): Record<string, unknown> {
  return {
    description,
    content: {
      "application/json": {
        schema,
      },
    },
  };
}

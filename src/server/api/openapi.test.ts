import type { ProviderDefinition } from "../../core/types.ts";
import type { OpenApiDocumentOptions } from "./openapi.ts";

import { describe, expect, it } from "vitest";
import { createOpenApiDocument } from "./openapi.ts";

interface RunOperation {
  description: string;
  parameters: Array<{
    name: string;
    in: string;
    required: boolean;
    schema: Record<string, unknown>;
    description: string;
  }>;
  responses: Record<string, { description: string }>;
}

const provider: ProviderDefinition = {
  service: "example",
  displayName: "Example",
  categories: ["productivity"],
  authTypes: ["no_auth"],
  auth: [{ type: "no_auth" }],
  actions: [
    {
      id: "example.echo",
      service: "example",
      name: "echo",
      description: "Echo the input.",
      requiredScopes: [],
      providerPermissions: [],
      inputSchema: { type: "object", additionalProperties: true },
      outputSchema: { type: "object", additionalProperties: true },
    },
  ],
};

describe("action execution OpenAPI", () => {
  it.each([
    ["generic", {}],
    ["concrete", { actionId: "example.echo" }],
  ] satisfies Array<[string, OpenApiDocumentOptions]>)(
    "documents idempotent retries for the %s operation",
    (_name, options) => {
      const document = createOpenApiDocument([provider], options);
      const path = document.paths["/v1/actions/{actionId}"] as { post: RunOperation };

      expect(path.post.parameters).toContainEqual({
        name: "actionId",
        in: "path",
        required: true,
        schema: { type: "string", description: "Action id, usually <service>.<name>." },
      });
      expect(path.post.parameters).toContainEqual({
        name: "Idempotency-Key",
        in: "header",
        required: false,
        schema: { type: "string", minLength: 1 },
        description:
          "Optional runtime-wide key for deduplicating retries of the same action request. Leading and trailing whitespace is trimmed; the remaining value must be non-empty and must not exceed 255 UTF-8 bytes. Reuse a key only for retries with the same action, input, effective connection, and stored runtime token. When this header is present, the action input must not exceed an object/array nesting depth of 100 levels.",
      });
      expect(path.post.responses["409"]?.description).toBe(
        "For idempotency, idempotency_request_in_progress means the original request is still running or its outcome is uncertain, while idempotency_key_conflict means the key was reused for a different action, input, effective connection, or stored runtime token. Other runtime conflicts may return their own error code with the same status.",
      );
      expect(path.post.responses["403"]).toBeDefined();
      expect(path.post.responses["429"]).toBeDefined();
      expect(path.post.description).toContain("24-hour replay window");
      expect(path.post.description).toContain("original HTTP status and body");
      expect(path.post.description).toContain("completed successes and failures");
      expect(path.post.description).toContain("are not automatically dispatched again");
      expect(path.post.description).toContain("does not guarantee exactly-once execution");
    },
  );

  it("documents public /v1 catalog routes with the runtime envelope", () => {
    const document = createOpenApiDocument([provider]);
    const search = document.paths["/v1/actions/search"] as {
      get: {
        responses: Record<string, { content?: { "application/json"?: { schema?: { required?: string[] } } } }>;
      };
    };
    const actionPath = document.paths["/v1/actions/{actionId}"] as { get?: unknown; post?: unknown };
    const connectedApp = document.components.schemas.RuntimeConnectedApp as {
      required: string[];
      properties: { alias?: { description?: string } };
    };

    expect(document.paths["/v1/health"]).toBeDefined();
    expect(document.paths["/v1/providers"]).toBeDefined();
    expect(document.paths["/v1/actions"]).toBeDefined();
    expect(document.paths["/v1/apps"]).toBeDefined();
    expect(actionPath.get).toBeDefined();
    expect(actionPath.post).toBeDefined();
    expect(document.components.schemas.ActionSearchRuntimeResult).toEqual({
      $ref: "#/components/schemas/ActionSearchResult",
    });
    expect(search.get.responses["400"]?.content?.["application/json"]?.schema?.required).toEqual(
      expect.arrayContaining(["success", "errorCode"]),
    );
    expect(search.get.responses["404"]).toBeUndefined();
    expect(connectedApp.required).toEqual(expect.arrayContaining(["alias", "isDefault"]));
    expect(connectedApp.properties.alias?.description).toContain("connectionName");
  });

  it("documents Runtime and token policy management and run audit metadata", () => {
    const document = createOpenApiDocument([provider]);
    const runtimePolicyPath = document.paths["/api/runtime-policy"] as {
      get: { responses: Record<string, unknown> };
      put: { responses: Record<string, unknown> };
    };
    const tokenPath = document.paths["/api/runtime-tokens/{id}"] as {
      put: { responses: Record<string, unknown> };
    };
    const policyRules = document.components.schemas.PolicyRules as {
      required: string[];
      properties: Record<string, { maxItems: number; items: { maxLength: number; description: string } }>;
    };
    const runLog = document.components.schemas.RunLog as { properties: Record<string, unknown> };
    const tokenSummary = document.components.schemas.RuntimeTokenSummary as {
      required: string[];
      properties: Record<string, { description?: string }>;
    };
    const tokenPolicy = document.components.schemas.TokenPolicy as {
      required: string[];
      properties: Record<string, unknown>;
    };
    const policyDecision = document.components.schemas.PolicyDecision as {
      properties: { code: { enum: string[] } };
    };

    expect(runtimePolicyPath.get.responses["200"]).toBeDefined();
    expect(runtimePolicyPath.put.responses["413"]).toBeDefined();
    expect(tokenPath.put.responses["413"]).toBeDefined();
    expect(policyRules.required).toEqual(["allowedActions", "blockedActions", "allowedProxies", "blockedProxies"]);
    expect(policyRules.properties.allowedActions).toMatchObject({
      maxItems: 128,
      items: { maxLength: 256, description: expect.stringContaining("256-byte UTF-8 limit") },
    });
    expect(tokenSummary.required).toEqual(
      expect.arrayContaining(["allowedActions", "blockedActions", "allowedProxies", "allowedConnections"]),
    );
    expect(tokenPolicy.required).toEqual(["allowedActions", "blockedActions", "allowedProxies", "allowedConnections"]);
    expect(policyDecision.properties.code.enum).toEqual([
      "action_not_allowed",
      "action_blocked",
      "proxy_not_allowed",
      "proxy_blocked",
      "connection_not_allowed",
    ]);
    expect(runLog.properties).toHaveProperty("policy");
    expect(runLog.properties).toHaveProperty("runtimeTokenId");
  });

  it("documents stored-token connection IDs without changing deployment PolicyRules", () => {
    const document = createOpenApiDocument([provider]);
    const tokenSummary = document.components.schemas.RuntimeTokenSummary as {
      required: string[];
      properties: Record<string, ConnectionGrantSchema>;
    };
    const createRequest = document.components.schemas.RuntimeTokenCreateRequest as {
      required: string[];
      properties: Record<string, ConnectionGrantSchema>;
    };
    const tokenPolicy = document.components.schemas.TokenPolicy as {
      required: string[];
      properties: Record<string, ConnectionGrantSchema>;
    };
    const policyRules = document.components.schemas.PolicyRules as {
      properties: Record<string, unknown>;
    };
    const expectedGrant = {
      type: "array",
      maxItems: 128,
      items: {
        type: "string",
        minLength: 1,
        maxLength: 256,
      },
    };

    expect(policyRules.properties).not.toHaveProperty("allowedConnections");
    expect(tokenSummary.required).toContain("allowedConnections");
    expect(createRequest.required).not.toContain("allowedConnections");
    expect(tokenPolicy.required).toContain("allowedConnections");
    expect(tokenSummary.properties.allowedConnections).toMatchObject(expectedGrant);
    expect(createRequest.properties.allowedConnections).toMatchObject(expectedGrant);
    expect(tokenPolicy.properties.allowedConnections).toMatchObject(expectedGrant);
    expect(tokenSummary.properties.allowedConnections.description).toMatch(/empty list/i);
    expect(tokenSummary.properties.allowedConnections.description).toMatch(/unrestricted/i);
    expect(createRequest.properties.allowedConnections.description).toMatch(/omit/i);
    expect(createRequest.properties.allowedConnections.description).toMatch(/exact/i);
    expect(createRequest.properties.allowedConnections.description).toMatch(/opaque IDs/i);
    expect(tokenPolicy.properties.allowedConnections.description).toMatch(/connection APIs/i);
    expect(tokenPolicy.properties.allowedConnections.description).not.toMatch(/omit/i);
  });
});

interface ConnectionGrantSchema {
  type: string;
  maxItems: number;
  description: string;
  items: { type: string; minLength: number; maxLength: number; pattern: string };
}

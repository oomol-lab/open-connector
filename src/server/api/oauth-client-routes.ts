import type { OAuthClientRecord, IOAuthClientStore, IOAuthTokenStore } from "../storage/oauth-as-stores.ts";
import type { RuntimeTokenService } from "../storage/runtime-token-service.ts";

import { Hono } from "hono";
import { optionalString } from "../../core/cast.ts";
import { isValidRedirectUri } from "../oauth/client-metadata.ts";
import { accessScope, supportedScopes } from "../oauth/config.ts";
import { hashToken, randomToken } from "../oauth/jwks.ts";
import { jsonError, readJsonBody } from "./http-utils.ts";

/**
 * Administrator routes for manually registered OAuth clients (the third
 * registration mode next to DCR and CIMD). Client secrets are stored hashed
 * and returned exactly once, at creation and at rotation.
 */

export interface OAuthClientSummary {
  clientId: string;
  clientName: string;
  registrationType: "dcr" | "cimd" | "manual";
  redirectUris: string[];
  scopes: string[];
  tokenEndpointAuthMethod: "none" | "client_secret_basic" | "client_secret_post";
  hasSecret: boolean;
  metadataDocumentUrl?: string;
  createdAt: string;
  rotatedAt?: string;
}

export interface OAuthClientRoutesOptions {
  clients: IOAuthClientStore;
  tokens: IOAuthTokenStore;
  runtimeTokens: RuntimeTokenService;
}

const clientRequestMaxBytes = 64 * 1024;

export function toClientSummary(record: OAuthClientRecord): OAuthClientSummary {
  return {
    clientId: record.clientId,
    clientName: record.clientName,
    registrationType: record.registrationType,
    redirectUris: record.redirectUris,
    scopes: record.scopes,
    tokenEndpointAuthMethod: record.tokenEndpointAuthMethod,
    hasSecret: record.clientSecretHash !== undefined,
    metadataDocumentUrl: record.metadataDocumentUrl,
    createdAt: record.createdAt,
    rotatedAt: record.rotatedAt,
  };
}

export function createOAuthClientRoutes({ clients, tokens, runtimeTokens }: OAuthClientRoutesOptions): Hono {
  const app = new Hono();

  app.get("/oauth-clients", async (context) => context.json((await clients.list()).map(toClientSummary)));

  app.post("/oauth-clients", async (context) => {
    const body = await readJsonBody(context, clientRequestMaxBytes);
    let input;
    try {
      input = readClientInput(body, true);
    } catch (error) {
      return jsonError(context, 400, "invalid_input", error instanceof Error ? error.message : "Invalid client input.");
    }
    const clientSecret = input.tokenEndpointAuthMethod === "none" ? undefined : randomToken(32);
    const record: OAuthClientRecord = {
      clientId: `mcp_${crypto.randomUUID()}`,
      clientName: input.clientName ?? "",
      registrationType: "manual",
      redirectUris: input.redirectUris ?? [],
      scopes: input.scopes ?? [accessScope],
      tokenEndpointAuthMethod: input.tokenEndpointAuthMethod ?? "client_secret_basic",
      clientSecretHash: clientSecret === undefined ? undefined : hashToken(clientSecret),
      createdAt: new Date().toISOString(),
    };
    await clients.add(record);
    return context.json({ client: toClientSummary(record), clientSecret }, 201);
  });

  app.put("/oauth-clients/:clientId", async (context) => {
    const existing = await clients.get(context.req.param("clientId"));
    if (!existing) {
      return jsonError(
        context,
        404,
        "oauth_client_not_found",
        `OAuth client not found: ${context.req.param("clientId")}`,
      );
    }
    const body = await readJsonBody(context, clientRequestMaxBytes);
    let input;
    try {
      input = readClientInput(body, false);
    } catch (error) {
      return jsonError(context, 400, "invalid_input", error instanceof Error ? error.message : "Invalid client input.");
    }
    const updated: OAuthClientRecord = {
      ...existing,
      clientName: input.clientName ?? existing.clientName,
      redirectUris: input.redirectUris ?? existing.redirectUris,
      scopes: input.scopes ?? existing.scopes,
    };
    await clients.update(updated);
    return context.json(toClientSummary(updated));
  });

  app.post("/oauth-clients/:clientId/rotate-secret", async (context) => {
    const existing = await clients.get(context.req.param("clientId"));
    if (!existing) {
      return jsonError(
        context,
        404,
        "oauth_client_not_found",
        `OAuth client not found: ${context.req.param("clientId")}`,
      );
    }
    if (existing.tokenEndpointAuthMethod === "none") {
      return jsonError(context, 400, "invalid_input", "A public client has no secret to rotate.");
    }
    const clientSecret = randomToken(32);
    await clients.update({
      ...existing,
      clientSecretHash: hashToken(clientSecret),
      rotatedAt: new Date().toISOString(),
    });
    return context.json({ clientSecret });
  });

  app.delete("/oauth-clients/:clientId", async (context) => {
    const clientId = context.req.param("clientId");
    const existing = await clients.get(clientId);
    if (!existing) {
      return jsonError(context, 404, "oauth_client_not_found", `OAuth client not found: ${clientId}`);
    }
    // Revoking every token anchored to this client's grants is the point of
    // deletion: a removed client must not keep working access tokens.
    const runtimeTokenIds = new Set((await tokens.listByClient(clientId)).map((record) => record.runtimeTokenId));
    for (const runtimeTokenId of runtimeTokenIds) {
      await tokens.revokeByGrant(clientId, runtimeTokenId);
      await runtimeTokens.revokeToken(runtimeTokenId);
    }
    await clients.delete(clientId);
    return context.json({ id: clientId, deleted: true });
  });

  return app;
}

interface ClientInput {
  clientName?: string;
  redirectUris?: string[];
  scopes?: string[];
  tokenEndpointAuthMethod?: "none" | "client_secret_basic" | "client_secret_post";
}

function readClientInput(body: unknown, requireAll: boolean): ClientInput {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error("A JSON object body is required.");
  }
  const record = body as Record<string, unknown>;
  const clientName = optionalString(record.clientName);
  if (requireAll && !clientName) {
    throw new Error("clientName is required.");
  }
  let redirectUris: string[] | undefined;
  if (record.redirectUris !== undefined) {
    if (!Array.isArray(record.redirectUris) || record.redirectUris.some((uri) => typeof uri !== "string")) {
      throw new Error("redirectUris must be an array of absolute URIs.");
    }
    redirectUris = record.redirectUris as string[];
    if (redirectUris.length === 0) {
      throw new Error("redirectUris must not be empty.");
    }
    const invalid = redirectUris.find((uri) => !isValidRedirectUri(uri));
    if (invalid !== undefined) {
      throw new Error(`redirect_uri is not acceptable: ${invalid}`);
    }
  } else if (requireAll) {
    throw new Error("redirectUris is required.");
  }
  let scopes: string[] | undefined;
  if (record.scopes !== undefined) {
    if (!Array.isArray(record.scopes) || record.scopes.some((scope) => typeof scope !== "string")) {
      throw new Error("scopes must be an array of strings.");
    }
    scopes = record.scopes as string[];
    const unsupported = scopes.find((scope) => !(supportedScopes as readonly string[]).includes(scope));
    if (unsupported !== undefined) {
      throw new Error(
        `Unsupported scope: ${unsupported}. Supported scopes: ${(supportedScopes as readonly string[]).join(" ")}.`,
      );
    }
  }
  let tokenEndpointAuthMethod: ClientInput["tokenEndpointAuthMethod"];
  if (record.tokenEndpointAuthMethod !== undefined) {
    if (
      record.tokenEndpointAuthMethod !== "none" &&
      record.tokenEndpointAuthMethod !== "client_secret_basic" &&
      record.tokenEndpointAuthMethod !== "client_secret_post"
    ) {
      throw new Error("tokenEndpointAuthMethod must be none, client_secret_basic, or client_secret_post.");
    }
    tokenEndpointAuthMethod = record.tokenEndpointAuthMethod;
  } else if (requireAll) {
    tokenEndpointAuthMethod = "client_secret_basic";
  }
  return { clientName, redirectUris, scopes, tokenEndpointAuthMethod };
}

import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderOAuthRuntime } from "../../oauth/oauth-token.ts";
import type { ProviderActionHandlers } from "../provider-executors.ts";
import type { OAuthProviderContext, ProviderRuntimeHandler } from "../provider-executors.ts";

import {
  compactObject,
  objectArray,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  optionalStringArray,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import { defineOAuthProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  readProviderJsonBody,
  requiredInputString,
  setSearchParams,
} from "../provider-runtime.ts";

const service = "miro";
const miroApiBaseUrl = "https://api.miro.com";
const miroValidationPath = "/v1/oauth-token";
const defaultBoardLimit = 20;
const defaultItemLimit = 10;

type MiroRequestPhase = "validate" | "execute";
type MiroActionHandler = ProviderRuntimeHandler<OAuthProviderContext>;

interface MiroRequestOptions {
  accessToken: string;
  tokenType?: string;
  fetcher: typeof fetch;
  path: string;
  phase: MiroRequestPhase;
  signal?: AbortSignal;
  method?: "DELETE" | "GET" | "PATCH" | "POST";
  query?: Record<string, string>;
  body?: Record<string, unknown>;
}

export const miroActionHandlers: ProviderActionHandlers<"miro", MiroActionHandler> = {
  async list_boards(input, context): Promise<unknown> {
    const limit = optionalInteger(input.limit) ?? defaultBoardLimit;
    const offset = optionalInteger(input.offset) ?? 0;
    const payload = requireMiroObject(
      await requestMiroJson({
        ...context,
        path: "/v2/boards",
        phase: "execute",
        query: queryParams({
          team_id: optionalString(input.teamId),
          project_id: optionalString(input.projectId),
          query: optionalString(input.query),
          owner: optionalString(input.owner),
          limit,
          offset,
          sort: optionalString(input.sort),
        }),
      }),
      "boards response",
    );
    const boards = objectArray(payload.data, "Miro board", providerResponseError);
    return {
      boards,
      pagination: {
        limit: optionalInteger(payload.limit) ?? limit,
        offset: optionalInteger(payload.offset) ?? offset,
        size: optionalInteger(payload.size) ?? boards.length,
      },
    };
  },
  async get_board(input, context): Promise<unknown> {
    const boardId = requiredInputString(input.boardId, "boardId");
    return {
      board: requireMiroObject(
        await requestMiroJson({
          ...context,
          path: `/v2/boards/${encodeURIComponent(boardId)}`,
          phase: "execute",
        }),
        "board response",
      ),
    };
  },
  async create_board(input, context): Promise<unknown> {
    const policy = optionalRecord(input.policy);
    return {
      board: requireMiroObject(
        await requestMiroJson({
          ...context,
          method: "POST",
          path: "/v2/boards",
          phase: "execute",
          body: compactObject({
            name: requiredInputString(input.name, "name"),
            description: optionalString(input.description),
            teamId: optionalString(input.teamId),
            projectId: optionalString(input.projectId),
            policy,
          }),
        }),
        "create board response",
      ),
    };
  },
  async list_items(input, context): Promise<unknown> {
    const boardId = requiredInputString(input.boardId, "boardId");
    const payload = requireMiroObject(
      await requestMiroJson({
        ...context,
        path: `/v2/boards/${encodeURIComponent(boardId)}/items`,
        phase: "execute",
        query: queryParams({
          limit: optionalInteger(input.limit) ?? defaultItemLimit,
          cursor: optionalString(input.cursor),
          type: optionalString(input.type),
        }),
      }),
      "board items response",
    );
    return {
      items: objectArray(payload.data, "Miro board item", providerResponseError),
      pagination: {
        cursor: optionalString(payload.cursor) ?? null,
      },
    };
  },
  async get_item(input, context): Promise<unknown> {
    const boardId = requiredInputString(input.boardId, "boardId");
    const itemId = requiredInputString(input.itemId, "itemId");
    return {
      item: requireMiroObject(
        await requestMiroJson({
          ...context,
          path: `/v2/boards/${encodeURIComponent(boardId)}/items/${encodeURIComponent(itemId)}`,
          phase: "execute",
        }),
        "board item response",
      ),
    };
  },
  async delete_item(input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
    const boardId = requiredInputString(input.boardId, "boardId");
    const itemId = requiredInputString(input.itemId, "itemId");
    await requestMiroJson({
      ...context,
      method: "DELETE",
      path: `/v2/boards/${encodeURIComponent(boardId)}/items/${encodeURIComponent(itemId)}`,
      phase: "execute",
    });
    return { boardId, itemId, deleted: true };
  },
  async create_sticky_note(input, context): Promise<unknown> {
    return createBoardItem(input, context, "sticky_notes", "sticky note");
  },
  async create_text(input, context): Promise<unknown> {
    return createBoardItem(input, context, "texts", "text item");
  },
  async create_shape(input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
    return createBoardItem(input, context, "shapes", "shape");
  },
  async update_sticky_note(input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
    return updateStickyNote(input, context);
  },
  async create_connector(input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
    const boardId = requiredInputString(input.boardId, "boardId");
    const startItem = requiredRecord(input.startItem, "startItem", providerInputError);
    const endItem = requiredRecord(input.endItem, "endItem", providerInputError);
    validateConnectorEndpoint(startItem, "startItem");
    validateConnectorEndpoint(endItem, "endItem");
    if (
      requiredString(startItem.id, "startItem.id", providerInputError) ===
      requiredString(endItem.id, "endItem.id", providerInputError)
    ) {
      throw new ProviderRequestError(400, "startItem.id and endItem.id must identify different items");
    }
    const connector = requireMiroObject(
      await requestMiroJson({
        ...context,
        method: "POST",
        path: `/v2/boards/${encodeURIComponent(boardId)}/connectors`,
        phase: "execute",
        body: compactObject({
          startItem,
          endItem,
          shape: optionalString(input.shape),
          captions: Array.isArray(input.captions) ? input.captions : undefined,
          style: optionalRecord(input.style),
        }),
      }),
      "create connector response",
    );
    return { connector };
  },
  async delete_connector(input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
    const boardId = requiredInputString(input.boardId, "boardId");
    const connectorId = requiredInputString(input.connectorId, "connectorId");
    await requestMiroJson({
      ...context,
      method: "DELETE",
      path: `/v2/boards/${encodeURIComponent(boardId)}/connectors/${encodeURIComponent(connectorId)}`,
      phase: "execute",
    });
    return { boardId, connectorId, deleted: true };
  },
};

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, miroActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: miroApiBaseUrl,
  auth: { type: "oauth_bearer" },
  skipDnsValidation: true,
});

export const oauth: ProviderOAuthRuntime = {
  async refreshAccessToken(input) {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
      client_id: input.clientConfig.clientId,
      client_secret: input.clientConfig.clientSecret,
    });
    const response = await input.fetcher("https://api.miro.com/v1/oauth/token", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": providerUserAgent,
      },
      body,
      redirect: "manual",
    });
    const payload = optionalRecord(
      await readProviderJsonBody(response, {
        emptyBody: null,
        invalidJsonMessage: "Miro token refresh returned invalid JSON",
      }),
    );
    const message = optionalString(payload?.message);
    if (!response.ok) {
      if (message === "Invalid refresh token") {
        throw new ProviderRequestError(401, message, payload);
      }
      throw input.createError(message ?? `Miro token refresh failed (HTTP ${response.status}).`);
    }
    const accessToken = requiredString(payload?.access_token, "access_token", input.createError);
    const expiresIn = optionalNumber(payload?.expires_in);
    return {
      accessToken,
      refreshToken: optionalString(payload?.refresh_token),
      tokenType: optionalString(payload?.token_type) ?? "Bearer",
      expiresAt: expiresIn === undefined ? undefined : new Date(Date.now() + expiresIn * 1000).toISOString(),
      metadata: compactObject({ expires_in: expiresIn, scope: optionalString(payload?.scope) }),
    };
  },
};

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }) {
    const payload = requireMiroObject(
      await requestMiroJson({
        accessToken: input.accessToken,
        tokenType: input.tokenType,
        fetcher,
        signal,
        path: miroValidationPath,
        phase: "validate",
      }),
      "access token context",
    );
    return normalizeMiroCredential(payload, input.metadata.scope);
  },
};

async function createBoardItem(
  input: Record<string, unknown>,
  context: OAuthProviderContext,
  endpoint: "shapes" | "sticky_notes" | "texts",
  resourceName: string,
): Promise<{ item: Record<string, unknown> }> {
  const boardId = requiredInputString(input.boardId, "boardId");
  const data =
    endpoint === "shapes" ? optionalRecord(input.data) : requiredRecord(input.data, "data", providerInputError);
  if (endpoint !== "shapes") requiredString(data?.content, "data.content", providerInputError);
  const geometry = optionalRecord(input.geometry);
  if (endpoint === "sticky_notes" && geometry?.width !== undefined && geometry.height !== undefined) {
    throw new ProviderRequestError(400, "geometry must specify either width or height, not both");
  }
  if (endpoint === "texts" && geometry?.height !== undefined) {
    throw new ProviderRequestError(400, "geometry.height is not supported for text items");
  }

  const item = requireMiroObject(
    await requestMiroJson({
      ...context,
      method: "POST",
      path: `/v2/boards/${encodeURIComponent(boardId)}/${endpoint}`,
      phase: "execute",
      body: compactObject({
        data,
        style: optionalRecord(input.style),
        position: optionalRecord(input.position),
        geometry,
        parent: optionalRecord(input.parent),
      }),
    }),
    `create ${resourceName} response`,
  );
  return { item };
}

async function updateStickyNote(input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
  const data = optionalRecord(input.data);
  const style = optionalRecord(input.style);
  const position = optionalRecord(input.position);
  const geometry = optionalRecord(input.geometry);
  const parent = optionalRecord(input.parent);
  if (!data && !style && !position && !geometry && !parent) {
    throw new ProviderRequestError(400, "at least one sticky note field is required");
  }
  if (geometry?.width !== undefined && geometry.height !== undefined) {
    throw new ProviderRequestError(400, "geometry must specify either width or height, not both");
  }
  const boardId = requiredInputString(input.boardId, "boardId");
  const itemId = requiredInputString(input.itemId, "itemId");
  const item = requireMiroObject(
    await requestMiroJson({
      ...context,
      method: "PATCH",
      path: `/v2/boards/${encodeURIComponent(boardId)}/sticky_notes/${encodeURIComponent(itemId)}`,
      phase: "execute",
      body: compactObject({ data, style, position, geometry, parent }),
    }),
    "update sticky note response",
  );
  return { item };
}

function validateConnectorEndpoint(endpoint: Record<string, unknown>, label: string): void {
  if (endpoint.position !== undefined && endpoint.snapTo !== undefined) {
    throw new ProviderRequestError(400, `${label} must specify either position or snapTo, not both`);
  }
}

async function requestMiroJson(input: MiroRequestOptions): Promise<unknown> {
  const url = new URL(input.path.replace(/^\//u, ""), `${miroApiBaseUrl}/`);
  setSearchParams(url, input.query ?? {});
  const headers: Record<string, string> = {
    authorization: `${input.tokenType ?? "Bearer"} ${input.accessToken}`,
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
  if (input.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  const response = await input.fetcher(url, {
    method: input.method ?? "GET",
    headers,
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    signal: input.signal,
  });
  const payload = await readProviderJsonBody(response, {
    emptyBody: null,
    invalidJsonMessage: "Miro response must be valid JSON",
    invalidJsonFallback: response.ok ? undefined : (text) => text,
  });
  if (!response.ok) {
    throw createMiroResponseError(response, payload, input.phase);
  }
  return payload;
}

function normalizeMiroCredential(payload: Record<string, unknown>, tokenScope: unknown): CredentialValidationResult {
  const user = requiredRecord(payload.user, "Miro token context user", providerResponseError);
  const accountId = requiredString(user.id, "Miro user id", providerResponseError);
  const team = optionalRecord(payload.team);
  const userName = optionalString(user.name) ?? accountId;
  const teamName = optionalString(team?.name);
  const grantedScopes = optionalStringArray(payload.scopes) ?? parseScopeString(tokenScope);

  return {
    profile: {
      accountId,
      displayName: teamName ? `${userName} (${teamName})` : userName,
      grantedScopes,
    },
    grantedScopes,
    metadata: compactObject({
      apiBaseUrl: miroApiBaseUrl,
      validationEndpoint: miroValidationPath,
      tokenId: optionalString(payload.id),
      currentUser: user,
      team,
      createdAt: optionalString(payload.createdAt),
      createdBy: optionalRecord(payload.createdBy),
    }),
  };
}

function parseScopeString(value: unknown): string[] {
  return optionalString(value)?.split(/\s+/u).filter(Boolean) ?? [];
}

function createMiroResponseError(response: Response, payload: unknown, phase: MiroRequestPhase): ProviderRequestError {
  const message = extractMiroErrorMessage(payload) ?? response.statusText ?? "Miro request failed";
  const status = phase === "validate" && (response.status === 400 || response.status === 401) ? 400 : response.status;
  return new ProviderRequestError(status || 502, message, payload);
}

function extractMiroErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const object = optionalRecord(payload);
  return optionalString(object?.message) ?? optionalString(object?.error_description) ?? optionalString(object?.error);
}

function requireMiroObject(value: unknown, source: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `Miro ${source} must be an object`, value);
  }
  return object;
}

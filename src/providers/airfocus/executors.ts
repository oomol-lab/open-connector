import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
} from "../provider-runtime.ts";

const service = "airfocus";
const airfocusApiBaseUrl = "https://app.airfocus.com/api";
const profilePath = "/profile";

type RequestPhase = "validate" | "execute";
type AirfocusHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface AirfocusRequestInput {
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: RequestPhase;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: Record<string, unknown>;
}

export const airfocusActionHandlers: Record<string, AirfocusHandler> = {
  async get_profile(_input, context) {
    return { profile: await requestAirfocusObject({ path: profilePath, context, phase: "execute" }) };
  },
  async search_workspaces(input, context) {
    const payload = await requestAirfocusObject({
      path: "/workspaces/search",
      context,
      phase: "execute",
      method: "POST",
      body: pickFields(input, ["archived", "filter", "sort"]),
    });
    return normalizeSearchPage(payload, "workspaces");
  },
  async get_workspace(input, context) {
    const workspaceId = requiredInputString(input.workspaceId, "workspaceId");
    return {
      workspace: await requestAirfocusObject({
        path: `/workspaces/${encodeURIComponent(workspaceId)}`,
        context,
        phase: "execute",
      }),
    };
  },
  async search_items(input, context) {
    const workspaceId = requiredInputString(input.workspaceId, "workspaceId");
    const payload = await requestAirfocusObject({
      path: `/workspaces/${encodeURIComponent(workspaceId)}/items/search`,
      context,
      phase: "execute",
      method: "POST",
      body: pickFields(input, ["archived", "filter", "sort"]),
    });
    return normalizeSearchPage(payload, "items");
  },
  async get_item(input, context) {
    const { workspaceId, itemId } = readItemPath(input);
    return {
      item: await requestAirfocusObject({
        path: `/workspaces/${encodeURIComponent(workspaceId)}/items/${encodeURIComponent(itemId)}`,
        context,
        phase: "execute",
      }),
    };
  },
  async create_item(input, context) {
    const workspaceId = requiredInputString(input.workspaceId, "workspaceId");
    return {
      item: await requestAirfocusObject({
        path: `/workspaces/${encodeURIComponent(workspaceId)}/items`,
        context,
        phase: "execute",
        method: "POST",
        body: pickItemBody(input),
      }),
    };
  },
  async update_item(input, context) {
    const { workspaceId, itemId } = readItemPath(input);
    return {
      item: await requestAirfocusObject({
        path: `/workspaces/${encodeURIComponent(workspaceId)}/items/${encodeURIComponent(itemId)}`,
        context,
        phase: "execute",
        method: "PUT",
        body: pickItemBody(input),
      }),
    };
  },
  async delete_item(input, context) {
    const { workspaceId, itemId } = readItemPath(input);
    await requestAirfocusJson({
      path: `/workspaces/${encodeURIComponent(workspaceId)}/items/${encodeURIComponent(itemId)}`,
      context,
      phase: "execute",
      method: "DELETE",
    });
    return { deleted: true, itemId };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, airfocusActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: airfocusApiBaseUrl,
  auth: { type: "bearer" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const profile = await requestAirfocusObject({
      path: profilePath,
      context: { apiKey: input.apiKey, fetcher, signal },
      phase: "validate",
    });
    const fullName = optionalString(profile.fullName);
    const email = optionalString(profile.email);
    return {
      profile: {
        accountId: email ?? fullName ?? "airfocus-api-key",
        displayName: fullName ?? email ?? "airfocus Personal Access Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: airfocusApiBaseUrl,
        validationEndpoint: profilePath,
        email,
        fullName,
      }),
    };
  },
};

async function requestAirfocusObject(input: AirfocusRequestInput): Promise<Record<string, unknown>> {
  const payload = await requestAirfocusJson(input);
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "airfocus response must be a JSON object");
  }
  return record;
}

async function requestAirfocusJson(input: AirfocusRequestInput): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    const hasBody = input.body !== undefined;
    response = await input.context.fetcher(`${airfocusApiBaseUrl}${input.path}`, {
      method: input.method ?? "GET",
      headers: compactHeaders({
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        "content-type": hasBody ? "application/json" : undefined,
        "user-agent": providerUserAgent,
      }),
      body: hasBody ? JSON.stringify(input.body) : undefined,
      signal: input.context.signal,
    });
    payload = await readResponsePayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `airfocus request failed: ${error.message}` : "airfocus request failed",
    );
  }
  if (!response.ok) throw createAirfocusError(response, payload, input.phase);
  return payload;
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createAirfocusError(response: Response, payload: unknown, phase: RequestPhase): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    (typeof payload === "string" ? optionalString(payload) : undefined) ??
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    optionalString(response.statusText) ??
    `airfocus request failed with status ${response.status}`;
  if (response.status === 401) return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  if ([400, 403, 404, 409, 429].includes(response.status)) {
    return new ProviderRequestError(response.status, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function normalizeSearchPage(payload: Record<string, unknown>, key: "workspaces" | "items"): Record<string, unknown> {
  const items = Array.isArray(payload.items) ? payload.items.filter((item) => optionalRecord(item) !== undefined) : [];
  const totalItems = typeof payload.totalItems === "number" ? payload.totalItems : items.length;
  return { [key]: items, totalItems };
}

function pickItemBody(input: Record<string, unknown>): Record<string, unknown> {
  return pickFields(input, [
    "name",
    "description",
    "statusId",
    "archived",
    "assigneeUserIds",
    "assigneeUserGroupIds",
    "fields",
    "order",
  ]);
}

function pickFields(input: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const key of keys) {
    if (input[key] !== undefined) output[key] = input[key];
  }
  return output;
}

function readItemPath(input: Record<string, unknown>): { workspaceId: string; itemId: string } {
  return {
    workspaceId: requiredInputString(input.workspaceId, "workspaceId"),
    itemId: requiredInputString(input.itemId, "itemId"),
  };
}

function compactHeaders(headers: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

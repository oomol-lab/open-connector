import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "rebrandly";
const rebrandlyApiBaseUrl = "https://api.rebrandly.com/v1";
const validationPath = "/account";

type RebrandlyQueryValue = string | number | boolean | undefined;
type RebrandlyActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const rebrandlyActionHandlers: ProviderActionHandlers<"rebrandly", RebrandlyActionHandler> = {
  async get_account(_input, context) {
    return {
      account: optionalRecord(await requestRebrandlyJson({ path: "/account", context, mode: "execute" })) ?? {},
    };
  },
  async list_domains(input, context) {
    const payload = await requestRebrandlyJson({
      path: "/domains",
      context,
      mode: "execute",
      workspaceId: optionalString(input.workspaceId),
      query: {
        limit: optionalInteger(input.limit),
        orderBy: optionalString(input.orderBy),
        orderDir: optionalString(input.orderDir),
        last: optionalString(input.last),
        active: optionalBoolean(input.active),
        verified: optionalBoolean(input.verified),
        type: optionalString(input.type),
      },
    });
    return { domains: extractArrayPayload(payload) };
  },
  async list_links(input, context) {
    const payload = await requestRebrandlyJson({
      path: "/links",
      context,
      mode: "execute",
      workspaceId: optionalString(input.workspaceId),
      query: {
        limit: optionalInteger(input.limit),
        orderBy: optionalString(input.orderBy),
        orderDir: optionalString(input.orderDir),
        last: optionalString(input.last),
        domainId: optionalString(input.domainId),
        favourite: optionalBoolean(input.favourite),
        status: optionalString(input.status),
      },
    });
    return { links: extractArrayPayload(payload) };
  },
  async get_link(input, context) {
    const linkId = requiredInputString(input.linkId, "linkId");
    return {
      link:
        optionalRecord(
          await requestRebrandlyJson({
            path: `/links/${encodeURIComponent(linkId)}`,
            context,
            mode: "execute",
            workspaceId: optionalString(input.workspaceId),
            notFoundAsInvalidInput: true,
          }),
        ) ?? {},
    };
  },
  async create_link(input, context) {
    return {
      link:
        optionalRecord(
          await requestRebrandlyJson({
            path: "/links",
            method: "POST",
            context,
            mode: "execute",
            workspaceId: requiredInputString(input.workspaceId, "workspaceId"),
            body: compactObject({
              destination: requiredInputString(input.destination, "destination"),
              domainId: optionalString(input.domainId),
              slashtag: optionalString(input.slashtag),
              title: optionalString(input.title),
              description: optionalString(input.description),
            }),
          }),
        ) ?? {},
    };
  },
  async update_link(input, context) {
    const linkId = requiredInputString(input.linkId, "linkId");
    const body = compactObject({
      destination: optionalString(input.destination),
      slashtag: optionalString(input.slashtag),
      title: optionalString(input.title),
      description: optionalString(input.description),
    });
    if (Object.keys(body).length === 0) {
      throw new ProviderRequestError(400, "At least one of destination, slashtag, title, or description is required");
    }
    return {
      link:
        optionalRecord(
          await requestRebrandlyJson({
            path: `/links/${encodeURIComponent(linkId)}`,
            method: "POST",
            context,
            mode: "execute",
            workspaceId: optionalString(input.workspaceId),
            body,
            notFoundAsInvalidInput: true,
          }),
        ) ?? {},
    };
  },
  async delete_link(input, context) {
    const linkId = requiredInputString(input.linkId, "linkId");
    const payload = await requestRebrandlyJson({
      path: `/links/${encodeURIComponent(linkId)}`,
      method: "DELETE",
      context,
      mode: "execute",
      workspaceId: optionalString(input.workspaceId),
      notFoundAsInvalidInput: true,
    });
    return { deleted: payload === null ? { id: linkId, status: "deleted" } : (optionalRecord(payload) ?? {}) };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, rebrandlyActionHandlers);

export async function validateRebrandlyCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const account =
    optionalRecord(
      await requestRebrandlyJson({ path: validationPath, context: { apiKey, fetcher, signal }, mode: "validate" }),
    ) ?? {};
  const email = optionalString(account.email);
  const fullName = optionalString(account.fullName);
  const accountId = optionalString(account.id);
  return {
    profile: {
      accountId: accountId ?? "rebrandly-api-key",
      displayName: fullName ?? email ?? "Rebrandly API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      validationEndpoint: validationPath,
      apiBaseUrl: rebrandlyApiBaseUrl,
      accountId,
      email,
      fullName,
    },
  };
}

export const credentialValidators = {
  apiKey(
    input: { apiKey: string },
    { fetcher, signal }: { fetcher: typeof fetch; signal?: AbortSignal },
  ): Promise<CredentialValidationResult> {
    return validateRebrandlyCredential(input, fetcher, signal);
  },
};

async function requestRebrandlyJson(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  mode: "validate" | "execute";
  method?: string;
  query?: Record<string, RebrandlyQueryValue>;
  body?: unknown;
  workspaceId?: string;
  notFoundAsInvalidInput?: boolean;
}): Promise<unknown> {
  const url = new URL(`${rebrandlyApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }

  let response: Response;
  let payload: { kind: "empty" } | { kind: "json"; value: unknown } | { kind: "invalid_json"; raw: string };
  try {
    response = await input.context.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        apikey: input.context.apiKey,
        ...(input.workspaceId ? { Workspace: input.workspaceId } : {}),
        accept: "application/json",
        ...(input.body !== undefined ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.context.signal,
    });
    payload = await readJsonPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `rebrandly request failed: ${error.message}` : "rebrandly request failed",
    );
  }

  if (payload.kind === "invalid_json") {
    throw new ProviderRequestError(
      response.status === 429 ? 429 : 502,
      `rebrandly returned invalid JSON: ${payload.raw.slice(0, 200)}`,
    );
  }

  const value = payload.kind === "json" ? payload.value : null;
  if (!response.ok) throw createRebrandlyError(response, value, input.mode, input.notFoundAsInvalidInput === true);
  return value;
}

async function readJsonPayload(
  response: Response,
): Promise<{ kind: "empty" } | { kind: "json"; value: unknown } | { kind: "invalid_json"; raw: string }> {
  const raw = await response.text();
  if (!raw.trim()) return { kind: "empty" };
  try {
    return { kind: "json", value: JSON.parse(raw) as unknown };
  } catch {
    return { kind: "invalid_json", raw };
  }
}

function createRebrandlyError(
  response: Response,
  payload: unknown,
  mode: "validate" | "execute",
  notFoundAsInvalidInput: boolean,
): ProviderRequestError {
  const message = readRebrandlyErrorMessage(payload) ?? response.statusText ?? "rebrandly request failed";
  if (response.status === 429) return new ProviderRequestError(429, message, payload);
  if (response.status === 401 || response.status === 403)
    return new ProviderRequestError(mode === "validate" ? 401 : 403, message, payload);
  if (notFoundAsInvalidInput && response.status === 404) return new ProviderRequestError(400, message, payload);
  if ([400, 404, 406].includes(response.status)) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(response.status >= 500 ? 502 : 400, message, payload);
}

function readRebrandlyErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") return payload;
  const body = optionalRecord(payload) ?? {};
  const errors = Array.isArray(body.errors) ? body.errors : [];
  const firstError = optionalRecord(errors[0]);
  return (
    optionalString(firstError?.message) ??
    optionalString(body.message) ??
    optionalString(body.code) ??
    optionalString(body.error)
  );
}

function extractArrayPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const body = optionalRecord(payload) ?? {};
  for (const key of ["links", "domains", "data", "items"]) {
    const value = body[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

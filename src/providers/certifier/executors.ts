import type { QueryValue } from "../../core/request.ts";
import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { compactJson, queryParams } from "../../core/request.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "certifier";
const apiBaseUrl = "https://api.certifier.io/v1";
const apiVersion = "2022-10-26";

type CertifierActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const certifierActionHandlers: ProviderActionHandlers<"certifier", CertifierActionHandler> = {
  list_groups(input, context) {
    return listCollection("groups", "groups", input, context);
  },
  list_designs(input, context) {
    return listCollection("designs", "designs", input, context);
  },
  list_credentials(input, context) {
    return listCollection("credentials", "credentials", input, context);
  },
  async search_credentials(input, context) {
    const payload = await requestCertifierJson("credentials/search", context, {
      method: "POST",
      body: compactJson({
        filter: optionalRecord(input.filter) ?? {},
        sort: optionalRecord(input.sort),
        limit: input.limit,
        cursor: input.cursor,
      }),
    });
    const { items, pagination } = readPaginatedCollectionPayload(payload, "credentials");
    return { credentials: items, pagination };
  },
  async list_credential_interactions(input, context) {
    const { items, pagination } = readPaginatedCollectionPayload(
      await requestCertifierJson("credential-interactions", context, { query: input }),
      "interactions",
    );
    return { interactions: items, pagination };
  },
  async create_issue_send_credential(input, context) {
    const payload = await requestCertifierJson("credentials/create-issue-send", context, {
      method: "POST",
      body: compactJson({
        groupId: input.groupId,
        recipient: input.recipient,
        issueDate: input.issueDate,
        expiryDate: input.expiryDate,
        customAttributes: input.customAttributes,
      }),
    });
    return { credential: readSingleObjectPayload(payload, "credential") };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, certifierActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const context = { apiKey: input.apiKey, fetcher, signal };
    const payload = await requestCertifierJson("groups", context, { query: { limit: 1 } });
    const { items } = readPaginatedCollectionPayload(payload, "groups");
    const firstGroup = optionalRecord(items[0]);
    return {
      profile: {
        accountId: "api_key",
        displayName: "Certifier Access Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl,
        validationEndpoint: "/groups",
        apiVersion,
        firstGroupId: optionalString(firstGroup?.id),
        firstGroupName: optionalString(firstGroup?.name),
      }),
    };
  },
};

async function listCollection(
  outputKey: string,
  path: string,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await requestCertifierJson(path, context, { query: input });
  const { items, pagination } = readPaginatedCollectionPayload(payload, outputKey);
  return { [outputKey]: items, pagination };
}

async function requestCertifierJson(
  path: string,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  options: { method?: "GET" | "POST"; query?: Record<string, unknown>; body?: unknown } = {},
): Promise<unknown> {
  const url = new URL(path, `${apiBaseUrl}/`);
  for (const [key, value] of Object.entries(queryParams((options.query ?? {}) as Record<string, QueryValue>))) {
    url.searchParams.set(key, value);
  }
  const response = await context.fetcher(url, {
    method: options.method ?? "GET",
    headers: buildHeaders(context.apiKey, options.body !== undefined),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: context.signal,
  });
  const payload = await readPayload(response);
  if (!response.ok) throw createCertifierError(response, payload);
  return payload;
}

function buildHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "certifier-version": apiVersion,
    "user-agent": providerUserAgent,
  };
  if (hasBody) headers["content-type"] = "application/json";
  return headers;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Certifier returned invalid JSON");
  }
}

function readPaginatedCollectionPayload(
  payload: unknown,
  key: string,
): { items: unknown[]; pagination: Record<string, unknown> } {
  const record = optionalRecord(payload);
  const items = Array.isArray(record?.[key]) ? record[key] : Array.isArray(record?.items) ? record.items : [];
  const pagination = optionalRecord(record?.pagination) ?? {
    next: record?.next ?? null,
    prev: record?.prev ?? null,
  };
  return { items, pagination };
}

function readSingleObjectPayload(payload: unknown, key: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  const value = optionalRecord(record?.[key]) ?? record;
  if (!value) throw new ProviderRequestError(502, `invalid Certifier ${key} response`);
  return value;
}

function createCertifierError(response: Response, payload: unknown): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(optionalRecord(record?.error)?.message) ??
    response.statusText ??
    `Certifier request failed with HTTP ${response.status}`;
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, payload);
}

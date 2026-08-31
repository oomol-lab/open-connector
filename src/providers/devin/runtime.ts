import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { ProviderRequestError, providerResponseError, providerUserAgent } from "../provider-runtime.ts";

export const devinApiBaseUrl = "https://api.devin.ai";

type JsonObject = Record<string, unknown>;
type DevinActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const devinActionHandlers: ProviderActionHandlers<"devin", DevinActionHandler> = {
  async get_self(_input, context) {
    return normalizeSelf(await requestDevin({ path: "/v3/self" }, context));
  },
  async create_session(input, context) {
    return normalizeSessionOutput(
      await requestDevin(
        {
          method: "POST",
          path: `/v3/organizations/${encodePathSegment(requireInputString(input.orgId, "orgId"))}/sessions`,
          search: buildSearchParams({ devin_id: input.devinId }),
          body: compactObject({
            prompt: input.prompt,
            title: input.title,
            devin_mode: input.devinMode,
            repos: input.repos,
            attachment_urls: input.attachmentUrls,
            tags: input.tags,
            playbook_id: input.playbookId,
            child_playbook_id: input.childPlaybookId,
            knowledge_ids: input.knowledgeIds,
            secret_ids: input.secretIds,
            session_links: input.sessionLinks,
            create_as_user_id: input.createAsUserId,
            max_acu_limit: input.maxAcuLimit,
            bypass_approval: optionalBoolean(input.bypassApproval),
            resumable: optionalBoolean(input.resumable),
            platform: input.platform,
            structured_output_required: optionalBoolean(input.structuredOutputRequired),
            structured_output_schema: input.structuredOutputSchema,
          }),
        },
        context,
      ),
    );
  },
  async list_sessions(input, context) {
    const payload = await requestDevin(
      {
        path: `/v3/organizations/${encodePathSegment(requireInputString(input.orgId, "orgId"))}/sessions`,
        search: buildSearchParams({
          first: input.first,
          after: input.after,
          session_ids: input.sessionIds,
          user_ids: input.userIds,
          service_user_ids: input.serviceUserIds,
          repo_names: input.repoNames,
          tags: input.tags,
          origins: input.origins,
          category: input.category,
          is_archived: optionalBoolean(input.isArchived),
          created_after: input.createdAfter,
          created_before: input.createdBefore,
          updated_after: input.updatedAfter,
          updated_before: input.updatedBefore,
          playbook_id: input.playbookId,
          schedule_id: input.scheduleId,
          devin_id: input.devinId,
        }),
      },
      context,
    );
    return {
      items: requireArray(payload.items, "items"),
      hasNextPage: requireBoolean(payload.has_next_page, "has_next_page"),
      endCursor: optionalString(payload.end_cursor) ?? null,
      total: typeof payload.total === "number" ? payload.total : null,
      raw: payload,
    };
  },
  async get_session(input, context) {
    return normalizeSessionOutput(
      await requestDevin(
        {
          path: `/v3/organizations/${encodePathSegment(requireInputString(input.orgId, "orgId"))}/sessions/${encodePathSegment(
            requireInputString(input.devinId, "devinId"),
          )}`,
        },
        context,
      ),
    );
  },
  async send_message(input, context) {
    return normalizeSessionOutput(
      await requestDevin(
        {
          method: "POST",
          path: `/v3/organizations/${encodePathSegment(requireInputString(input.orgId, "orgId"))}/sessions/${encodePathSegment(
            requireInputString(input.devinId, "devinId"),
          )}/messages`,
          body: compactObject({
            message: input.message,
            attachment_urls: input.attachmentUrls,
            message_as_user_id: input.messageAsUserId,
          }),
        },
        context,
      ),
    );
  },
  async terminate_session(input, context) {
    return normalizeSessionOutput(
      await requestDevin(
        {
          method: "DELETE",
          path: `/v3/organizations/${encodePathSegment(requireInputString(input.orgId, "orgId"))}/sessions/${encodePathSegment(
            requireInputString(input.devinId, "devinId"),
          )}`,
          search: buildSearchParams({ archive: optionalBoolean(input.archive) }),
        },
        context,
      ),
    );
  },
};

export async function validateDevinCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const normalized = normalizeSelf(
    await requestDevin({ path: "/v3/self", authFailureAsInvalidInput: true }, { apiKey, fetcher, signal }),
  );
  return {
    profile: {
      accountId: `devin:${normalized.id}`,
      displayName: normalized.name ?? "Devin API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: devinApiBaseUrl,
      validationEndpoint: "/v3/self",
      principalType: normalized.principalType,
      orgId: normalized.orgId,
    }),
  };
}

interface DevinRequestOptions {
  method?: "DELETE" | "GET" | "POST";
  path: string;
  search?: URLSearchParams;
  body?: Record<string, unknown>;
  authFailureAsInvalidInput?: boolean;
}

async function requestDevin(request: DevinRequestOptions, context: ApiKeyProviderContext): Promise<JsonObject> {
  const url = new URL(`${devinApiBaseUrl}${request.path}`);
  for (const [key, value] of request.search ?? []) {
    url.searchParams.append(key, value);
  }

  const response = await context.fetcher(url, {
    method: request.method ?? "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${context.apiKey}`,
      ...(request.body === undefined ? {} : { "content-type": "application/json" }),
      "user-agent": providerUserAgent,
    },
    body: request.body === undefined ? undefined : JSON.stringify(request.body),
    signal: context.signal,
  });

  const payload = await readJsonObject(response, !response.ok);
  if (!response.ok) {
    throw mapDevinError(response, payload, request.authFailureAsInvalidInput ?? false);
  }
  return payload;
}

async function readJsonObject(response: Response, tolerant: boolean): Promise<JsonObject> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return requiredRecord(JSON.parse(text), "Devin response", providerResponseError);
  } catch (error) {
    if (tolerant) {
      return {};
    }
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, "Devin returned invalid JSON");
  }
}

function mapDevinError(
  response: Response,
  payload: JsonObject,
  authFailureAsInvalidInput: boolean,
): ProviderRequestError {
  const message =
    readValidationMessage(payload.detail) ??
    optionalString(payload.detail) ??
    optionalString(payload.message) ??
    `Devin API request failed with status ${response.status}`;

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(authFailureAsInvalidInput ? 400 : response.status, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, payload);
}

function normalizeSelf(payload: JsonObject): {
  principalType: string;
  orgId: string | null;
  id: string;
  name: string | null;
  raw: JsonObject;
} {
  const principalType = requireResponseString(payload.principal_type, "principal_type");
  const orgId = optionalString(payload.org_id) ?? null;
  const id =
    optionalString(payload.service_user_id) ??
    optionalString(payload.user_id) ??
    optionalString(payload.devin_id) ??
    optionalString(payload.api_key_id) ??
    (orgId ? `${principalType}:${orgId}` : undefined);
  if (!id) {
    throw new ProviderRequestError(502, "Devin returned invalid stable principal identifier");
  }
  return {
    principalType,
    orgId,
    id,
    name:
      optionalString(payload.service_user_name) ??
      optionalString(payload.user_name) ??
      optionalString(payload.api_key_name) ??
      null,
    raw: payload,
  };
}

function normalizeSessionOutput(payload: JsonObject): { session: JsonObject; raw: JsonObject } {
  return {
    session: payload,
    raw: payload,
  };
}

function buildSearchParams(input: Record<string, unknown>): URLSearchParams {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null && item !== "") {
          search.append(key, String(item));
        }
      }
      continue;
    }
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  return search;
}

function requireArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Devin returned invalid ${fieldName}`);
  }
  return value;
}

function requireBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `Devin returned invalid ${fieldName}`);
  }
  return value;
}

function requireInputString(value: unknown, fieldName: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return stringValue;
}

function requireResponseString(value: unknown, fieldName: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(502, `Devin returned invalid ${fieldName}`);
  }
  return stringValue;
}

function readValidationMessage(detail: unknown): string | undefined {
  if (!Array.isArray(detail)) {
    return undefined;
  }
  const messages = detail
    .map((item) => optionalRecord(item))
    .map((item) => optionalString(item?.msg))
    .filter((message): message is string => Boolean(message));
  return messages.length > 0 ? messages.join("; ") : undefined;
}

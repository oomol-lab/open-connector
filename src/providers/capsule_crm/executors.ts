import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalInteger, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "capsule_crm";
const capsuleCrmApiBaseUrl = "https://api.capsulecrm.com/api/v2";

type CapsuleCrmActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const capsuleCrmActionHandlers: ProviderActionHandlers<"capsule_crm", CapsuleCrmActionHandler> = {
  list_parties(input, context) {
    return requestList(context, "/parties", "parties", buildListQuery(input));
  },
  search_parties(input, context) {
    return requestList(context, "/parties/search", "parties", buildListQuery(input));
  },
  get_party(input, context) {
    return requestItem(context, `/parties/${readId(input)}`, "party");
  },
  create_party(input, context) {
    return requestItem(context, "/parties", "party", "POST", { party: input.party });
  },
  update_party(input, context) {
    return requestItem(context, `/parties/${readId(input)}`, "party", "PUT", { party: input.party });
  },
  async delete_party(input, context) {
    await requestJson({ ...context, path: `/parties/${readId(input)}`, method: "DELETE" });
    return { deleted: true };
  },
  list_opportunities(input, context) {
    return requestList(context, "/opportunities", "opportunities", buildListQuery(input));
  },
  search_opportunities(input, context) {
    return requestList(context, "/opportunities/search", "opportunities", buildListQuery(input));
  },
  get_opportunity(input, context) {
    return requestItem(context, `/opportunities/${readId(input)}`, "opportunity");
  },
  create_opportunity(input, context) {
    return requestItem(context, "/opportunities", "opportunity", "POST", { opportunity: input.opportunity });
  },
  update_opportunity(input, context) {
    return requestItem(context, `/opportunities/${readId(input)}`, "opportunity", "PUT", {
      opportunity: input.opportunity,
    });
  },
  async delete_opportunity(input, context) {
    await requestJson({ ...context, path: `/opportunities/${readId(input)}`, method: "DELETE" });
    return { deleted: true };
  },
  list_tasks(input, context) {
    return requestList(context, "/tasks", "tasks", buildListQuery(input));
  },
  get_task(input, context) {
    return requestItem(context, `/tasks/${readId(input)}`, "task");
  },
  create_task(input, context) {
    return requestItem(context, "/tasks", "task", "POST", { task: input.task });
  },
  update_task(input, context) {
    return requestItem(context, `/tasks/${readId(input)}`, "task", "PUT", { task: input.task });
  },
  async delete_task(input, context) {
    await requestJson({ ...context, path: `/tasks/${readId(input)}`, method: "DELETE" });
    return { deleted: true };
  },
  list_users(input, context) {
    return requestList(context, "/users", "users", buildListQuery(input));
  },
  get_current_user(input, context) {
    return requestItem(context, "/users/current", "user", "GET", undefined, {
      embed: Array.isArray(input.embed) ? input.embed.join(",") : undefined,
    });
  },
  list_categories(input, context) {
    return requestList(context, "/categories", "categories", buildListQuery(input));
  },
  list_countries(_input, context) {
    return requestList(context, "/countries", "countries");
  },
  list_currencies(_input, context) {
    return requestList(context, "/currencies", "currencies");
  },
  list_pipelines(input, context) {
    return requestList(context, "/pipelines", "pipelines", {
      ...buildListQuery(input),
      includeDeleted: typeof input.includeDeleted === "boolean" ? String(input.includeDeleted) : undefined,
    });
  },
  list_pipeline_milestones(input, context) {
    return requestList(context, `/pipelines/${readPipelineId(input)}/milestones`, "milestones", buildListQuery(input));
  },
  list_stages(input, context) {
    const boardId = optionalInteger(input.boardId);
    return requestList(context, boardId === undefined ? "/stages" : `/boards/${boardId}/stages`, "stages", {
      ...buildListQuery(input),
      status: optionalString(input.status),
      includeOnDeletedBoard:
        typeof input.includeOnDeletedBoard === "boolean" ? String(input.includeOnDeletedBoard) : undefined,
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, capsuleCrmActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestJson({
      apiKey: input.apiKey,
      fetcher,
      signal,
      path: "/users/current",
    });
    const user = requireObject(payload.user, "/users/current user");
    const userId = optionalInteger(user.id);
    const username = optionalString(user.username);
    const name = optionalString(user.name);
    return {
      profile: {
        accountId: userId
          ? `capsule_crm:user:${userId}`
          : `capsule_crm:token:${createHash("sha256").update(input.apiKey).digest("hex").slice(0, 16)}`,
        displayName: name ?? username ?? "Capsule CRM API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: capsuleCrmApiBaseUrl,
        validationEndpoint: "/users/current",
        userId,
        username,
      }),
    };
  },
};

function readId(input: Record<string, unknown>) {
  const id = optionalInteger(input.id);
  if (id === undefined) throw new ProviderRequestError(400, "capsule_crm id is required");
  return id;
}

function readPipelineId(input: Record<string, unknown>) {
  const id = optionalInteger(input.pipelineId);
  if (id === undefined) throw new ProviderRequestError(400, "capsule_crm pipelineId is required");
  return id;
}

function buildListQuery(input: Record<string, unknown>) {
  return compactObject({
    page: optionalInteger(input.page),
    perPage: optionalInteger(input.perPage),
    since: optionalString(input.since),
    q: optionalString(input.q),
    embed: Array.isArray(input.embed) ? input.embed.join(",") : undefined,
    status: Array.isArray(input.status) ? input.status.join(",") : undefined,
  });
}

async function requestList(
  context: ApiKeyProviderContext,
  path: string,
  propertyName: string,
  query?: Record<string, unknown>,
) {
  const { payload, headers } = await requestJsonWithHeaders({ ...context, path, query });
  return {
    [propertyName]: requireArray(payload[propertyName], `${path} ${propertyName}`),
    pagination: readPagination(headers),
  };
}

async function requestItem(
  context: ApiKeyProviderContext,
  path: string,
  propertyName: string,
  method = "GET",
  body?: unknown,
  query?: Record<string, unknown>,
) {
  const payload = await requestJson({ ...context, path, method, body, query });
  return {
    [propertyName]: requireObject(payload[propertyName], `${path} ${propertyName}`),
  };
}

async function requestJson(input: CapsuleCrmRequestInput) {
  const { payload } = await requestJsonWithHeaders(input);
  return payload;
}

interface CapsuleCrmRequestInput {
  apiKey: string;
  fetcher: typeof fetch;
  path: string;
  signal?: AbortSignal;
  method?: string;
  query?: Record<string, unknown>;
  body?: unknown;
}

async function requestJsonWithHeaders(input: CapsuleCrmRequestInput) {
  const url = new URL(`${capsuleCrmApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const timeout = createProviderTimeout(input.signal);
  try {
    const response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    if (!response.ok) await throwCapsuleCrmError(response);
    if (response.status === 204) return { payload: {}, headers: response.headers };
    const text = await response.text().catch(() => "");
    return {
      payload: requireObject(text ? JSON.parse(text) : {}, input.path),
      headers: response.headers,
    };
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout()) throw new ProviderRequestError(504, "capsule_crm request timed out");
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "capsule_crm request failed");
  } finally {
    timeout.cleanup();
  }
}

async function throwCapsuleCrmError(response: Response): Promise<never> {
  const text = await response.text().catch(() => "");
  let message = text || `Capsule CRM request failed with HTTP ${response.status}`;
  if (text) {
    try {
      const payload = requireObject(JSON.parse(text), "error response");
      message =
        optionalString(payload.message) ?? optionalString(payload.error) ?? optionalString(payload.detail) ?? message;
    } catch {
      message = text;
    }
  }
  if (response.status === 401 || response.status === 403)
    throw new ProviderRequestError(400, `capsule_crm authentication failed: ${message}`);
  if (response.status >= 400 && response.status < 500) throw new ProviderRequestError(400, message);
  throw new ProviderRequestError(response.status, message);
}

function requireObject(value: unknown, context: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, `capsule_crm ${context} returned invalid object`, value);
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, context: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `capsule_crm ${context} returned invalid array`, value);
  }
  return value;
}

function readPagination(headers: Headers) {
  return compactObject({
    page: parseHeaderInteger(headers.get("X-Pagination-Page")),
    perPage: parseHeaderInteger(headers.get("X-Pagination-Per-Page")),
    totalPages: parseHeaderInteger(headers.get("X-Pagination-Total-Pages")),
    totalRecords: parseHeaderInteger(headers.get("X-Pagination-Total-Records")),
    nextUrl: parseLinkHeader(headers.get("Link")).next,
    previousUrl: parseLinkHeader(headers.get("Link")).prev,
  });
}

function parseHeaderInteger(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function parseLinkHeader(value: string | null) {
  const links: Record<string, string> = {};
  if (!value) return links;
  for (const part of value.split(",")) {
    const sections = part.split(";").map((section) => section.trim());
    const rawUrl = sections[0];
    const rawRel = sections.find((section) => section.startsWith('rel="'));
    if (!rawUrl || !rawRel || !rawUrl.startsWith("<") || !rawUrl.endsWith(">")) continue;
    links[rawRel.slice(5, -1)] = rawUrl.slice(1, -1);
  }
  return links;
}

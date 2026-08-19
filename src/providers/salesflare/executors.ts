import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "salesflare";
const salesflareApiBaseUrl = "https://api.salesflare.com";

type SalesflareRequestPhase = "validate" | "execute";
type SalesflareActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface SalesflareRequestInput {
  method: "GET" | "POST" | "PUT";
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase?: SalesflareRequestPhase;
  query?: Record<string, unknown>;
  body?: unknown;
}

export const salesflareActionHandlers: ProviderActionHandlers<"salesflare", SalesflareActionHandler> = {
  async get_current_user(_input, context) {
    return { user: await salesflareRequestJson({ method: "GET", path: "/me", context }) };
  },
  async list_accounts(input, context) {
    return {
      accounts: await salesflareRequestJson({
        method: "GET",
        path: "/accounts",
        query: buildListQuery(input),
        context,
      }),
    };
  },
  async create_account(input, context) {
    return {
      account: await salesflareRequestJson({ method: "POST", path: "/accounts", body: buildBody(input), context }),
    };
  },
  async get_account(input, context) {
    return {
      account: await salesflareRequestJson({ method: "GET", path: `/accounts/${readId(input, "id")}`, context }),
    };
  },
  async update_account(input, context) {
    return {
      account: await salesflareRequestJson({
        method: "PUT",
        path: `/accounts/${readId(input, "account_id")}`,
        body: buildBody(input, ["account_id"]),
        context,
      }),
    };
  },
  async list_contacts(input, context) {
    return {
      contacts: await salesflareRequestJson({
        method: "GET",
        path: "/contacts",
        query: buildListQuery(input),
        context,
      }),
    };
  },
  async create_contact(input, context) {
    return {
      contact: await salesflareRequestJson({ method: "POST", path: "/contacts", body: buildBody(input), context }),
    };
  },
  async get_contact(input, context) {
    return {
      contact: await salesflareRequestJson({ method: "GET", path: `/contacts/${readId(input, "id")}`, context }),
    };
  },
  async update_contact(input, context) {
    return {
      contact: await salesflareRequestJson({
        method: "PUT",
        path: `/contacts/${readId(input, "contact_id")}`,
        body: buildBody(input, ["contact_id"]),
        context,
      }),
    };
  },
  async list_opportunities(input, context) {
    return {
      opportunities: await salesflareRequestJson({
        method: "GET",
        path: "/opportunities",
        query: buildListQuery(input),
        context,
      }),
    };
  },
  async get_opportunity(input, context) {
    return {
      opportunity: await salesflareRequestJson({
        method: "GET",
        path: `/opportunities/${readId(input, "id")}`,
        context,
      }),
    };
  },
  async create_opportunity(input, context) {
    return {
      opportunity: await salesflareRequestJson({
        method: "POST",
        path: "/opportunities",
        body: buildBody(input),
        context,
      }),
    };
  },
  async update_opportunity(input, context) {
    return {
      opportunity: await salesflareRequestJson({
        method: "PUT",
        path: `/opportunities/${readId(input, "id")}`,
        body: buildBody(input, ["id"]),
        context,
      }),
    };
  },
  async list_tasks(input, context) {
    return {
      tasks: await salesflareRequestJson({ method: "GET", path: "/tasks", query: buildListQuery(input), context }),
    };
  },
  create_task(input, context) {
    return salesflareRequestJson({ method: "POST", path: "/tasks", body: buildBody(input), context });
  },
  update_task(input, context) {
    return salesflareRequestJson({
      method: "PUT",
      path: `/tasks/${readId(input, "id")}`,
      body: buildBody(input, ["id"]),
      context,
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, salesflareActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
    const user = await salesflareRequestJson({
      method: "GET",
      path: "/me",
      context: { apiKey, fetcher, signal },
      phase: "validate",
    });
    const userObject = optionalRecord(user) ?? {};
    const userId = userObject.id;
    const userName = optionalString(userObject.name);
    const userEmail = optionalString(userObject.email);

    return {
      profile: {
        accountId: userId == null ? "salesflare-api-key" : String(userId),
        displayName: userName ?? userEmail ?? "Salesflare API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: salesflareApiBaseUrl,
        validationEndpoint: "/me",
        userId,
        userEmail,
        userName,
      }),
    };
  },
};

async function salesflareRequestJson(input: SalesflareRequestInput): Promise<unknown> {
  const url = new URL(input.path, salesflareApiBaseUrl);
  applyQuery(url, input.query);

  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(url, {
      method: input.method,
      headers: salesflareHeaders(input.context.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.context.signal,
    });
    payload = await readSalesflarePayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `salesflare request failed: ${error.message}` : "salesflare request failed",
    );
  }

  if (!response.ok) throw createSalesflareError(response, payload, input.phase ?? "execute");
  return payload;
}

function salesflareHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    "user-agent": providerUserAgent,
    ...(hasBody ? { "content-type": "application/json" } : {}),
  };
}

function buildListQuery(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    search: optionalString(input.search),
    details: optionalBoolean(input.details),
    name: optionalString(input.name),
    id: optionalInteger(input.id),
    email: optionalString(input.email),
    phone_number: optionalString(input.phone_number),
    domain: input.domain,
    account: optionalInteger(input.account),
    includeArchived: optionalBoolean(input.includeArchived),
    type: optionalString(input.type),
    status: optionalString(input.status),
    stage: optionalInteger(input.stage),
    owner: optionalInteger(input.owner),
    min_value: optionalNumber(input.min_value),
    max_value: optionalNumber(input.max_value),
    closed: optionalBoolean(input.closed),
    done: optionalBoolean(input.done),
    hotness: optionalInteger(input.hotness),
    assignees: input.assignees,
    limit: optionalInteger(input.limit),
    offset: optionalInteger(input.offset),
    order_by: input.order_by,
    custom: optionalString(input.custom),
  });
}

function buildBody(input: Record<string, unknown>, omitKeys: string[] = []): Record<string, unknown> {
  const body = { ...input };
  for (const key of omitKeys) delete body[key];
  const raw = body.raw;
  delete body.raw;
  const rawObject = optionalRecord(raw);
  if (rawObject) return compactObject({ ...rawObject, ...body });
  return compactObject(body);
}

function applyQuery(url: URL, query: Record<string, unknown> | undefined): void {
  if (!query) return;
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
      continue;
    }
    url.searchParams.set(key, String(value));
  }
}

async function readSalesflarePayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createSalesflareError(
  response: Response,
  payload: unknown,
  phase: SalesflareRequestPhase,
): ProviderRequestError {
  const message =
    extractSalesflareErrorMessage(payload) ??
    response.statusText ??
    `salesflare request failed with status ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message, payload);
  }
  if (response.status === 400 || response.status === 404)
    return new ProviderRequestError(response.status, message, payload);
  if (response.status === 429) return new ProviderRequestError(429, message, payload);
  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractSalesflareErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload;
  const record = optionalRecord(payload);
  if (!record) return undefined;
  const message = optionalString(record.message);
  if (message) return message;
  const error = record.error;
  if (typeof error === "string" && error.trim()) return error;
  if (Array.isArray(error)) {
    const firstMessage = error.find((item) => typeof item === "string" && item.trim());
    if (typeof firstMessage === "string") return firstMessage;
  }
  return undefined;
}

function readId(input: Record<string, unknown>, key: string): string {
  const id = optionalInteger(input[key]);
  if (id === undefined) throw new ProviderRequestError(400, `${key} is required`);
  return encodeURIComponent(String(id));
}

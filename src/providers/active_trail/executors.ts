import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "active_trail";
const activeTrailApiBaseUrl = "https://webapi.mymarketing.co.il/api";
const activeTrailDefaultRequestTimeoutMs = 30_000;

type ActiveTrailPhase = "validate" | "execute";
type ActiveTrailMethod = "GET" | "POST" | "PUT" | "DELETE";
type QueryValue = string | number | undefined;
type ActiveTrailActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const activeTrailActionHandlers: ProviderActionHandlers<"active_trail", ActiveTrailActionHandler> = {
  async get_account_balance(_input, context) {
    const payload = await requestActiveTrailJson({
      method: "GET",
      path: "/account/balance",
      context,
      phase: "execute",
    });
    return normalizeBalance(payload);
  },
  async list_contacts(input, context) {
    const payload = await requestActiveTrailJson({
      method: "GET",
      path: "/contacts",
      context,
      query: contactListQuery(input),
      phase: "execute",
    });
    return {
      contacts: requireArray(payload, "ActiveTrail contacts").map(normalizeContact),
    };
  },
  async get_contact(input, context) {
    const payload = await requestActiveTrailJson({
      method: "GET",
      path: `/contacts/${encodeURIComponent(readRequiredInteger(input.id, "id"))}`,
      context,
      phase: "execute",
    });
    return {
      contact: normalizeContact(payload),
    };
  },
  async create_contact(input, context) {
    const payload = await requestActiveTrailJson({
      method: "POST",
      path: "/contacts",
      context,
      body: input,
      phase: "execute",
    });
    return {
      contact: normalizeContact(payload),
    };
  },
  async update_contact(input, context) {
    const { id, ...body } = input;
    const payload = await requestActiveTrailJson({
      method: "PUT",
      path: `/contacts/${encodeURIComponent(readRequiredInteger(id, "id"))}`,
      context,
      body,
      phase: "execute",
    });
    return {
      contact: normalizeContact(payload ?? { id, ...body }),
    };
  },
  async delete_contact(input, context) {
    const payload = await requestActiveTrailJson({
      method: "DELETE",
      path: `/contacts/${encodeURIComponent(readRequiredInteger(input.id, "id"))}`,
      context,
      phase: "execute",
    });
    return normalizeDeleteResult(payload);
  },
  async list_groups(input, context) {
    const payload = await requestActiveTrailJson({
      method: "GET",
      path: "/groups",
      context,
      query: compactObject({
        SearchTerm: readOptionalString(input.search_term),
        Page: readOptionalNumberString(input.page),
        Limit: readOptionalNumberString(input.limit),
      }),
      phase: "execute",
    });
    return {
      groups: requireArray(payload, "ActiveTrail groups").map(normalizeGroup),
    };
  },
  async get_group(input, context) {
    const payload = await requestActiveTrailJson({
      method: "GET",
      path: `/groups/${encodeURIComponent(readRequiredInteger(input.id, "id"))}`,
      context,
      phase: "execute",
    });
    return {
      group: normalizeGroup(payload),
    };
  },
  async create_group(input, context) {
    const payload = await requestActiveTrailJson({
      method: "POST",
      path: "/groups",
      context,
      body: {
        name: readRequiredString(input.name, "name"),
      },
      phase: "execute",
    });
    return {
      group: normalizeGroup(payload),
    };
  },
  async update_group(input, context) {
    const id = readRequiredInteger(input.id, "id");
    const name = readRequiredString(input.name, "name");
    const payload = await requestActiveTrailJson({
      method: "PUT",
      path: `/groups/${encodeURIComponent(id)}`,
      context,
      body: {
        name,
      },
      phase: "execute",
    });
    return {
      group: normalizeGroup(payload ?? { id, name }),
    };
  },
  async delete_group(input, context) {
    const payload = await requestActiveTrailJson({
      method: "DELETE",
      path: `/groups/${encodeURIComponent(readRequiredInteger(input.id, "id"))}`,
      context,
      phase: "execute",
    });
    return normalizeDeleteResult(payload);
  },
  async list_group_members(input, context) {
    const { group_id, ...filters } = input;
    const payload = await requestActiveTrailJson({
      method: "GET",
      path: `/groups/${encodeURIComponent(readRequiredInteger(group_id, "group_id"))}/members`,
      context,
      query: contactListQuery(filters),
      phase: "execute",
    });
    const record = requireObjectRecord(payload, "ActiveTrail group members response");
    const contacts = requireArray(record.contacts, "ActiveTrail group members").map(normalizeContact);
    return {
      count: readNullableInteger(record.count),
      contacts,
      data: record,
    };
  },
  async add_group_member(input, context) {
    const { group_id, ...body } = input;
    const payload = await requestActiveTrailJson({
      method: "POST",
      path: `/groups/${encodeURIComponent(readRequiredInteger(group_id, "group_id"))}/members`,
      context,
      body,
      phase: "execute",
    });
    return {
      contact: normalizeContact(payload),
    };
  },
  async remove_group_member(input, context) {
    const payload = await requestActiveTrailJson({
      method: "DELETE",
      path: `/groups/${encodeURIComponent(readRequiredInteger(input.group_id, "group_id"))}/members/${encodeURIComponent(readRequiredInteger(input.member_id, "member_id"))}`,
      context,
      phase: "execute",
    });
    return normalizeDeleteResult(payload);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, activeTrailActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestActiveTrailJson({
      method: "GET",
      path: "/account/balance",
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      phase: "validate",
    });
    const balance = normalizeBalance(payload);

    return {
      profile: {
        accountId: "active_trail:api_token",
        displayName: "ActiveTrail API Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: activeTrailApiBaseUrl,
        validationEndpoint: "/account/balance",
        emailCredits: readOptionalNumber(balance.email.credits),
        smsCredits: readOptionalNumber(balance.sms.credits),
      }),
    };
  },
};

async function requestActiveTrailJson(input: {
  method: ActiveTrailMethod;
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  query?: Record<string, QueryValue>;
  body?: Record<string, unknown>;
  phase: ActiveTrailPhase;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, activeTrailDefaultRequestTimeoutMs);

  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: input.context.apiKey,
      "user-agent": providerUserAgent,
    };
    if (input.body) {
      headers["content-type"] = "application/json";
    }

    const response = await input.context.fetcher(buildActiveTrailUrl(input.path, input.query), {
      method: input.method,
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readActiveTrailPayload(response);

    if (!response.ok) {
      throw createActiveTrailError(response.status, response.statusText, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "ActiveTrail request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `ActiveTrail request failed: ${error.message}` : "ActiveTrail request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildActiveTrailUrl(path: string, query: Record<string, QueryValue> = {}): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${activeTrailApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function readActiveTrailPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "ActiveTrail returned invalid JSON");
  }
}

function createActiveTrailError(
  status: number,
  statusText: string,
  payload: unknown,
  phase: ActiveTrailPhase,
): ProviderRequestError {
  const message = extractActiveTrailErrorMessage(payload) ?? statusText ?? "ActiveTrail request failed";

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(409, message, payload);
  }

  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractActiveTrailErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return (
    readOptionalString(record.message) ||
    readOptionalString(record.Message) ||
    readOptionalString(record.error) ||
    readOptionalString(record.Error) ||
    undefined
  );
}

function contactListQuery(input: Record<string, unknown>): Record<string, QueryValue> {
  return compactObject({
    CustomerStates: readOptionalString(input.customer_state),
    SearchTerm: readOptionalString(input.search_term),
    FromDate: readOptionalString(input.from_date),
    ToDate: readOptionalString(input.to_date),
    Page: readOptionalNumberString(input.page),
    Limit: readOptionalNumberString(input.limit),
  });
}

function normalizeBalance(payload: unknown): {
  email: Record<string, unknown>;
  sms: Record<string, unknown>;
  coupons: Record<string, unknown>;
  data: Record<string, unknown>;
} {
  const record = requireObjectRecord(payload, "ActiveTrail account balance");
  return {
    email: requireObjectRecord(record.email, "ActiveTrail email balance"),
    sms: requireObjectRecord(record.sms, "ActiveTrail SMS balance"),
    coupons: requireObjectRecord(record.coupons, "ActiveTrail coupon balance"),
    data: record,
  };
}

function normalizeGroup(value: unknown): Record<string, unknown> {
  const record = requireObjectRecord(value, "ActiveTrail group");
  return {
    id: readRequiredInteger(record.id, "id"),
    name: readRequiredString(record.name, "name"),
    active_counter: readNullableInteger(record.active_counter),
    counter: readNullableInteger(record.counter),
    created: readNullableString(record.created),
    last_generated: readNullableString(record.last_generated),
    data: record,
  };
}

function normalizeContact(value: unknown): Record<string, unknown> {
  const record = requireObjectRecord(value, "ActiveTrail contact");
  return {
    id: readRequiredInteger(record.id, "id"),
    state: readNullableString(record.state),
    is_optined: readNullableBoolean(record.is_optined),
    email: readNullableString(record.email),
    sms: readNullableString(record.sms),
    first_name: readNullableString(record.first_name),
    last_name: readNullableString(record.last_name),
    data: record,
  };
}

function normalizeDeleteResult(payload: unknown): Record<string, unknown> {
  return {
    deleted: true,
    data: payload,
  };
}

function requireObjectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} must be an object`, value);
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} must be an array`, value);
  }
  return value;
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProviderRequestError(502, `ActiveTrail response missing string field: ${fieldName}`);
  }
  return value;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed)) {
    throw new ProviderRequestError(502, `ActiveTrail response missing integer field: ${fieldName}`);
  }
  return parsed;
}

function readNullableInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function readOptionalNumberString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return String(value);
}

function readNullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

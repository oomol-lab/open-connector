import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "repairshopr";
const repairshoprHostSuffix = ".repairshopr.com";
const repairshoprApiPath = "/api/v1";
const currentUserPath = "/me";
const customerListQueryKeys = ["sort", "query", "firstname", "lastname", "business_name", "email", "page"] as const;
const ticketListQueryKeys = [
  "customer_id",
  "contact_id",
  "number",
  "resolved_after",
  "created_after",
  "since_updated_at",
  "status",
  "query",
  "user_id",
  "mine",
  "ticket_search_id",
  "asset_name",
  "asset_serial",
  "page",
  "comment_format",
  "all_comments",
] as const;

type RepairshoprPhase = "validate" | "execute";
type RepairshoprQueryValue = string | number | boolean | undefined;
type RepairshoprActionHandler = (input: Record<string, unknown>, context: RepairshoprActionContext) => Promise<unknown>;

interface RepairshoprActionContext {
  apiBaseUrl: string;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const repairshoprActionHandlers: ProviderActionHandlers<"repairshopr", RepairshoprActionHandler> = {
  get_current_user(_input, context) {
    return getCurrentUser(context, "execute");
  },
  list_customers(input, context) {
    return requestRepairshoprJson({
      ...context,
      path: "/customers",
      query: buildQuery(input, customerListQueryKeys),
      phase: "execute",
    });
  },
  get_customer(input, context) {
    return requestRepairshoprJson({
      ...context,
      path: `/customers/${readRequiredId(input.id, "id")}`,
      phase: "execute",
    });
  },
  list_tickets(input, context) {
    return requestRepairshoprJson({
      ...context,
      path: "/tickets",
      query: buildQuery(input, ticketListQueryKeys),
      phase: "execute",
    });
  },
  get_ticket(input, context) {
    return requestRepairshoprJson({
      ...context,
      path: `/tickets/${readRequiredId(input.id, "id")}`,
      phase: "execute",
    });
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<RepairshoprActionContext>({
  service,
  handlers: repairshoprActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<RepairshoprActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiBaseUrl: readRepairshoprApiBaseUrl(credential.values, credential.metadata),
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const subdomain = readRepairshoprSubdomain(input.values.subdomain);
    const apiBaseUrl = buildRepairshoprApiBaseUrl(subdomain);
    const payload = await getCurrentUser(
      {
        apiBaseUrl,
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );
    const user = optionalRecord(payload) ?? {};
    const userId = optionalInteger(user.user_id);
    const userEmail = optionalString(user.user_email);

    return {
      profile: {
        accountId: userId === undefined ? `repairshopr:${subdomain}` : `repairshopr:${subdomain}:user:${userId}`,
        displayName: buildAccountLabel(user, subdomain),
      },
      grantedScopes: [],
      metadata: compactObject({
        subdomain,
        apiBaseUrl,
        validationEndpoint: currentUserPath,
        userId: userId === undefined ? undefined : String(userId),
        userEmail,
      }),
    };
  },
};

function buildRepairshoprApiBaseUrl(account: unknown): string {
  const subdomain = readRepairshoprSubdomain(account);
  return `https://${subdomain}${repairshoprHostSuffix}${repairshoprApiPath}`;
}

function readRepairshoprApiBaseUrl(values: Record<string, string>, metadata: Record<string, unknown>): string {
  const storedBaseUrl = optionalString(metadata.apiBaseUrl);
  if (storedBaseUrl) {
    return buildRepairshoprApiBaseUrl(storedBaseUrl);
  }
  return buildRepairshoprApiBaseUrl(optionalString(metadata.subdomain) ?? values.subdomain);
}

function getCurrentUser(context: RepairshoprActionContext, phase: RepairshoprPhase): Promise<unknown> {
  return requestRepairshoprJson({
    ...context,
    path: currentUserPath,
    phase,
  });
}

async function requestRepairshoprJson(
  input: RepairshoprActionContext & {
    path: string;
    query?: Record<string, RepairshoprQueryValue>;
    phase: RepairshoprPhase;
  },
): Promise<unknown> {
  let response: Response;
  let payload: unknown;

  try {
    response = await input.fetcher(buildRepairshoprUrl(input.apiBaseUrl, input.path, input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: input.apiKey,
        "user-agent": providerUserAgent,
      },
      signal: input.signal,
    });
    payload = await readRepairshoprPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `RepairShopr request failed: ${error.message}` : "RepairShopr request failed",
      error,
    );
  }

  if (!response.ok) {
    throw createRepairshoprError(response.status, payload, input.phase);
  }

  return payload;
}

function buildRepairshoprUrl(
  apiBaseUrl: string,
  path: string,
  query: Record<string, RepairshoprQueryValue> = {},
): string {
  const url = new URL(`${apiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function buildQuery<const TKeys extends readonly string[]>(
  input: Record<string, unknown>,
  keys: TKeys,
): Record<string, RepairshoprQueryValue> {
  const query: Record<string, RepairshoprQueryValue> = {};
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        query[key] = trimmed;
      }
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      query[key] = value;
    }
  }
  return query;
}

async function readRepairshoprPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "RepairShopr returned invalid JSON");
    }
    return { message: text };
  }
}

function createRepairshoprError(status: number, payload: unknown, phase: RepairshoprPhase): ProviderRequestError {
  const message = extractRepairshoprMessage(payload) ?? `RepairShopr request failed with ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(403, message, payload);
  }

  if (phase === "execute" && [400, 404, 422].includes(status)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function extractRepairshoprMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const message = record.message;
  if (Array.isArray(message)) {
    for (const item of message) {
      if (typeof item === "string" && item.trim()) {
        return item;
      }
    }
  }

  return optionalString(record.error) ?? optionalString(record.message) ?? optionalString(record.detail);
}

function readRequiredId(value: unknown, fieldName: string): number {
  const id = optionalInteger(value);
  if (id === undefined || id <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return id;
}

function readRepairshoprSubdomain(account: unknown): string {
  const value = optionalString(account);
  if (!value) {
    throw new ProviderRequestError(400, "subdomain is required");
  }

  const parsed = parseRepairshoprAccountInput(value);
  if (parsed) {
    return parsed;
  }

  const lowered = value.toLowerCase();
  if (isSafeSubdomain(lowered)) {
    return lowered;
  }

  throw new ProviderRequestError(400, "subdomain must be a RepairShopr account subdomain or URL");
}

function parseRepairshoprAccountInput(value: string): string | undefined {
  const candidate = value.includes("://") ? value : value.includes(".") ? `https://${value}` : "";
  if (!candidate) {
    return undefined;
  }

  try {
    const url = new URL(candidate);
    const hostname = url.hostname.toLowerCase();
    if (!hostname.endsWith(repairshoprHostSuffix)) {
      return undefined;
    }
    const subdomain = hostname.slice(0, -repairshoprHostSuffix.length);
    return isSafeSubdomain(subdomain) ? subdomain : undefined;
  } catch {
    return undefined;
  }
}

function isSafeSubdomain(value: string): boolean {
  if (
    !value ||
    value.startsWith("-") ||
    value.endsWith("-") ||
    value.includes(".") ||
    value.includes("/") ||
    value.includes("?")
  ) {
    return false;
  }
  for (const char of value) {
    const code = char.charCodeAt(0);
    const isLowercaseLetter = code >= 97 && code <= 122;
    const isNumber = code >= 48 && code <= 57;
    if (!isLowercaseLetter && !isNumber && char !== "-") {
      return false;
    }
  }
  return true;
}

function buildAccountLabel(user: Record<string, unknown>, subdomain: string): string {
  return optionalString(user.user_name) ?? optionalString(user.user_email) ?? `RepairShopr ${subdomain}`;
}

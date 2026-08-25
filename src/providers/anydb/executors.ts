import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "anydb";
const apiBaseUrl = "https://app.anydb.com/api";

interface AnydbCredentials {
  apiKey: string;
  userEmail: string;
}

interface AnydbActionContext extends AnydbCredentials {
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type AnydbActionHandler = (input: Record<string, unknown>, context: AnydbActionContext) => Promise<unknown>;

export const anydbActionHandlers: ProviderActionHandlers<"anydb", AnydbActionHandler> = {
  async list_teams(_input, context) {
    return { teams: await requestAnydb(context, "/integrations/ext/listteams") };
  },
  async list_databases(input, context) {
    return {
      databases: await requestAnydb(context, "/integrations/ext/listdbsforteam", {
        query: pickQuery(input, ["teamid"]),
      }),
    };
  },
  async list_records(input, context) {
    const data = await requestAnydb(context, "/integrations/ext/list", {
      query: pickQuery(input, ["teamid", "adbid", "parentid", "templateid", "templatename", "pagesize", "lastmarker"]),
    });
    const page = optionalRecord(data);
    if (!page) throw new ProviderRequestError(502, "AnyDB returned an invalid record page");

    return {
      items: Array.isArray(page.items) ? page.items : [],
      lastmarker: optionalString(page.lastmarker) ?? optionalString(page.lastMarker) ?? optionalString(page.nextCursor),
      hasmore:
        typeof page.hasmore === "boolean" ? page.hasmore : typeof page.hasMore === "boolean" ? page.hasMore : undefined,
      total: typeof page.total === "number" ? page.total : undefined,
    };
  },
  async get_record(input, context) {
    return {
      record: await requestAnydb(context, "/integrations/ext/record", {
        query: pickQuery(input, ["teamid", "adbid", "adoid"]),
      }),
    };
  },
  async search_records(input, context) {
    return {
      records: await requestAnydb(context, "/integrations/ext/search", {
        query: pickQuery(input, ["teamid", "adbid", "search", "limit"]),
      }),
    };
  },
  async create_record(input, context) {
    return {
      record: await requestAnydb(context, "/integrations/ext/createrecord", { method: "POST", body: input }),
    };
  },
  async update_record(input, context) {
    return {
      record: await requestAnydb(context, "/integrations/ext/updaterecord", { method: "PUT", body: input }),
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<AnydbActionContext>({
  service,
  handlers: anydbActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<AnydbActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      userEmail: readUserEmail(credential.values),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: apiBaseUrl,
  auth: { type: "api_key_header", name: "x-anydb-api-key" },
  skipDnsValidation: true,
  async customizeRequest({ context, headers }) {
    const credential = await requireApiKeyCredential(context, service);
    headers.set("x-anydb-email", readUserEmail(credential.values));
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    if (!headers.has("user-agent")) headers.set("user-agent", providerUserAgent);
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const credentials = { apiKey: input.apiKey, userEmail: readUserEmail(input.values) };
    const teams = await requestAnydb({ ...credentials, fetcher, signal }, "/integrations/ext/listteams", {
      phase: "validate",
    });
    if (!Array.isArray(teams)) throw new ProviderRequestError(502, "AnyDB returned an invalid team list");

    return {
      profile: { accountId: credentials.userEmail, displayName: credentials.userEmail },
      grantedScopes: [],
      metadata: {
        apiBaseUrl,
        validationEndpoint: "/integrations/ext/listteams",
        teamCount: teams.length,
      },
    };
  },
};

function readUserEmail(values: Record<string, unknown>): string {
  return requiredString(values.userEmail, "userEmail", (message) => new ProviderRequestError(400, message));
}

function pickQuery(input: Record<string, unknown>, names: string[]): URLSearchParams {
  const query = new URLSearchParams();
  for (const name of names) {
    const value = input[name];
    if (typeof value === "string" || typeof value === "number") query.set(name, String(value));
  }
  return query;
}

interface AnydbRequestOptions {
  method?: "GET" | "POST" | "PUT";
  query?: URLSearchParams;
  body?: Record<string, unknown>;
  phase?: "validate" | "execute";
}

async function requestAnydb(
  context: AnydbActionContext,
  path: string,
  options: AnydbRequestOptions = {},
): Promise<unknown> {
  const url = new URL(`${apiBaseUrl}${path}`);
  if (options.query) url.search = options.query.toString();

  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: options.method ?? "GET",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-anydb-api-key": context.apiKey,
        "x-anydb-email": context.userEmail,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `AnyDB request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
    );
  }

  const payload = await readJson(response);
  const record = optionalRecord(payload);
  const message = optionalString(record?.message) ?? optionalString(record?.error) ?? "AnyDB request failed";
  if (!response.ok || record?.status !== "success") {
    throw mapAnydbError(response.status, message, options.phase ?? "execute", payload);
  }
  return record.data;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderRequestError(502, "AnyDB returned invalid JSON");
  }
}

function mapAnydbError(
  status: number,
  message: string,
  phase: "validate" | "execute",
  payload: unknown,
): ProviderRequestError {
  if (status === 401 || status === 403)
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (status >= 400 && status < 500) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(status || 502, message, payload);
}

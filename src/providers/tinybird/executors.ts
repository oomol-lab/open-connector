import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { TinybirdActionName } from "./actions.ts";

import {
  compactObject,
  optionalBoolean,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { tinybirdDefaultApiBaseUrl } from "./constants.ts";

export const tinybirdAllowedApiBaseUrls: readonly string[] = [
  "https://api.europe-west2.gcp.tinybird.co",
  tinybirdDefaultApiBaseUrl,
  "https://api.us-east.tinybird.co",
  "https://api.northamerica-northeast2.gcp.tinybird.co",
  "https://api.eu-central-1.aws.tinybird.co",
  "https://api.eu-west-1.aws.tinybird.co",
  "https://api.us-east.aws.tinybird.co",
  "https://api.us-west-2.aws.tinybird.co",
  "https://api.ap-east-1.aws.tinybird.co",
  "https://api.ap-southeast-2.aws.tinybird.co",
];

const service = "tinybird";
const tinybirdValidationQuery = "SELECT 1 FORMAT JSON";
const tinybirdSqlPath = "/v0/sql";

type TinybirdPhase = "validate" | "execute";
type TinybirdQueryValue = string | number | boolean | undefined;
type TinybirdActionHandler = (input: Record<string, unknown>, context: TinybirdActionContext) => Promise<unknown>;

interface TinybirdActionContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface TinybirdRequestInput {
  apiKey: string;
  apiBaseUrl: string;
  path: string;
  method?: "GET" | "POST";
  query?: Record<string, TinybirdQueryValue>;
  body?: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: TinybirdPhase;
  notFoundAsInvalidInput?: boolean;
}

export const tinybirdActionHandlers: Record<TinybirdActionName, TinybirdActionHandler> = {
  run_sql_query(input, context) {
    return runSqlQuery(input, context);
  },
  run_pipe_endpoint(input, context) {
    return runPipeEndpoint(input, context);
  },
  list_data_sources(input, context) {
    return listDataSources(input, context);
  },
  get_data_source(input, context) {
    return getDataSource(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<TinybirdActionContext>({
  service,
  handlers: tinybirdActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<TinybirdActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiBaseUrl: resolveTinybirdApiBaseUrl(
        credential.values.apiBaseUrl ?? optionalString(credential.metadata.apiBaseUrl),
      ),
      fetcher,
      signal: context.signal,
    };
  },
  fallbackMessage: "Tinybird request failed",
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    return resolveTinybirdApiBaseUrl(credential.values.apiBaseUrl ?? optionalString(credential.metadata.apiBaseUrl));
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const apiBaseUrl = resolveTinybirdApiBaseUrl(input.values.apiBaseUrl);
    await requestTinybirdJson({
      apiKey: input.apiKey,
      apiBaseUrl,
      path: tinybirdSqlPath,
      method: "POST",
      body: {
        q: tinybirdValidationQuery,
      },
      fetcher,
      signal,
      phase: "validate",
    });

    const host = new URL(apiBaseUrl).host;
    return {
      profile: {
        accountId: `tinybird:${host}`,
        displayName: `Tinybird ${host}`,
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl,
        validationEndpoint: tinybirdSqlPath,
      },
    };
  },
};

export function resolveTinybirdApiBaseUrl(value: unknown): string {
  const rawApiBaseUrl = optionalString(value);
  if (!rawApiBaseUrl) {
    return tinybirdDefaultApiBaseUrl;
  }

  let url: URL;
  try {
    url = new URL(rawApiBaseUrl);
  } catch {
    throw new ProviderRequestError(400, "Tinybird API Base URL must be a valid URL");
  }

  const pathname = url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;
  if (
    url.protocol === "https:" &&
    tinybirdAllowedApiBaseUrls.includes(url.origin) &&
    (pathname === "" || pathname === "/v0") &&
    !url.search &&
    !url.hash &&
    !url.username &&
    !url.password
  ) {
    return url.origin;
  }

  throw new ProviderRequestError(400, `unsupported Tinybird API Base URL: ${rawApiBaseUrl}`);
}

async function runSqlQuery(input: Record<string, unknown>, context: TinybirdActionContext): Promise<unknown> {
  const payload = await requestTinybirdJson({
    apiKey: context.apiKey,
    apiBaseUrl: context.apiBaseUrl,
    path: tinybirdSqlPath,
    method: "POST",
    body: compactObject({
      ...optionalRecord(input.parameters),
      q: requiredString(input.q, "q", createInvalidInputError),
      pipeline: optionalString(input.pipeline),
      explain: optionalBoolean(input.explain),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    payload,
  };
}

async function runPipeEndpoint(input: Record<string, unknown>, context: TinybirdActionContext): Promise<unknown> {
  const pipeName = requiredString(input.pipeName, "pipeName", createInvalidInputError);
  const payload = await requestTinybirdJson({
    apiKey: context.apiKey,
    apiBaseUrl: context.apiBaseUrl,
    path: `/v0/pipes/${encodeURIComponent(pipeName)}.json`,
    query: readParameterRecord(input.parameters),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    payload,
  };
}

async function listDataSources(input: Record<string, unknown>, context: TinybirdActionContext): Promise<unknown> {
  const payload = await requestTinybirdJson({
    apiKey: context.apiKey,
    apiBaseUrl: context.apiBaseUrl,
    path: "/v0/datasources",
    query: compactObject({
      attrs: optionalString(input.attrs),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    dataSources: normalizeDataSourceList(payload),
    payload,
  };
}

async function getDataSource(input: Record<string, unknown>, context: TinybirdActionContext): Promise<unknown> {
  const dataSourceName = requiredString(input.name, "name", createInvalidInputError);
  const payload = await requestTinybirdJson({
    apiKey: context.apiKey,
    apiBaseUrl: context.apiBaseUrl,
    path: `/v0/datasources/${encodeURIComponent(dataSourceName)}`,
    query: compactObject({
      attrs: optionalString(input.attrs),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    dataSource: requiredRecord(payload, "dataSource", createInvalidInputError),
  };
}

async function requestTinybirdJson(input: TinybirdRequestInput): Promise<unknown> {
  const url = new URL(input.path, input.apiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: tinybirdHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Tinybird request failed: ${error.message}` : "Tinybird request failed",
    );
  }

  const payload = await readTinybirdPayload(response);
  if (!response.ok) {
    throw createTinybirdError(response.status, payload, input.phase, input.notFoundAsInvalidInput);
  }

  return payload;
}

function tinybirdHeaders(apiKey: string, hasBody: boolean): Headers {
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  });
  if (hasBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

async function readTinybirdPayload(response: Response): Promise<unknown> {
  const rawBody = await response.text();
  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch (error) {
    throw new ProviderRequestError(
      response.status === 429 ? 429 : 502,
      error instanceof Error
        ? `Tinybird returned non-JSON response: ${error.message}`
        : "Tinybird returned non-JSON response",
    );
  }
}

function createTinybirdError(
  status: number,
  payload: unknown,
  phase: TinybirdPhase,
  notFoundAsInvalidInput?: boolean,
): ProviderRequestError {
  const message = readTinybirdErrorMessage(payload) ?? `Tinybird request failed with ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (notFoundAsInvalidInput && status === 404) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 400) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function readTinybirdErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    return trimmed ? trimmed : undefined;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return optionalString(record.error) ?? optionalString(record.message) ?? optionalString(record.detail);
}

function normalizeDataSourceList(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.map((item) => requiredRecord(item, "dataSource", createInvalidInputError));
  }

  const record = requiredRecord(payload, "payload", createInvalidInputError);
  const dataSources = record.datasources ?? record.data_sources ?? record.dataSources;
  if (Array.isArray(dataSources)) {
    return dataSources.map((item) => requiredRecord(item, "dataSource", createInvalidInputError));
  }
  return [];
}

function readParameterRecord(value: unknown): Record<string, TinybirdQueryValue> {
  const record = optionalRecord(value);
  if (!record) {
    return {};
  }

  const output: Record<string, TinybirdQueryValue> = {};
  for (const [key, child] of Object.entries(record)) {
    if (typeof child === "string" || typeof child === "number" || typeof child === "boolean") {
      output[key] = child;
    }
  }
  return output;
}

function createInvalidInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

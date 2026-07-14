import type {
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderFetch,
  createProviderProxyUrl,
  defineApiKeyProviderExecutors,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "appdrag";
const appdragHomepageUrl = "https://appdrag.com";
const appdragDefaultRequestTimeoutMs = 30_000;
const appdragResponseWrapperDescription = "/api/<folder>/<function>";
const appdragFetch = createProviderFetch({ skipDnsValidation: true });

type AppdragHttpMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
type AppdragEnvironment = "default" | "dev" | "preprod" | "prod";

interface AppdragResponse {
  ok: boolean;
  body: unknown;
  format: "empty" | "json" | "text";
}

type AppdragActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const appdragActionHandlers: Record<string, AppdragActionHandler> = {
  execute_function(input, context) {
    return executeFunction(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, appdragActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const url = createProviderProxyUrl(appdragHomepageUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("user-agent", providerUserAgent);

    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };
    if (input.method.toUpperCase() === "GET") {
      url.searchParams.set("APIKey", credential.apiKey);
    } else {
      init.body = JSON.stringify(buildProxyRequestBody(credential.apiKey, input.body));
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
    }

    const response = await appdragFetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `provider request failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "provider request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    const apiKey = input.apiKey.trim();
    if (!apiKey) {
      throw new ProviderRequestError(400, "appdrag apiKey is required");
    }

    return {
      profile: {
        displayName: "AppDrag API Key",
      },
      grantedScopes: [],
      metadata: {
        homepageUrl: appdragHomepageUrl,
        routePattern: appdragResponseWrapperDescription,
        validationMode: "format_only",
      },
    };
  },
};

async function executeFunction(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const folder = requiredString(input.folder, "folder", invalidInputError);
  const functionName = requiredString(input.functionName, "functionName", invalidInputError);
  const method = normalizeMethod(input.method);
  const environment = normalizeEnvironment(input.environment);
  const rawResponse = input.rawResponse === true;
  const route = buildFunctionRoute({
    folder,
    functionName,
    environment,
  });
  const parameters = mergeApiKeyIntoParameters(context.apiKey, input.parameters);
  const request = buildRequest(route, method, parameters);

  const response = await requestAppdrag(route, request, context);
  if (rawResponse) {
    return {
      successful: response.ok,
      rawBody: response.body,
      responseFormat: response.format,
      route: route.toString(),
    };
  }

  const wrapped = parseWrappedResponse(response.body);
  return compactObject({
    successful: response.ok,
    data: wrapped,
    error: response.ok ? undefined : extractTopLevelError(response.body),
    responseFormat: response.format,
    route: route.toString(),
  });
}

function normalizeMethod(value: unknown): AppdragHttpMethod {
  const text = optionalString(value)?.toUpperCase();
  if (!text) {
    return "POST";
  }

  switch (text) {
    case "GET":
    case "POST":
    case "PUT":
    case "PATCH":
    case "DELETE":
      return text;
    default:
      throw new ProviderRequestError(400, "method must be GET, POST, PUT, PATCH, or DELETE");
  }
}

function normalizeEnvironment(value: unknown): AppdragEnvironment {
  const text = optionalString(value)?.toLowerCase();
  if (!text) {
    return "default";
  }

  switch (text) {
    case "default":
    case "dev":
    case "preprod":
    case "prod":
      return text;
    default:
      throw new ProviderRequestError(400, "environment must be default, dev, preprod, or prod");
  }
}

function mergeApiKeyIntoParameters(apiKey: string, parametersInput: unknown): Record<string, unknown> {
  const parameterRecord = { ...(optionalRecord(parametersInput) ?? {}) };
  const existingApiKey = optionalString(parameterRecord.APIKey);
  if (existingApiKey && existingApiKey !== apiKey) {
    throw new ProviderRequestError(400, "parameters.APIKey must match the connected AppDrag API key");
  }
  parameterRecord.APIKey = apiKey;
  return parameterRecord;
}

function buildProxyRequestBody(apiKey: string, bodyInput: unknown): Record<string, unknown> {
  if (bodyInput === undefined) {
    return { APIKey: apiKey };
  }

  const body = optionalRecord(bodyInput);
  if (!body) {
    throw new ProviderRequestError(400, "body must be a JSON object for AppDrag proxy requests");
  }
  const existingApiKey = optionalString(body.APIKey);
  if (existingApiKey && existingApiKey !== apiKey) {
    throw new ProviderRequestError(400, "body.APIKey must match the connected AppDrag API key");
  }
  return {
    ...body,
    APIKey: apiKey,
  };
}

function buildFunctionRoute(input: { folder: string; functionName: string; environment: AppdragEnvironment }): URL {
  const path = `/api/${encodeURIComponent(input.folder)}/${encodeURIComponent(input.functionName)}`;
  if (input.environment === "default") {
    return new URL(path, appdragHomepageUrl);
  }
  return new URL(`/${input.environment}${path}`, appdragHomepageUrl);
}

function buildRequest(route: URL, method: AppdragHttpMethod, parameters: Record<string, unknown>): RequestInit {
  const headers: Record<string, string> = {
    accept: "application/json, text/plain;q=0.9, */*;q=0.8",
    "user-agent": providerUserAgent,
  };

  if (method === "GET") {
    for (const [key, value] of Object.entries(parameters)) {
      appendSearchParam(route, key, value);
    }
    return {
      method,
      headers,
    };
  }

  headers["content-type"] = "application/json";
  return {
    method,
    headers,
    body: JSON.stringify(parameters),
  };
}

function appendSearchParam(route: URL, key: string, value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (value === null) {
    route.searchParams.set(key, "null");
    return;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    route.searchParams.set(key, String(value));
    return;
  }
  route.searchParams.set(key, JSON.stringify(value));
}

async function requestAppdrag(
  route: URL,
  init: RequestInit,
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">,
): Promise<AppdragResponse> {
  const timeoutSignal = AbortSignal.timeout(appdragDefaultRequestTimeoutMs);
  const signal = context.signal ? AbortSignal.any([context.signal, timeoutSignal]) : timeoutSignal;

  try {
    const response = await context.fetcher(route, {
      ...init,
      signal,
    });
    const body = await readResponseBody(response);
    if (!response.ok) {
      throw createAppdragError(response, body);
    }
    return {
      ok: response.ok,
      body,
      format: inferResponseFormat(body),
    };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutSignal.aborted && isAbortError(error)) {
      throw new ProviderRequestError(504, "AppDrag request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `AppDrag request failed: ${error.message}` : "AppDrag request failed",
    );
  }
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function parseWrappedResponse(body: unknown): Record<string, unknown> {
  const record = optionalRecord(body);
  if (!record) {
    throw new ProviderRequestError(502, "AppDrag response did not return the expected JSON wrapper", body);
  }

  const status = record.status;
  const execTime = record.execTime;
  const billedTime = record.billedTime;
  const payload = "payload" in record ? record.payload : undefined;

  if (
    (typeof status !== "boolean" && typeof status !== "string") ||
    typeof execTime !== "number" ||
    typeof billedTime !== "number" ||
    payload === undefined
  ) {
    throw new ProviderRequestError(
      502,
      "AppDrag response did not include status, execTime, billedTime, and payload",
      body,
    );
  }

  return compactObject({
    status,
    execTime,
    billedTime,
    payload,
    logs: record.logs,
    affectedRows: normalizeAffectedRows(record.affectedRows),
  });
}

function normalizeAffectedRows(value: unknown): number | string | undefined {
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }
  return undefined;
}

function extractTopLevelError(body: unknown): string | undefined {
  const record = optionalRecord(body);
  return typeof record?.error === "string" ? record.error : undefined;
}

function createAppdragError(response: Response, body: unknown): ProviderRequestError {
  const record = optionalRecord(body);
  const message =
    optionalString(record?.error) ??
    optionalString(record?.message) ??
    optionalString(record?.logs) ??
    response.statusText ??
    `AppDrag request failed with status ${response.status}`;

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(400, message, {
      status: response.status,
      body,
    });
  }

  return new ProviderRequestError(response.status, message, body);
}

function inferResponseFormat(body: unknown): "empty" | "json" | "text" {
  if (body === null) {
    return "empty";
  }
  if (typeof body === "string") {
    return "text";
  }
  return "json";
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function invalidInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

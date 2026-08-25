import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const celigoDefaultApiBaseUrl = "https://api.integrator.io";
const celigoValidationPath = "/v1/tokenInfo";
const celigoAllowedHosts = new Set(["api.integrator.io", "api.eu.integrator.io"]);

interface CeligoActionContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface CeligoRequestOptions extends CeligoActionContext {
  path: string;
  mode: "validate" | "execute";
  notFoundAsInvalidInput?: boolean;
}

type CeligoActionHandler = (input: Record<string, unknown>, context: CeligoActionContext) => Promise<unknown>;
type JsonPayloadReadResult =
  | { kind: "empty" }
  | { kind: "json"; value: unknown }
  | { kind: "invalid_json"; raw: string };

export const celigoActionHandlers: ProviderActionHandlers<"celigo", CeligoActionHandler> = {
  get_token_info(_input, context) {
    return getTokenInfo(context);
  },
  list_exports(_input, context) {
    return listResource(context, "/v1/exports", "exports");
  },
  get_export(input, context) {
    return getResource(
      context,
      `/v1/exports/${encodeURIComponent(requireInputString(input.exportId, "exportId"))}`,
      "export",
    );
  },
  list_imports(_input, context) {
    return listResource(context, "/v1/imports", "imports");
  },
  get_import(input, context) {
    return getResource(
      context,
      `/v1/imports/${encodeURIComponent(requireInputString(input.importId, "importId"))}`,
      "import",
    );
  },
  list_flows(_input, context) {
    return listResource(context, "/v1/flows", "flows");
  },
  get_flow(input, context) {
    return getResource(context, `/v1/flows/${encodeURIComponent(requireInputString(input.flowId, "flowId"))}`, "flow");
  },
  get_connection(input, context) {
    return getResource(
      context,
      `/v1/connections/${encodeURIComponent(requireInputString(input.connectionId, "connectionId"))}`,
      "connection",
    );
  },
};

export async function validateCeligoCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = requireApiKey(input.apiKey);
  const apiBaseUrl = resolveCeligoApiBaseUrl(input.apiBaseUrl);
  const tokenInfo = normalizeTokenInfo(
    await requestCeligoJson({
      apiKey,
      apiBaseUrl,
      path: celigoValidationPath,
      fetcher,
      signal,
      mode: "validate",
    }),
  );

  return {
    profile: {
      accountId: tokenInfo._userId,
      displayName: "Celigo API Token",
    },
    grantedScopes: tokenInfo.scope,
    metadata: compactObject({
      apiBaseUrl,
      validationEndpoint: celigoValidationPath,
      scope: tokenInfo.scope,
    }),
  };
}

export function resolveCeligoApiBaseUrl(value: unknown): string {
  const text = optionalString(value);
  if (!text) return celigoDefaultApiBaseUrl;

  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new ProviderRequestError(400, "apiBaseUrl must be a valid URL");
  }

  if (parsed.protocol !== "https:") {
    throw new ProviderRequestError(400, "apiBaseUrl must use https");
  }
  if (!celigoAllowedHosts.has(parsed.host)) {
    throw new ProviderRequestError(400, "apiBaseUrl must be an approved Celigo API host");
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, "");
  if (normalizedPath.length > 0 && normalizedPath !== "/v1") {
    throw new ProviderRequestError(400, "apiBaseUrl must point to the API root or /v1");
  }
  if (parsed.search || parsed.hash) {
    throw new ProviderRequestError(400, "apiBaseUrl must not include query parameters or fragments");
  }

  return parsed.origin;
}

async function getTokenInfo(context: CeligoActionContext): Promise<unknown> {
  return {
    tokenInfo: normalizeTokenInfo(
      await requestCeligoJson({
        ...context,
        path: celigoValidationPath,
        mode: "execute",
      }),
    ),
  };
}

async function listResource(
  context: CeligoActionContext,
  path: string,
  fieldName: "exports" | "imports" | "flows",
): Promise<unknown> {
  return {
    [fieldName]: readResourceArray(
      await requestCeligoJson({
        ...context,
        path,
        mode: "execute",
      }),
      fieldName,
    ),
  };
}

async function getResource(
  context: CeligoActionContext,
  path: string,
  fieldName: "export" | "import" | "flow" | "connection",
): Promise<unknown> {
  return {
    [fieldName]: readResourceObject(
      await requestCeligoJson({
        ...context,
        path,
        mode: "execute",
        notFoundAsInvalidInput: true,
      }),
      fieldName,
    ),
  };
}

async function requestCeligoJson(input: CeligoRequestOptions): Promise<unknown> {
  let response: Response;
  try {
    response = await input.fetcher(buildCeligoUrl(input.apiBaseUrl, input.path), {
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        Accept: "application/json",
        "User-Agent": providerUserAgent,
      },
      signal: input.signal,
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Celigo request failed: ${error.message}` : "Celigo request failed",
    );
  }
  const payload = await readJsonPayload(response);

  if (!response.ok) {
    const message = payload.kind === "json" ? readErrorMessage(payload.value) : undefined;
    throw mapCeligoError(response.status, message, input.notFoundAsInvalidInput === true);
  }
  if (payload.kind === "invalid_json") {
    throw new ProviderRequestError(502, "Celigo returned invalid JSON", payload.raw);
  }
  if (payload.kind === "empty") {
    throw new ProviderRequestError(502, "Celigo returned an empty response");
  }

  return payload.value;
}

function buildCeligoUrl(apiBaseUrl: string, path: string): string {
  return new URL(path.replace(/^\/+/, ""), `${apiBaseUrl}/`).toString();
}

async function readJsonPayload(response: Response): Promise<JsonPayloadReadResult> {
  const raw = await response.text();
  if (!raw) return { kind: "empty" };
  try {
    return { kind: "json", value: JSON.parse(raw) };
  } catch {
    return { kind: "invalid_json", raw };
  }
}

function normalizeTokenInfo(value: unknown): { _userId: string; scope: string[] } {
  const record = readResponseObject(value, "tokenInfo");
  const userId = optionalString(record._userId);
  if (!userId) {
    throw new ProviderRequestError(502, "Celigo token info response is missing _userId", value);
  }
  return {
    _userId: userId,
    scope: readStringArray(record.scope),
  };
}

function readResourceArray(value: unknown, fieldName: string): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.map((item, index) => readResponseObject(item, `${fieldName}[${index}]`));
  }

  const record = readResponseObject(value, fieldName);
  const nested = record[fieldName];
  if (!Array.isArray(nested)) {
    throw new ProviderRequestError(502, `Celigo ${fieldName} response is not an array`, value);
  }
  return nested.map((item, index) => readResponseObject(item, `${fieldName}[${index}]`));
}

function readResourceObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = readResponseObject(value, fieldName);
  return optionalRecord(record[fieldName]) ?? optionalRecord(record.data) ?? record;
}

function readResponseObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `Celigo ${fieldName} response is not an object`, value);
  }
  return record;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => optionalString(item)).filter((item): item is string => Boolean(item))
    : [];
}

function readErrorMessage(value: unknown): string | undefined {
  const record = optionalRecord(value);
  if (!record) return undefined;

  const directMessage = optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail);
  if (directMessage) return directMessage;

  const errors = record.errors;
  if (!Array.isArray(errors)) return undefined;
  for (const item of errors) {
    const errorRecord = optionalRecord(item);
    const message =
      optionalString(errorRecord?.message) ?? optionalString(errorRecord?.error) ?? optionalString(errorRecord?.detail);
    if (message) return message;
  }
  return undefined;
}

function mapCeligoError(
  status: number,
  message: string | undefined,
  notFoundAsInvalidInput: boolean,
): ProviderRequestError {
  if (status === 429) return new ProviderRequestError(429, message ?? "Celigo rate limit exceeded");
  if (status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message ?? "Celigo resource not found");
  }
  if (status === 400 || status === 401 || status === 403) {
    return new ProviderRequestError(400, message ?? "Celigo request was rejected");
  }
  return new ProviderRequestError(status >= 500 ? 502 : 500, message ?? `Celigo request failed with status ${status}`);
}

function requireInputString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) throw new ProviderRequestError(400, `${fieldName} is required`);
  return parsed;
}

function requireApiKey(value: string | undefined): string {
  const apiKey = optionalString(value);
  if (!apiKey) throw new ProviderRequestError(400, "apiKey is required");
  return apiKey;
}

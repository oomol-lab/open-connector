import { optionalRecord, optionalString } from "../../core/cast.ts";
import { jsonObject } from "../../core/request.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

interface ApiKeyProviderActionInput {
  apiKey: string;
  values: Record<string, string>;
  actionName: string;
  input: Record<string, unknown>;
}

export const unthreadApiBaseUrl = "https://api.unthread.io/api";
const requestTimeoutMs = 30_000;

interface UnthreadActionInput extends ApiKeyProviderActionInput {
  actionName: string;
  input: Record<string, unknown>;
}

interface UnthreadRequestOptions {
  apiKey: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  fetcher: typeof fetch;
  phase: "validate" | "execute";
  body?: Record<string, unknown>;
}

export async function validateUnthreadCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<{ accountLabel: string; providerScopes: string[]; providerMetadata: Record<string, unknown> }> {
  const apiKey = input.apiKey;
  await requestUnthread({
    apiKey,
    method: "POST",
    path: "/accounts/list",
    body: { limit: 1 },
    fetcher,
    phase: "validate",
  });
  return {
    accountLabel: "Unthread Service Account",
    providerScopes: [],
    providerMetadata: {
      apiBaseUrl: unthreadApiBaseUrl,
      validationEndpoint: "/accounts/list",
    },
  };
}

export async function executeUnthreadAction(input: UnthreadActionInput, fetcher: typeof fetch): Promise<unknown> {
  const apiKey = input.apiKey;
  if (input.actionName === "create_account") {
    return {
      account: requireObject(
        await requestUnthread({
          apiKey,
          method: "POST",
          path: "/accounts",
          body: input.input,
          fetcher,
          phase: "execute",
        }),
        "create account response",
      ),
    };
  }

  if (input.actionName === "list_accounts") {
    return normalizeListResponse(
      await requestUnthread({
        apiKey,
        method: "POST",
        path: "/accounts/list",
        body: input.input,
        fetcher,
        phase: "execute",
      }),
    );
  }
  const accountId = encodeURIComponent(requireString(input.input.accountId, "accountId"));
  if (input.actionName === "get_account") {
    return {
      account: requireObject(
        await requestUnthread({
          apiKey,
          method: "GET",
          path: `/accounts/${accountId}`,
          fetcher,
          phase: "execute",
        }),
        "get account response",
      ),
    };
  }
  if (input.actionName === "update_account") {
    const { accountId: _accountId, ...body } = input.input;
    return {
      account: requireObject(
        await requestUnthread({
          apiKey,
          method: "PATCH",
          path: `/accounts/${accountId}`,
          body,
          fetcher,
          phase: "execute",
        }),
        "update account response",
      ),
    };
  }
  if (input.actionName === "delete_account") {
    await requestUnthread({
      apiKey,
      method: "DELETE",
      path: `/accounts/${accountId}`,
      fetcher,
      phase: "execute",
    });
    return { deleted: true, accountId: decodeURIComponent(accountId) };
  }
  throw new ProviderRequestError(400, `unknown unthread action: ${input.actionName}`);
}

async function requestUnthread(options: UnthreadRequestOptions): Promise<unknown> {
  const timeout = createProviderTimeout(undefined, requestTimeoutMs);
  try {
    const response = await options.fetcher(`${unthreadApiBaseUrl}${options.path}`, {
      method: options.method,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "X-Api-Key": options.apiKey,
      },
      body: options.body === undefined ? undefined : JSON.stringify(jsonObject(options.body)),
      signal: timeout.signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      throw createUnthreadError(response.status, payload, options.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || (error instanceof DOMException && error.name === "AbortError")) {
      throw new ProviderRequestError(504, "Unthread request timed out.");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Unthread request failed: ${error.message}` : "Unthread request failed.",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createUnthreadError(status: number, payload: unknown, phase: UnthreadRequestOptions["phase"]) {
  const message = readErrorMessage(payload) ?? `Unthread request failed with HTTP ${status}.`;
  if (status === 429) return new ProviderRequestError(429, message);
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status >= 500 ? status : 502, message);
}

function normalizeListResponse(payload: unknown) {
  const response = requireObject(payload, "list accounts response");
  if (!Array.isArray(response.data)) {
    throw new ProviderRequestError(502, "Unthread list accounts response is missing data.");
  }
  if (!Number.isInteger(response.totalCount)) {
    throw new ProviderRequestError(502, "Unthread list accounts response is missing totalCount.");
  }
  const cursors = requireObject(response.cursors, "list accounts cursors");
  if (typeof cursors.hasNext != "boolean" || typeof cursors.hasPrevious != "boolean") {
    throw new ProviderRequestError(502, "Unthread list accounts response contains invalid cursors.");
  }
  return {
    accounts: response.data,
    totalCount: response.totalCount,
    cursors,
  };
}

function requireString(value: unknown, fieldName: string) {
  const text = optionalString(value)?.trim();
  if (!text) throw new ProviderRequestError(400, `${fieldName} is required`);
  return text;
}

function requireObject(value: unknown, description: string) {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `Unthread ${description} must be an object.`);
  }
  return object;
}

function readErrorMessage(payload: unknown) {
  if (typeof payload === "string") return payload.trim() || undefined;
  const object = optionalRecord(payload);
  return optionalString(object?.message ?? object?.error)?.trim();
}

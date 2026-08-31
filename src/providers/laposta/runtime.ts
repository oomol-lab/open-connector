import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortSignalError,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
} from "../provider-runtime.ts";

type LapostaResource = "list" | "member";
type RequestPhase = "validate" | "execute";
type LapostaActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const lapostaApiBaseUrl = "https://api.laposta.nl";

export const lapostaActionHandlers: ProviderActionHandlers<"laposta", LapostaActionHandler> = {
  list_lists(_input, context) {
    return listResources("list", context);
  },
  get_list(input, context) {
    return getResource("list", String(input.list_id), {}, context);
  },
  create_list(input, context) {
    return writeResource("list", undefined, input, context);
  },
  update_list(input, context) {
    requireAnyUpdateField(input, ["list_id"], "At least one list field must be provided for update.");
    return writeResource("list", String(input.list_id), input, context);
  },
  list_members(input, context) {
    return listResources("member", context, {
      list_id: String(input.list_id),
      state: optionalString(input.state),
    });
  },
  get_member(input, context) {
    return getResource("member", String(input.member_id), { list_id: String(input.list_id) }, context);
  },
  create_member(input, context) {
    return writeResource("member", undefined, input, context);
  },
  update_member(input, context) {
    requireAnyUpdateField(input, ["list_id", "member_id"], "At least one member field must be provided for update.");
    return writeResource("member", String(input.member_id), input, context);
  },
};

export async function validateLapostaCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = expectLapostaObject(
    await requestLapostaJson("/v2/list", {
      apiKey,
      fetcher,
      signal,
      method: "GET",
      phase: "validate",
    }),
    "credential validation response",
  );
  if (!Array.isArray(payload.data)) {
    throw new ProviderRequestError(502, "Laposta credential validation response must contain data", payload);
  }
  return {
    profile: {
      displayName: "Laposta API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: lapostaApiBaseUrl,
      validationEndpoint: "/v2/list",
    },
  };
}

async function listResources(
  resource: LapostaResource,
  context: ApiKeyProviderContext,
  query: Record<string, string | undefined> = {},
): Promise<unknown> {
  const payload = expectLapostaObject(
    await requestLapostaJson(`/v2/${resource}`, {
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      method: "GET",
      phase: "execute",
      query,
    }),
    "collection",
  );
  if (!Array.isArray(payload.data)) {
    throw new ProviderRequestError(502, "Laposta collection response must contain data", payload);
  }
  const resources = payload.data.map((item) => {
    const wrapper = expectLapostaObject(item, `${resource} wrapper`);
    return expectLapostaObject(wrapper[resource], resource);
  });
  return resource === "list" ? { lists: resources } : { members: resources };
}

async function getResource(
  resource: LapostaResource,
  id: string,
  query: Record<string, string>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = expectLapostaObject(
    await requestLapostaJson(`/v2/${resource}/${encodeLapostaResourceId(resource, id)}`, {
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      method: "GET",
      phase: "execute",
      query,
    }),
    `${resource} response`,
  );
  return { [resource]: expectLapostaObject(payload[resource], resource) };
}

async function writeResource(
  resource: LapostaResource,
  id: string | undefined,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const body = new URLSearchParams();
  const excluded = new Set(resource === "list" ? ["list_id"] : ["member_id"]);
  for (const [key, value] of Object.entries(input)) {
    if (!excluded.has(key) && value !== undefined) {
      appendFormValue(body, key, value);
    }
  }
  const path = `/v2/${resource}${id === undefined ? "" : `/${encodeLapostaResourceId(resource, id)}`}`;
  const payload = expectLapostaObject(
    await requestLapostaJson(path, {
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      method: "POST",
      phase: "execute",
      body,
    }),
    `${resource} response`,
  );
  return { [resource]: expectLapostaObject(payload[resource], resource) };
}

function encodeLapostaResourceId(resource: LapostaResource, value: string): string {
  const encoded = encodeURIComponent(value);
  return resource === "member" ? encoded.replaceAll("%2B", "%252B") : encoded;
}

function expectLapostaObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `Laposta ${label} must be an object`, value);
  }
  return record;
}

function appendFormValue(form: URLSearchParams, key: string, value: unknown): void {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      form.append(key, "");
      return;
    }
    for (const item of value) {
      appendFormValue(form, `${key}[]`, item);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value)) {
      appendFormValue(form, `${key}[${childKey}]`, childValue);
    }
    return;
  }
  if (value !== undefined && value !== null) {
    form.append(key, String(value));
  }
}

async function requestLapostaJson(
  path: string,
  input: {
    apiKey: string;
    fetcher: typeof fetch;
    method: "GET" | "POST";
    phase: RequestPhase;
    signal?: AbortSignal;
    query?: Record<string, string | undefined>;
    body?: URLSearchParams;
  },
): Promise<unknown> {
  const url = new URL(`${lapostaApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  const headers = new Headers({
    accept: "application/json",
    authorization: `Basic ${Buffer.from(`${input.apiKey}:`, "utf8").toString("base64")}`,
    "user-agent": providerUserAgent,
  });
  if (input.body) {
    headers.set("content-type", "application/x-www-form-urlencoded;charset=UTF-8");
  }

  input.signal?.throwIfAborted();
  const timeout = createProviderTimeout(input.signal);
  try {
    const response = await input.fetcher(url, {
      method: input.method,
      headers,
      body: input.body,
      signal: timeout.signal,
    });
    const payload = await readJson(response);
    if (response.ok) {
      return payload;
    }
    throw mapLapostaError(response.status, payload, input.phase);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Laposta request timed out", error);
    }
    if (isAbortSignalError(input.signal, error)) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Laposta request failed: ${error.message}` : "Laposta request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

async function readJson(response: Response): Promise<unknown> {
  return readProviderJsonBody(response, {
    emptyBody: {},
    invalidJsonMessage: "Laposta returned invalid JSON",
    invalidJsonFallback: (text) => ({ error: { message: text } }),
    trimEmptyBody: false,
  });
}

function mapLapostaError(status: number, payload: unknown, phase: RequestPhase): ProviderRequestError {
  const payloadObject = optionalRecord(payload);
  const error = payloadObject?.error;
  const errorObject = optionalRecord(error);
  const message = errorObject ? optionalString(errorObject.message) : optionalString(error);
  const fallback = `Laposta request failed with HTTP ${status}`;
  if (status === 401 || status === 403) {
    return phase === "validate"
      ? new ProviderRequestError(400, message ?? fallback, payload)
      : new ProviderRequestError(status, message ?? fallback, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message ?? fallback, payload);
  }
  return new ProviderRequestError(status >= 400 ? status : 502, message ?? fallback, payload);
}

function requireAnyUpdateField(input: Record<string, unknown>, excludedFields: string[], message: string): void {
  const excluded = new Set(excludedFields);
  if (!Object.keys(input).some((key) => !excluded.has(key) && input[key] !== undefined)) {
    throw new ProviderRequestError(400, message);
  }
}

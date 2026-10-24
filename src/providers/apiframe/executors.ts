import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-executors.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionNames } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  ProviderRequestError,
  providerInputError,
  providerUserAgent,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "apiframe";
const apiframeApiBaseUrl = "https://api.apiframe.ai";

const actionPathByName: Record<string, string> = {
  list_models: "/v2/models",
  generate_image: "/v2/images/generate",
  generate_video: "/v2/videos/generate",
  generate_music: "/v2/music/generate",
  get_job: "/v2/jobs",
  list_jobs: "/v2/jobs",
};

type ApiframeActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const apiframeActionHandlers: ProviderActionHandlers<"apiframe", ApiframeActionHandler> = mapProviderActionNames(
  service,
  Object.keys(actionPathByName),
  (name) => (input, context) => executeApiframeAction(name, input, context),
);

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, apiframeActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: apiframeApiBaseUrl,
  auth: { type: "api_key_header", name: "X-API-Key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateApiframeCredential(input.apiKey, fetcher, signal);
  },
};

async function validateApiframeCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = optionalRecord(await requestApiframe({ path: "/v2/me", apiKey, fetcher, signal, phase: "validate" }));
  const user = optionalRecord(payload?.user);
  const team = optionalRecord(payload?.team);
  return {
    profile: { displayName: optionalString(team?.name) ?? optionalString(user?.email) ?? "Apiframe API Key" },
    metadata: compactObject({ apiBaseUrl: apiframeApiBaseUrl, plan: optionalString(team?.plan) }),
  };
}

async function executeApiframeAction(
  actionName: string,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  if (actionName.startsWith("generate_")) {
    return requestApiframe({
      path: actionPathByName[actionName]!,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      method: "POST",
      body: optionalRecord(input.body) ?? {},
      idempotencyKey: optionalString(input.idempotencyKey),
    });
  }

  const url = new URL(actionPathByName[actionName]!, apiframeApiBaseUrl);
  if (actionName == "get_job") {
    url.pathname += `/${encodeURIComponent(optionalString(input.id) ?? "")}`;
  } else if (actionName == "list_models") {
    setQuery(url, "modality", optionalString(input.modality));
  } else {
    setQuery(url, "status", optionalString(input.status));
    setQuery(url, "model", optionalString(input.model));
    setQuery(url, "limit", optionalNumber(input.limit));
    setQuery(url, "cursor", optionalString(input.cursor));
    setQuery(url, "scope", optionalString(input.scope));
    setQuery(url, "search", optionalString(input.search));
    const includeModels = optionalBoolean(input.includeModels);
    setQuery(url, "include_models", includeModels == null ? undefined : String(includeModels));
  }

  return requestApiframe({
    path: `${url.pathname}${url.search}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
}

interface ApiframeRequestInput {
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: "validate" | "execute";
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  idempotencyKey?: string;
}

async function requestApiframe(input: ApiframeRequestInput): Promise<unknown> {
  return runProviderRequest({ label: "Apiframe", signal: input.signal }, async (signal) => {
    const headers = new Headers({
      accept: "application/json",
      "user-agent": providerUserAgent,
      "X-API-Key": input.apiKey,
    });
    if (input.body) headers.set("content-type", "application/json");
    if (input.idempotencyKey) headers.set("Idempotency-Key", input.idempotencyKey);
    const response = await input.fetcher(new URL(input.path, apiframeApiBaseUrl), {
      method: input.method ?? "GET",
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal,
    });
    const payload = await readApiframeJson(response);
    if (!response.ok) throw mapApiframeError(response.status, payload, input.phase);
    return payload;
  });
}

async function readApiframeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ProviderRequestError(502, "Apiframe returned invalid JSON");
  }
}

function mapApiframeError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = optionalString(optionalRecord(payload)?.error) ?? `Apiframe request failed with ${status}`;
  if (status == 401 || (status == 403 && message == "API key is inactive")) {
    return phase == "validate"
      ? new ProviderRequestError(400, message)
      : new ProviderRequestError(status, message, payload);
  }
  if (status == 400 || status == 404) return providerInputError(message);
  return new ProviderRequestError(status, message);
}

function setQuery(url: URL, key: string, value: string | number | undefined): void {
  if (value != null) url.searchParams.set(key, String(value));
}

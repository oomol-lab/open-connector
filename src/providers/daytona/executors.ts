import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "daytona";
const daytonaApiBaseUrl = "https://app.daytona.io/api";
type RequestPhase = "validate" | "execute";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  service,
  {
    list_sandboxes(input, context) {
      return executeDaytonaAction("list_sandboxes", input, context.apiKey, context.fetcher);
    },
    get_sandbox(input, context) {
      return executeDaytonaAction("get_sandbox", input, context.apiKey, context.fetcher);
    },
    create_sandbox(input, context) {
      return executeDaytonaAction("create_sandbox", input, context.apiKey, context.fetcher);
    },
    start_sandbox(input, context) {
      return executeDaytonaAction("start_sandbox", input, context.apiKey, context.fetcher);
    },
    stop_sandbox(input, context) {
      return executeDaytonaAction("stop_sandbox", input, context.apiKey, context.fetcher);
    },
    delete_sandbox(input, context) {
      return executeDaytonaAction("delete_sandbox", input, context.apiKey, context.fetcher);
    },
  },
  { skipDnsValidation: true },
);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, context) {
    const key = optionalRecord(
      await requestDaytona({
        apiKey: input.apiKey,
        path: "/api-keys/current",
        fetcher: context.fetcher,
        phase: "validate",
      }),
    );
    return {
      profile: { accountId: "daytona", displayName: optionalString(key?.name) ?? "Daytona API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: daytonaApiBaseUrl },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: daytonaApiBaseUrl,
  auth: { type: "api_key_header", name: "authorization" },
  customizeRequest({ headers, credential }) {
    if (credential?.authType == "api_key") headers.set("authorization", `Bearer ${credential.apiKey}`);
    headers.set("accept", "application/json");
  },
  skipDnsValidation: true,
});

async function executeDaytonaAction(
  actionName: string,
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
) {
  const sandboxIdOrName = optionalString(input.sandboxIdOrName);
  let method = "GET";
  let path = "/sandbox";
  let query: Record<string, unknown> | undefined;
  let body: unknown;
  if (actionName === "list_sandboxes") query = input;
  if (actionName === "get_sandbox") path = `/sandbox/${encodeURIComponent(sandboxIdOrName!)}`;
  if (actionName === "create_sandbox") {
    method = "POST";
    body = input;
  }
  if (actionName === "start_sandbox") {
    method = "POST";
    path = `/sandbox/${encodeURIComponent(sandboxIdOrName!)}/start`;
  }
  if (actionName === "stop_sandbox") {
    method = "POST";
    path = `/sandbox/${encodeURIComponent(sandboxIdOrName!)}/stop`;
    query = { force: input.force };
  }
  if (actionName === "delete_sandbox") {
    method = "DELETE";
    path = `/sandbox/${encodeURIComponent(sandboxIdOrName!)}`;
  }
  const payload = await requestDaytona({
    apiKey,
    path,
    method,
    query,
    body,
    fetcher,
    phase: "execute",
  });
  if (actionName === "list_sandboxes") {
    const result = optionalRecord(payload);
    return { sandboxes: result?.items, nextCursor: result?.nextCursor ?? null };
  }
  return { sandbox: payload };
}

async function requestDaytona(input: {
  apiKey: string;
  path: string;
  method?: string;
  query?: Record<string, unknown>;
  body?: unknown;
  fetcher: typeof fetch;
  phase: RequestPhase;
}) {
  const url = new URL(`${daytonaApiBaseUrl}${input.path}`);
  for (const [name, value] of Object.entries(input.query ?? {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((item) => url.searchParams.append(name, String(item)));
    else url.searchParams.set(name, String(value));
  }
  const timeout = createProviderTimeout(undefined);
  try {
    const response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readPayload(response, !response.ok);
    if (!response.ok) throw mapError(response, payload, input.phase);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout()) throw new ProviderRequestError(504, "Daytona request timed out");
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Daytona request failed: ${error.message}` : "Daytona request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readPayload(response: Response, allowInvalidJson: boolean) {
  const text = await response.text();
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (allowInvalidJson) return null;
    throw new ProviderRequestError(502, "Daytona returned invalid JSON");
  }
}

function mapError(response: Response, payload: unknown, phase: RequestPhase) {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    `Daytona request failed with HTTP ${response.status}`;
  if (response.status === 429) return new ProviderRequestError(429, message);
  if (phase === "validate" && response.status >= 400 && response.status < 500)
    return new ProviderRequestError(400, message);
  if (response.status === 401 || response.status === 403) return new ProviderRequestError(401, message);
  if (response.status >= 400 && response.status < 500) return new ProviderRequestError(400, message);
  return new ProviderRequestError(response.status || 500, message);
}

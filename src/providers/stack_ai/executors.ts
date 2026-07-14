import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { StackAiActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderFetch,
  createProviderProxyUrl,
  createProviderTimeout,
  defineProviderExecutors,
  isAbortLikeError,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireCustomCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "stack_ai";
const stackAiInferenceBaseUrl = "https://stack-inference.com";
const stackAiRequestTimeoutMs = 30_000;

const stackAiFetch = createProviderFetch({ skipDnsValidation: true });

type StackAiPhase = "validate" | "execute";

interface StackAiContext {
  apiKey: string;
  flowId: string;
  organizationId: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type StackAiActionHandler = (input: Record<string, unknown>, context: StackAiContext) => Promise<unknown>;

export const stackAiActionHandlers: Record<StackAiActionName, StackAiActionHandler> = {
  run_flow(input, context) {
    return runStackAiFlow(input, context);
  },
  get_run_metadata(input, context) {
    return getStackAiRunMetadata(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<StackAiContext>({
  service,
  handlers: stackAiActionHandlers,
  createContext: createStackAiContext,
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireCustomCredential(context, service);
    const stackAiContext = readStackAiCredential(credential.values, stackAiFetch, context.signal);
    const baseUrl = new URL(
      buildRunPath(stackAiContext.organizationId, stackAiContext.flowId),
      stackAiInferenceBaseUrl,
    );
    const url = createProviderProxyUrl(baseUrl.toString(), input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", `Bearer ${stackAiContext.apiKey}`);
    headers.set("user-agent", providerUserAgent);

    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };
    if (input.body !== undefined) {
      init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
      if (!headers.has("content-type") && typeof input.body !== "string") {
        headers.set("content-type", "application/json");
      }
    }

    const response = await stackAiFetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `StackAI request failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "StackAI request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }) {
    const context = readStackAiCredential(input.values, fetcher, signal);
    await stackAiJsonRequest(
      {
        method: "GET",
        path: buildRunMetadataPath(context.organizationId, context.flowId),
        phase: "validate",
      },
      context,
    );

    return {
      profile: {
        accountId: `${context.organizationId}/${context.flowId}`,
        displayName: `StackAI Flow ${context.flowId}`,
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: stackAiInferenceBaseUrl,
        organizationId: context.organizationId,
        flowId: context.flowId,
        validationEndpoint: buildRunMetadataPath(context.organizationId, context.flowId),
      },
    };
  },
};

async function createStackAiContext(context: ExecutionContext, fetcher: typeof fetch): Promise<StackAiContext> {
  const credential = await requireCustomCredential(context, service);
  return readStackAiCredential(credential.values, fetcher, context.signal);
}

function readStackAiCredential(
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): StackAiContext {
  return {
    apiKey: requireTextField(values.apiKey, "apiKey"),
    organizationId: requireTextField(values.organizationId, "organizationId"),
    flowId: requireTextField(values.flowId, "flowId"),
    fetcher,
    signal,
  };
}

async function runStackAiFlow(input: Record<string, unknown>, context: StackAiContext): Promise<unknown> {
  const responsePayload = await stackAiJsonRequest(
    {
      method: "POST",
      path: buildRunPath(context.organizationId, context.flowId),
      phase: "execute",
      body: {
        user_id: requireInputField(input.userId, "userId"),
        variables: optionalRecord(input.variables) ?? {},
      },
    },
    context,
  );

  return normalizeRunResult(responsePayload);
}

async function getStackAiRunMetadata(input: Record<string, unknown>, context: StackAiContext): Promise<unknown> {
  const runId = requireInputField(input.runId, "runId");
  const responsePayload = await stackAiJsonRequest(
    {
      method: "GET",
      path: buildRunMetadataPath(context.organizationId, context.flowId),
      phase: "execute",
      query: {
        run_id: runId,
      },
    },
    context,
  );

  return normalizeRunMetadata(responsePayload, runId);
}

async function stackAiJsonRequest(
  input: {
    path: string;
    phase: StackAiPhase;
    method?: "GET" | "POST";
    body?: Record<string, unknown>;
    query?: Record<string, string | undefined>;
  },
  context: StackAiContext,
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, stackAiRequestTimeoutMs);
  try {
    const url = new URL(input.path, stackAiInferenceBaseUrl);
    for (const [key, value] of Object.entries(input.query ?? {})) {
      if (value) {
        url.searchParams.set(key, value);
      }
    }

    const response = await context.fetcher(url, {
      method: input.method ?? "GET",
      headers: compactObject({
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
        "content-type": input.body ? "application/json" : undefined,
      }) as Record<string, string>,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readStackAiPayload(response);
    if (!response.ok) {
      throw buildStackAiError(response.status, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "StackAI request timed out.");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `StackAI request failed: ${error.message}` : "StackAI request failed.",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readStackAiPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "StackAI returned invalid JSON.");
  }
}

function buildStackAiError(status: number, payload: unknown, phase: StackAiPhase): ProviderRequestError {
  const message = extractErrorMessage(payload) ?? `StackAI request failed with status ${status}`;
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function extractErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  const direct = firstNonEmptyString(record.message, record.detail, record.error, record.error_message);
  if (direct) {
    return direct;
  }
  const nestedError = optionalRecord(record.error);
  return nestedError
    ? (firstNonEmptyString(nestedError.message, nestedError.detail, nestedError.error, nestedError.error_message) ??
        undefined)
    : undefined;
}

function normalizeRunResult(payload: unknown): Record<string, unknown> {
  const source = optionalRecord(payload) ?? { value: payload };
  const normalized = resolvePrimaryRecord(source);
  return {
    runId: firstNonEmptyString(normalized.run_id, normalized.runId),
    status: firstNonEmptyString(normalized.status),
    output: normalized.output ?? normalized.result ?? normalized.data ?? normalized.response ?? payload,
    text: firstNonEmptyString(normalized.text, normalized.response, normalized.message),
    raw: payload,
  };
}

function normalizeRunMetadata(payload: unknown, runId: string): Record<string, unknown> {
  const source = optionalRecord(payload) ?? { value: payload };
  const normalized = resolvePrimaryRecord(source);
  return {
    run: {
      runId: firstNonEmptyString(normalized.run_id, normalized.runId) ?? runId,
      status: firstNonEmptyString(normalized.status),
      createdAt: firstNonEmptyString(normalized.created_at, normalized.createdAt),
      finishedAt: firstNonEmptyString(normalized.finished_at, normalized.finishedAt),
      userId: firstNonEmptyString(normalized.user_id, normalized.userId),
      conversationId: firstNonEmptyString(normalized.conversation_id, normalized.conversationId),
      output: normalized.output ?? normalized.result ?? normalized.data ?? payload,
      text: firstNonEmptyString(normalized.text, normalized.response, normalized.message),
      usage: optionalRecord(normalized.usage) ?? optionalRecord(normalized.metrics) ?? null,
      raw: payload,
    },
  };
}

function resolvePrimaryRecord(record: Record<string, unknown>): Record<string, unknown> {
  return optionalRecord(record.result) ?? optionalRecord(record.data) ?? optionalRecord(record.run) ?? record;
}

function buildRunPath(organizationId: string, flowId: string): string {
  return `/inference/v0/run/${encodeURIComponent(organizationId)}/${encodeURIComponent(flowId)}`;
}

function buildRunMetadataPath(organizationId: string, flowId: string): string {
  return `${buildRunPath(organizationId, flowId)}/metadata`;
}

function requireTextField(value: string | undefined, key: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new ProviderRequestError(400, `${key} is required.`);
  }
  return normalized;
}

function requireInputField(value: unknown, key: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${key} is required.`);
  }
  return text;
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    const text = optionalString(value);
    if (text) {
      return text;
    }
  }
  return null;
}

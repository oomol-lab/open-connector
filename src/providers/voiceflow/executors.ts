import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { VoiceflowActionName } from "./actions.ts";

import {
  compactObject,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyEndpoint,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "voiceflow";
const generalRuntimeBaseUrl = "https://general-runtime.voiceflow.com";
const realtimeBaseUrl = "https://realtime-api.voiceflow.com";
const defaultEnvironmentAlias = "main";
const voiceflowRequestTimeoutMs = 30_000;

interface VoiceflowActionContext {
  apiKey: string;
  projectId: string;
  defaultEnvironmentAlias?: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type VoiceflowActionHandler = (input: Record<string, unknown>, context: VoiceflowActionContext) => Promise<unknown>;

interface VoiceflowRequestOptions {
  baseUrl: string;
  path: string;
  method: "GET" | "POST";
  apiKey: string;
  body?: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: "validate" | "execute";
}

interface VoiceflowEnvironment {
  id: string;
  name: string;
  alias: string;
  isMain: boolean;
  createdAt: string;
  draftVersionID: string;
  publishedVersionID: string;
  trafficPercentage: number;
  raw: Record<string, unknown>;
}

export const voiceflowActionHandlers: Record<VoiceflowActionName, VoiceflowActionHandler> = {
  start_session(input, context) {
    return startSession(input, context);
  },
  interact(input, context) {
    return interact(input, context);
  },
  query_knowledge_base(input, context) {
    return queryKnowledgeBase(input, context);
  },
  list_environments(_input, context) {
    return listEnvironments(context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<VoiceflowActionContext>({
  service,
  handlers: voiceflowActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<VoiceflowActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      projectId: requiredString(
        credential.values.projectId ?? credential.metadata.projectId,
        "projectId",
        (message) => new ProviderRequestError(401, message),
      ),
      defaultEnvironmentAlias:
        optionalString(credential.values.environmentAlias) ??
        optionalString(credential.metadata.defaultEnvironmentAlias) ??
        optionalString(credential.metadata.environmentAlias),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const endpoint = normalizeProviderProxyEndpoint(input.endpoint);
    const url = createProviderProxyUrl(resolveProxyBaseUrl(endpoint), endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("accept", "application/json");
    headers.set("authorization", credential.apiKey);
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

    const response = await fetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `provider request failed with HTTP ${response.status}`);
    }

    return {
      ok: true,
      response: await readProviderProxyResponse(response),
    };
  } catch (error) {
    return toProviderProxyError(error, "provider request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateVoiceflowCredential(input.apiKey, input.values, fetcher, signal);
  },
};

async function validateVoiceflowCredential(
  apiKey: string,
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<Awaited<ReturnType<NonNullable<CredentialValidators["apiKey"]>>>> {
  const projectId = requiredString(values.projectId, "projectId", (message) => new ProviderRequestError(400, message));
  const payload = await requestVoiceflow({
    baseUrl: realtimeBaseUrl,
    path: `/v1alpha1/project/${encodeURIComponent(projectId)}/environments`,
    method: "GET",
    apiKey,
    fetcher,
    signal,
    phase: "validate",
  });
  const environments = normalizeEnvironments(payload.data);
  const mainEnvironment = environments.find((environment) => environment.isMain);

  return {
    profile: {
      accountId: projectId,
      displayName: mainEnvironment ? `Voiceflow ${mainEnvironment.name}` : "Voiceflow Project",
    },
    grantedScopes: [],
    metadata: compactObject({
      projectId,
      defaultEnvironmentAlias: readEnvironmentAlias(values),
      environmentCount: environments.length,
      mainEnvironmentAlias: mainEnvironment?.alias,
      apiBaseUrl: generalRuntimeBaseUrl,
      realtimeBaseUrl,
    }),
  };
}

async function startSession(input: Record<string, unknown>, context: VoiceflowActionContext): Promise<unknown> {
  const environmentAlias = resolveEnvironmentAlias(input, context);
  const payload = await requestVoiceflow({
    baseUrl: generalRuntimeBaseUrl,
    path: `/v4/project/${encodeURIComponent(context.projectId)}/environment/${encodeURIComponent(
      environmentAlias,
    )}/session`,
    method: "POST",
    apiKey: context.apiKey,
    body: {
      userID: requiredString(input.userId, "userId", (message) => new ProviderRequestError(400, message)),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return {
    sessionKey: requiredString(payload.sessionKey, "sessionKey", (message) => new ProviderRequestError(502, message)),
  };
}

async function interact(input: Record<string, unknown>, context: VoiceflowActionContext): Promise<unknown> {
  const payload = await requestVoiceflow({
    baseUrl: generalRuntimeBaseUrl,
    path: "/v4/interact",
    method: "POST",
    apiKey: requiredString(input.sessionKey, "sessionKey", (message) => new ProviderRequestError(400, message)),
    body: compactObject({
      action: requiredRecord(input.action, "action", (message) => new ProviderRequestError(400, message)),
      variables: optionalRecord(input.variables),
      state: input.state,
      config: optionalRecord(input.config),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return {
    traces: Array.isArray(payload.traces) ? payload.traces : [],
  };
}

async function queryKnowledgeBase(input: Record<string, unknown>, context: VoiceflowActionContext): Promise<unknown> {
  const environmentAlias = resolveEnvironmentAlias(input, context);
  const payload = await requestVoiceflow({
    baseUrl: generalRuntimeBaseUrl,
    path: "/knowledge-base/query",
    method: "POST",
    apiKey: context.apiKey,
    body: compactObject({
      projectID: context.projectId,
      question: requiredString(input.question, "question", (message) => new ProviderRequestError(400, message)),
      instruction: optionalString(input.instruction),
      chunkLimit: input.chunkLimit,
      synthesis: input.synthesis,
      settings: optionalRecord(input.settings),
      filters: optionalRecord(input.filters),
      projectEnvironmentIDOrAlias: environmentAlias,
      versionVariant: optionalString(input.versionVariant),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return {
    type: optionalString(payload.type) ?? "completion",
    model: optionalString(payload.model) ?? "",
    output: payload.output === null ? null : (optionalString(payload.output) ?? null),
    duration: optionalNumber(payload.duration) ?? 0,
    tokens: optionalNumber(payload.tokens) ?? 0,
    chunks: Array.isArray(payload.chunks) ? payload.chunks : [],
    raw: payload,
  };
}

async function listEnvironments(context: VoiceflowActionContext): Promise<unknown> {
  const payload = await requestVoiceflow({
    baseUrl: realtimeBaseUrl,
    path: `/v1alpha1/project/${encodeURIComponent(context.projectId)}/environments`,
    method: "GET",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return {
    environments: normalizeEnvironments(payload.data),
  };
}

async function requestVoiceflow(input: VoiceflowRequestOptions): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(input.signal, voiceflowRequestTimeoutMs);
  try {
    const response = await input.fetcher(`${input.baseUrl}${input.path}`, {
      method: input.method,
      headers: buildVoiceflowHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readJson(response);
    if (!response.ok) {
      throw createVoiceflowError(response, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Voiceflow request timed out");
    }
    throw error;
  } finally {
    timeout.cleanup();
  }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return requiredRecord(
      JSON.parse(text) as unknown,
      "Voiceflow response",
      (message) => new ProviderRequestError(502, message),
    );
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, "Voiceflow returned non-JSON response");
  }
}

function createVoiceflowError(
  response: Response,
  payload: Record<string, unknown>,
  phase: "validate" | "execute",
): ProviderRequestError {
  const message =
    optionalString(payload.message) ??
    optionalString(payload.error) ??
    `Voiceflow request failed with status ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(response.status, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function normalizeEnvironments(value: unknown): VoiceflowEnvironment[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "Voiceflow environments payload is invalid");
  }
  return value.map((item) => {
    const environment = requiredRecord(
      item,
      "Voiceflow environment item",
      (message) => new ProviderRequestError(502, message),
    );
    return {
      id: optionalString(environment.id) ?? "",
      name: optionalString(environment.name) ?? "",
      alias: optionalString(environment.alias) ?? "",
      isMain: environment.isMain === true,
      createdAt: optionalString(environment.createdAt) ?? "",
      draftVersionID: optionalString(environment.draftVersionID) ?? "",
      publishedVersionID: optionalString(environment.publishedVersionID) ?? "",
      trafficPercentage: optionalNumber(environment.trafficPercentage) ?? 0,
      raw: environment,
    };
  });
}

function resolveEnvironmentAlias(input: Record<string, unknown>, context: VoiceflowActionContext): string {
  return optionalString(input.environmentAlias) ?? context.defaultEnvironmentAlias ?? defaultEnvironmentAlias;
}

function readEnvironmentAlias(values: Record<string, unknown>): string | undefined {
  return optionalString(values.environmentAlias) ?? optionalString(values.defaultEnvironmentAlias);
}

function resolveProxyBaseUrl(endpoint: string): string {
  return endpoint.startsWith("/v1alpha1/") ? realtimeBaseUrl : generalRuntimeBaseUrl;
}

function buildVoiceflowHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: apiKey,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

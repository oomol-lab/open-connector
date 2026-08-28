import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  compactObject,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
  stringArray,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "fal_ai";
const falAiPlatformApiBaseUrl = "https://api.fal.ai";
const falAiQueueApiBaseUrl = "https://queue.fal.run";

interface FalAiActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface FalAiRequestInput {
  apiKey: string;
  baseUrl: string;
  method?: string;
  path?: string;
  /** Fully-qualified URL to fetch verbatim, bypassing baseUrl/path. Must already be validated. */
  url?: string;
  query?: Record<string, string | number | string[] | undefined>;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

interface FalAiQueueLog {
  message: string;
  level: string;
  source: string;
  timestamp: string;
}

interface FalAiSseEvent {
  event: string | undefined;
  data: string;
}

type FalAiRequestMode = "validate" | "execute";
type FalAiActionHandler = (input: Record<string, unknown>, context: FalAiActionContext) => Promise<unknown>;

export const falAiActionHandlers: ProviderActionHandlers<"fal_ai", FalAiActionHandler> = {
  submit_queue_request(input, context) {
    return falAiSubmitQueueRequest(input, context);
  },
  get_models(input, context) {
    return falAiGetModels(input, context);
  },
  get_pricing(input, context) {
    return falAiGetPricing(input, context);
  },
  estimate_pricing(input, context) {
    return falAiEstimatePricing(input, context);
  },
  get_jwks(input, context) {
    return falAiGetJwks(input, context);
  },
  queue_get_status(input, context) {
    return falAiQueueGetStatus(input, context);
  },
  queue_get_status_stream(input, context) {
    return falAiQueueGetStatusStream(input, context);
  },
  get_queue_request_result(input, context) {
    return falAiGetQueueRequestResult(input, context);
  },
  cancel_queue_request(input, context) {
    return falAiCancelQueueRequest(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, falAiActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await falAiPlatformRequest<{
      models?: Array<{ endpoint_id?: string }>;
    }>(
      {
        apiKey: input.apiKey,
        path: "/v1/models",
        query: { limit: 1 },
        signal,
      },
      fetcher,
      "validate",
    );

    return {
      profile: {
        accountId: "api_key",
        displayName: "fal.ai API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/v1/models",
        availableModels: (payload.models ?? [])
          .map((model) => model.endpoint_id)
          .filter((model): model is string => typeof model === "string"),
      },
    };
  },
};

async function falAiGetModels(input: Record<string, unknown>, context: FalAiActionContext): Promise<unknown> {
  const payload = await falAiPlatformRequest<{
    models?: Record<string, unknown>[];
    has_more?: boolean;
    next_cursor?: string | null;
  }>(
    {
      apiKey: context.apiKey,
      path: "/v1/models",
      query: compactObject({
        q: optionalString(input.q),
        limit: optionalInteger(input.limit),
        cursor: optionalString(input.cursor),
        expand: normalizeStringOrArray(input.expand),
        status: optionalString(input.status),
        category: optionalString(input.category),
        endpoint_id: normalizeStringOrArray(input.endpointId),
      }),
      signal: context.signal,
    },
    context.fetcher,
    "execute",
  );

  return {
    models: payload.models ?? [],
    hasMore: payload.has_more ?? false,
    nextCursor: payload.next_cursor ?? null,
  };
}

async function falAiGetPricing(input: Record<string, unknown>, context: FalAiActionContext): Promise<unknown> {
  const payload = await falAiPlatformRequest<{
    prices?: Record<string, unknown>[];
    has_more?: boolean;
    next_cursor?: string | null;
  }>(
    {
      apiKey: context.apiKey,
      path: "/v1/models/pricing",
      query: {
        endpoint_id: normalizeStringOrArray(input.endpointId),
      },
      signal: context.signal,
    },
    context.fetcher,
    "execute",
  );

  return {
    prices: payload.prices ?? [],
    hasMore: payload.has_more ?? false,
    nextCursor: payload.next_cursor ?? null,
  };
}

async function falAiEstimatePricing(input: Record<string, unknown>, context: FalAiActionContext): Promise<unknown> {
  const estimateType = optionalString(input.estimateType);
  if (!estimateType) {
    throw new ProviderRequestError(400, "estimateType is required");
  }

  const payload = await falAiPlatformRequest<{
    estimate_type?: string;
    total_cost?: number;
    currency?: string;
  }>(
    {
      apiKey: context.apiKey,
      method: "POST",
      path: "/v1/models/pricing/estimate",
      body: {
        estimate_type: estimateType,
        endpoints: optionalRecord(input.endpoints) ?? {},
      },
      signal: context.signal,
    },
    context.fetcher,
    "execute",
  );

  return {
    estimateType: payload.estimate_type ?? "",
    totalCost: typeof payload.total_cost === "number" ? payload.total_cost : 0,
    currency: typeof payload.currency === "string" ? payload.currency : "",
  };
}

async function falAiGetJwks(_input: Record<string, unknown>, context: FalAiActionContext): Promise<unknown> {
  const payload = await falAiPlatformRequest<{
    keys?: Record<string, unknown>[];
  }>(
    {
      apiKey: context.apiKey,
      path: "/.well-known/jwks.json",
      signal: context.signal,
    },
    context.fetcher,
    "execute",
  );

  return {
    keys: payload.keys ?? [],
  };
}

async function falAiSubmitQueueRequest(input: Record<string, unknown>, context: FalAiActionContext): Promise<unknown> {
  const modelId = optionalString(input.modelId);
  if (!modelId) {
    throw new ProviderRequestError(400, "modelId is required");
  }
  const modelInput = optionalRecord(input.input);
  if (!modelInput) {
    throw new ProviderRequestError(400, "input is required");
  }

  const payload = await falAiQueueRequest<{
    status?: string;
    request_id?: string;
    queue_position?: number;
    status_url?: string;
    response_url?: string;
    cancel_url?: string;
  }>(
    {
      method: "POST",
      path: `/${encodeFalAiModelIdPath(modelId)}`,
      query: compactObject({
        fal_webhook: optionalString(input.webhookUrl),
      }),
      body: modelInput,
      signal: context.signal,
    },
    context,
  );

  return {
    requestId: requiredString(payload.request_id, "fal_ai queue submission request_id", invalidQueueResponseError),
    status: payload.status ?? "IN_QUEUE",
    queuePosition: typeof payload.queue_position === "number" ? payload.queue_position : null,
    statusUrl: requiredString(payload.status_url, "fal_ai queue submission status_url", invalidQueueResponseError),
    responseUrl: requiredString(
      payload.response_url,
      "fal_ai queue submission response_url",
      invalidQueueResponseError,
    ),
    cancelUrl: requiredString(payload.cancel_url, "fal_ai queue submission cancel_url", invalidQueueResponseError),
  };
}

function invalidQueueResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}

async function falAiQueueGetStatus(input: Record<string, unknown>, context: FalAiActionContext): Promise<unknown> {
  const statusUrl = optionalString(input.statusUrl);
  const payload = await falAiQueueRequest<{
    status?: string;
    response_url?: string | null;
    queue_position?: number;
    logs?: unknown[];
  }>(
    {
      url: statusUrl ? assertFalAiQueueUrl(statusUrl, "statusUrl").toString() : undefined,
      path: statusUrl ? undefined : buildQueueRequestPath(input, "status"),
      query: compactObject({
        logs: optionalInteger(input.logs),
      }),
      signal: context.signal,
    },
    context,
  );

  return {
    status: payload.status ?? "",
    responseUrl: payload.response_url ?? null,
    queuePosition: typeof payload.queue_position === "number" ? payload.queue_position : null,
    logs: normalizeQueueLogs(payload.logs),
  };
}

async function falAiQueueGetStatusStream(
  input: Record<string, unknown>,
  context: FalAiActionContext,
): Promise<unknown> {
  const statusUrl = optionalString(input.statusUrl);
  const response = await falAiFetch(
    {
      apiKey: context.apiKey,
      baseUrl: falAiQueueApiBaseUrl,
      url: statusUrl ? appendFalAiQueuePathSegment(assertFalAiQueueUrl(statusUrl, "statusUrl"), "stream") : undefined,
      path: statusUrl ? undefined : buildQueueRequestPath(input, "status/stream"),
      query: compactObject({
        logs: optionalInteger(input.logs),
      }),
      headers: {
        accept: "text/event-stream",
      },
      signal: context.signal,
    },
    context.fetcher,
  );

  await assertFalAiResponse(response, "execute");
  const events = await readSseEvents(response);
  const updates = events
    .map((event) => {
      if (!event.data) {
        return null;
      }

      try {
        return JSON.parse(event.data) as Record<string, unknown>;
      } catch {
        return {
          event: event.event ?? "message",
          data: event.data,
        };
      }
    })
    .filter((event): event is Record<string, unknown> => event !== null);
  const lastUpdate = updates.at(-1);

  return {
    updates,
    finalStatus: typeof lastUpdate?.status === "string" ? lastUpdate.status : null,
    responseUrl: typeof lastUpdate?.response_url === "string" ? lastUpdate.response_url : null,
  };
}

async function falAiGetQueueRequestResult(
  input: Record<string, unknown>,
  context: FalAiActionContext,
): Promise<unknown> {
  const responseUrl = optionalString(input.responseUrl);
  const payload = await falAiQueueRequest<Record<string, unknown>>(
    {
      url: responseUrl ? assertFalAiQueueUrl(responseUrl, "responseUrl").toString() : undefined,
      path: responseUrl ? undefined : buildQueueRequestPath(input),
      signal: context.signal,
    },
    context,
  );

  // The fal queue result endpoint returns the raw, model-specific output
  // directly (e.g. { images: [...] }), not wrapped in a status envelope. A
  // successful response here is only ever reachable once fal reports the
  // request COMPLETED; otherwise the endpoint responds with an error status.
  return {
    status: "COMPLETED",
    response: payload ?? {},
  };
}

async function falAiCancelQueueRequest(input: Record<string, unknown>, context: FalAiActionContext): Promise<unknown> {
  const cancelUrl = optionalString(input.cancelUrl);
  const payload = await falAiQueueRequest<{
    status?: string;
  }>(
    {
      method: "PUT",
      url: cancelUrl ? assertFalAiQueueUrl(cancelUrl, "cancelUrl").toString() : undefined,
      path: cancelUrl ? undefined : buildQueueRequestPath(input, "cancel"),
      signal: context.signal,
    },
    context,
  );

  return {
    status: payload.status ?? "",
  };
}

async function falAiPlatformRequest<T>(
  input: Omit<FalAiRequestInput, "baseUrl">,
  fetcher: typeof fetch,
  mode: FalAiRequestMode,
): Promise<T> {
  const response = await falAiFetch(
    {
      ...input,
      baseUrl: falAiPlatformApiBaseUrl,
    },
    fetcher,
  );

  await assertFalAiResponse(response, mode);
  return response.json() as Promise<T>;
}

async function falAiQueueRequest<T>(
  input: Omit<FalAiRequestInput, "apiKey" | "baseUrl">,
  context: FalAiActionContext,
): Promise<T> {
  const response = await falAiFetch(
    {
      ...input,
      apiKey: context.apiKey,
      baseUrl: falAiQueueApiBaseUrl,
    },
    context.fetcher,
  );

  await assertFalAiResponse(response, "execute");
  return response.json() as Promise<T>;
}

async function falAiFetch(input: FalAiRequestInput, fetcher: typeof fetch): Promise<Response> {
  const url = new URL(input.url ?? `${input.baseUrl}${input.path ?? ""}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  return fetcher(url.toString(), {
    method: input.method ?? (input.body ? "POST" : "GET"),
    headers: {
      authorization: `Key ${input.apiKey}`,
      "content-type": "application/json",
      "user-agent": providerUserAgent,
      ...input.headers,
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
    signal: input.signal,
  });
}

function buildQueueRequestPath(input: Record<string, unknown>, suffix?: string): string {
  const modelId = encodeFalAiModelIdPath(String(input.modelId));
  const requestId = encodeURIComponent(String(input.requestId));
  const basePath = `/${modelId}/requests/${requestId}`;
  return suffix ? `${basePath}/${suffix}` : basePath;
}

/**
 * Encodes each `/`-separated segment of a fal model ID individually so
 * literal path separators survive, instead of collapsing the whole ID into
 * a single `%2F`-escaped segment that fal's routing will not match.
 */
function encodeFalAiModelIdPath(modelId: string): string {
  return modelId
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

/**
 * Validates a status/response/cancel URL returned by a prior fal queue call
 * before fetching it with the caller's API key, so a crafted input value
 * cannot redirect the request (and the Authorization header) off fal's
 * queue host.
 */
function assertFalAiQueueUrl(value: string, fieldName: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ProviderRequestError(400, `${fieldName} must be a valid URL.`);
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "queue.fal.run") {
    throw new ProviderRequestError(400, `${fieldName} must be an https://queue.fal.run URL returned by fal.`);
  }
  return parsed;
}

/**
 * Append a path segment to a validated fal queue URL's pathname, preserving
 * its search and hash. String-concatenating a `/stream` suffix onto the
 * whole URL would land after the query string instead of the path.
 */
function appendFalAiQueuePathSegment(url: URL, segment: string): string {
  const withSegment = new URL(url);
  withSegment.pathname = `${withSegment.pathname.replace(/\/+$/, "")}/${segment}`;
  return withSegment.toString();
}

function normalizeStringOrArray(value: unknown): string | string[] | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return stringArray(value, "value");
  }
  return undefined;
}

function normalizeQueueLogs(value: unknown): FalAiQueueLog[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => optionalRecord(item))
    .filter((item): item is Record<string, unknown> => item !== undefined)
    .map((item) => ({
      message: typeof item.message === "string" ? item.message : "",
      level: typeof item.level === "string" ? item.level : "",
      source: typeof item.source === "string" ? item.source : "",
      timestamp: typeof item.timestamp === "string" ? item.timestamp : "",
    }));
}

async function readSseEvents(response: Response): Promise<FalAiSseEvent[]> {
  const payload = await response.text();
  const rawEvents = payload.split(/\r?\n\r?\n/);

  return rawEvents
    .map((chunk) => {
      const lines = chunk
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0);
      if (lines.length === 0) {
        return null;
      }

      let event: string | undefined;
      const dataLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith(":")) {
          continue;
        }
        if (line.startsWith("event:")) {
          event = line.slice("event:".length).trim();
          continue;
        }
        if (line.startsWith("data:")) {
          dataLines.push(line.slice("data:".length).trim());
        }
      }

      return {
        event,
        data: dataLines.join("\n"),
      };
    })
    .filter((item): item is FalAiSseEvent => item !== null);
}

async function assertFalAiResponse(response: Response, mode: FalAiRequestMode): Promise<void> {
  if (response.ok) {
    return;
  }

  const error = await readFalAiError(response);

  if (response.status === 429) {
    throw new ProviderRequestError(429, error.message, error.detail);
  }
  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    throw new ProviderRequestError(400, error.message, error.detail);
  }
  if (mode === "execute" && response.status === 401) {
    throw new ProviderRequestError(401, error.message, error.detail);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    throw new ProviderRequestError(400, error.message, error.detail);
  }

  throw new ProviderRequestError(response.status || 502, error.message, error.detail);
}

async function readFalAiError(response: Response): Promise<{ detail: string | undefined; message: string }> {
  try {
    const payload = (await response.json()) as {
      detail?: unknown;
      message?: unknown;
      error?: unknown;
    };

    const detail =
      typeof payload.detail === "string"
        ? payload.detail
        : payload.detail && typeof payload.detail === "object"
          ? JSON.stringify(payload.detail)
          : undefined;
    const message =
      typeof payload.message === "string"
        ? payload.message
        : typeof payload.error === "string"
          ? payload.error
          : (detail ?? `fal_ai request failed with ${response.status}`);

    return {
      detail,
      message,
    };
  } catch {
    const message = (await response.text().catch(() => "")) || `fal_ai request failed with ${response.status}`;
    return {
      detail: undefined,
      message,
    };
  }
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.fal.ai",
  auth: { type: "api_key_authorization", prefix: "Key " },
});

import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "kernel";
const kernelApiBaseUrl = "https://api.onkernel.com";
const kernelDefaultRequestTimeoutMs = 60_000;

type KernelRequestPhase = "validate" | "execute";

interface KernelRequestInput {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  apiKey: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  phase: KernelRequestPhase;
}

type KernelActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const kernelActionHandlers: ProviderActionHandlers<"kernel", KernelActionHandler> = {
  async list_browser_sessions(input, context): Promise<unknown> {
    const result = await requestKernelJson({
      method: "GET",
      path: "/browsers",
      query: buildListBrowserSessionsQuery(input),
      apiKey: context.apiKey,
      context,
      phase: "execute",
    });
    return {
      browser_sessions: result.payload,
      pagination: result.pagination,
    };
  },
  async create_browser_session(input, context): Promise<unknown> {
    const result = await requestKernelJson({
      method: "POST",
      path: "/browsers",
      body: input,
      apiKey: context.apiKey,
      context,
      phase: "execute",
    });
    return { browser_session: result.payload };
  },
  async get_browser_session(input, context): Promise<unknown> {
    const result = await requestKernelJson({
      method: "GET",
      path: `/browsers/${encodeURIComponent(String(input.id_or_name))}`,
      query: {
        include_deleted: input.include_deleted,
      },
      apiKey: context.apiKey,
      context,
      phase: "execute",
    });
    return { browser_session: result.payload };
  },
  async update_browser_session(input, context): Promise<unknown> {
    const { id_or_name, ...body } = input;
    const result = await requestKernelJson({
      method: "PATCH",
      path: `/browsers/${encodeURIComponent(String(id_or_name))}`,
      body,
      apiKey: context.apiKey,
      context,
      phase: "execute",
    });
    return { browser_session: result.payload };
  },
  async delete_browser_session(input, context): Promise<unknown> {
    await requestKernelJson({
      method: "DELETE",
      path: `/browsers/${encodeURIComponent(String(input.id_or_name))}`,
      apiKey: context.apiKey,
      context,
      phase: "execute",
    });
    return { deleted: true };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, kernelActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestKernelJson({
      method: "GET",
      path: "/browsers",
      query: {
        limit: 1,
      },
      apiKey: input.apiKey,
      context: {
        fetcher,
        signal,
      },
      phase: "validate",
    });

    return {
      profile: {
        accountId: "api_key",
        displayName: "Kernel API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: kernelApiBaseUrl,
        validationEndpoint: "/browsers",
      },
    };
  },
};

function buildListBrowserSessionsQuery(input: Record<string, unknown>): Record<string, unknown> {
  return {
    status: input.status,
    limit: input.limit,
    offset: input.offset,
    query: input.query,
    ...buildTagsQuery(input.tags),
  };
}

function buildTagsQuery(value: unknown): Record<string, string> {
  const record = optionalRecord(value);
  if (!record) {
    return {};
  }

  const query: Record<string, string> = {};
  for (const [key, child] of Object.entries(record)) {
    if (typeof child === "string") {
      query[`tags[${key}]`] = child;
    }
  }
  return query;
}

async function requestKernelJson(input: KernelRequestInput): Promise<{
  payload: unknown;
  pagination: ReturnType<typeof readKernelPagination>;
}> {
  const timeout = createProviderTimeout(input.context.signal, kernelDefaultRequestTimeoutMs);

  try {
    const response = await input.context.fetcher(buildKernelUrl(input.path, input.query), {
      method: input.method,
      headers: buildKernelHeaders(input),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    if (!response.ok) {
      const payload = await readKernelErrorPayload(response);
      throw createKernelError(response, payload, input.phase);
    }

    return {
      payload: await readKernelPayload(response),
      pagination: readKernelPagination(response.headers),
    };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Kernel request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Kernel request failed: ${error.message}` : "Kernel request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildKernelHeaders(input: KernelRequestInput): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${input.apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (input.body) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

function buildKernelUrl(path: string, query?: Record<string, unknown>): URL {
  const url = new URL(path, kernelApiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function readKernelPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Kernel returned invalid JSON");
  }
}

async function readKernelErrorPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  const trimmedText = text.trim();
  if (trimmedText === "") {
    return {};
  }

  try {
    return JSON.parse(trimmedText) as unknown;
  } catch {
    return {
      message: trimmedText,
    };
  }
}

function readKernelPagination(headers: Headers): Record<string, unknown> {
  return {
    limit: readIntegerHeader(headers, "x-limit") ?? 0,
    offset: readIntegerHeader(headers, "x-offset") ?? 0,
    has_more: headers.get("x-has-more") === "true",
    next_offset: readIntegerHeader(headers, "x-next-offset") ?? 0,
  };
}

function readIntegerHeader(headers: Headers, name: string): number | undefined {
  const value = headers.get(name);
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function createKernelError(response: Response, payload: unknown, phase: KernelRequestPhase): ProviderRequestError {
  const message = extractKernelErrorMessage(payload) ?? `Kernel request failed with status ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }

  if (phase === "execute" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractKernelErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const message = optionalString(record.message) ?? optionalString(record.error);
  if (message) {
    return message;
  }

  if (Array.isArray(record.details)) {
    return record.details.map(extractKernelErrorMessage).find((value): value is string => value !== undefined);
  }

  const details = optionalRecord(record.details);
  if (details) {
    return extractKernelErrorMessage(details);
  }

  const innerError = optionalRecord(record.inner_error);
  if (innerError) {
    return extractKernelErrorMessage(innerError);
  }

  return undefined;
}

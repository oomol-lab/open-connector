import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
} from "../../core/types.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { WeaviateActionName } from "./actions.ts";

import { optionalInteger, optionalNumber, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { compactObject } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "weaviate";

interface WeaviateActionContext {
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type WeaviateActionHandler = ProviderRuntimeHandler<WeaviateActionContext>;

const weaviateActionHandlers: Record<WeaviateActionName, WeaviateActionHandler> = {
  async get_instance_metadata(_input, context): Promise<unknown> {
    const payload = await requestWeaviateJson({
      baseUrl: context.baseUrl,
      path: "/v1/meta",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return {
      meta: payload,
      raw: payload,
    };
  },
  async list_collections(input, context): Promise<unknown> {
    const payload = await requestWeaviateJson({
      baseUrl: context.baseUrl,
      path: "/v1/schema",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      headers: buildSchemaHeaders(input),
    });
    const classes = Array.isArray(payload.classes) ? payload.classes : [];

    return {
      classes,
      name: optionalString(payload.name) ?? "",
      maintainer: optionalString(payload.maintainer) ?? "",
      raw: payload,
    };
  },
  async get_collection(input, context): Promise<unknown> {
    const className = requiredString(input.className, "className", (message) => new ProviderRequestError(400, message));
    const payload = await requestWeaviateJson({
      baseUrl: context.baseUrl,
      path: `/v1/schema/${encodeURIComponent(className)}`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      headers: buildSchemaHeaders(input),
    });

    return {
      collection: payload,
      raw: payload,
    };
  },
  async list_objects(input, context): Promise<unknown> {
    const query = compactObject({
      class: requiredString(input.className, "className", (message) => new ProviderRequestError(400, message)),
      tenant: optionalString(input.tenant),
      after: optionalString(input.after),
      offset: readOptionalNonNegativeInteger(input.offset, "offset"),
      limit: readOptionalNonNegativeInteger(input.limit, "limit"),
      include: optionalString(input.include),
      sort: optionalString(input.sort),
      order: optionalString(input.order),
    });
    const payload = await requestWeaviateJson({
      baseUrl: context.baseUrl,
      path: "/v1/objects",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      query,
    });
    const objects = Array.isArray(payload.objects) ? payload.objects : [];

    return {
      objects,
      totalResults: optionalNumber(payload.totalResults) ?? objects.length,
      raw: payload,
    };
  },
  async get_object(input, context): Promise<unknown> {
    const className = requiredString(input.className, "className", (message) => new ProviderRequestError(400, message));
    const id = requiredString(input.id, "id", (message) => new ProviderRequestError(400, message));
    const payload = await requestWeaviateJson({
      baseUrl: context.baseUrl,
      path: `/v1/objects/${encodeURIComponent(className)}/${encodeURIComponent(id)}`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      query: compactObject({
        include: optionalString(input.include),
        consistency_level: optionalString(input.consistencyLevel),
        node_name: optionalString(input.nodeName),
        tenant: optionalString(input.tenant),
      }),
    });

    return {
      object: payload,
      raw: payload,
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<WeaviateActionContext>({
  service,
  handlers: weaviateActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<WeaviateActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      baseUrl: normalizeWeaviateBaseUrl(credential.values.baseUrl),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const baseUrl = normalizeWeaviateBaseUrl(input.values.baseUrl);
    const payload = await requestWeaviateJson({
      baseUrl,
      path: "/v1/meta",
      apiKey: input.apiKey,
      fetcher,
      signal,
      phase: "validate",
    });

    return {
      profile: {
        accountId: optionalString(payload.hostname) ?? baseUrl,
        displayName: optionalString(payload.hostname) ?? "Weaviate API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        baseUrl,
        apiBaseUrl: baseUrl,
        validationEndpoint: "/v1/meta",
        version: optionalString(payload.version),
        hostname: optionalString(payload.hostname),
        grpcMaxMessageSize: optionalNumber(payload.grpcMaxMessageSize),
      }),
    };
  },
};

async function requestWeaviateJson(input: {
  baseUrl: string;
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: "validate" | "execute";
  query?: Record<string, string | number | undefined>;
  headers?: Record<string, string | undefined>;
}): Promise<Record<string, unknown>> {
  let response: Response;
  let payload: unknown;

  try {
    response = await input.fetcher(buildWeaviateUrl(input.baseUrl, input.path, input.query), {
      method: "GET",
      headers: compactObject({
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "user-agent": providerUserAgent,
        ...input.headers,
      }),
      signal: input.signal,
    });
    payload = await readWeaviatePayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Weaviate request failed: ${error.message}` : "Weaviate request failed",
    );
  }

  if (!response.ok) {
    throw createWeaviateError(response.status, payload, input.phase);
  }

  return requireObject(payload, "Weaviate response");
}

function buildWeaviateUrl(baseUrl: string, path: string, query?: Record<string, string | number | undefined>): string {
  const url = new URL(path, `${baseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function readWeaviatePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Weaviate returned invalid JSON");
  }
}

function createWeaviateError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = extractWeaviateErrorMessage(payload) ?? `Weaviate request failed with status ${status}`;

  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 400 || status === 404 || status === 410 || status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractWeaviateErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  const errors = record?.error;
  if (!Array.isArray(errors) || errors.length === 0) {
    return optionalString(record?.message);
  }

  const firstError = optionalRecord(errors[0]);
  return optionalString(firstError?.message) ?? optionalString(record?.message);
}

function buildSchemaHeaders(input: Record<string, unknown>): Record<string, string | undefined> {
  if (typeof input.consistency !== "boolean") {
    return {};
  }
  return {
    consistency: input.consistency ? "true" : "false",
  };
}

function readOptionalNonNegativeInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = optionalInteger(value);
  if (parsed === undefined || parsed < 0) {
    throw new ProviderRequestError(400, `${fieldName} must be an integer`);
  }
  return parsed;
}

function normalizeWeaviateBaseUrl(rawBaseUrl: unknown): string {
  const text = optionalString(rawBaseUrl);
  if (!text) {
    throw new ProviderRequestError(400, "baseUrl is required");
  }

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new ProviderRequestError(400, "baseUrl must be a valid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ProviderRequestError(400, "baseUrl must use http or https");
  }

  return url.toString().replace(/\/+$/u, "");
}

function requireObject(value: unknown, name: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${name} is not a JSON object`);
  }
  return record;
}

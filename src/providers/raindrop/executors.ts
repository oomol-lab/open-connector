import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  isAbortSignalError,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
} from "../provider-runtime.ts";

const service = "raindrop";
const raindropApiBaseUrl = "https://api.raindrop.io/rest/v1";

type RequestPhase = "validate" | "execute";

type RequestContext = ApiKeyProviderContext;

type ActionHandler = (input: Record<string, unknown>, context: RequestContext) => Promise<unknown>;

export const raindropActionHandlers: ProviderActionHandlers<"raindrop", ActionHandler> = {
  get_user(_input, context) {
    return requestJson("/user", { method: "GET" }, context, "execute");
  },
  async list_collections(input, context) {
    const root = await requestJson("/collections", { method: "GET" }, context, "execute");
    if (input.includeChildren !== true) {
      return root;
    }

    const children = await requestJson("/collections/childrens", { method: "GET" }, context, "execute");
    return { result: true, items: [...readItems(root), ...readItems(children)] };
  },
  get_collection(input, context) {
    return requestJson(
      `/collection/${readInteger(input.collectionId, "collectionId")}`,
      { method: "GET" },
      context,
      "execute",
    );
  },
  create_collection(input, context) {
    return requestJson("/collection", { method: "POST", body: collectionBody(input) }, context, "execute");
  },
  update_collection(input, context) {
    return requestJson(
      `/collection/${readInteger(input.collectionId, "collectionId")}`,
      { method: "PUT", body: collectionBody(input) },
      context,
      "execute",
    );
  },
  delete_collection(input, context) {
    return requestJson(
      `/collection/${readInteger(input.collectionId, "collectionId")}`,
      { method: "DELETE" },
      context,
      "execute",
    );
  },
  list_raindrops(input, context) {
    const collectionId = input.collectionId === undefined ? 0 : readInteger(input.collectionId, "collectionId");
    return requestJson(
      `/raindrops/${collectionId}`,
      {
        method: "GET",
        query: compactObject({
          search: input.search,
          sort: input.sort,
          page: input.page,
          perpage: input.perPage,
          nested: input.nested,
        }),
      },
      context,
      "execute",
    );
  },
  get_raindrop(input, context) {
    return requestJson(
      `/raindrop/${readInteger(input.raindropId, "raindropId")}`,
      { method: "GET" },
      context,
      "execute",
    );
  },
  create_raindrop(input, context) {
    return requestJson("/raindrop", { method: "POST", body: raindropBody(input) }, context, "execute");
  },
  update_raindrop(input, context) {
    return requestJson(
      `/raindrop/${readInteger(input.raindropId, "raindropId")}`,
      { method: "PUT", body: raindropBody(input) },
      context,
      "execute",
    );
  },
  delete_raindrop(input, context) {
    return requestJson(
      `/raindrop/${readInteger(input.raindropId, "raindropId")}`,
      { method: "DELETE" },
      context,
      "execute",
    );
  },
  list_tags(input, context) {
    const suffix = input.collectionId === undefined ? "" : `/${readInteger(input.collectionId, "collectionId")}`;
    return requestJson(`/tags${suffix}`, { method: "GET" }, context, "execute");
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, raindropActionHandlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestJson(
      "/user",
      { method: "GET" },
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );
    const user = optionalRecord(optionalRecord(payload)?.user);
    const accountId = user?._id === undefined ? undefined : String(user._id);
    const displayName = optionalString(user?.fullName) ?? optionalString(user?.email) ?? "Raindrop.io Account";

    return {
      profile: {
        accountId: accountId ?? displayName,
        displayName,
      },
      grantedScopes: [],
      metadata: { apiBaseUrl: raindropApiBaseUrl, validationEndpoint: "/user" },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: raindropApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    if (!headers.has("user-agent")) {
      headers.set("user-agent", providerUserAgent);
    }
  },
});

function collectionBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    title: input.title,
    view: input.view,
    sort: input.sort,
    public: input.public,
    expanded: input.expanded,
    parent: input.parentId === undefined ? undefined : { $id: input.parentId },
    cover: input.cover,
  });
}

function raindropBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    link: input.link,
    title: input.title,
    excerpt: input.excerpt,
    note: input.note,
    collection: input.collectionId === undefined ? undefined : { $id: input.collectionId },
    tags: input.tags,
    important: input.important,
    cover: input.cover,
    type: input.type,
  });
}

async function requestJson(
  path: string,
  init: { method: string; query?: Record<string, unknown>; body?: Record<string, unknown> },
  context: RequestContext,
  phase: RequestPhase,
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal);
  const url = new URL(`${raindropApiBaseUrl}${path}`);
  for (const [name, value] of Object.entries(init.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(name, String(value));
    }
  }

  try {
    const response = await context.fetcher(url, {
      method: init.method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: timeout.signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      throw createRequestError(response, payload, phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortSignalError(timeout.signal, error)) {
      throw new ProviderRequestError(504, "Raindrop.io request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Raindrop.io request failed: ${error.message}` : "Raindrop.io request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readPayload(response: Response): Promise<unknown> {
  return readProviderJsonBody(response, {
    emptyBody: {},
    invalidJsonMessage: "Raindrop.io returned a non-JSON response",
  });
}

function createRequestError(response: Response, payload: unknown, phase: RequestPhase): ProviderRequestError {
  const object = optionalRecord(payload);
  const message =
    optionalString(object?.errorMessage) ??
    optionalString(object?.error) ??
    `Raindrop.io request failed with status ${response.status}`;

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 502, message, payload);
}

function readInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an integer`);
  }

  return value;
}

function readItems(payload: unknown): unknown[] {
  const object = optionalRecord(payload);
  if (!object) {
    throw new ProviderRequestError(502, "Raindrop.io returned an invalid collection list");
  }

  const items = object.items;
  if (!Array.isArray(items)) {
    throw new ProviderRequestError(502, "Raindrop.io returned an invalid collection list");
  }

  return items;
}

import type { ApiKeyActionRequest, ProviderActionHandlers } from "../provider-runtime.ts";
import type { SupermemoryActionName } from "./actions.ts";

import { compactObject, requiredString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export interface SupermemoryCredentialCheck {
  providerAccountId?: string;
  accountLabel: string;
  providerScopes: string[];
  providerMetadata: Record<string, unknown>;
}

type SupermemoryActionHandler = (
  input: Record<string, unknown>,
  context: { apiKey: string; fetcher: typeof fetch },
) => Promise<unknown>;

type SupermemoryRequestInput = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
  phase?: "validate" | "execute";
};

export const supermemoryApiBaseUrl = "https://api.supermemory.ai";
export const supermemoryUserAgent: string = providerUserAgent;

export const supermemoryActionHandlers: ProviderActionHandlers<"supermemory", SupermemoryActionHandler> = {
  create_memories(input, context) {
    return supermemoryRequest("/v4/memories", { method: "POST", body: input }, context.apiKey, context.fetcher);
  },
  add_document(input, context) {
    return supermemoryRequest("/v3/documents", { method: "POST", body: input }, context.apiKey, context.fetcher);
  },
  get_document(input, context) {
    return supermemoryRequest(
      `/v3/documents/${encodeURIComponent(readRequiredString(input.id, "id"))}`,
      {},
      context.apiKey,
      context.fetcher,
    );
  },
  search(input, context) {
    return supermemoryRequest("/v4/search", { method: "POST", body: input }, context.apiKey, context.fetcher);
  },
  get_profile(input, context) {
    return supermemoryRequest("/v4/profile", { method: "POST", body: input }, context.apiKey, context.fetcher);
  },
  update_memory(input, context) {
    const { memoryId, ...body } = input;
    return supermemoryRequest(
      "/v4/memories",
      {
        method: "PATCH",
        body: { ...body, id: readRequiredString(memoryId, "memoryId") },
      },
      context.apiKey,
      context.fetcher,
    );
  },
  forget_memory(input, context) {
    const { memoryId, ...body } = input;
    return supermemoryRequest(
      "/v4/memories",
      {
        method: "DELETE",
        body: { ...body, id: readRequiredString(memoryId, "memoryId") },
      },
      context.apiKey,
      context.fetcher,
    );
  },
  async delete_document(input, context) {
    const id = readRequiredString(input.id, "id");
    const response = await supermemoryRawRequest(
      `/v3/documents/${encodeURIComponent(id)}`,
      { method: "DELETE" },
      context.apiKey,
      context.fetcher,
    );

    if (!response.ok) {
      throw await buildSupermemoryError(response, "execute");
    }

    return { id, deleted: true };
  },
};

export async function validateSupermemoryApiKey(
  apiKey: string,
  fetcher: typeof fetch,
): Promise<SupermemoryCredentialCheck> {
  await supermemoryRequest("/v3/documents/processing", { phase: "validate" }, apiKey, fetcher);

  return {
    accountLabel: "Supermemory API Key",
    providerScopes: [],
    providerMetadata: {
      apiBaseUrl: supermemoryApiBaseUrl,
      validationEndpoint: "/v3/documents/processing",
    },
  };
}

export function executeSupermemoryAction(
  input: ApiKeyActionRequest & {
    actionName: SupermemoryActionName;
    input: Record<string, unknown>;
  },
  fetcher: typeof fetch,
): Promise<unknown> {
  return supermemoryActionHandlers[input.actionName](input.input, {
    apiKey: requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message)),
    fetcher,
  });
}

async function supermemoryRequest(path: string, input: SupermemoryRequestInput, apiKey: string, fetcher: typeof fetch) {
  const response = await supermemoryRawRequest(path, input, apiKey, fetcher);
  if (!response.ok) {
    throw await buildSupermemoryError(response, input.phase ?? "execute");
  }
  if (response.status === 204) {
    return {};
  }

  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function supermemoryRawRequest(path: string, input: SupermemoryRequestInput, apiKey: string, fetcher: typeof fetch) {
  const headers = new Headers({
    authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    "user-agent": supermemoryUserAgent,
  });
  let body: string | undefined;
  if (input.body) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(compactObject(input.body));
  }

  return fetcher(new URL(path, supermemoryApiBaseUrl), {
    method: input.method ?? "GET",
    headers,
    body,
  });
}

async function buildSupermemoryError(response: Response, phase: "validate" | "execute") {
  const message = await readSupermemoryErrorMessage(response);

  if (response.status === 402 || response.status === 429) {
    return new ProviderRequestError(response.status, message);
  }
  if ([400, 404, 409, 422].includes(response.status)) {
    return new ProviderRequestError(response.status, message);
  }
  if (response.status === 401 || response.status === 403) {
    if (phase === "validate") {
      return new ProviderRequestError(400, message);
    }
    return new ProviderRequestError(response.status, message);
  }

  return new ProviderRequestError(response.status, message);
}

async function readSupermemoryErrorMessage(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) {
    return `Supermemory request failed with ${response.status}`;
  }

  try {
    const payload = JSON.parse(text) as Record<string, unknown>;
    const error = typeof payload.error === "string" ? payload.error : undefined;
    const details = typeof payload.details === "string" ? payload.details : undefined;
    const message = typeof payload.message === "string" ? payload.message : undefined;
    return [error, details].filter(Boolean).join(": ") || message || text;
  } catch {
    return text;
  }
}

function readRequiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

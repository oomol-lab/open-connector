import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError, requiredInputString } from "../provider-runtime.ts";

const mem0ApiBaseUrl = "https://api.mem0.ai";

type Mem0ActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type Mem0ActionHandler = (input: Record<string, unknown>, context: Mem0ActionContext) => Promise<unknown>;
type QueryValue = string | number | boolean | null | undefined | readonly string[] | Record<string, unknown>;

interface Mem0RequestInput {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, QueryValue>;
  body?: Record<string, unknown>;
  mode?: "validate" | "execute";
}

export const mem0ActionHandlers: ProviderActionHandlers<"mem0", Mem0ActionHandler> = {
  add_memories(input, context) {
    return addMem0Memories(input, context);
  },
  get_memories(input, context) {
    return getMem0Memories(input, context);
  },
  search_memories(input, context) {
    return searchMem0Memories(input, context);
  },
  get_memory(input, context) {
    return getMem0Memory(input, context);
  },
  update_memory(input, context) {
    return updateMem0Memory(input, context);
  },
  delete_memory(input, context) {
    return deleteMem0Memory(input, context);
  },
  get_memory_history(input, context) {
    return getMem0MemoryHistory(input, context);
  },
  get_events(input, context) {
    return getMem0Events(input, context);
  },
  get_event(input, context) {
    return getMem0Event(input, context);
  },
  get_users(input, context) {
    return getMem0Users(input, context);
  },
};

export async function validateMem0ApiKey(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await mem0Request(
    {
      apiKey,
      fetcher,
      signal,
    },
    {
      path: "/v1/events/",
      query: { page: 1, page_size: 1 },
      mode: "validate",
    },
  );

  const eventCount = optionalNumber(optionalRecord(payload)?.count);

  return {
    profile: {
      accountId: "mem0",
      displayName: "Mem0 API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/v1/events/",
      apiBaseUrl: mem0ApiBaseUrl,
      eventCount,
    }),
  };
}

function addMem0Memories(input: Record<string, unknown>, context: Mem0ActionContext): Promise<unknown> {
  if (!optionalString(input.memory) && !Array.isArray(input.messages)) {
    throw new ProviderRequestError(400, "memory or messages must be provided");
  }
  return mem0Request(context, {
    method: "POST",
    path: "/v1/memories/",
    body: compactObject({
      memory: optionalString(input.memory),
      messages: input.messages,
      user_id: optionalString(input.user_id),
      agent_id: optionalString(input.agent_id),
      app_id: optionalString(input.app_id),
      run_id: optionalString(input.run_id),
      org_id: optionalString(input.org_id),
      project_id: optionalString(input.project_id),
      metadata: optionalRecord(input.metadata),
      custom_categories: optionalRecord(input.custom_categories),
      enable_graph: optionalBoolean(input.enable_graph),
      infer: optionalBoolean(input.infer),
      async_mode: optionalBoolean(input.async_mode),
      output_format: optionalString(input.output_format),
      version: optionalString(input.version),
      custom_instructions: optionalString(input.custom_instructions),
      immutable: optionalBoolean(input.immutable),
      timestamp: optionalNumber(input.timestamp),
      expiration_date: optionalString(input.expiration_date),
      includes: optionalString(input.includes),
      excludes: optionalString(input.excludes),
    }),
  });
}

function getMem0Memories(input: Record<string, unknown>, context: Mem0ActionContext): Promise<unknown> {
  return mem0Request(context, {
    method: "POST",
    path: "/v2/memories/",
    body: compactObject({
      filters: optionalRecord(input.filters),
      page: optionalNumber(input.page),
      page_size: optionalNumber(input.page_size),
      org_id: optionalString(input.org_id),
      project_id: optionalString(input.project_id),
    }),
  });
}

function searchMem0Memories(input: Record<string, unknown>, context: Mem0ActionContext): Promise<unknown> {
  return mem0Request(context, {
    method: "POST",
    path: "/v2/memories/search/",
    body: compactObject({
      query: requiredInputString(input.query, "query"),
      filters: optionalRecord(input.filters),
      top_k: optionalNumber(input.top_k),
      rerank: optionalBoolean(input.rerank),
      threshold: optionalNumber(input.threshold),
      fields: optionalStringArray(input.fields),
      keyword_search: optionalBoolean(input.keyword_search),
      filter_memories: optionalBoolean(input.filter_memories),
      org_id: optionalString(input.org_id),
      project_id: optionalString(input.project_id),
    }),
  });
}

function getMem0Memory(input: Record<string, unknown>, context: Mem0ActionContext): Promise<unknown> {
  return mem0Request(context, {
    path: `/v1/memories/${encodeURIComponent(requiredInputString(input.memory_id, "memory_id"))}/`,
  });
}

function updateMem0Memory(input: Record<string, unknown>, context: Mem0ActionContext): Promise<unknown> {
  if (!optionalString(input.text) && !optionalRecord(input.metadata)) {
    throw new ProviderRequestError(400, "text or metadata must be provided");
  }
  return mem0Request(context, {
    method: "PUT",
    path: `/v1/memories/${encodeURIComponent(requiredInputString(input.memory_id, "memory_id"))}/`,
    body: compactObject({
      text: optionalString(input.text),
      metadata: optionalRecord(input.metadata),
    }),
  });
}

async function deleteMem0Memory(input: Record<string, unknown>, context: Mem0ActionContext): Promise<unknown> {
  const memoryId = requiredInputString(input.memory_id, "memory_id");
  const response = await mem0RawRequest(context, {
    method: "DELETE",
    path: `/v1/memories/${encodeURIComponent(memoryId)}/`,
  });

  if (!response.ok) {
    throw await buildMem0Error(response, "execute");
  }

  const payload = await readOptionalJsonObject(response);
  return compactObject({
    memory_id: memoryId,
    deleted: true,
    message: optionalString(payload?.message) ?? "Memory deleted successfully!",
  });
}

function getMem0MemoryHistory(input: Record<string, unknown>, context: Mem0ActionContext): Promise<unknown> {
  return mem0Request(context, {
    path: `/v1/memories/${encodeURIComponent(requiredInputString(input.memory_id, "memory_id"))}/history/`,
  });
}

function getMem0Events(input: Record<string, unknown>, context: Mem0ActionContext): Promise<unknown> {
  return mem0Request(context, {
    path: "/v1/events/",
    query: compactObject({
      event_type: optionalString(input.event_type),
      start_date: optionalString(input.start_date),
      end_date: optionalString(input.end_date),
      page: optionalNumber(input.page),
      page_size: optionalNumber(input.page_size),
    }),
  });
}

function getMem0Event(input: Record<string, unknown>, context: Mem0ActionContext): Promise<unknown> {
  return mem0Request(context, {
    path: `/v1/event/${encodeURIComponent(requiredInputString(input.event_id, "event_id"))}/`,
  });
}

function getMem0Users(input: Record<string, unknown>, context: Mem0ActionContext): Promise<unknown> {
  const orgId = optionalString(input.org_id);
  const projectId = optionalString(input.project_id);
  if ((orgId && !projectId) || (!orgId && projectId)) {
    throw new ProviderRequestError(400, "org_id and project_id must be provided together or omitted together");
  }
  return mem0Request(context, {
    path: "/v1/entities/",
    query: compactObject({
      entity_type: "user",
      org_id: orgId,
      project_id: projectId,
    }),
  });
}

async function mem0Request(context: Mem0ActionContext, input: Mem0RequestInput): Promise<unknown> {
  const response = await mem0RawRequest(context, input);

  if (!response.ok) {
    throw await buildMem0Error(response, input.mode ?? "execute");
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
    return {
      raw: text,
    };
  }
}

function mem0RawRequest(context: Mem0ActionContext, input: Mem0RequestInput): Promise<Response> {
  const url = new URL(input.path, mem0ApiBaseUrl);
  appendQuery(url, input.query);

  const headers = new Headers({
    authorization: `Token ${context.apiKey}`,
    accept: "application/json",
    "user-agent": providerUserAgent,
  });
  let body: string | undefined;
  if (input.body) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(input.body);
  }

  return context.fetcher(url, {
    method: input.method ?? "GET",
    headers,
    body,
    signal: context.signal,
  });
}

function appendQuery(url: URL, query?: Record<string, QueryValue>): void {
  if (!query) {
    return;
  }

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
      continue;
    }
    if (typeof value === "object") {
      url.searchParams.set(key, JSON.stringify(value));
      continue;
    }
    url.searchParams.set(key, String(value));
  }
}

async function buildMem0Error(response: Response, mode: "validate" | "execute"): Promise<ProviderRequestError> {
  const message = await readMem0ErrorMessage(response);

  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (response.status === 400 || response.status === 404 || response.status === 409) {
    return new ProviderRequestError(response.status, message);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : response.status, message);
  }

  return new ProviderRequestError(response.status, message);
}

async function readMem0ErrorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  if (!text) {
    return `mem0 request failed with ${response.status}`;
  }

  try {
    const payload = JSON.parse(text) as Record<string, unknown>;
    const detail = payload.detail;
    if (typeof detail === "string" && detail) {
      return detail;
    }
    if (Array.isArray(detail)) {
      const parts = detail
        .map((item) => {
          if (!item || typeof item !== "object") {
            return undefined;
          }
          const maybeMessage = (item as Record<string, unknown>).msg;
          return typeof maybeMessage === "string" ? maybeMessage : undefined;
        })
        .filter((item): item is string => Boolean(item));
      if (parts.length > 0) {
        return parts.join("; ");
      }
    }
    if (typeof payload.message === "string" && payload.message) {
      return payload.message;
    }
    if (typeof payload.error === "string" && payload.error) {
      return payload.error;
    }
  } catch {
    return text;
  }

  return text;
}

async function readOptionalJsonObject(response: Response): Promise<Record<string, unknown> | undefined> {
  const text = await response.text().catch(() => "");
  if (!text) {
    return undefined;
  }

  try {
    return optionalRecord(JSON.parse(text) as unknown);
  } catch {
    return undefined;
  }
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const strings = value.filter((item): item is string => typeof item === "string");
  return strings.length === value.length ? strings : undefined;
}

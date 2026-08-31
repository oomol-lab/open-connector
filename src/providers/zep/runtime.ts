import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
} from "../provider-runtime.ts";

export const zepApiBaseUrl = "https://api.getzep.com/api/v2";
const validationEndpoint = "/projects/info";
const maxResponseBytes = 10 * 1024 * 1024;

interface ZepRequestInput {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
  phase?: "validate" | "execute";
}

export const zepActionHandlers: ProviderActionHandlers<"zep", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  get_project(_input, context) {
    return requestZepJson(context, { path: validationEndpoint });
  },
  create_user(input, context) {
    return requestZepJson(context, {
      method: "POST",
      path: "/users",
      body: compactObject({
        user_id: input.user_id,
        email: input.email,
        first_name: input.first_name,
        last_name: input.last_name,
        metadata: input.metadata,
        time_zone: input.time_zone,
        disable_default_ontology: input.disable_default_ontology,
      }),
    });
  },
  list_users(input, context) {
    return requestZepJson(context, {
      path: "/users-ordered",
      query: {
        pageNumber: optionalNumber(input.pageNumber),
        pageSize: optionalNumber(input.pageSize),
        search: optionalString(input.search),
        order_by: optionalString(input.order_by),
        asc: optionalBoolean(input.asc),
      },
    });
  },
  get_user(input, context) {
    return requestZepJson(context, {
      path: `/users/${encodeIdentifier(input.user_id, "user_id")}`,
    });
  },
  update_user(input, context) {
    return requestZepJson(context, {
      method: "PATCH",
      path: `/users/${encodeIdentifier(input.user_id, "user_id")}`,
      body: compactObject({
        email: input.email,
        first_name: input.first_name,
        last_name: input.last_name,
        metadata: input.metadata,
        time_zone: input.time_zone,
        disable_default_ontology: input.disable_default_ontology,
      }),
    });
  },
  delete_user(input, context) {
    return requestZepJson(context, {
      method: "DELETE",
      path: `/users/${encodeIdentifier(input.user_id, "user_id")}`,
    });
  },
  create_thread(input, context) {
    return requestZepJson(context, {
      method: "POST",
      path: "/threads",
      body: { thread_id: input.thread_id, user_id: input.user_id },
    });
  },
  list_threads(input, context) {
    return requestZepJson(context, {
      path: "/threads",
      query: {
        page_number: optionalNumber(input.page_number),
        page_size: optionalNumber(input.page_size),
        order_by: optionalString(input.order_by),
        asc: optionalBoolean(input.asc),
      },
    });
  },
  delete_thread(input, context) {
    return requestZepJson(context, {
      method: "DELETE",
      path: `/threads/${encodeIdentifier(input.thread_id, "thread_id")}`,
    });
  },
  add_thread_messages(input, context) {
    return requestZepJson(context, {
      method: "POST",
      path: `/threads/${encodeIdentifier(input.thread_id, "thread_id")}/messages`,
      body: compactObject({
        messages: input.messages,
        ignore_roles: input.ignore_roles,
        return_context: input.return_context,
        strict_ontology: input.strict_ontology,
      }),
    });
  },
  get_thread_messages(input, context) {
    return requestZepJson(context, {
      path: `/threads/${encodeIdentifier(input.thread_id, "thread_id")}/messages`,
      query: {
        limit: optionalNumber(input.limit),
        cursor: optionalNumber(input.cursor),
        lastn: optionalNumber(input.lastn),
      },
    });
  },
  get_thread_context(input, context) {
    return requestZepJson(context, {
      path: `/threads/${encodeIdentifier(input.thread_id, "thread_id")}/context`,
      query: { template_id: optionalString(input.template_id) },
    });
  },
};

export async function validateZepCredential(
  input: { apiKey: string },
  { fetcher, signal }: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const payload = await requestZepJson(
    { apiKey: input.apiKey, fetcher, signal },
    { path: validationEndpoint, phase: "validate" },
  );
  const project = optionalRecord(optionalRecord(payload)?.project);
  if (!project) {
    throw new ProviderRequestError(502, "Zep response did not include project");
  }
  const projectId = optionalString(project.uuid);
  const projectName = optionalString(project.name);
  return {
    profile: {
      accountId: projectId ? `zep:${projectId}` : "zep",
      displayName: projectName ?? "Zep API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: zepApiBaseUrl,
      validationEndpoint,
      projectId,
      projectName,
    }),
  };
}

async function requestZepJson(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  input: ZepRequestInput,
): Promise<unknown> {
  const url = new URL(`${zepApiBaseUrl}${input.path}`);
  for (const [name, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }
  const headers = new Headers({
    accept: "application/json",
    authorization: `Api-Key ${context.apiKey}`,
    "user-agent": providerUserAgent,
  });
  let body: string | undefined;
  if (input.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(input.body);
  }
  const timeout = createProviderTimeout(context.signal);
  try {
    const response = await context.fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body,
      signal: timeout.signal,
    });
    const payload = await readZepPayload(response);
    if (!response.ok) {
      throw createZepError(response.status, payload, input.phase ?? "execute");
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Zep request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Zep request failed: ${error.message}` : "Zep request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readZepPayload(response: Response): Promise<unknown> {
  const text = await readProviderTextBody(response, "Zep response", maxResponseBytes);
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Zep returned invalid JSON");
  }
}

function createZepError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = extractZepErrorMessage(payload) ?? `Zep request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message);
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(status, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(502, message);
}

function extractZepErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") return optionalString(payload);
  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error) ?? optionalString(record?.detail);
}

function encodeIdentifier(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value === "") {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return encodeURIComponent(value);
}

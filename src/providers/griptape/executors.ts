import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "griptape";
const griptapeApiBaseUrl = "https://cloud.griptape.ai/api";

type GriptapeRequestPhase = "validate" | "execute";
type GriptapeActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const griptapeActionHandlers: ProviderActionHandlers<"griptape", GriptapeActionHandler> = {
  async list_organizations(_input, context) {
    const record = asRecord(await requestGriptape({ path: "/organizations", method: "GET", context }));
    return {
      organizations: readRequiredArray(record, "organizations"),
      raw: record,
    };
  },
  async get_organization(input, context) {
    const record = asRecord(
      await requestGriptape({
        path: `/organizations/${encodePath(input.organization_id)}`,
        method: "GET",
        context,
      }),
    );
    return {
      organization: record,
      raw: record,
    };
  },
  async list_assistants(input, context) {
    const record = asRecord(
      await requestGriptape({
        path: "/assistants",
        method: "GET",
        context,
        query: [
          ["page", input.page],
          ["page_size", input.page_size],
        ],
      }),
    );
    return {
      assistants: readRequiredArray(record, "assistants"),
      pagination: asRecord(record.pagination),
      raw: record,
    };
  },
  async create_assistant(input, context) {
    const record = asRecord(
      await requestGriptape({
        path: "/assistants",
        method: "POST",
        context,
        body: pickAssistantBody(input),
      }),
    );
    return {
      assistant: record,
      raw: record,
    };
  },
  async get_assistant(input, context) {
    const record = asRecord(
      await requestGriptape({
        path: `/assistants/${encodePath(input.assistant_id)}`,
        method: "GET",
        context,
      }),
    );
    return {
      assistant: record,
      raw: record,
    };
  },
  async update_assistant(input, context) {
    const record = asRecord(
      await requestGriptape({
        path: `/assistants/${encodePath(input.assistant_id)}`,
        method: "PATCH",
        context,
        body: pickAssistantBody(input),
      }),
    );
    return {
      assistant: record,
      raw: record,
    };
  },
  async delete_assistant(input, context) {
    await requestGriptape({
      path: `/assistants/${encodePath(input.assistant_id)}`,
      method: "DELETE",
      context,
    });
    return { deleted: true };
  },
  async list_assistant_runs(input, context) {
    const record = asRecord(
      await requestGriptape({
        path: `/assistants/${encodePath(input.assistant_id)}/runs`,
        method: "GET",
        context,
        query: [
          ["page", input.page],
          ["page_size", input.page_size],
          ["status", input.status],
        ],
      }),
    );
    return {
      assistant_runs: readRequiredArray(record, "assistant_runs"),
      pagination: asRecord(record.pagination),
      raw: record,
    };
  },
  async create_assistant_run(input, context) {
    const record = asRecord(
      await requestGriptape({
        path: `/assistants/${encodePath(input.assistant_id)}/runs`,
        method: "POST",
        context,
        body: pickAssistantRunBody(input),
      }),
    );
    return {
      assistant_run: record,
      raw: record,
    };
  },
  async get_assistant_run(input, context) {
    const record = asRecord(
      await requestGriptape({
        path: `/assistant-runs/${encodePath(input.assistant_run_id)}`,
        method: "GET",
        context,
      }),
    );
    return {
      assistant_run: record,
      raw: record,
    };
  },
  async cancel_assistant_run(input, context) {
    const record = asRecord(
      await requestGriptape({
        path: `/assistant-runs/${encodePath(input.assistant_run_id)}/cancel`,
        method: "POST",
        context,
      }),
    );
    return {
      assistant_run: record,
      raw: record,
    };
  },
  async list_assistant_events(input, context) {
    const record = asRecord(
      await requestGriptape({
        path: `/assistant-runs/${encodePath(input.assistant_run_id)}/events`,
        method: "GET",
        context,
        query: [
          ["limit", input.limit],
          ["offset", input.offset],
        ],
      }),
    );
    return compactObject({
      events: readRequiredArray(record, "events"),
      count: readRequiredNumber(record, "count"),
      limit: readRequiredNumber(record, "limit"),
      offset: readRequiredNumber(record, "offset"),
      next_offset: readOptionalNumber(record, "next_offset"),
      total_count: readRequiredNumber(record, "total_count"),
      raw: record,
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, griptapeActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestGriptape({
      path: "/organizations",
      method: "GET",
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      phase: "validate",
    });
    const organizations = readRequiredArray(asRecord(payload), "organizations");
    const firstOrganization = optionalRecord(organizations[0]);
    const organizationName = optionalString(firstOrganization?.name);
    const organizationId = optionalString(firstOrganization?.organization_id);
    return {
      profile: {
        accountId: organizationId ? `griptape:organization:${organizationId}` : "griptape-cloud-api-key",
        displayName: organizationName ?? "Griptape Cloud API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: griptapeApiBaseUrl,
        organizationId,
        organizationCount: organizations.length,
      }),
    };
  },
};

async function requestGriptape(input: {
  path: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  query?: Array<[string, unknown]>;
  body?: unknown;
  phase?: GriptapeRequestPhase;
}): Promise<unknown> {
  const url = new URL(`${griptapeApiBaseUrl}${input.path}`);
  for (const [key, value] of input.query ?? []) {
    appendQueryValue(url, key, value);
  }
  let response: Response;
  try {
    response = await input.context.fetcher(url.toString(), {
      method: input.method,
      headers: buildHeaders(input.context.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Griptape request failed: ${error.message}` : "Griptape request failed",
    );
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    throw mapHttpError(response.status, payload, input.phase ?? "execute");
  }
  return payload;
}

function buildHeaders(apiKey: string, hasBody: boolean): Headers {
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  });
  if (hasBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

async function readPayload(response: Response): Promise<unknown> {
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
    throw new ProviderRequestError(502, "Griptape returned invalid JSON");
  }
}

function mapHttpError(status: number, payload: unknown, phase: GriptapeRequestPhase): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `Griptape request failed with status ${status}`;
  if (status === 401 || status === 403) {
    if (phase === "validate") {
      return new ProviderRequestError(400, message, payload);
    }
    return new ProviderRequestError(401, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  for (const key of ["message", "detail", "error"]) {
    const value = optionalString(record[key]);
    if (value) {
      return value;
    }
  }
  if (Array.isArray(record.errors) && record.errors.length > 0) {
    const first = record.errors[0];
    if (typeof first === "string" && first.trim()) {
      return first.trim();
    }
    const errorRecord = optionalRecord(first);
    return (
      optionalString(errorRecord?.message) ?? optionalString(errorRecord?.detail) ?? optionalString(errorRecord?.error)
    );
  }
  return optionalString(record.type);
}

function pickAssistantBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: input.name,
    description: input.description,
    input: input.input,
    model: input.model,
    knowledge_base_ids: input.knowledge_base_ids,
    retriever_ids: input.retriever_ids,
    ruleset_ids: input.ruleset_ids,
    structure_ids: input.structure_ids,
    tool_ids: input.tool_ids,
  });
}

function pickAssistantRunBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    input: input.input,
    args: input.args,
    model: input.model,
    new_thread: input.new_thread,
    thread_id: input.thread_id,
    knowledge_base_ids: input.knowledge_base_ids,
    additional_knowledge_base_ids: input.additional_knowledge_base_ids,
    retriever_ids: input.retriever_ids,
    additional_retriever_ids: input.additional_retriever_ids,
    ruleset_ids: input.ruleset_ids,
    additional_ruleset_ids: input.additional_ruleset_ids,
    structure_ids: input.structure_ids,
    additional_structure_ids: input.additional_structure_ids,
    tool_ids: input.tool_ids,
    additional_tool_ids: input.additional_tool_ids,
  });
}

function appendQueryValue(url: URL, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      appendQueryValue(url, key, item);
    }
    return;
  }
  url.searchParams.append(key, String(value));
}

function encodePath(value: unknown): string {
  return encodeURIComponent(String(value));
}

function asRecord(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "Griptape returned a non-object response", value);
  }
  return record;
}

function readRequiredArray(record: Record<string, unknown>, key: string): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Griptape response missing ${key} array`, record);
  }
  return value;
}

function readRequiredNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number") {
    throw new ProviderRequestError(502, `Griptape response missing ${key} number`, record);
  }
  return value;
}

function readOptionalNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "number") {
    throw new ProviderRequestError(502, `Griptape response has invalid ${key} number`, record);
  }
  return value;
}

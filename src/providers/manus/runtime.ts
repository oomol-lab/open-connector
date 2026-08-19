import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderActionSources, ProviderFetch } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  isAbortLikeError,
  mapProviderActionSources,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const manusApiBaseUrl = "https://api.manus.ai";
const validationEndpoint = "/v2/project.list";

type ManusRequestPhase = "validate" | "execute";
type ManusMethod = "GET" | "POST";
type ManusActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface ManusOperation {
  method: ManusMethod;
  path: string;
  queryKeys?: readonly string[];
  bodyBuilder?: (input: Record<string, unknown>) => Record<string, unknown>;
}

const manusOperations: ProviderActionSources<"manus", ManusOperation> = {
  create_task: {
    method: "POST",
    path: "/v2/task.create",
    bodyBuilder: buildCreateTaskBody,
  },
  get_task: {
    method: "GET",
    path: "/v2/task.detail",
    queryKeys: ["task_id"],
  },
  list_tasks: {
    method: "GET",
    path: "/v2/task.list",
    queryKeys: ["limit", "cursor", "order", "scope", "agent_id", "project_id"],
  },
  list_task_messages: {
    method: "GET",
    path: "/v2/task.listMessages",
    queryKeys: ["task_id", "limit", "cursor", "order", "verbose", "slides_format"],
  },
  send_message: {
    method: "POST",
    path: "/v2/task.sendMessage",
    bodyBuilder: buildSendMessageBody,
  },
  stop_task: {
    method: "POST",
    path: "/v2/task.stop",
  },
  delete_task: {
    method: "POST",
    path: "/v2/task.delete",
  },
  update_task: {
    method: "POST",
    path: "/v2/task.update",
  },
  confirm_task_action: {
    method: "POST",
    path: "/v2/task.confirmAction",
  },
  create_project: {
    method: "POST",
    path: "/v2/project.create",
  },
  list_projects: {
    method: "GET",
    path: "/v2/project.list",
  },
  list_connectors: {
    method: "GET",
    path: "/v2/connector.list",
  },
  list_skills: {
    method: "GET",
    path: "/v2/skill.list",
    queryKeys: ["project_id"],
  },
  list_agents: {
    method: "GET",
    path: "/v2/agent.list",
  },
  get_agent: {
    method: "GET",
    path: "/v2/agent.detail",
    queryKeys: ["agent_id"],
  },
  update_agent: {
    method: "POST",
    path: "/v2/agent.update",
  },
  list_online_browser_clients: {
    method: "GET",
    path: "/v2/browser.onlineList",
  },
};

export const manusActionHandlers: ProviderActionHandlers<"manus", ManusActionHandler> = mapProviderActionSources(
  "manus",
  manusOperations,
  (_name, operation): ManusActionHandler =>
    (input, context) =>
      requestManusJson({
        apiKey: context.apiKey,
        fetcher: context.fetcher,
        signal: context.signal,
        operation,
        input,
        phase: "execute",
      }),
);

export async function validateManusCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestManusJson({
    apiKey,
    fetcher,
    signal,
    operation: manusOperations.list_projects,
    input: {},
    phase: "validate",
  });

  return {
    profile: {
      accountId: "api_key",
      displayName: "Manus API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: manusApiBaseUrl,
      validationEndpoint,
    },
  };
}

async function requestManusJson(input: {
  apiKey: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
  operation: ManusOperation;
  input: Record<string, unknown>;
  phase: ManusRequestPhase;
}): Promise<unknown> {
  const url = buildManusUrl(input.operation, input.input);
  const body = buildRequestBody(input.operation, input.input);

  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: input.operation.method,
      headers: buildManusHeaders(input.apiKey, body !== undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: input.signal,
    });
    payload = await readManusPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (isAbortLikeError(error)) {
      throw new ProviderRequestError(504, error instanceof Error ? error.message : "Manus request timed out");
    }
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "Manus request failed");
  }

  if (!response.ok || isManusErrorPayload(payload)) {
    throw mapManusError(
      response.status,
      extractManusErrorMessage(payload),
      extractManusErrorCode(payload),
      input.phase,
    );
  }

  return payload;
}

function buildManusUrl(operation: ManusOperation, input: Record<string, unknown>): URL {
  const url = new URL(operation.path, manusApiBaseUrl);
  if (operation.method !== "GET") {
    return url;
  }
  for (const key of operation.queryKeys ?? []) {
    const value = input[key];
    if (value === undefined || value === null || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
}

function buildRequestBody(
  operation: ManusOperation,
  input: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (operation.method !== "POST") {
    return undefined;
  }
  return operation.bodyBuilder ? operation.bodyBuilder(input) : compactObject({ ...input });
}

function buildCreateTaskBody(input: Record<string, unknown>): Record<string, unknown> {
  const { content, connectors, enable_skills, force_skills, message, ...rest } = input;
  return compactObject({
    message: buildMessage({ content, connectors, enable_skills, force_skills, message }),
    ...rest,
  });
}

function buildSendMessageBody(input: Record<string, unknown>): Record<string, unknown> {
  const { task_id, content, connectors, enable_skills, force_skills, message, ...rest } = input;
  return compactObject({
    task_id,
    message: buildMessage({ content, connectors, enable_skills, force_skills, message }),
    ...rest,
  });
}

function buildMessage(input: Record<string, unknown>): Record<string, unknown> {
  const explicitMessage = optionalRecord(input.message);
  if (explicitMessage) {
    return explicitMessage;
  }
  if (input.content === undefined) {
    throw new ProviderRequestError(400, "message or content is required");
  }
  return compactObject({
    content: input.content,
    connectors: input.connectors,
    enable_skills: input.enable_skills,
    force_skills: input.force_skills,
  });
}

function buildManusHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  return {
    accept: "application/json",
    "x-manus-api-key": apiKey,
    "user-agent": providerUserAgent,
    ...(hasBody ? { "content-type": "application/json" } : {}),
  };
}

async function readManusPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isManusErrorPayload(payload: unknown): boolean {
  const record = optionalRecord(payload);
  return record?.ok === false;
}

function extractManusErrorMessage(payload: unknown): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const record = optionalRecord(payload);
  const error = optionalRecord(record?.error);
  return (
    optionalString(error?.message) ??
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    "Manus request failed"
  );
}

function extractManusErrorCode(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  const error = optionalRecord(record?.error);
  return optionalString(error?.code);
}

function mapManusError(
  status: number,
  message: string,
  errorCode: string | undefined,
  phase: ManusRequestPhase,
): ProviderRequestError {
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message);
  }
  if (phase === "execute" && status === 403) {
    const lowerMessage = message.toLowerCase();
    return new ProviderRequestError(
      errorCode === "permission_denied" || lowerMessage.includes("insufficient_scope") ? 403 : 502,
      message,
    );
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 500, message);
}

import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
} from "../provider-runtime.ts";

const service = "nozbe_teams";
const nozbeTeamsApiBaseUrl = "https://api4.nozbe.com/v1/api";
const nozbeTeamsValidationPath = "/teams";
const nozbeTeamsMaxResponseBytes = 10 * 1024 * 1024;

type NozbeRequestPhase = "validate" | "execute";
type NozbeContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type NozbeActionHandler = (input: Record<string, unknown>, context: NozbeContext) => Promise<unknown>;

interface NozbeRequestInput {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
  allowEmpty?: boolean;
}

export const nozbeTeamsActionHandlers: ProviderActionHandlers<"nozbe_teams", NozbeActionHandler> = {
  list_teams(input, context) {
    return requestNozbeArray({ method: "GET", path: "/teams", query: input }, context, "execute");
  },
  list_projects(input, context) {
    return requestNozbeArray({ method: "GET", path: "/projects", query: input }, context, "execute");
  },
  get_project(input, context) {
    return requestNozbeObject({ method: "GET", path: resourcePath("projects", input.id) }, context, "execute");
  },
  create_project(input, context) {
    return requestNozbeObject({ method: "POST", path: "/projects", body: input }, context, "execute");
  },
  update_project(input, context) {
    const { id, ...body } = input;
    validateUpdateBody(body, "project");
    return requestNozbeObject({ method: "PUT", path: resourcePath("projects", id), body }, context, "execute");
  },
  async delete_project(input, context) {
    const id = requireResourceId(input.id);
    await requestNozbeJson(
      { method: "DELETE", path: `/projects/${encodeURIComponent(id)}`, allowEmpty: true },
      context,
      "execute",
    );
    return { id, deleted: true };
  },
  list_tasks(input, context) {
    return requestNozbeArray({ method: "GET", path: "/tasks", query: input }, context, "execute");
  },
  get_task(input, context) {
    return requestNozbeObject({ method: "GET", path: resourcePath("tasks", input.id) }, context, "execute");
  },
  create_task(input, context) {
    return requestNozbeObject({ method: "POST", path: "/tasks", body: input }, context, "execute");
  },
  update_task(input, context) {
    const { id, ...body } = input;
    validateUpdateBody(body, "task");
    return requestNozbeObject({ method: "PUT", path: resourcePath("tasks", id), body }, context, "execute");
  },
  async delete_task(input, context) {
    const id = requireResourceId(input.id);
    await requestNozbeJson(
      { method: "DELETE", path: `/tasks/${encodeURIComponent(id)}`, allowEmpty: true },
      context,
      "execute",
    );
    return { id, deleted: true };
  },
  list_comments(input, context) {
    return requestNozbeArray({ method: "GET", path: "/comments", query: input }, context, "execute");
  },
  get_comment(input, context) {
    return requestNozbeObject({ method: "GET", path: resourcePath("comments", input.id) }, context, "execute");
  },
  create_comment(input, context) {
    return requestNozbeObject({ method: "POST", path: "/comments", body: input }, context, "execute");
  },
  update_comment(input, context) {
    const { id, ...body } = input;
    validateUpdateBody(body, "comment");
    return requestNozbeObject({ method: "PUT", path: resourcePath("comments", id), body }, context, "execute");
  },
  delete_comment(input, context) {
    return requestNozbeObject({ method: "DELETE", path: resourcePath("comments", input.id) }, context, "execute");
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, nozbeTeamsActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: nozbeTeamsApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "apikey " },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const teams = await requestNozbeArray(
      { method: "GET", path: nozbeTeamsValidationPath, query: { limit: 1 } },
      { apiKey: input.apiKey, fetcher, signal },
      "validate",
    );
    const firstTeam = optionalRecord(teams[0]);
    const teamId = optionalString(firstTeam?.id);
    const teamName = optionalString(firstTeam?.name);

    return {
      profile: {
        accountId: teamId ?? "api_key",
        displayName: teamName ?? "Nozbe API Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: nozbeTeamsApiBaseUrl,
        validationEndpoint: nozbeTeamsValidationPath,
        teamId,
        teamName,
      }),
    };
  },
};

async function requestNozbeArray(
  input: NozbeRequestInput,
  context: NozbeContext,
  phase: NozbeRequestPhase,
): Promise<unknown[]> {
  const payload = await requestNozbeJson(input, context, phase);
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Nozbe returned an unexpected non-array response");
  }
  return payload;
}

async function requestNozbeObject(
  input: NozbeRequestInput,
  context: NozbeContext,
  phase: NozbeRequestPhase,
): Promise<Record<string, unknown>> {
  const payload = await requestNozbeJson(input, context, phase);
  const object = optionalRecord(payload);
  if (!object) {
    throw new ProviderRequestError(502, "Nozbe returned an unexpected non-object response");
  }
  return object;
}

async function requestNozbeJson(
  input: NozbeRequestInput,
  context: NozbeContext,
  phase: NozbeRequestPhase,
): Promise<unknown> {
  const url = new URL(`${nozbeTeamsApiBaseUrl}${input.path}`);
  for (const [name, value] of Object.entries(input.query ?? {})) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      url.searchParams.set(name, String(value));
    }
  }

  const timeout = createProviderTimeout(context.signal);
  try {
    const response = await context.fetcher(url, {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: `apikey ${context.apiKey}`,
        ...(input.body === undefined ? {} : { "content-type": "application/json" }),
        "user-agent": providerUserAgent,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const text = await readProviderTextBody(response, "Nozbe response", nozbeTeamsMaxResponseBytes);
    if (!response.ok) {
      throw buildNozbeError(response, text, phase);
    }
    if (response.status === 204 || !text.trim()) {
      if (response.status === 204 || input.allowEmpty) {
        return null;
      }
      throw new ProviderRequestError(502, "Nozbe returned an empty response");
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new ProviderRequestError(502, "Nozbe returned invalid JSON");
    }
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Nozbe request timed out");
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new ProviderRequestError(502, `Nozbe request failed: ${detail}`, error);
  } finally {
    timeout.cleanup();
  }
}

function buildNozbeError(response: Response, text: string, phase: NozbeRequestPhase): ProviderRequestError {
  const message = readNozbeErrorMessage(response.status, text);
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if ([400, 404, 409, 422].includes(response.status)) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(502, message);
}

function readNozbeErrorMessage(status: number, text: string): string {
  const fallback = `Nozbe request failed with status ${status}`;
  if (!text.trim()) {
    return fallback;
  }
  try {
    const payload = optionalRecord(JSON.parse(text) as unknown);
    return (
      optionalString(payload?.message) ?? optionalString(payload?.error) ?? optionalString(payload?.detail) ?? fallback
    );
  } catch {
    return text.trim();
  }
}

function resourcePath(resource: string, id: unknown): string {
  return `/${resource}/${encodeURIComponent(requireResourceId(id))}`;
}

function requireResourceId(value: unknown): string {
  return requiredString(value, "Nozbe resource ID", (message) => new ProviderRequestError(400, message));
}

function validateUpdateBody(body: Record<string, unknown>, resource: string): void {
  if (Object.keys(body).length === 0) {
    throw new ProviderRequestError(400, `at least one ${resource} field is required`);
  }
}

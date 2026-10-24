import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-executors.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { compactObject, looseArray, optionalRecord, optionalString } from "../../core/cast.ts";
import { readProviderTextBody } from "../provider-runtime.ts";
import {
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
  runProviderRequest,
} from "../provider-runtime.ts";

export const riddleQuizMakerApiBaseUrl = "https://www.riddle.com/creator/api/v3/";
type RequestPhase = "validate" | "execute";
interface RiddleRequest {
  path: string;
  method?: "GET" | "POST" | "DELETE";
  query?: Record<string, unknown>;
  body?: unknown;
}
type Handler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
export const riddleQuizMakerActionHandlers: ProviderActionHandlers<"riddle_quiz_maker", Handler> = {
  async list_riddles(input, context) {
    const envelope = await requestRiddle({ path: "riddle/list", method: "POST", body: compactObject(input) }, context);
    return { riddles: looseArray(envelope.data), pagination: optionalRecord(envelope.pagination) ?? null };
  },
  async get_riddle(input, context) {
    return {
      riddle: await requestObject(
        `riddle/${encodeURIComponent(requiredInputString(input.riddleUuid, "riddleUuid"))}`,
        context,
      ),
    };
  },
  async rename_riddle(input, context) {
    return {
      riddle: await requestObject(
        `riddle/rename/${encodeURIComponent(requiredInputString(input.riddleUuid, "riddleUuid"))}`,
        context,
        { title: requiredInputString(input.title, "title") },
      ),
    };
  },
  async publish_riddle(input, context) {
    return {
      riddle: await requestObject(
        `riddle/publish/${encodeURIComponent(requiredInputString(input.riddleUuid, "riddleUuid"))}`,
        context,
        undefined,
        "POST",
      ),
    };
  },
  async unpublish_riddle(input, context) {
    return {
      riddle: await requestObject(
        `riddle/unpublish/${encodeURIComponent(requiredInputString(input.riddleUuid, "riddleUuid"))}`,
        context,
        undefined,
        "POST",
      ),
    };
  },
  async get_embed_code(input, context) {
    const envelope = await requestRiddle(
      { path: `riddle/embed-code/${encodeURIComponent(requiredInputString(input.riddleUuid, "riddleUuid"))}` },
      context,
    );
    const embedCode = optionalString(envelope.data);
    if (embedCode === undefined)
      throw new ProviderRequestError(502, "Riddle embed-code response did not include a string data value");
    return { embedCode };
  },
  async list_projects(input, context) {
    const envelope = await requestRiddle(
      { path: "project/list", query: compactObject({ page: input.page, pageSize: input.pageSize }) },
      context,
    );
    const data = optionalRecord(envelope.data);
    return {
      projects: Array.isArray(envelope.data) ? envelope.data : looseArray(data?.items ?? data?.projects),
      pagination: optionalRecord(envelope.pagination) ?? null,
    };
  },
  async get_project(input, context) {
    return { project: await requestObject(`project/${encodeURIComponent(String(input.projectId))}`, context) };
  },
  async list_tags(input, context) {
    const envelope = await requestRiddle(
      { path: "tag/list", method: "POST", body: compactObject({ project: input.project }) },
      context,
    );
    return { tags: looseArray(envelope.data) };
  },
  async list_riddle_tags(input, context) {
    const envelope = await requestRiddle(
      { path: `tag/riddle/list/${encodeURIComponent(requiredInputString(input.riddleUuid, "riddleUuid"))}` },
      context,
    );
    return { tags: looseArray(envelope.data) };
  },
  async add_riddle_tag(input, context) {
    if (input.id !== undefined && input.name !== undefined)
      throw providerInputError("provide either id or name, not both");
    return {
      riddle: await requestObject(
        `tag/riddle/${encodeURIComponent(requiredInputString(input.riddleUuid, "riddleUuid"))}`,
        context,
        compactObject({ id: input.id, name: input.name }),
      ),
    };
  },
  async remove_riddle_tag(input, context) {
    const envelope = await requestRiddle(
      {
        path: `tag/riddle/${encodeURIComponent(requiredInputString(input.riddleUuid, "riddleUuid"))}/${encodeURIComponent(String(input.tagId))}`,
        method: "DELETE",
      },
      context,
    );
    return { riddle: requireDataObject(envelope.data, "Riddle remove-tag response") };
  },
};
export async function validateRiddleQuizMakerCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const envelope = await requestRiddle(
    { path: "project/list", query: { page: 1, pageSize: 1 } },
    { apiKey, fetcher, signal },
    "validate",
  );
  const projects = Array.isArray(envelope.data) ? envelope.data : looseArray(optionalRecord(envelope.data)?.items);
  const first = optionalRecord(projects[0]);
  return {
    profile: {
      accountId: "api_key",
      displayName: optionalString(first?.name) ?? optionalString(first?.title) ?? "Riddle API Key",
    },
    grantedScopes: [],
    metadata: { apiBaseUrl: riddleQuizMakerApiBaseUrl, validationEndpoint: "/project/list" },
  };
}
async function requestObject(
  path: string,
  context: ApiKeyProviderContext,
  body?: Record<string, unknown>,
  method?: "GET" | "POST",
): Promise<Record<string, unknown>> {
  const envelope = await requestRiddle(
    { path, method: method ?? (body === undefined ? "GET" : "POST"), body },
    context,
  );
  return requireDataObject(envelope.data, "Riddle response");
}
async function requestRiddle(
  request: RiddleRequest,
  context: ApiKeyProviderContext,
  phase: RequestPhase = "execute",
): Promise<Record<string, unknown>> {
  return runProviderRequest({ label: "Riddle", signal: context.signal }, async (signal) => {
    const url = new URL(request.path, riddleQuizMakerApiBaseUrl);
    for (const [key, value] of Object.entries(request.query ?? {}))
      if (value !== undefined) url.searchParams.set(key, String(value));
    const hasBody = request.body !== undefined;
    const headers = new Headers({
      accept: "application/json",
      authorization: `Bearer ${context.apiKey}`,
      "user-agent": providerUserAgent,
    });
    if (hasBody) headers.set("content-type", "application/json");
    const response = await context.fetcher(url, {
      method: request.method ?? "GET",
      headers,
      body: hasBody ? JSON.stringify(request.body) : undefined,
      signal,
    });
    const payload = await readJson(response);
    const envelope = optionalRecord(payload);
    if (!response.ok || envelope?.success === false) throw createError(response, envelope, phase);
    if (!envelope) throw new ProviderRequestError(502, "Riddle returned an invalid response envelope");
    return envelope;
  });
}
async function readJson(response: Response): Promise<unknown> {
  const text = await readProviderTextBody(response, "Riddle Quiz Maker response");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Riddle returned invalid JSON");
  }
}
function createError(
  response: Response,
  envelope: Record<string, unknown> | undefined,
  phase: RequestPhase,
): ProviderRequestError {
  const message =
    optionalString(envelope?.message) ??
    optionalString(envelope?.error) ??
    `Riddle request failed with status ${response.status}`;
  if (response.status === 429 || envelope?.error === "API_RATE_LIMIT_EXCEEDED")
    return new ProviderRequestError(429, message, envelope);
  if (phase === "validate" && 400 <= response.status && response.status < 500)
    return new ProviderRequestError(400, message, envelope);
  if (response.status === 400 || response.status === 404 || response.status === 422)
    return new ProviderRequestError(400, message, envelope);
  return new ProviderRequestError(response.status || 502, message, envelope);
}
function requireDataObject(value: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) throw new ProviderRequestError(502, `${label} data must be an object`);
  return object;
}

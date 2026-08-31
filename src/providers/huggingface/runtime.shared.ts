import type { BearerProviderContext, ProviderFetch } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalIntegerLike,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  ProviderRequestError,
  providerUserAgent,
  setSearchParams,
} from "../provider-runtime.ts";

export const huggingfaceUserinfoUrl = "https://huggingface.co/oauth/userinfo";
export const huggingfaceWhoamiUrl = "https://huggingface.co/api/whoami-v2";
export const huggingfaceHubModelsUrl = "https://huggingface.co/api/models";
export const huggingfaceChatCompletionsUrl = "https://router.huggingface.co/v1/chat/completions";
export const huggingfaceInferenceBaseUrl = "https://router.huggingface.co/hf-inference/models";
export const huggingfaceDefaultEmbeddingModel = "sentence-transformers/all-MiniLM-L6-v2";

export interface HuggingfaceActionContext extends BearerProviderContext {
  authType: "oauth2" | "api_key";
}

export interface HuggingfaceCurrentUser {
  id: string;
  preferredUsername?: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
  profileUrl?: string;
  organizations?: Array<Record<string, unknown>>;
}

interface HuggingfaceRequestJsonInput {
  url: string;
  accessToken: string;
  tokenType?: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
  method?: string;
  body?: Record<string, unknown>;
  query?: Record<string, string | number | boolean | undefined>;
  mode?: "validate" | "execute";
}

export async function readHuggingfaceCurrentUser(context: HuggingfaceActionContext): Promise<HuggingfaceCurrentUser> {
  return context.authType === "api_key"
    ? fetchHuggingfaceTokenCurrentUser(context)
    : fetchHuggingfaceOAuthCurrentUser(context);
}

export async function listHuggingfaceModels(
  input: Record<string, unknown>,
  context: HuggingfaceActionContext,
): Promise<unknown> {
  const payload = await huggingfaceRequestJson<unknown[]>({
    ...context,
    url: huggingfaceHubModelsUrl,
    query: compactObject({
      search: optionalString(input.search),
      author: optionalString(input.author),
      pipeline_tag: optionalString(input.task),
      limit: optionalIntegerLike(input.limit, "limit", (message) => new ProviderRequestError(400, message)),
    }),
  });

  return {
    models: requireProviderArray(payload, "huggingface models").map((item) =>
      normalizeHuggingfaceModelSummary(asRecord(item)),
    ),
  };
}

export async function getHuggingfaceModelInfo(
  input: Record<string, unknown>,
  context: HuggingfaceActionContext,
): Promise<unknown> {
  const modelId = requiredString(input.modelId, "modelId", (message) => new ProviderRequestError(400, message));
  const payload = await huggingfaceRequestJson<Record<string, unknown>>({
    ...context,
    url: `${huggingfaceHubModelsUrl}/${modelId}`,
  });

  return normalizeHuggingfaceModelInfo(payload);
}

export async function generateHuggingfaceChatCompletion(
  input: Record<string, unknown>,
  context: HuggingfaceActionContext,
): Promise<unknown> {
  assertStreamingDisabled(input);

  const payload = await huggingfaceRequestJson<Record<string, unknown>>({
    ...context,
    url: huggingfaceChatCompletionsUrl,
    method: "POST",
    body: compactObject(input),
  });

  return normalizeChatCompletionPayload(payload);
}

export async function generateHuggingfaceEmbeddings(
  input: Record<string, unknown>,
  context: HuggingfaceActionContext,
): Promise<unknown> {
  const model = optionalString(input.model) ?? huggingfaceDefaultEmbeddingModel;
  const payload = await huggingfaceRequestJson<unknown>({
    ...context,
    url: `${huggingfaceInferenceBaseUrl}/${model}`,
    method: "POST",
    body: {
      inputs: requireProviderArray(input.inputs, "huggingface embedding inputs").map((item) => String(item)),
    },
  });

  const embeddings = normalizeEmbeddingVectors(payload);
  return {
    model,
    embeddings,
    dimensions: embeddings[0]?.length ?? 0,
  };
}

export async function huggingfaceRequestJson<T>(input: HuggingfaceRequestJsonInput): Promise<T> {
  const url = new URL(input.url);
  setSearchParams(
    url,
    Object.fromEntries(
      Object.entries(input.query ?? {}).map(([key, value]) => [key, value === undefined ? undefined : String(value)]),
    ),
  );

  const timeout = createProviderTimeout(input.signal);
  let response: Response;
  try {
    response = await input.fetcher(url.toString(), {
      method: input.method ?? (input.body ? "POST" : "GET"),
      headers: compactObject({
        accept: "application/json",
        authorization: `${input.tokenType ?? "Bearer"} ${input.accessToken}`,
        "content-type": input.body ? "application/json" : undefined,
        "user-agent": providerUserAgent,
      }) as HeadersInit,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Hugging Face request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Hugging Face request failed: ${error.message}` : "Hugging Face request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw normalizeHuggingfaceError(response, payload, input.mode ?? "execute");
  }
  if (payload == null) {
    throw new ProviderRequestError(502, "Hugging Face response body is empty");
  }

  return payload as T;
}

export function normalizeHuggingfaceModelSummary(payload: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: requireProviderString(payload.id, "huggingface model id"),
    author: optionalString(payload.author),
    task: optionalString(payload.pipeline_tag) ?? optionalString(payload.task),
    private: optionalBoolean(payload.private),
    gated: optionalGated(payload.gated),
    likes: optionalIntegerLike(payload.likes, "likes", (message) => new ProviderRequestError(502, message)),
    downloads: optionalIntegerLike(payload.downloads, "downloads", (message) => new ProviderRequestError(502, message)),
    lastModified: optionalString(payload.lastModified) ?? optionalString(payload.last_modified),
    createdAt: optionalString(payload.createdAt) ?? optionalString(payload.created_at),
    tags: optionalStringArray(payload.tags),
  });
}

export function normalizeHuggingfaceModelInfo(payload: Record<string, unknown>): Record<string, unknown> {
  const summary = normalizeHuggingfaceModelSummary(payload);

  return compactObject({
    modelId: requireProviderString(payload.id, "huggingface model id"),
    author: summary.author,
    sha: optionalString(payload.sha),
    downloads: summary.downloads,
    likes: summary.likes,
    private: summary.private,
    gated: summary.gated,
    tags: summary.tags,
    task: summary.task,
    createdAt: summary.createdAt,
    lastModified: summary.lastModified,
    libraryName: optionalString(payload.library_name) ?? optionalString(payload.libraryName),
    config: optionalRecord(payload.config),
    cardData: optionalRecord(payload.cardData),
  });
}

export function normalizeHuggingfaceError(
  response: Response,
  payload: unknown,
  mode: "validate" | "execute",
): ProviderRequestError {
  const message = readHuggingfaceErrorMessage(payload, response.status);
  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 400 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status, message, payload);
}

export function readHuggingfaceErrorMessage(
  payload: unknown,
  status: number,
  fallback = `Hugging Face request failed with HTTP ${status}`,
): string {
  const object = optionalRecord(payload);
  if (!object) {
    return fallback;
  }

  const directError = object.error;
  if (typeof directError === "string" && directError.trim()) {
    return directError;
  }
  const nestedError = optionalRecord(directError);
  const nestedMessage = nestedError ? optionalString(nestedError.message) : undefined;
  if (nestedMessage) {
    return nestedMessage;
  }

  return (
    optionalString(object.error_description) ??
    optionalString(object.message) ??
    optionalString(object.detail) ??
    fallback
  );
}

export async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "Hugging Face response object is invalid");
  }
  return record;
}

export function requireProviderArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Missing ${field}`);
  }

  return value;
}

export function requireProviderString(value: unknown, field: string): string {
  const result = optionalString(value);
  if (result) {
    return result;
  }

  throw new ProviderRequestError(502, `Missing ${field}`);
}

export function optionalGated(value: unknown): boolean | string | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  return optionalString(value);
}

export function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  return items.length > 0 ? items : [];
}

function assertStreamingDisabled(input: Record<string, unknown>): void {
  if (input.stream === true) {
    throw new ProviderRequestError(400, "stream=true is not supported by connector actions");
  }
}

async function fetchHuggingfaceOAuthCurrentUser(context: HuggingfaceActionContext): Promise<HuggingfaceCurrentUser> {
  const payload = await huggingfaceRequestJson<Record<string, unknown>>({
    ...context,
    url: huggingfaceUserinfoUrl,
    mode: "validate",
  });

  return normalizeOAuthCurrentUserPayload(payload);
}

async function fetchHuggingfaceTokenCurrentUser(context: HuggingfaceActionContext): Promise<HuggingfaceCurrentUser> {
  const payload = await huggingfaceRequestJson<Record<string, unknown>>({
    ...context,
    url: huggingfaceWhoamiUrl,
    mode: "validate",
  });

  return normalizeTokenCurrentUserPayload(payload);
}

function normalizeOAuthCurrentUserPayload(payload: Record<string, unknown>): HuggingfaceCurrentUser {
  const user: HuggingfaceCurrentUser = {
    id: requireProviderString(payload.sub, "huggingface userinfo sub"),
  };
  const preferredUsername = optionalString(payload.preferred_username);
  if (preferredUsername) user.preferredUsername = preferredUsername;
  const name = optionalString(payload.name);
  if (name) user.name = name;
  const email = optionalString(payload.email);
  if (email) user.email = email;
  const avatarUrl = optionalString(payload.picture);
  if (avatarUrl) user.avatarUrl = avatarUrl;
  const profileUrl = optionalString(payload.profile);
  if (profileUrl) user.profileUrl = profileUrl;
  const organizations = optionalOrganizationList(payload.orgs);
  if (organizations) user.organizations = organizations;
  return user;
}

function normalizeTokenCurrentUserPayload(payload: Record<string, unknown>): HuggingfaceCurrentUser {
  const user: HuggingfaceCurrentUser = {
    id: optionalString(payload.id) ?? requireProviderString(payload.name, "huggingface user name"),
  };
  const preferredUsername = optionalString(payload.name);
  if (preferredUsername) {
    user.preferredUsername = preferredUsername;
    user.profileUrl = `https://huggingface.co/${preferredUsername}`;
  }
  const name = optionalString(payload.fullname) ?? preferredUsername;
  if (name) user.name = name;
  const email = optionalString(payload.email);
  if (email) user.email = email;
  const avatarUrl = optionalString(payload.avatarUrl) ?? optionalString(payload.picture);
  if (avatarUrl) user.avatarUrl = avatarUrl;
  const organizations = optionalOrganizationList(payload.orgs ?? payload.organizations);
  if (organizations) user.organizations = organizations;
  return user;
}

function normalizeChatCompletionPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const choices = requireProviderArray(payload.choices, "huggingface chat choices").map((item) => {
    const choice = asRecord(item);
    const message = asRecord(choice.message);
    return compactObject({
      index:
        optionalIntegerLike(
          choice.index,
          "choice.index",
          (messageText) => new ProviderRequestError(502, messageText),
        ) ?? 0,
      message: compactObject({
        role: optionalString(message.role) ?? "assistant",
        content: nullableString(message.content),
      }),
      finishReason: nullableString(choice.finish_reason) ?? nullableString(choice.finishReason),
    });
  });

  return compactObject({
    id: requireProviderString(payload.id, "huggingface chat completion id"),
    object: requireProviderString(payload.object, "huggingface chat completion object"),
    created: optionalIntegerLike(payload.created, "created", (message) => new ProviderRequestError(502, message)),
    model: requireProviderString(payload.model, "huggingface chat completion model"),
    text: extractFirstChoiceText(choices),
    choices,
    usage: normalizeChatUsage(payload.usage),
  });
}

function normalizeChatUsage(value: unknown): Record<string, unknown> | undefined {
  const usage = optionalRecord(value);
  if (!usage) {
    return undefined;
  }

  return compactObject({
    promptTokens:
      optionalIntegerLike(usage.prompt_tokens, "prompt_tokens", (message) => new ProviderRequestError(502, message)) ??
      optionalIntegerLike(usage.promptTokens, "promptTokens", (message) => new ProviderRequestError(502, message)),
    completionTokens:
      optionalIntegerLike(
        usage.completion_tokens,
        "completion_tokens",
        (message) => new ProviderRequestError(502, message),
      ) ??
      optionalIntegerLike(
        usage.completionTokens,
        "completionTokens",
        (message) => new ProviderRequestError(502, message),
      ),
    totalTokens:
      optionalIntegerLike(usage.total_tokens, "total_tokens", (message) => new ProviderRequestError(502, message)) ??
      optionalIntegerLike(usage.totalTokens, "totalTokens", (message) => new ProviderRequestError(502, message)),
  });
}

function normalizeEmbeddingVectors(payload: unknown): number[][] {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Hugging Face embeddings response is invalid");
  }
  if (payload.length === 0) {
    return [];
  }
  if (payload.every((item) => typeof item === "number")) {
    return [payload.map((item) => Number(item))];
  }

  return payload.map((item) => requireNumberArray(item, "huggingface embedding row"));
}

function requireNumberArray(value: unknown, field: string): number[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "number")) {
    throw new ProviderRequestError(502, `Invalid ${field}`);
  }

  return value.map((item) => Number(item));
}

function extractFirstChoiceText(choices: Array<Record<string, unknown>>): string | undefined {
  const firstChoice = choices[0];
  if (!firstChoice) {
    return undefined;
  }

  const message = optionalRecord(firstChoice.message);
  return optionalString(message?.content);
}

function nullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  return optionalString(value);
}

function optionalOrganizationList(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .map((item) => optionalRecord(item))
    .filter((item): item is Record<string, unknown> => item !== undefined)
    .map((item) =>
      compactObject({
        preferredUsername: optionalString(item.preferred_username) ?? optionalString(item.name),
        name: optionalString(item.fullname) ?? optionalString(item.name),
        avatarUrl: optionalString(item.picture) ?? optionalString(item.avatarUrl),
        profileUrl: optionalString(item.profile),
      }),
    );
}

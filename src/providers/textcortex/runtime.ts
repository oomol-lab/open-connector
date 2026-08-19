import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const textcortexApiBaseUrl = "https://api.textcortex.com/v1";
const textcortexApiOrigin = "https://api.textcortex.com";

type TextcortexRequestPhase = "validate" | "execute";
type TextcortexContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type TextcortexActionHandler = (input: Record<string, unknown>, context: TextcortexContext) => Promise<unknown>;

export async function validateTextcortexCredential(context: TextcortexContext): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const payload = await textcortexRequest({
    path: "/models",
    method: "GET",
    apiKey: context.apiKey,
    context,
    phase: "validate",
  });
  const models = readModelArray(payload);
  const firstModel = models[0];

  return {
    profile: {
      accountId: "api_key",
      displayName: "TextCortex API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: textcortexApiBaseUrl,
      validationEndpoint: "/models",
      modelCount: models.length,
      firstModelId: firstModel?.id,
    }),
  };
}

export const textcortexActionHandlers: ProviderActionHandlers<"textcortex", TextcortexActionHandler> = {
  list_models(_input, context) {
    return listModels(context);
  },
  retrieve_model(input, context) {
    return retrieveModel(input, context);
  },
  create_chat_completion(input, context) {
    return createChatCompletion(input, context);
  },
};

async function listModels(context: TextcortexContext) {
  const payload = await textcortexRequest({
    path: "/models",
    method: "GET",
    apiKey: context.apiKey,
    context,
    phase: "execute",
  });

  return {
    object: optionalString(requiredRecord(payload, "textcortex models response").object) ?? "list",
    models: readModelArray(payload),
  };
}

async function retrieveModel(input: Record<string, unknown>, context: TextcortexContext) {
  const modelId = readRequiredInputString(input.modelId, "modelId");
  const payload = await textcortexRequest({
    path: `/models/${encodeURIComponent(modelId)}`,
    method: "GET",
    apiKey: context.apiKey,
    context,
    phase: "execute",
  });

  return {
    model: normalizeModel(requiredRecord(payload, "textcortex model response")),
  };
}

async function createChatCompletion(input: Record<string, unknown>, context: TextcortexContext) {
  if (input.stream === true) {
    throw new ProviderRequestError(400, "stream=true is not supported by connector actions");
  }

  const payload = await textcortexRequest({
    path: "/chat/completions",
    method: "POST",
    body: buildChatCompletionBody(input),
    apiKey: context.apiKey,
    context,
    phase: "execute",
  });
  const response = requiredRecord(payload, "textcortex chat completion response");

  return {
    id: readRequiredString(response.id, "id"),
    object: readRequiredString(response.object, "object"),
    created: readRequiredInteger(response.created, "created"),
    model: readRequiredString(response.model, "model"),
    choices: readChoiceArray(response.choices),
    usage: optionalRecord(response.usage) ?? null,
    raw: response,
  };
}

function buildChatCompletionBody(input: Record<string, unknown>) {
  return compactObject({
    ...optionalRecord(input.extra),
    model: readRequiredInputString(input.model, "model"),
    messages: input.messages,
    temperature: input.temperature,
    top_p: input.topP,
    max_tokens: input.maxTokens,
    max_completion_tokens: input.maxCompletionTokens,
    presence_penalty: input.presencePenalty,
    frequency_penalty: input.frequencyPenalty,
    stop: input.stop,
    n: input.n,
    stream: input.stream,
    response_format: input.responseFormat,
    tools: input.tools,
    tool_choice: input.toolChoice,
    user: input.user,
  });
}

async function textcortexRequest(input: {
  path: string;
  method: "GET" | "POST";
  body?: Record<string, unknown>;
  apiKey: string;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  phase: TextcortexRequestPhase;
}) {
  const url = new URL(`/v1${input.path}`, textcortexApiOrigin);
  let response: Response;
  let payload: unknown;

  try {
    response = await input.context.fetcher(url, {
      method: input.method,
      headers: textcortexHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.context.signal,
    });
    payload = await readTextcortexPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `textcortex request failed: ${error.message}` : "textcortex request failed",
    );
  }

  if (!response.ok) {
    throw createTextcortexError(response, payload, input.phase);
  }

  return payload;
}

function textcortexHeaders(apiKey: string, hasBody: boolean) {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readTextcortexPayload(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createTextcortexError(response: Response, payload: unknown, phase: TextcortexRequestPhase) {
  const message = readErrorMessage(payload) ?? (response.statusText.trim() || "textcortex request failed");

  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 400 || response.status === 422) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(response.status || 502, message);
}

function readErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const object = optionalRecord(payload);
  const error = optionalRecord(object?.error);
  return optionalString(error?.message) ?? optionalString(object?.message) ?? optionalString(object?.error);
}

function readModelArray(payload: unknown) {
  const object = requiredRecord(payload, "textcortex models response");
  if (!Array.isArray(object.data)) {
    throw new ProviderRequestError(502, "invalid textcortex models response");
  }
  return object.data.map((item) => normalizeModel(requiredRecord(item, "textcortex model")));
}

function normalizeModel(input: Record<string, unknown>) {
  return {
    id: readRequiredString(input.id, "id"),
    object: readRequiredString(input.object, "object"),
    created: readRequiredInteger(input.created, "created"),
    ownedBy: readRequiredString(input.owned_by, "owned_by"),
    raw: input,
  };
}

function readChoiceArray(value: unknown) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "invalid textcortex choices response");
  }

  return value.map((item) => {
    const choice = requiredRecord(item, "textcortex choice");
    return compactObject({
      index: optionalInteger(choice.index) ?? null,
      finishReason: optionalString(choice.finish_reason) ?? null,
      message: optionalRecord(choice.message),
      raw: choice,
    });
  });
}

function readRequiredInputString(value: unknown, fieldName: string) {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function readRequiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string") {
    throw new ProviderRequestError(502, `invalid textcortex ${fieldName} response`);
  }
  return value;
}

function readRequiredInteger(value: unknown, fieldName: string) {
  if (!Number.isInteger(value)) {
    throw new ProviderRequestError(502, `invalid textcortex ${fieldName} response`);
  }
  return value as number;
}

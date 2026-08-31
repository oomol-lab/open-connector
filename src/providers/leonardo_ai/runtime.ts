import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  createProviderTimeout,
  providerInputError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
} from "../provider-runtime.ts";

interface LeonardoAiRequestOptions {
  method?: "GET" | "POST";
  baseUrl?: string;
  path: string;
  body?: Record<string, unknown>;
  mode?: "validate" | "execute";
}

type LeonardoAiActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const leonardoAiApiRootUrl = "https://cloud.leonardo.ai/api/rest";
export const leonardoAiV2ApiBaseUrl: string = `${leonardoAiApiRootUrl}/v2`;
export const leonardoAiValidationPath = "/models";

const leonardoAiV1ApiBaseUrl = `${leonardoAiApiRootUrl}/v1`;
const leonardoAiRequestTimeoutMs = 60_000;

export const leonardoAiActionHandlers: ProviderActionHandlers<"leonardo_ai", LeonardoAiActionHandler> = {
  list_models(_input, context) {
    return listModels(context);
  },
  create_generation(input, context) {
    return createGeneration(input, context);
  },
  get_generation(input, context) {
    return getGeneration(input, context);
  },
};

export async function validateLeonardoAiCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await leonardoAiRequest(
    {
      path: leonardoAiValidationPath,
      mode: "validate",
    },
    { apiKey, fetcher, signal },
  );

  return {
    profile: {
      displayName: "Leonardo.Ai API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      validationEndpoint: `${leonardoAiV2ApiBaseUrl}${leonardoAiValidationPath}`,
    },
  };
}

async function listModels(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = readObjectPayload(
    await leonardoAiRequest(
      {
        path: "/models",
      },
      context,
    ),
    "models",
  );
  const models = objectArray(
    payload.productionApiAvailableModels,
    "Leonardo.Ai productionApiAvailableModels",
    providerResponseError,
  ).map(validateLeonardoAiModel);
  return { models, raw: payload };
}

async function createGeneration(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const model = requiredString(input.model, "model", providerInputError);
  const parameters = requiredRecord(input.parameters, "parameters", providerInputError);
  const payload = readObjectPayload(
    await leonardoAiRequest(
      {
        method: "POST",
        path: "/generations",
        body: compactObject({
          model,
          parameters,
          public: input.public,
        }),
      },
      context,
    ),
    "generation creation",
  );
  const generationId = optionalString(payload.generationId);
  if (!generationId) {
    throw new ProviderRequestError(502, "Leonardo.Ai generation creation response must include generationId.");
  }
  const apiCreditCost = payload.apiCreditCost;
  if (apiCreditCost !== undefined && apiCreditCost !== null && !Number.isInteger(apiCreditCost)) {
    throw new ProviderRequestError(502, "Leonardo.Ai apiCreditCost must be an integer when provided.", payload);
  }
  return {
    generationId,
    apiCreditCost: typeof apiCreditCost === "number" ? apiCreditCost : null,
    raw: payload,
  };
}

async function getGeneration(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const generationId = encodePathSegment(requiredString(input.generationId, "generationId", providerInputError));
  const payload = readObjectPayload(
    await leonardoAiRequest(
      {
        baseUrl: leonardoAiV1ApiBaseUrl,
        path: `/generations/${generationId}`,
      },
      context,
    ),
    "generation",
  );
  const generation = validateLeonardoAiGeneration(readGenerationPayload(payload));
  return {
    generation,
    status: optionalString(generation.status) ?? null,
    images: readGeneratedImages(generation),
    raw: payload,
  };
}

async function leonardoAiRequest(
  options: LeonardoAiRequestOptions,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<unknown> {
  const url = new URL(`${options.baseUrl ?? leonardoAiV2ApiBaseUrl}${options.path}`);
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${context.apiKey}`,
    "user-agent": providerUserAgent,
  });
  const init: RequestInit = {
    method: options.method ?? "GET",
    headers,
  };
  if (options.body) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(options.body);
  }

  const timeout = createProviderTimeout(context.signal, leonardoAiRequestTimeoutMs);
  try {
    const response = await context.fetcher(url, { ...init, signal: timeout.signal });
    const payload = await readLeonardoAiResponse(response);
    if (!response.ok) {
      throw mapLeonardoAiError(response.status, payload, options.mode ?? "execute");
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Leonardo.Ai request timed out.");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Leonardo.Ai request failed: ${error.message}` : "Leonardo.Ai request failed.",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readLeonardoAiResponse(response: Response): Promise<unknown> {
  return readProviderJsonBody(response, {
    emptyBody: {},
    invalidJsonMessage: "Leonardo.Ai response was not valid JSON.",
    invalidJsonFallback: (text) => ({ error: text }),
  });
}

function mapLeonardoAiError(status: number, payload: unknown, mode: "validate" | "execute"): ProviderRequestError {
  const payloadRecord = optionalRecord(payload);
  const message =
    optionalString(payloadRecord?.error) ??
    optionalString(payloadRecord?.message) ??
    optionalString(payloadRecord?.detail) ??
    `Leonardo.Ai request failed with status ${status}.`;

  if (status === 401 || status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : 401, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? status : 502, message, payload);
}

function readObjectPayload(value: unknown, label: string): Record<string, unknown> {
  try {
    return requiredRecord(value, `Leonardo.Ai ${label} response`);
  } catch {
    throw new ProviderRequestError(502, `Leonardo.Ai ${label} response must be an object.`);
  }
}

function readGenerationPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const generationByPk = optionalRecord(payload.generations_by_pk);
  if (generationByPk) {
    return generationByPk;
  }
  const data = optionalRecord(payload.data);
  if (data) {
    return optionalRecord(data.object) ?? data;
  }
  return payload;
}

function validateLeonardoAiModel(model: Record<string, unknown>): Record<string, unknown> {
  if (model.id !== undefined) {
    requiredString(model.id, "Leonardo.Ai model id", providerResponseError);
  }
  if (model.model !== undefined) {
    requiredString(model.model, "Leonardo.Ai model slug", providerResponseError);
  }
  if (model.name !== undefined) {
    requiredString(model.name, "Leonardo.Ai model name", providerResponseError);
  }
  if (model.description !== undefined && typeof model.description !== "string") {
    throw new ProviderRequestError(502, "Leonardo.Ai model description must be a string when provided.", model);
  }
  if (model.parameters !== undefined && !optionalRecord(model.parameters)) {
    throw new ProviderRequestError(502, "Leonardo.Ai model parameters must be an object when provided.", model);
  }
  return model;
}

function validateLeonardoAiGeneration(generation: Record<string, unknown>): Record<string, unknown> {
  if (generation.id !== undefined) {
    requiredString(generation.id, "Leonardo.Ai generation id", providerResponseError);
  }
  if (generation.status !== undefined && typeof generation.status !== "string") {
    throw new ProviderRequestError(502, "Leonardo.Ai generation status must be a string when provided.", generation);
  }
  if (generation.prompt !== undefined && typeof generation.prompt !== "string") {
    throw new ProviderRequestError(502, "Leonardo.Ai generation prompt must be a string when provided.", generation);
  }
  if (generation.createdAt !== undefined && typeof generation.createdAt !== "string") {
    throw new ProviderRequestError(
      502,
      "Leonardo.Ai generation creation timestamp must be a string when provided.",
      generation,
    );
  }
  if (generation.updatedAt !== undefined && typeof generation.updatedAt !== "string") {
    throw new ProviderRequestError(
      502,
      "Leonardo.Ai generation update timestamp must be a string when provided.",
      generation,
    );
  }
  return generation;
}

function readGeneratedImages(generation: Record<string, unknown>): Array<Record<string, unknown>> {
  const images = generation.images ?? generation.generated_images;
  if (!Array.isArray(images)) {
    return [];
  }
  return images.flatMap((image) => {
    const imageObject = optionalRecord(image);
    if (!imageObject) {
      return [];
    }
    return [
      {
        id: optionalString(imageObject.id) ?? null,
        url: optionalString(imageObject.url) ?? null,
        nsfw: typeof imageObject.nsfw === "boolean" ? imageObject.nsfw : null,
        public: typeof imageObject.public === "boolean" ? imageObject.public : null,
        raw: imageObject,
      },
    ];
  });
}

import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-executors.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import {
  looseArray,
  optionalRawString,
  optionalRecord,
  optionalString,
  requiredNumber,
  requiredRawString,
  requiredRecord,
} from "../../core/cast.ts";
import {
  providerInputError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { typesafeAiApiBaseUrl, typesafeAiDefaultModel } from "./constants.ts";

type TypesafeAiRequestPhase = "validate" | "execute";
type TypesafeAiActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const typesafeAiActionHandlers: ProviderActionHandlers<"typesafe_ai", TypesafeAiActionHandler> = {
  async list_models(_input, context) {
    const payload = await requestTypesafeAiJson("/v1/models", { method: "GET" }, context, "execute");
    return { models: parseModels(payload) };
  },
  async evaluate(input, context) {
    const questions = requiredRecord(input.questions, "questions", providerInputError);
    const payload = await requestTypesafeAiJson(
      "/v1/systemone",
      {
        method: "POST",
        body: {
          state: input.state,
          model: optionalString(input.model) ?? typesafeAiDefaultModel,
          questions,
        },
      },
      context,
      "execute",
    );
    return parseEvaluation(payload, questions);
  },
};

export async function validateTypesafeAiCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestTypesafeAiJson("/v1/models", { method: "GET" }, { apiKey, fetcher, signal }, "validate");
  const models = parseModels(payload);
  return {
    profile: { accountId: "api_key", displayName: "TypeSafe AI API Key" },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: typesafeAiApiBaseUrl,
      validationEndpoint: "/v1/models",
      availableModels: models.map((model) => model.name),
    },
  };
}

interface TypesafeAiRequestOptions {
  method: "GET" | "POST";
  body?: Record<string, unknown>;
}

async function requestTypesafeAiJson(
  path: string,
  options: TypesafeAiRequestOptions,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: TypesafeAiRequestPhase,
): Promise<unknown> {
  return runProviderRequest({ label: "TypeSafe AI", signal: context.signal }, async (signal) => {
    const headers = new Headers({
      accept: "application/json",
      authorization: `Bearer ${context.apiKey}`,
      "user-agent": providerUserAgent,
    });
    if (options.body) {
      headers.set("content-type", "application/json");
    }
    const response = await context.fetcher(new URL(path, typesafeAiApiBaseUrl), {
      method: options.method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: undefined,
      invalidJsonMessage: "TypeSafe AI returned invalid JSON",
      invalidJsonFallback: response.ok ? undefined : (text) => text,
    });
    if (!response.ok) {
      throw createTypesafeAiError(response, payload, phase);
    }
    return payload;
  });
}

function parseModels(payload: unknown): Array<{ name: string; description: string; releaseDate: string }> {
  const body = requiredResponseRecord(payload, "TypeSafe AI models response");
  if (!Array.isArray(body.models)) {
    throw providerResponseError("TypeSafe AI models response must include a models array");
  }

  return body.models.map((value, index) => {
    const model = optionalRecord(value);
    const name = optionalString(model?.name);
    const description = optionalRawString(model?.description);
    const releaseDate = optionalString(model?.release_date);
    if (!name || description === undefined || !releaseDate) {
      throw providerResponseError(`TypeSafe AI model at index ${index} is malformed`);
    }
    return { name, description, releaseDate };
  });
}

function parseEvaluation(payload: unknown, questions: Record<string, unknown>): Record<string, unknown> {
  const body = requiredResponseRecord(payload, "TypeSafe AI evaluation response");
  const model = optionalString(body.model);
  const answers = optionalRecord(body.answers);
  const usage = optionalRecord(body.usage);
  if (!model || !answers || !usage) {
    throw providerResponseError("TypeSafe AI evaluation response is missing model, answers, or usage");
  }
  const inputTokens = requireTokenCount(usage.input_tokens, "usage.input_tokens");
  const outputTokens = requireTokenCount(usage.output_tokens, "usage.output_tokens");
  for (const [questionId, questionValue] of Object.entries(questions)) {
    const question = requiredResponseRecord(questionValue, `TypeSafe question ${questionId}`);
    const answer = requiredResponseRecord(answers[questionId], `TypeSafe AI answer for question ${questionId}`);
    assertAnswerShape(answer, question, questionId);
  }

  return {
    model,
    answers,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    },
  };
}

function requireTokenCount(value: unknown, fieldName: string): number {
  const count = requiredNumber(value, `TypeSafe AI ${fieldName}`, providerResponseError);
  if (!Number.isInteger(count) || count < 0) {
    throw providerResponseError(`TypeSafe AI ${fieldName} must be a non-negative integer`);
  }
  return count;
}

function assertAnswerShape(
  answer: Record<string, unknown>,
  question: Record<string, unknown>,
  questionId: string,
): void {
  const label = `TypeSafe AI answer for question ${questionId}`;
  const expectedType = requiredRawString(question.type, `TypeSafe question ${questionId}.type`, providerResponseError);
  const answerType = requiredRawString(answer.type, `${label}.type`, providerResponseError);
  if (answerType !== expectedType) {
    throw providerResponseError(`${label}.type must match the ${expectedType} question type`);
  }
  if (answerType === "noul") {
    requiredNumber(answer.noul, `${label}.noul`, providerResponseError);
    return;
  }
  if (answerType === "choice") {
    requiredRawString(answer.choice, `${label}.choice`, providerResponseError);
    requiredNumber(answer.confidence, `${label}.confidence`, providerResponseError);
    requiredResponseRecord(answer.probabilities, `${label}.probabilities`);
    return;
  }
  if (answerType === "score") {
    requiredNumber(answer.score, `${label}.score`, providerResponseError);
    requiredNumber(answer.confidence, `${label}.confidence`, providerResponseError);
    requiredResponseRecord(answer.legend, `${label}.legend`);
    requiredResponseRecord(answer.probabilities, `${label}.probabilities`);
    return;
  }
  throw providerResponseError(`${label}.type is unsupported: ${answerType}`);
}

function createTypesafeAiError(
  response: Response,
  payload: unknown,
  phase: TypesafeAiRequestPhase,
): ProviderRequestError {
  const message = extractTypesafeAiErrorMessage(payload) ?? `TypeSafe AI request failed with status ${response.status}`;

  if (response.status === 429 || response.status === 529) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status === 401 && phase === "validate") {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 400 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractTypesafeAiErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload || undefined;
  }
  const body = optionalRecord(payload);
  if (!body) {
    return undefined;
  }

  const error = optionalRecord(body.error);
  const detail = optionalRecord(body.detail);
  return (
    optionalString(body.error) ??
    optionalString(error?.message) ??
    optionalString(body.message) ??
    optionalString(body.detail) ??
    optionalString(detail?.message) ??
    describeValidationErrors(looseArray(body.detail))
  );
}

function describeValidationErrors(errors: unknown[]): string | undefined {
  const descriptions = errors.flatMap((value) => {
    const error = optionalRecord(value);
    const message = optionalString(error?.msg);
    if (!message) {
      return [];
    }
    const location = looseArray(error?.loc)
      .filter((part) => part !== "body")
      .map(String)
      .join(".");
    return [location ? `${location}: ${message}` : message];
  });
  return descriptions.length > 0 ? descriptions.join("; ") : undefined;
}

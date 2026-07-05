import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { DadataRuActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "dadata_ru";
const dadataRuApiBaseUrl = "https://suggestions.dadata.ru/suggestions/api/4_1/rs";
const dadataRuValidationQuery = "\u043c\u043e\u0441\u043a\u0432\u0430";

type DadataRuActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type DadataRuActionHandler = (input: Record<string, unknown>, context: DadataRuActionContext) => Promise<unknown>;

const dadataRuEndpointByAction: Record<DadataRuActionName, string> = {
  suggest_address: "/suggest/address",
  suggest_party: "/suggest/party",
  suggest_bank: "/suggest/bank",
  suggest_fio: "/suggest/fio",
  suggest_email: "/suggest/email",
};

export const dadataRuActionHandlers: Record<DadataRuActionName, DadataRuActionHandler> = {
  suggest_address(input, context) {
    return dadataRuSuggest("suggest_address", input, context);
  },
  suggest_party(input, context) {
    return dadataRuSuggest("suggest_party", input, context);
  },
  suggest_bank(input, context) {
    return dadataRuSuggest("suggest_bank", input, context);
  },
  suggest_fio(input, context) {
    return dadataRuSuggest("suggest_fio", input, context);
  },
  suggest_email(input, context) {
    return dadataRuSuggest("suggest_email", input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, dadataRuActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context: DadataRuActionContext = {
      apiKey: input.apiKey,
      fetcher,
      signal,
    };
    const payload = await dadataRuRequest(
      "/suggest/address",
      {
        query: dadataRuValidationQuery,
        count: 1,
      },
      context,
      "validate",
    );

    return {
      profile: {
        accountId: "dadata-api-key",
        displayName: "DaData.ru API Key",
        grantedScopes: [],
      },
      metadata: {
        apiBaseUrl: dadataRuApiBaseUrl,
        validationEndpoint: "/suggest/address",
        validatedSuggestion: firstSuggestionValue(payload),
      },
    } satisfies CredentialValidationResult;
  },
};

async function dadataRuSuggest(
  actionName: DadataRuActionName,
  input: Record<string, unknown>,
  context: DadataRuActionContext,
): Promise<unknown> {
  return dadataRuRequest(
    dadataRuEndpointByAction[actionName],
    buildDadataRuSuggestionBody(actionName, input),
    context,
    "execute",
  );
}

function buildDadataRuSuggestionBody(
  actionName: DadataRuActionName,
  input: Record<string, unknown>,
): Record<string, unknown> {
  return compactObject({
    query: requiredString(input.query, "query", providerInputError),
    count: optionalInteger(input.count),
    language: actionName === "suggest_address" ? optionalString(input.language) : undefined,
  });
}

async function dadataRuRequest(
  path: string,
  body: Record<string, unknown>,
  context: DadataRuActionContext,
  phase: "validate" | "execute",
): Promise<unknown> {
  const url = new URL(`${dadataRuApiBaseUrl}${path}`);
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Token ${context.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(body),
      signal: context.signal,
    });
    payload = await readDadataRuPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `DaData.ru request failed: ${error.message}` : "DaData.ru request failed",
    );
  }

  if (!response.ok) {
    throw createDadataRuError(response, payload, phase);
  }

  return payload;
}

async function readDadataRuPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createDadataRuError(
  response: Response,
  payload: unknown,
  phase: "validate" | "execute",
): ProviderRequestError {
  const message = extractDadataRuErrorMessage(payload) ?? response.statusText ?? "DaData.ru request failed";
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (response.status === 400 || response.status === 413 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractDadataRuErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    return trimmed || undefined;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  for (const key of ["message", "reason", "error", "detail"]) {
    const value = optionalString(record[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function firstSuggestionValue(payload: unknown): string | undefined {
  const suggestions = optionalRecord(payload)?.suggestions;
  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    return undefined;
  }
  return optionalString(optionalRecord(suggestions[0])?.value);
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

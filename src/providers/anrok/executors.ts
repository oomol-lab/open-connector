import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const anrokApiBaseUrl = "https://api.anrok.com";
const anrokCredentialHelpUrl = "https://app.anrok.com/-/api-keys";
const anrokValidationPath = "/v1/seller/productTaxCategories/list";
const anrokDefaultRequestTimeoutMs = 30_000;

type AnrokPhase = "validate" | "execute";
type AnrokActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const anrokActionHandlers: ProviderActionHandlers<"anrok", AnrokActionHandler> = {
  async list_customers(input, context) {
    return requestAnrokJson({
      context,
      path: "/v1/seller/customers/list",
      body: compactObject({
        cursor: input.cursor,
        limit: input.limit,
      }),
      phase: "execute",
    });
  },

  async get_customer(input, context) {
    const customer = await requestAnrokJson({
      context,
      path: `/v1/seller/customers/id:${encodePathSegment(requiredString(input.customerId, "customerId", providerInputError))}/get`,
      phase: "execute",
    });
    return requireObjectPayload(customer, "Anrok customer response");
  },

  async list_transactions(input, context) {
    rejectCursorAndFilter(input);
    return requestAnrokJson({
      context,
      path: "/v1/seller/transactions/list",
      body: compactObject({
        cursor: input.cursor,
        limit: input.limit,
        filter: input.filter,
      }),
      phase: "execute",
    });
  },

  async list_filings(input, context) {
    rejectCursorAndFilter(input);
    return requestAnrokJson({
      context,
      path: "/v1/seller/filings/list",
      body: compactObject({
        cursor: input.cursor,
        limit: input.limit,
        filter: input.filter,
      }),
      phase: "execute",
    });
  },

  async get_product(input, context) {
    const product = await requestAnrokJson({
      context,
      path: `/v1/seller/products/externalId:${encodePathSegment(requiredString(input.externalId, "externalId", providerInputError))}/get`,
      phase: "execute",
    });
    return requireObjectPayload(product, "Anrok product response");
  },

  async list_product_tax_categories(_input, context) {
    return requestAnrokJson({
      context,
      path: "/v1/seller/productTaxCategories/list",
      phase: "execute",
    });
  },

  async list_product_mappings(input, context) {
    const mappings = await requestAnrokJson({
      context,
      path: `/v1/seller/integrations/id:${encodePathSegment(requiredString(input.integrationId, "integrationId", providerInputError))}/productIdMapping/list`,
      phase: "execute",
    });
    return requireArrayPayload(mappings, "Anrok product mappings response");
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("anrok", anrokActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestAnrokJson({
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      path: anrokValidationPath,
      phase: "validate",
    });

    return {
      profile: {
        accountId: "api_key",
        displayName: "Anrok API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: anrokApiBaseUrl,
        validationEndpoint: anrokValidationPath,
        credentialHelpUrl: anrokCredentialHelpUrl,
      },
    };
  },
};

async function requestAnrokJson(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  phase: AnrokPhase;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, anrokDefaultRequestTimeoutMs);

  try {
    const response = await input.context.fetcher(buildAnrokUrl(input.path), {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(input.body ?? {}),
      signal: timeout.signal,
    });
    const payload = await readAnrokPayload(response);

    if (!response.ok) {
      throw createAnrokError(response.status, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Anrok request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Anrok request failed: ${error.message}` : "Anrok request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildAnrokUrl(path: string): URL {
  const relativePath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(relativePath, `${anrokApiBaseUrl}/`);
}

async function readAnrokPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) {
      return text;
    }
    throw new ProviderRequestError(502, "invalid Anrok JSON response");
  }
}

function createAnrokError(status: number, payload: unknown, phase: AnrokPhase): ProviderRequestError {
  const message = extractAnrokErrorMessage(payload) ?? `Anrok request failed with status ${status}`;

  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractAnrokErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.detail) ??
    optionalString(record.type)
  );
}

function rejectCursorAndFilter(input: Record<string, unknown>): void {
  if (Object.hasOwn(input, "cursor") && Object.hasOwn(input, "filter")) {
    throw new ProviderRequestError(400, "cursor and filter cannot both be provided.");
  }
}

function requireObjectPayload(payload: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `${label} is invalid`);
  }

  return record;
}

function requireArrayPayload(payload: unknown, label: string): unknown[] {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `${label} is invalid`);
  }

  return payload;
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

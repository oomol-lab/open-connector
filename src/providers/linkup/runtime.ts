import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const linkupApiBaseUrl = "https://api.linkup.so";
const linkupValidationPath = "/v1/credits/balance";
const linkupDefaultRequestTimeoutMs = 30_000;

type LinkupActionContext = ApiKeyProviderContext;
type LinkupActionHandler = (input: Record<string, unknown>, context: LinkupActionContext) => Promise<unknown>;

interface LinkupRequestInput {
  method: "GET" | "POST";
  path: string;
  body?: Record<string, unknown>;
  mode: "validate" | "execute";
}

export const linkupActionHandlers: ProviderActionHandlers<"linkup", LinkupActionHandler> = {
  get_credits_balance(_input, context) {
    return linkupRequest(context, {
      method: "GET",
      path: linkupValidationPath,
      mode: "execute",
    });
  },
  search_results(input, context) {
    validateDateRange(input);
    return linkupRequest(context, {
      method: "POST",
      path: "/v1/search",
      body: {
        ...input,
        outputType: "searchResults",
      },
      mode: "execute",
    });
  },
  search_answer(input, context) {
    validateDateRange(input);
    return linkupRequest(context, {
      method: "POST",
      path: "/v1/search",
      body: {
        ...input,
        outputType: "sourcedAnswer",
      },
      mode: "execute",
    });
  },
  async search_structured_data(input, context) {
    validateDateRange(input);
    const structuredOutputSchema = validateStructuredOutputSchema(String(input.structuredOutputSchema ?? ""));
    const payload = await linkupRequest(context, {
      method: "POST",
      path: "/v1/search",
      body: {
        ...input,
        structuredOutputSchema,
        outputType: "structured",
      },
      mode: "execute",
    });

    const record = optionalRecord(payload);
    if (!record) {
      throw new ProviderRequestError(502, "Linkup structured response must be an object");
    }
    if ("data" in record) {
      return record;
    }
    return {
      data: record,
    };
  },
  fetch_webpage(input, context) {
    return linkupRequest(context, {
      method: "POST",
      path: "/v1/fetch",
      body: input,
      mode: "execute",
    });
  },
};

export async function validateLinkupCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await linkupRequest(
    {
      apiKey,
      fetcher,
      signal,
    },
    {
      method: "GET",
      path: linkupValidationPath,
      mode: "validate",
    },
  );

  const response = optionalRecord(payload);
  if (!response) {
    throw new ProviderRequestError(502, "Linkup balance response must be an object");
  }
  const balance = optionalNumber(response.balance);

  return {
    profile: {
      accountId: "linkup",
      displayName: "Linkup API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: linkupApiBaseUrl,
      validationEndpoint: linkupValidationPath,
      balance,
    }),
  };
}

async function linkupRequest(
  context: Pick<LinkupActionContext, "apiKey" | "fetcher" | "signal">,
  input: LinkupRequestInput,
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, linkupDefaultRequestTimeoutMs);
  try {
    const response = await context.fetcher(new URL(input.path, linkupApiBaseUrl), {
      method: input.method,
      headers: {
        authorization: `Bearer ${context.apiKey}`,
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: input.body ? JSON.stringify(compactObject(input.body)) : undefined,
      signal: timeout.signal,
    });
    const payload = await readLinkupPayload(response, response.ok);
    if (!response.ok) {
      throw buildLinkupError(response, payload, input.mode);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(
        504,
        `Linkup ${input.path} request timed out after ${Math.max(1, Math.ceil(linkupDefaultRequestTimeoutMs / 1000))} seconds`,
      );
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Linkup request failed: ${error.message}` : "Linkup request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readLinkupPayload(response: Response, requireJson: boolean): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (requireJson) {
      throw new ProviderRequestError(502, "Linkup returned invalid JSON");
    }
    return text;
  }
}

function buildLinkupError(response: Response, payload: unknown, mode: "validate" | "execute"): ProviderRequestError {
  const message = extractLinkupErrorMessage(payload) ?? `Linkup request failed with ${response.status}`;
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (mode === "validate" && [400, 401, 403].includes(response.status)) {
    return new ProviderRequestError(400, message);
  }
  if (mode === "execute" && [401, 403].includes(response.status)) {
    return new ProviderRequestError(401, message);
  }
  if (mode === "execute" && response.status === 400) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(response.status || 502, message);
}

function extractLinkupErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }
  const response = optionalRecord(payload);
  const error = optionalRecord(response?.error);
  if (error) {
    const direct = optionalString(error.message) ?? optionalString(error.code) ?? optionalString(response?.message);
    if (direct) {
      return direct;
    }
    if (Array.isArray(error.details)) {
      for (const detail of error.details) {
        const message = optionalString(optionalRecord(detail)?.message);
        if (message) {
          return message;
        }
      }
    }
  }
  return optionalString(response?.message);
}

function validateStructuredOutputSchema(value: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ProviderRequestError(400, "structuredOutputSchema must be valid JSON");
  }
  const schemaObject = optionalRecord(parsed);
  if (!schemaObject || schemaObject.type !== "object") {
    throw new ProviderRequestError(400, "structuredOutputSchema must be a JSON object schema");
  }
  return value;
}

function validateDateRange(input: Record<string, unknown>): void {
  const fromDate = optionalString(input.fromDate);
  const toDate = optionalString(input.toDate);
  if (fromDate && toDate && fromDate > toDate) {
    throw new ProviderRequestError(400, "fromDate must be before or equal to toDate");
  }
}

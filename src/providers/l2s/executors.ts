import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "l2s";
const l2sApiBaseUrl = "https://api.l2s.is";
const l2sValidationPath = "/user/setting";
const l2sDefaultRequestTimeoutMs = 30_000;

type L2sRequestMode = "validate" | "execute";
type L2sActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface L2sRequestInput {
  method: "GET" | "POST" | "PUT";
  path: string;
  body?: Record<string, unknown>;
  mode: L2sRequestMode;
}

interface L2sEnvelope {
  ok: boolean;
  response: {
    message: string;
    data?: unknown;
  };
}

export const l2sActionHandlers: ProviderActionHandlers<"l2s", L2sActionHandler> = {
  shorten_url(input, context) {
    return l2sRequest(context, {
      method: "POST",
      path: "/url",
      body: buildL2sUrlBody(input),
      mode: "execute",
    });
  },
  get_url_details(input, context) {
    return l2sRequest(context, {
      method: "GET",
      path: `/url/${encodeURIComponent(requiredString(input.id, "id", inputError))}`,
      mode: "execute",
    });
  },
  update_url_details(input, context) {
    return l2sRequest(context, {
      method: "PUT",
      path: `/url/${encodeURIComponent(requiredString(input.id, "id", inputError))}`,
      body: buildL2sUrlBody(input),
      mode: "execute",
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, l2sActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateL2sCredential({
      apiKey: input.apiKey,
      fetcher,
      signal,
    });
  },
};

async function validateL2sCredential(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<CredentialValidationResult> {
  const payload = await l2sRequest(context, {
    method: "GET",
    path: l2sValidationPath,
    mode: "validate",
  });
  const response = requireL2sEnvelope(payload);
  if (response.ok !== true) {
    throw new ProviderRequestError(400, response.response.message);
  }
  const data = optionalRecord(response.response.data);

  return {
    profile: {
      accountId: "l2s",
      displayName: "L2S API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: l2sApiBaseUrl,
      validationEndpoint: l2sValidationPath,
      message: response.response.message,
      data,
    }),
  };
}

async function l2sRequest(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  input: L2sRequestInput,
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, l2sDefaultRequestTimeoutMs);

  try {
    const response = await context.fetcher(new URL(input.path, l2sApiBaseUrl), {
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

    const payload = await readL2sPayload(response, response.ok);
    if (!response.ok) {
      throw buildL2sError(response, payload, input.mode);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(
        504,
        `L2S ${input.path} request timed out after ${Math.max(
          1,
          Math.ceil(l2sDefaultRequestTimeoutMs / 1000),
        )} seconds`,
      );
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `L2S request failed: ${error.message}` : "L2S request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readL2sPayload(response: Response, requireJson: boolean): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (requireJson) {
      throw new ProviderRequestError(502, "L2S returned invalid JSON");
    }
    return text;
  }
}

function buildL2sError(response: Response, payload: unknown, mode: L2sRequestMode): ProviderRequestError {
  const message = extractL2sErrorMessage(payload) ?? `L2S request failed with ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (mode === "validate" && (response.status === 400 || response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (mode === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractL2sErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const response = optionalRecord(record.response);
  if (response) {
    return optionalString(response.message) ?? optionalString(response.error) ?? optionalString(record.message);
  }

  return optionalString(record.message);
}

function requireL2sEnvelope(payload: unknown): L2sEnvelope {
  const record = optionalRecord(payload);
  const response = optionalRecord(record?.response);
  const message = optionalString(response?.message);
  if (!record || typeof record.ok !== "boolean" || !response || !message) {
    throw new ProviderRequestError(502, "L2S response must be a success envelope object");
  }

  return {
    ok: record.ok,
    response: {
      message,
      data: response.data,
    },
  };
}

function buildL2sUrlBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    url: optionalString(input.url),
    customKey: optionalString(input.customKey),
    utmSource: optionalString(input.utmSource),
    utmMedium: optionalString(input.utmMedium),
    utmCampaign: optionalString(input.utmCampaign),
    utmTerm: optionalString(input.utmTerm),
    utmContent: optionalString(input.utmContent),
    title: optionalString(input.title),
    tags: normalizeTagArray(input.tags),
  });
}

function normalizeTagArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const tags = value.map((item) => optionalString(item)).filter((item): item is string => Boolean(item));
  return tags.length > 0 ? tags : undefined;
}

function inputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

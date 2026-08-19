import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  objectArray,
  optionalInteger,
  optionalRecord,
  optionalString,
  positiveInteger,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "drimify";
const drimifyApiBaseUrl = "https://endpoint.drimify.com";

type DrimifyRequestPhase = "validate" | "execute";
type DrimifyQueryValue = number | string | undefined;

const handlers: ProviderActionHandlers<"drimify", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async list_app_data_collections(input, context) {
    const page = readPositiveInteger(input.page, "page") ?? 1;
    const itemsPerPage = readItemsPerPage(input.itemsPerPage);
    const app = optionalString(input.app);
    const createdSince = optionalString(input.createdSince);
    if (createdSince && !app) {
      throw new ProviderRequestError(400, "app is required when createdSince is provided.");
    }

    const payload = await requestDrimify({
      path: "/api/app_data_collections",
      query: {
        page,
        itemsPerPage,
        app,
        sessionId: optionalString(input.sessionId),
        createdSince,
      },
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    const records = objectArray(payload, "Drimify response", providerResponseError);
    return {
      records,
      count: records.length,
      page,
      itemsPerPage,
    };
  },

  async get_app_data_collection(input, context) {
    const id = requiredString(input.id, "id", providerInputError);
    const payload = await requestDrimify({
      path: `/api/app_data_collections/${encodeURIComponent(id)}`,
      query: {},
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return {
      record: requiredRecord(payload, "Drimify response", providerResponseError),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: drimifyApiBaseUrl,
  auth: { type: "api_key_header", name: "X-AUTH-TOKEN" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestDrimify({
      path: "/api/app_data_collections",
      query: { itemsPerPage: 1 },
      apiKey: input.apiKey,
      fetcher,
      signal,
      phase: "validate",
    });
    return {
      profile: {
        accountId: "api_key",
        displayName: "Drimify API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: drimifyApiBaseUrl,
        validationEndpoint: "/api/app_data_collections",
      },
    };
  },
};

interface DrimifyRequestInput {
  path: string;
  query: Record<string, DrimifyQueryValue>;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: DrimifyRequestPhase;
}

async function requestDrimify(input: DrimifyRequestInput): Promise<unknown> {
  const url = new URL(input.path, drimifyApiBaseUrl);
  for (const [key, value] of Object.entries(input.query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "X-AUTH-TOKEN": input.apiKey,
      },
      signal: input.signal,
    });
    payload = await readDrimifyPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Drimify request failed: ${error.message}` : "Drimify request failed",
    );
  }

  if (!response.ok) {
    throw createDrimifyError(response, payload, input.phase);
  }
  return payload;
}

async function readDrimifyPayload(response: Response): Promise<unknown> {
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

function createDrimifyError(response: Response, payload: unknown, phase: DrimifyRequestPhase): ProviderRequestError {
  const message = extractDrimifyErrorMessage(payload) || response.statusText || "Drimify request failed";
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractDrimifyErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }
  const record = optionalRecord(payload);
  return optionalString(record?.detail) ?? optionalString(record?.title) ?? optionalString(record?.message);
}

function readItemsPerPage(value: unknown): number {
  const parsed = optionalInteger(value) ?? 500;
  if (parsed < 0 || parsed > 500) {
    throw new ProviderRequestError(400, "itemsPerPage must be between 0 and 500");
  }
  return parsed;
}

function readPositiveInteger(value: unknown, fieldName: string): number | undefined {
  return value === undefined ? undefined : positiveInteger(value, fieldName, providerInputError);
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function providerResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}

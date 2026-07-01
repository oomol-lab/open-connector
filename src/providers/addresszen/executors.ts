import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { AddresszenActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "addresszen";
const addresszenApiBaseUrl = "https://api.addresszen.com";
const addresszenApiVersion = "v1";

type AddresszenRequestPhase = "validate" | "execute";

interface AddresszenActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type AddresszenActionHandler = (input: Record<string, unknown>, context: AddresszenActionContext) => Promise<unknown>;

export const addresszenActionHandlers: Record<AddresszenActionName, AddresszenActionHandler> = {
  async get_key_availability(_input, context) {
    return requestKeyAvailability(context, "execute");
  },
  async find_address(input, context) {
    return requestAddresszen(
      buildAddresszenUrl("/autocomplete/addresses", context.apiKey, {
        query: optionalString(input.query),
        context: optionalString(input.context),
        limit: optionalInteger(input.limit),
        country: optionalString(input.country),
      }),
      context,
      "execute",
    );
  },
  async retrieve_address_usa(input, context) {
    const address = optionalString(input.address);
    if (!address) {
      throw new ProviderRequestError(400, "address is required");
    }

    return requestAddresszen(
      buildAddresszenUrl(`/autocomplete/addresses/${encodeURIComponent(address)}/usa`, context.apiKey),
      context,
      "execute",
    );
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<AddresszenActionContext>({
  service,
  handlers: addresszenActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<AddresszenActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestKeyAvailability(
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );
    const result = requireObjectRecord(payload.result, "AddressZen key availability result");

    return {
      profile: {
        accountId: "api_key",
        displayName: "AddressZen API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: `${addresszenApiBaseUrl}/${addresszenApiVersion}`,
        validationEndpoint: "/keys/{key}",
        available: typeof result.available === "boolean" ? result.available : undefined,
        context: optionalString(result.context),
        contexts: Array.isArray(result.contexts) ? result.contexts : undefined,
      }),
    };
  },
};

function requestKeyAvailability(
  context: AddresszenActionContext,
  phase: AddresszenRequestPhase,
): Promise<Record<string, unknown>> {
  return requestAddresszen(buildKeysUrl(context.apiKey), context, phase);
}

function buildKeysUrl(apiKey: string): URL {
  return new URL(`/${addresszenApiVersion}/keys/${encodeURIComponent(apiKey)}`, addresszenApiBaseUrl);
}

function buildAddresszenUrl(
  path: string,
  apiKey: string,
  query: Record<string, string | number | undefined> = {},
): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(`/${addresszenApiVersion}/${normalizedPath}`, addresszenApiBaseUrl);
  url.searchParams.set("api_key", apiKey);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function requestAddresszen(
  url: URL,
  context: AddresszenActionContext,
  phase: AddresszenRequestPhase,
): Promise<Record<string, unknown>> {
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
    payload = await readAddresszenPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `AddressZen request failed: ${error.message}` : "AddressZen request failed",
    );
  }

  if (!response.ok) {
    throw createAddresszenError(response, payload, phase);
  }

  return requireObjectRecord(payload, "AddressZen response");
}

async function readAddresszenPayload(response: Response): Promise<unknown> {
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

function createAddresszenError(
  response: Response,
  payload: unknown,
  phase: AddresszenRequestPhase,
): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ?? response.statusText ?? `AddressZen request failed with ${response.status}`;

  if (response.status === 402 || response.status === 429 || response.status === 503) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 404)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && response.status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status === 400 || response.status === 404) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function requireObjectRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} must be an object`);
  }
  return record;
}

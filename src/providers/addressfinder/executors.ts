import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { AddressfinderActionName } from "./actions.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "addressfinder";
const addressfinderApiBaseUrl = "https://api.addressfinder.io/api/";
const addressfinderDefaultRequestTimeoutMs = 30_000;
const addressfinderValidationEndpoint = "/nz/address/autocomplete";

type AddressfinderCountry = "au" | "nz";
type AddressfinderRequestPhase = "validate" | "execute";

interface AddressfinderActionContext {
  apiKey: string;
  apiSecret: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type AddressfinderActionHandler = (
  input: Record<string, unknown>,
  context: AddressfinderActionContext,
) => Promise<unknown>;

export const addressfinderActionHandlers: Record<AddressfinderActionName, AddressfinderActionHandler> = {
  find_au_addresses(input, context) {
    return executeAutocomplete("au", "/au/address/autocomplete", input, context);
  },
  get_au_address_metadata(input, context) {
    return executeMetadata("au", "/au/address/metadata", input, context);
  },
  verify_au_address(input, context) {
    return executeVerification("au", "/au/address/v2/verification", input, context);
  },
  find_nz_addresses(input, context) {
    return executeAutocomplete("nz", "/nz/address/autocomplete", input, context);
  },
  get_nz_address_metadata(input, context) {
    return executeMetadata("nz", "/nz/address/metadata", input, context);
  },
  verify_nz_address(input, context) {
    return executeVerification("nz", "/nz/address/verification", input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<AddressfinderActionContext>({
  service,
  handlers: addressfinderActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<AddressfinderActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiSecret: requireAddressfinderApiSecret(credential.values),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const apiSecret = requireAddressfinderApiSecret(input.values);
    const payload = await requestAddressfinderJson({
      path: addressfinderValidationEndpoint,
      apiKey: input.apiKey,
      apiSecret,
      query: {
        q: "test",
        max: "1",
      },
      phase: "validate",
      fetcher,
      signal,
    });

    return {
      profile: {
        accountId: "addressfinder",
        displayName: "Addressfinder API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: addressfinderApiBaseUrl,
        validationEndpoint: addressfinderValidationEndpoint,
        success: optionalBoolean(payload.success),
      }),
    };
  },
};

function executeAutocomplete(
  country: AddressfinderCountry,
  path: string,
  input: Record<string, unknown>,
  context: AddressfinderActionContext,
): Promise<unknown> {
  return requestAndWrapAddressfinderJson({
    country,
    path,
    context,
    query: buildQuery(input, {
      q: "query",
      max: integerField("max"),
      source: "source",
      post_box: "postBox",
      canonical: "canonical",
      state_codes: joinArrayField("stateCodes"),
      domain: "domain",
      highlight: "highlight",
      ascii: "ascii",
      delivered: "delivered",
      rural: "rural",
      strict: "strict",
      region_code: "regionCode",
    }),
    normalize(payload) {
      const record = requireRecord(payload, "Addressfinder autocomplete response");
      return {
        success: readBoolean(record.success, true),
        completions: Array.isArray(record.completions) ? record.completions : [],
        meta: { country, endpoint: path },
        raw: record,
      };
    },
  });
}

function executeMetadata(
  country: AddressfinderCountry,
  path: string,
  input: Record<string, unknown>,
  context: AddressfinderActionContext,
): Promise<unknown> {
  return requestAndWrapAddressfinderJson({
    country,
    path,
    context,
    query: buildQuery(input, {
      id: "id",
      gnaf_id: "gnafId",
      dpid: "dpid",
      pxid: "pxid",
      source: "source",
      gps: "gps",
      census: integerField("census"),
      domain: "domain",
      ascii: "ascii",
    }),
    normalize(payload) {
      const address = requireRecord(payload, "Addressfinder metadata response");
      return {
        success: readBoolean(address.success, true),
        address,
        meta: { country, endpoint: path },
      };
    },
  });
}

function executeVerification(
  country: AddressfinderCountry,
  path: string,
  input: Record<string, unknown>,
  context: AddressfinderActionContext,
): Promise<unknown> {
  return requestAndWrapAddressfinderJson({
    country,
    path,
    context,
    query: buildQuery(input, {
      q: "query",
      gnaf: "gnaf",
      paf: "paf",
      post_box: "postBox",
      gps: "gps",
      extended: "extended",
      census: integerField("census"),
      state_codes: joinArrayField("stateCodes"),
      region_code: "regionCode",
      domain: "domain",
      ascii: "ascii",
    }),
    normalize(payload) {
      const record = requireRecord(payload, "Addressfinder verification response");
      return {
        success: readBoolean(record.success, true),
        matched: readNullableBoolean(record.matched),
        address: readNullableRecord(record.address),
        meta: { country, endpoint: path },
        raw: record,
      };
    },
  });
}

async function requestAndWrapAddressfinderJson<TOutput>(input: {
  country: AddressfinderCountry;
  path: string;
  context: AddressfinderActionContext;
  query: Record<string, string | undefined>;
  normalize: (payload: unknown) => TOutput;
}): Promise<TOutput> {
  const payload = await requestAddressfinderJson({
    path: input.path,
    apiKey: input.context.apiKey,
    apiSecret: input.context.apiSecret,
    query: input.query,
    phase: "execute",
    fetcher: input.context.fetcher,
    signal: input.context.signal,
  });
  return input.normalize(payload);
}

async function requestAddressfinderJson(input: {
  path: string;
  apiKey: string;
  apiSecret: string;
  query: Record<string, string | undefined>;
  phase: AddressfinderRequestPhase;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): Promise<Record<string, unknown>> {
  const timeoutSignal = AbortSignal.timeout(addressfinderDefaultRequestTimeoutMs);
  const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;

  try {
    const response = await input.fetcher(buildAddressfinderUrl(input.path, input.apiKey, input.query), {
      method: "GET",
      headers: addressfinderHeaders(input.apiSecret),
      signal,
    });
    const payload = await readAddressfinderPayload(response);

    if (!response.ok) {
      throw createAddressfinderError(response.status, payload, input.phase);
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new ProviderRequestError(502, "Addressfinder returned invalid JSON");
    }

    const record = payload as Record<string, unknown>;
    const success = optionalBoolean(record.success);
    if (success === false) {
      throw createAddressfinderError(response.status || 400, payload, input.phase);
    }
    if (success !== true) {
      throw new ProviderRequestError(502, "Addressfinder returned invalid JSON success flag");
    }

    return record;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Addressfinder request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Addressfinder request failed: ${error.message}` : "Addressfinder request failed",
    );
  }
}

function buildAddressfinderUrl(path: string, apiKey: string, query: Record<string, string | undefined>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, addressfinderApiBaseUrl);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("format", "json");

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  return url;
}

function addressfinderHeaders(apiSecret: string): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: apiSecret,
    "User-Agent": providerUserAgent,
  };
}

function buildQuery(
  input: Record<string, unknown>,
  mapping: Record<string, string | ((input: Record<string, unknown>) => string | undefined)>,
): Record<string, string | undefined> {
  const query: Record<string, string | undefined> = {};
  for (const [queryName, inputKeyOrReader] of Object.entries(mapping)) {
    query[queryName] =
      typeof inputKeyOrReader === "function" ? inputKeyOrReader(input) : optionalString(input[inputKeyOrReader]);
  }
  return query;
}

function integerField(key: string): (input: Record<string, unknown>) => string | undefined {
  return (input) => {
    const value = optionalInteger(input[key]);
    return value === undefined ? undefined : String(value);
  };
}

function joinArrayField(key: string): (input: Record<string, unknown>) => string | undefined {
  return (input) => {
    const value = input[key];
    return Array.isArray(value) ? value.join(",") : undefined;
  };
}

async function readAddressfinderPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createAddressfinderError(
  status: number,
  payload: unknown,
  phase: AddressfinderRequestPhase,
): ProviderRequestError {
  const message = readAddressfinderErrorMessage(payload) ?? `Addressfinder request failed with ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function readAddressfinderErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error) ?? optionalString(record?.error_message);
}

function requireAddressfinderApiSecret(values: Record<string, unknown>): string {
  const apiSecret = optionalString(values.apiSecret);
  if (!apiSecret) {
    throw new ProviderRequestError(400, "apiSecret is required");
  }
  return apiSecret;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readNullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readNullableRecord(value: unknown): Record<string, unknown> | null {
  return optionalRecord(value) ?? null;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} is not a JSON object`);
  }
  return record;
}

function isAbortLikeError(error: unknown): boolean {
  return (
    error instanceof DOMException ||
    (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"))
  );
}

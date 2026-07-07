import type {
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { ShippoActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  createProviderProxyUrl,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "shippo";
const shippoApiBaseUrl = "https://api.goshippo.com";
const shippoApiVersion = "2018-02-08";
const shippoDefaultRequestTimeoutMs = 30_000;
const shippoValidationEndpoint = "/addresses/";

interface ShippoRequestInput {
  path: string;
  method?: "GET" | "POST";
  apiKey: string;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type ShippoActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const shippoActionHandlers: Record<ShippoActionName, ShippoActionHandler> = {
  list_addresses(input, context) {
    return requestAndWrapShippoPaginatedJson({
      path: "/addresses/",
      apiKey: context.apiKey,
      query: paginationQuery(input),
      fetcher: context.fetcher,
      signal: context.signal,
    });
  },
  create_address(input, context) {
    return requestAndWrapShippoJson({
      path: "/addresses/",
      method: "POST",
      apiKey: context.apiKey,
      body: buildAddressBody(input),
      fetcher: context.fetcher,
      signal: context.signal,
      wrapper: "address",
    });
  },
  get_address(input, context) {
    return requestAndWrapShippoJson({
      path: `/addresses/${encodeURIComponent(requireInputString(input.addressId, "addressId"))}/`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      wrapper: "address",
    });
  },
  validate_address(input, context) {
    return requestAndWrapShippoJson({
      path: `/addresses/${encodeURIComponent(requireInputString(input.addressId, "addressId"))}/validate/`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      wrapper: "address",
    });
  },
  list_parcels(input, context) {
    return requestAndWrapShippoPaginatedJson({
      path: "/parcels/",
      apiKey: context.apiKey,
      query: paginationQuery(input),
      fetcher: context.fetcher,
      signal: context.signal,
    });
  },
  create_parcel(input, context) {
    return requestAndWrapShippoJson({
      path: "/parcels/",
      method: "POST",
      apiKey: context.apiKey,
      body: buildParcelBody(input),
      fetcher: context.fetcher,
      signal: context.signal,
      wrapper: "parcel",
    });
  },
  get_parcel(input, context) {
    return requestAndWrapShippoJson({
      path: `/parcels/${encodeURIComponent(requireInputString(input.parcelId, "parcelId"))}/`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      wrapper: "parcel",
    });
  },
  get_tracking_status(input, context) {
    const carrier = encodeURIComponent(requireInputString(input.carrier, "carrier"));
    const trackingNumber = encodeURIComponent(requireInputString(input.trackingNumber, "trackingNumber"));
    return requestAndWrapShippoJson({
      path: `/tracks/${carrier}/${trackingNumber}`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      wrapper: "track",
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, shippoActionHandlers);

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const url = createProviderProxyUrl(shippoApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
    headers.set("authorization", `ShippoToken ${credential.apiKey}`);
    headers.set("shippo-api-version", shippoApiVersion);
    headers.set("user-agent", providerUserAgent);

    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };
    if (input.body !== undefined) {
      init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
      if (!headers.has("content-type") && typeof input.body !== "string") {
        headers.set("content-type", "application/json");
      }
    }

    const response = await fetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `provider request failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "provider request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestShippoJson({
      path: shippoValidationEndpoint,
      apiKey: input.apiKey,
      query: { page: "1", results: "1" },
      fetcher,
      signal,
    });

    return {
      profile: {
        accountId: "shippo",
        displayName: "Shippo API Token",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: shippoApiBaseUrl,
        apiVersion: shippoApiVersion,
        validationEndpoint: shippoValidationEndpoint,
      },
    };
  },
};

async function requestAndWrapShippoJson(
  input: ShippoRequestInput & { wrapper: string },
): Promise<Record<string, unknown>> {
  const payload = await requestShippoJson(input);
  return { [input.wrapper]: payload };
}

async function requestAndWrapShippoPaginatedJson(input: ShippoRequestInput): Promise<Record<string, unknown>> {
  const payload = readObject(await requestShippoJson(input), "Shippo paginated response");
  return { ...payload, raw: payload };
}

async function requestShippoJson(input: ShippoRequestInput): Promise<unknown> {
  const url = new URL(input.path, shippoApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const timeout = createProviderTimeout(input.signal, shippoDefaultRequestTimeoutMs);
  try {
    const response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: `ShippoToken ${input.apiKey}`,
        "content-type": "application/json",
        "shippo-api-version": shippoApiVersion,
        "user-agent": providerUserAgent,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });

    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw mapShippoError(response.status, payload);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Shippo request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Shippo request failed: ${error.message}` : "Shippo request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function paginationQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  const page = optionalInteger(input.page);
  const results = optionalInteger(input.results);
  return compactObject({
    page: page === undefined ? undefined : String(page),
    results: results === undefined ? undefined : String(results),
  });
}

function buildAddressBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: optionalString(input.name),
    company: optionalString(input.company),
    street1: optionalString(input.street1),
    street2: optionalString(input.street2),
    street3: optionalString(input.street3),
    street_no: optionalString(input.streetNo),
    city: optionalString(input.city),
    state: optionalString(input.state),
    zip: optionalString(input.zip),
    country: requireInputString(input.country, "country"),
    phone: optionalString(input.phone),
    email: optionalString(input.email),
    is_residential: input.isResidential,
    metadata: optionalString(input.metadata),
    validate: input.validate,
  });
}

function buildParcelBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    length: optionalString(input.length),
    width: optionalString(input.width),
    height: optionalString(input.height),
    distance_unit: optionalString(input.distanceUnit),
    weight: requireInputString(input.weight, "weight"),
    mass_unit: requireInputString(input.massUnit, "massUnit"),
    template: optionalString(input.template),
    metadata: optionalString(input.metadata),
    extra: input.extra,
  });
}

function requireInputString(value: unknown, key: string): string {
  return requiredString(value, key, (message) => new ProviderRequestError(400, message));
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { message: text };
  }
}

function mapShippoError(status: number, payload: Record<string, unknown>): ProviderRequestError {
  const message = readShippoErrorMessage(payload) ?? `Shippo API returned HTTP ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(502, message, payload);
}

function readShippoErrorMessage(payload: Record<string, unknown>): string | undefined {
  return optionalString(payload.detail) ?? optionalString(payload.message) ?? optionalString(payload.error);
}

function readObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${fieldName} must be an object`, value);
  }
  return record;
}

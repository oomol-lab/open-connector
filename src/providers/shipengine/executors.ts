import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { ShipengineActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "shipengine";
const shipengineBaseUrl = "https://api.shipengine.com";
const validationEndpoint = "/v1/carriers";

interface ShipengineRequestInput {
  method?: "GET" | "POST" | "PUT";
  path: string;
  body?: unknown;
}

type ShipengineRequestPhase = "validate" | "execute";
type ShipengineActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const shipengineActionHandlers: Record<ShipengineActionName, ShipengineActionHandler> = {
  validate_addresses(input, context) {
    return validateAddresses(input, context);
  },
  parse_address(input, context) {
    return parseAddress(input, context);
  },
  list_carriers(_input, context) {
    return listCarriers(context);
  },
  get_rate(input, context) {
    return getRate(input, context);
  },
  calculate_rates(input, context) {
    return calculateRates(input, context);
  },
  estimate_rates(input, context) {
    return estimateRates(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, shipengineActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await shipengineRequest(
      { apiKey: input.apiKey, fetcher, signal },
      { path: validationEndpoint },
      "validate",
    );

    const firstCarrierId = readFirstCarrierId(payload);
    return {
      profile: {
        accountId: firstCarrierId ?? "shipengine-api-key",
        displayName: "ShipEngine API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: shipengineBaseUrl,
        validationEndpoint,
        firstCarrierId,
      }),
    };
  },
};

async function validateAddresses(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await shipengineRequest(
    context,
    {
      method: "POST",
      path: "/v1/addresses/validate",
      body: normalizeValidateAddressInput(input),
    },
    "execute",
  );

  return {
    addresses: requireArray(payload, "ShipEngine validate_addresses did not return an array"),
  };
}

async function parseAddress(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await shipengineRequest(
    context,
    {
      method: "PUT",
      path: "/v1/addresses/recognize",
      body: normalizeParseAddressInput(input),
    },
    "execute",
  );

  return {
    parsedAddress: requireObject(payload, "ShipEngine parse_address did not return an object"),
  };
}

async function listCarriers(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await shipengineRequest(context, { path: validationEndpoint }, "execute");
  const response = requireObject(payload, "ShipEngine list_carriers did not return an object");

  return {
    carriers: requireArray(response.carriers, "ShipEngine list_carriers missing carriers"),
    errors: Array.isArray(response.errors) ? response.errors.map((item) => requireObject(item)) : [],
  };
}

async function getRate(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await shipengineRequest(
    context,
    { path: `/v1/rates/${encodeURIComponent(String(input.rateId))}` },
    "execute",
  );

  return {
    rate: requireObject(payload, "ShipEngine get_rate did not return an object"),
  };
}

async function calculateRates(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await shipengineRequest(
    context,
    {
      method: "POST",
      path: "/v1/rates",
      body: normalizeRatesInput(input),
    },
    "execute",
  );

  return {
    rateResponse: requireObject(payload, "ShipEngine calculate_rates did not return an object"),
  };
}

async function estimateRates(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await shipengineRequest(
    context,
    {
      method: "POST",
      path: "/v1/rates/estimate",
      body: normalizeKeys(input),
    },
    "execute",
  );

  return {
    rates: requireArray(payload, "ShipEngine estimate_rates did not return an array"),
  };
}

async function shipengineRequest(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  request: ShipengineRequestInput,
  phase: ShipengineRequestPhase,
): Promise<unknown> {
  let response: Response;
  try {
    response = await context.fetcher(new URL(request.path, shipengineBaseUrl), {
      method: request.method ?? "GET",
      headers: shipengineHeaders(context.apiKey, request.body !== undefined),
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      isAbortError(error) ? 504 : 502,
      error instanceof Error ? error.message : "ShipEngine request failed",
    );
  }

  let payload: unknown;
  try {
    payload = await readShipenginePayload(response);
  } catch (error) {
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "Invalid ShipEngine response payload");
  }

  if (!response.ok && response.status !== 207) {
    throw createShipengineError(response, payload, phase);
  }

  return payload;
}

function shipengineHeaders(apiKey: string, hasJsonBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "API-Key": apiKey,
    "User-Agent": providerUserAgent,
  };
  if (hasJsonBody) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

async function readShipenginePayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createShipengineError(
  response: Response,
  payload: unknown,
  phase: ShipengineRequestPhase,
): ProviderRequestError {
  const message =
    extractShipengineErrorMessage(payload) ??
    response.statusText ??
    `ShipEngine request failed with status ${response.status}`;

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(response.status, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractShipengineErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const object = optionalRecord(payload);
  const errors = Array.isArray(object?.errors) ? object.errors : undefined;
  const firstError = optionalRecord(errors?.[0]);
  return (
    optionalString(object?.message) ??
    optionalString(object?.error) ??
    optionalString(firstError?.message) ??
    optionalString(firstError?.error_source)
  );
}

function normalizeValidateAddressInput(input: Record<string, unknown>): unknown[] {
  return Array.isArray(input.addresses) ? input.addresses.map(normalizeAddress) : [];
}

function normalizeParseAddressInput(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {
    text: input.text,
  };
  if (input.address) {
    output.address = normalizeAddress(input.address);
  }
  return output;
}

function normalizeRatesInput(input: Record<string, unknown>): unknown {
  return normalizeKeys({
    ...input,
    rateOptions: normalizeKeys(input.rateOptions),
    shipment: normalizeKeys(input.shipment),
  });
}

function normalizeAddress(input: unknown): unknown {
  return normalizeKeys(requireObject(input, "ShipEngine address input must be an object"));
}

function normalizeKeys(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map(normalizeKeys);
  }

  const object = optionalRecord(input);
  if (!object) {
    return input;
  }

  return Object.fromEntries(Object.entries(object).map(([key, value]) => [toSnakeCase(key), normalizeKeys(value)]));
}

function toSnakeCase(value: string): string {
  let normalized = "";
  for (const letter of value) {
    const lower = letter.toLowerCase();
    normalized += letter !== lower ? `_${lower}` : letter;
  }
  return normalized;
}

function requireArray(value: unknown, message: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, message);
  }
  return value.map((item) => requireObject(item, `${message}: item was not an object`));
}

function requireObject(
  value: unknown,
  message = "ShipEngine response item was not an object",
): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, message);
  }
  return object;
}

function readFirstCarrierId(payload: unknown): string | undefined {
  const object = optionalRecord(payload);
  const carriers = Array.isArray(object?.carriers) ? object.carriers : undefined;
  return optionalString(optionalRecord(carriers?.[0])?.carrier_id);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.shipengine.com",
  auth: { type: "api_key_header", name: "api-key" },
});

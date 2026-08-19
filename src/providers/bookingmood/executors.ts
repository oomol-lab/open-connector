import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "bookingmood";
const bookingmoodApiBaseUrl = "https://api.bookingmood.com/v1";

type BookingmoodMode = "validate" | "execute";
type BookingmoodActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const bookingmoodActionHandlers: ProviderActionHandlers<"bookingmood", BookingmoodActionHandler> = {
  list_products(input, context) {
    return listBookingmoodProducts(input, context);
  },
  list_bookings(input, context) {
    return listBookingmoodBookings(input, context);
  },
  query_availability(input, context) {
    return queryBookingmoodAvailability(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, bookingmoodActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestBookingmood({
      apiKey: input.apiKey,
      url: bookingmoodUrl("/products", { select: "id,name", limit: 1 }),
      fetcher,
      signal,
      mode: "validate",
    });
    const products = readArray(payload, "Bookingmood products response");
    const firstProduct = optionalRecord(products[0]);

    return {
      profile: {
        accountId: "bookingmood",
        displayName: readLabel(firstProduct) ?? "Bookingmood API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: bookingmoodApiBaseUrl,
        validationEndpoint: "/products",
      },
    };
  },
};

async function listBookingmoodProducts(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestBookingmood({
    apiKey: context.apiKey,
    url: buildListUrl("/products", input),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
  return { products: readArray(payload, "Bookingmood products response") };
}

async function listBookingmoodBookings(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestBookingmood({
    apiKey: context.apiKey,
    url: buildListUrl("/bookings", input),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
  return { bookings: readArray(payload, "Bookingmood bookings response") };
}

async function queryBookingmoodAvailability(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestBookingmood({
    apiKey: context.apiKey,
    url: bookingmoodUrl("/availability", {
      product_id: requiredString(input.product_id, "product_id", invalidInputError),
      start: optionalString(input.start),
      end: optionalString(input.end),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
  return {
    availability: normalizeAvailability(payload),
    raw: payload,
  };
}

function buildListUrl(path: string, input: Record<string, unknown>): URL {
  return bookingmoodUrl(path, {
    select: optionalString(input.select) ?? "*",
    limit: input.limit,
    offset: input.offset,
    order: input.order,
    id: input.id,
    organization_id: input.organization_id,
    product_id: input.product_id,
  });
}

function bookingmoodUrl(path: string, query: Record<string, unknown>): URL {
  const url = new URL(`${bookingmoodApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function requestBookingmood(input: {
  apiKey: string;
  url: URL;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  mode: BookingmoodMode;
}): Promise<unknown> {
  let response: Response;
  try {
    response = await input.fetcher(input.url.toString(), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Bookingmood request failed: ${error.message}`
        : "Bookingmood request failed: unknown transport error",
    );
  }

  if (!response.ok) {
    throw await buildBookingmoodError(response, input.mode);
  }
  return readBookingmoodJson(response, "Bookingmood returned invalid JSON");
}

async function readBookingmoodJson(response: Response, message: string): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, message);
  }
}

async function buildBookingmoodError(response: Response, mode: BookingmoodMode): Promise<ProviderRequestError> {
  const payload = await readBookingmoodJson(response, `Bookingmood request failed with ${response.status}`);
  const record = optionalRecord(payload);
  const message =
    (optionalString(record?.message) ??
      optionalString(record?.error) ??
      optionalString(record?.details) ??
      response.statusText) ||
    `Bookingmood request failed with ${response.status}`;

  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 500, message, payload);
}

function readArray(value: unknown, message: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, message);
  }
  return value.map((item) => requiredRecord(item, message, providerDataError));
}

function readLabel(record: Record<string, unknown> | undefined): string | undefined {
  if (!record) {
    return undefined;
  }
  const name = optionalString(record.name);
  if (name) {
    return name;
  }
  const localizedName = optionalRecord(record.name);
  return optionalString(localizedName?.default) ?? optionalString(record.id);
}

function normalizeAvailability(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.map((item) => requiredRecord(item, "Bookingmood availability response", providerDataError));
  }

  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Bookingmood availability response");
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      return value.map((item) => requiredRecord(item, "Bookingmood availability response", providerDataError));
    }
  }

  return [record];
}

function invalidInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function providerDataError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}

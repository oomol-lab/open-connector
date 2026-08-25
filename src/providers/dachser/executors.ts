import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "dachser";
const apiBaseUrl = "https://api-gateway.dachser.com";
const validationTrackingNumber = "OPEN-CONNECTOR-CREDENTIAL-CHECK";

interface DachserActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface DachserRequest {
  path: string;
  query: Record<string, unknown>;
  acceptLanguage?: string;
  acceptedStatuses?: number[];
  phase?: "validate" | "execute";
}

type DachserActionHandler = (input: Record<string, unknown>, context: DachserActionContext) => Promise<unknown>;

export const dachserActionHandlers: ProviderActionHandlers<"dachser", DachserActionHandler> = {
  get_shipment_status(input, context) {
    return requestDachser(context, {
      path: "/rest/v2/shipmentstatus",
      query: shipmentQuery(input),
      acceptLanguage: optionalString(input.acceptLanguage),
      acceptedStatuses: [206],
    }).then((result) => result.payload);
  },
  get_shipment_history(input, context) {
    return requestDachser(context, {
      path: "/rest/v2/shipmenthistory",
      query: shipmentQuery(input),
      acceptLanguage: optionalString(input.acceptLanguage),
    }).then((result) => result.payload);
  },
  get_delivery_order_status(input, context) {
    requireDeliveryOrderLookup(input);
    return requestDachser(context, {
      path: "/rest/v2/deliveryorderstatus",
      query: compactObject({
        "reference-number1": input.referenceNumber1,
        "reference-number2": input.referenceNumber2,
        "reference-number3": input.referenceNumber3,
        "purchase-order-number": input.purchaseOrderNumber,
        "delivery-order-date": input.deliveryOrderDate,
        "event-code": input.eventCode,
        "customer-id": input.customerId,
      }),
      acceptLanguage: optionalString(input.acceptLanguage),
    }).then((result) => result.payload);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<DachserActionContext>({
  service,
  handlers: dachserActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<DachserActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return { apiKey: credential.apiKey, fetcher, signal: context.signal };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: apiBaseUrl,
  auth: { type: "api_key_header", name: "X-API-Key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (!headers.has("user-agent")) headers.set("user-agent", providerUserAgent);
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const result = await requestDachser(
      { apiKey: input.apiKey, fetcher, signal },
      {
        path: "/rest/v2/shipmentstatus",
        query: { "tracking-number": validationTrackingNumber },
        acceptedStatuses: [422],
        phase: "validate",
      },
    );
    return {
      profile: { accountId: "api_key", displayName: "DACHSER API Key" },
      grantedScopes: [],
      metadata: {
        apiBaseUrl,
        validationEndpoint: "/rest/v2/shipmentstatus",
        validationStatus: result.status,
      },
    };
  },
};

function shipmentQuery(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    "tracking-number": input.trackingNumber,
    "customer-id": input.customerId,
  });
}

function requireDeliveryOrderLookup(input: Record<string, unknown>): void {
  const fields = [
    input.referenceNumber1,
    input.referenceNumber2,
    input.referenceNumber3,
    input.purchaseOrderNumber,
    input.deliveryOrderDate,
  ];
  if (!fields.some((value) => typeof value === "string" && value.length > 0)) {
    throw new ProviderRequestError(
      400,
      "At least one reference number, purchase order number, or delivery order date is required.",
    );
  }
}

async function requestDachser(
  context: DachserActionContext,
  request: DachserRequest,
): Promise<{ payload: unknown; status: number }> {
  const url = new URL(request.path, apiBaseUrl);
  for (const [name, value] of Object.entries(request.query)) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }

  const timeoutSignal = AbortSignal.timeout(30_000);
  const signal = context.signal ? AbortSignal.any([context.signal, timeoutSignal]) : timeoutSignal;
  const headers = new Headers({
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": context.apiKey,
  });
  if (request.acceptLanguage) headers.set("accept-language", request.acceptLanguage);
  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers,
      signal,
    });
  } catch (error) {
    if (timeoutSignal.aborted && !context.signal?.aborted) {
      throw new ProviderRequestError(504, "DACHSER request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `DACHSER request failed: ${error.message}` : "DACHSER request failed",
    );
  }

  const payload = await readDachserPayload(response);
  if (!response.ok && !request.acceptedStatuses?.includes(response.status)) {
    throw createDachserError(response, payload, request.phase ?? "execute");
  }
  return { payload, status: response.status };
}

async function readDachserPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderRequestError(502, "DACHSER returned invalid JSON");
  }
}

function createDachserError(response: Response, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const record = optionalRecord(payload);
  const details = Array.isArray(record?.details)
    ? record.details.filter((value) => typeof value === "string").join("; ")
    : undefined;
  const message = optionalString(record?.message) ?? details ?? `DACHSER request failed with status ${response.status}`;

  if (response.status === 429) return new ProviderRequestError(429, message, payload);
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (response.status >= 400 && response.status < 500) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(response.status || 502, message, payload);
}

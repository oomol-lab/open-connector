import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { FraudlabsproActionName } from "./actions.ts";

import { optionalNumber, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderProxyUrl,
  defineApiKeyProviderExecutors,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "fraudlabspro";
const fraudlabsproApiBaseUrl = "https://api.fraudlabspro.com/v2";

type FraudlabsproRequestMethod = "GET" | "POST";
type FraudlabsproRequestValue = string | number | undefined;
type FraudlabsproActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type FraudlabsproActionHandler = (
  input: Record<string, unknown>,
  context: FraudlabsproActionContext,
) => Promise<unknown>;

export const fraudlabsproActionHandlers: Record<FraudlabsproActionName, FraudlabsproActionHandler> = {
  async screen_order(input, context) {
    return fraudlabsproRequest(
      context.apiKey,
      {
        method: "POST",
        path: "/order/screen",
        body: {
          ip: optionalString(input.ip),
          user_order_id: optionalString(input.userOrderId),
          email: optionalString(input.email),
          amount: optionalNumber(input.amount),
          currency: optionalString(input.currency),
          payment_mode: optionalString(input.paymentMode),
          first_name: optionalString(input.firstName),
          last_name: optionalString(input.lastName),
          user_phone: optionalString(input.userPhone),
          email_hash: optionalString(input.emailHash),
          email_domain: optionalString(input.emailDomain),
          bin_no: optionalString(input.binNo),
          quantity: optionalNumber(input.quantity),
          coupon_code: optionalString(input.couponCode),
          flp_checksum: optionalString(input.flpChecksum),
        },
      },
      context,
    );
  },
  async get_order_result(input, context) {
    return fraudlabsproRequest(
      context.apiKey,
      {
        method: "GET",
        path: "/order/result",
        query: {
          id: requiredString(input.id, "id", (message) => new ProviderRequestError(400, message)),
        },
      },
      context,
    );
  },
  async feedback_order(input, context) {
    return fraudlabsproRequest(
      context.apiKey,
      {
        method: "POST",
        path: "/order/feedback",
        body: {
          id: requiredString(input.id, "id", (message) => new ProviderRequestError(400, message)),
          action: requiredString(input.action, "action", (message) => new ProviderRequestError(400, message)),
          note: optionalString(input.note),
        },
      },
      context,
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, fraudlabsproActionHandlers);

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    if (input.method !== "GET" && input.method !== "POST") {
      throw new ProviderRequestError(400, "FraudLabs Pro proxy only supports GET and POST");
    }

    const commonParams = {
      key: credential.apiKey,
      format: "json",
    };
    const url =
      input.method === "GET"
        ? createProviderProxyUrl(fraudlabsproApiBaseUrl, input.endpoint, { ...commonParams, ...input.query })
        : createProviderProxyUrl(fraudlabsproApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("user-agent", providerUserAgent);

    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };
    if (input.method === "POST") {
      headers.set("content-type", "application/json");
      init.body = JSON.stringify({
        ...commonParams,
        ...(optionalRecord(input.body) ?? {}),
      });
    }

    const response = await fetch(url, init);
    if (!response.ok) {
      throw buildFraudlabsproError(response.status, await readFraudlabsproPayload(response), "execute");
    }

    return {
      ok: true,
      response: await readProviderProxyResponse(response),
    };
  } catch (error) {
    return toProviderProxyError(error, "FraudLabs Pro request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const response = await fraudlabsproRawRequest(
      input.apiKey,
      {
        method: "GET",
        path: "/order/result",
        query: {
          id: "connect-validation",
        },
      },
      { fetcher, signal },
    );
    const payload = await readFraudlabsproPayload(response);
    const message = extractFraudlabsproErrorMessage(payload) ?? "";
    const normalized = message.toLowerCase();

    if (response.status === 429 || normalized.includes("limit")) {
      throw new ProviderRequestError(429, message || "FraudLabs Pro rate limit reached", payload);
    }

    if (isCredentialError(response.status, normalized)) {
      throw new ProviderRequestError(400, message || "FraudLabs Pro API license key is invalid", payload);
    }

    if (response.status >= 500) {
      throw new ProviderRequestError(
        response.status,
        message || `FraudLabs Pro request failed with ${response.status}`,
        payload,
      );
    }

    return {
      profile: {
        accountId: "fraudlabspro-api-key",
        displayName: "FraudLabs Pro API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/order/result",
        apiBaseUrl: fraudlabsproApiBaseUrl,
      },
    };
  },
};

interface FraudlabsproRequestInput {
  method: FraudlabsproRequestMethod;
  path: string;
  query?: Record<string, FraudlabsproRequestValue>;
  body?: Record<string, FraudlabsproRequestValue>;
}

async function fraudlabsproRequest(
  apiKey: string,
  input: FraudlabsproRequestInput,
  context: Pick<FraudlabsproActionContext, "fetcher" | "signal">,
  phase: "execute" | "validate" = "execute",
): Promise<Record<string, unknown>> {
  const response = await fraudlabsproRawRequest(apiKey, input, context);
  const payload = await readFraudlabsproPayload(response);

  if (!response.ok) {
    throw buildFraudlabsproError(response.status, payload, phase);
  }

  if (isFraudlabsproErrorPayload(payload)) {
    throw buildFraudlabsproError(response.status, payload, phase);
  }

  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "FraudLabs Pro returned an unparseable JSON response", payload);
  }

  return record;
}

async function fraudlabsproRawRequest(
  apiKey: string,
  input: FraudlabsproRequestInput,
  context: Pick<FraudlabsproActionContext, "fetcher" | "signal">,
): Promise<Response> {
  const url = new URL(resolveFraudlabsproPath(input.path), `${fraudlabsproApiBaseUrl}/`);
  const commonParams = compactRequestValues({
    key: apiKey,
    format: "json",
  });

  const headers: Record<string, string> = {
    "user-agent": providerUserAgent,
  };
  const init: RequestInit = {
    method: input.method,
    headers,
    signal: context.signal,
  };

  if (input.method === "GET") {
    for (const [key, value] of Object.entries({ ...commonParams, ...input.query })) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  } else {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(compactRequestValues({ ...commonParams, ...input.body }));
  }

  try {
    return await context.fetcher(url, init);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `FraudLabs Pro request failed: ${error.message}` : "FraudLabs Pro request failed",
      error,
    );
  }
}

function buildFraudlabsproError(status: number, payload: unknown, phase: "execute" | "validate"): ProviderRequestError {
  const message = extractFraudlabsproErrorMessage(payload) ?? `FraudLabs Pro request failed with ${status || 500}`;
  const normalized = message.toLowerCase();

  if (status === 429 || normalized.includes("limit")) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && isCredentialError(status, normalized)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message, payload);
  }

  if (
    status === 400 ||
    status === 404 ||
    normalized.includes("invalid") ||
    normalized.includes("missing") ||
    normalized.includes("not found")
  ) {
    return new ProviderRequestError(400, message, payload);
  }

  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

async function readFraudlabsproPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "FraudLabs Pro returned an unparseable JSON response");
  }
}

function isFraudlabsproErrorPayload(payload: unknown): boolean {
  const record = optionalRecord(payload);
  return (
    record !== undefined &&
    (record.error !== undefined ||
      record.error_message !== undefined ||
      record.status === "ERROR" ||
      record.success === false)
  );
}

function extractFraudlabsproErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const nestedError = optionalRecord(record.error);
  return (
    optionalString(record.error_message) ??
    optionalString(record.error) ??
    optionalString(nestedError?.message) ??
    optionalString(nestedError?.info) ??
    optionalString(record.message) ??
    optionalString(record.status)
  );
}

function isCredentialError(status: number, normalizedMessage: string): boolean {
  return (
    status === 401 ||
    status === 403 ||
    normalizedMessage.includes("api license key") ||
    normalizedMessage.includes("license key") ||
    normalizedMessage.includes("api key")
  );
}

function compactRequestValues(input: Record<string, FraudlabsproRequestValue>): Record<string, string | number> {
  const output: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== "") {
      output[key] = value;
    }
  }
  return output;
}

function resolveFraudlabsproPath(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}

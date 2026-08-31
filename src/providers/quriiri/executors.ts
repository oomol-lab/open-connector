import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  defineProviderProxy,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "quriiri";
const quriiriRequestTimeoutMs = 60_000;
const quriiriMaxResponseBytes = 10 * 1024 * 1024;

interface QuriiriContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface QuriiriRequestOptions {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
}

interface QuriiriResponseBody {
  payload: unknown;
  text: string;
  isJson: boolean;
}

type QuriiriActionHandler = (input: Record<string, unknown>, context: QuriiriContext) => Promise<unknown>;

export const quriiriActionHandlers: ProviderActionHandlers<"quriiri", QuriiriActionHandler> = {
  send_sms(input, context) {
    return quriiriRequest(context, {
      method: "POST",
      path: "/v1/",
      body: compactObject({
        sender: input.sender,
        destination: input.destination,
        text: input.text,
        sendertype: input.senderType,
        batchid: input.batchId,
        billingref: input.billingRef,
        drurl: input.deliveryReportUrl,
        drtype: input.deliveryReportType,
        flash: input.flash,
        validity: input.validityMinutes,
        scheduletime: input.scheduleTime,
      }),
    }).then((response) => response.payload);
  },
  async get_sms_status(input, context) {
    const deliveryReportId = requiredString(input.deliveryReportId, "deliveryReportId", providerInputError);
    const response = await quriiriRequest(context, {
      method: "GET",
      path: `/v2/status/sms/${encodeURIComponent(deliveryReportId)}`,
    });
    return { status: response.payload };
  },
  list_sms_statuses(input, context) {
    return quriiriRequest(context, {
      method: "GET",
      path: "/v2/status/sms",
      query: {
        start: optionalString(input.start),
        end: optionalString(input.end),
        status: optionalString(input.status),
      },
    }).then((response) => response.payload);
  },
  list_sender_ids(_input, context) {
    return quriiriRequest(context, {
      method: "GET",
      path: "/v2/senderlist/",
    }).then((response) => response.payload);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<QuriiriContext>({
  service,
  handlers: quriiriActionHandlers,
  async createContext(context: ExecutionContext, fetcher): Promise<QuriiriContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: requireCleanApiKey(credential.apiKey),
      apiBaseUrl: normalizeQuriiriApiBaseUrl(
        credential.values.apiBaseUrl ?? optionalString(credential.metadata.apiBaseUrl),
      ),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return normalizeQuriiriApiBaseUrl(credential.values.apiBaseUrl ?? optionalString(credential.metadata.apiBaseUrl));
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const apiBaseUrl = normalizeQuriiriApiBaseUrl(input.values.apiBaseUrl);
    const context = {
      apiKey: requireCleanApiKey(input.apiKey),
      apiBaseUrl,
      fetcher,
      signal,
    };
    const response = await quriiriRequest(context, {
      method: "GET",
      path: "/v2/senderlist/",
    });
    if (!response.isJson || !optionalRecord(response.payload)) {
      throw new ProviderRequestError(502, "Quriiri credential validation returned an invalid response");
    }
    const url = new URL(apiBaseUrl);
    const accountKey = url.pathname === "/" ? url.host : `${url.host}${url.pathname}`;
    return {
      profile: {
        accountId: accountKey,
        displayName: `Quriiri ${accountKey}`,
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl,
        validationEndpoint: "/v2/senderlist/",
      },
    };
  },
};

export function normalizeQuriiriApiBaseUrl(value: unknown): string {
  const raw = requiredString(value, "apiBaseUrl", providerInputError);
  const url = assertPublicHttpUrl(raw, {
    fieldName: "apiBaseUrl",
    createError: providerInputError,
  });
  if (url.username || url.password) {
    throw new ProviderRequestError(400, "apiBaseUrl must not include credentials");
  }
  url.hash = "";
  url.search = "";
  while (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }
  const normalized = url.toString();
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

async function quriiriRequest(context: QuriiriContext, options: QuriiriRequestOptions): Promise<QuriiriResponseBody> {
  const url = quriiriEndpointUrl(context.apiBaseUrl, options.path);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const timeout = createProviderTimeout(context.signal, quriiriRequestTimeoutMs);
  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${context.apiKey}`,
      "user-agent": providerUserAgent,
    };
    const body = options.body === undefined ? undefined : JSON.stringify(options.body);
    if (body !== undefined) {
      headers["content-type"] = "application/json";
    }
    const response = await context.fetcher(url, {
      method: options.method,
      headers,
      body,
      signal: timeout.signal,
    });
    const responseBody = await readResponseBody(response);
    if (!response.ok) {
      throw buildQuriiriError(response.status, responseBody);
    }
    return responseBody;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Quriiri request timed out");
    }
    throw error;
  } finally {
    timeout.cleanup();
  }
}

function quriiriEndpointUrl(apiBaseUrl: string, path: string): URL {
  const url = new URL(apiBaseUrl);
  const basePath = url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;
  const endpointPath = path.startsWith("/") ? path : `/${path}`;
  url.pathname = `${basePath}${endpointPath}`;
  return url;
}

async function readResponseBody(response: Response): Promise<QuriiriResponseBody> {
  const text = await readProviderTextBody(response, "Quriiri response", quriiriMaxResponseBytes);
  if (!text) {
    return { payload: null, text, isJson: false };
  }
  try {
    return { payload: JSON.parse(text), text, isJson: true };
  } catch {
    return { payload: text, text, isJson: false };
  }
}

function buildQuriiriError(status: number, body: QuriiriResponseBody): ProviderRequestError {
  let message = `Quriiri request failed with status ${status}`;
  const payload = optionalRecord(body.payload);
  const errors = payload?.errors;
  if (Array.isArray(errors)) {
    const firstError = errors.map(optionalRecord).find(Boolean);
    message = optionalString(firstError?.message) ?? message;
  } else if (body.text) {
    message = body.text.slice(0, 500);
  }
  return new ProviderRequestError(status === 400 ? 400 : status, message);
}

function requireCleanApiKey(value: string): string {
  if (value.trim() !== value) {
    throw new ProviderRequestError(400, "quriiri apiKey must not include leading or trailing whitespace");
  }
  return value;
}

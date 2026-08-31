import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
} from "../provider-runtime.ts";

const service = "niftyimages";
const niftyimagesApiBaseUrl = "https://api.niftyimages.com/v1";
const niftyimagesMaxResponseBytes = 10 * 1024 * 1024;

type NiftyimagesRequestPhase = "validate" | "execute";
interface NiftyimagesContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type NiftyimagesActionHandler = (input: Record<string, unknown>, context: NiftyimagesContext) => Promise<unknown>;

export const niftyimagesActionHandlers: ProviderActionHandlers<"niftyimages", NiftyimagesActionHandler> = {
  list_images(input, context) {
    return requestNiftyimagesJson(
      {
        path: "/Images",
        params: compactObject({
          pageSize: readOptionalIntegerString(input.pageSize),
          pageNumber: readOptionalIntegerString(input.pageNumber),
        }),
        phase: "execute",
      },
      context,
    );
  },
  get_image(input, context) {
    return requestNiftyimagesJson(
      {
        path: "/Image",
        params: { url: readRequiredString(input.url, "url") },
        phase: "execute",
      },
      context,
    );
  },
  get_image_stats(input, context) {
    return requestNiftyimagesJson(
      { path: "/Images/AllStats", params: readDateRange(input), phase: "execute" },
      context,
    );
  },
  list_widgets(_input, context) {
    return requestNiftyimagesJson({ path: "/Widgets", params: {}, phase: "execute" }, context);
  },
  get_widget_stats(input, context) {
    return requestNiftyimagesJson(
      { path: "/Widgets/AllStats", params: readDateRange(input), phase: "execute" },
      context,
    );
  },
  list_widget_images(input, context) {
    return requestNiftyimagesJson(
      {
        path: `/Widgets/${encodeURIComponent(readRequiredString(input.widgetKey, "widgetKey"))}/Images`,
        params: readDateRange(input),
        phase: "execute",
      },
      context,
    );
  },
  list_widget_users(input, context) {
    return requestNiftyimagesJson(
      {
        path: `/Widgets/${encodeURIComponent(readRequiredString(input.widgetKey, "widgetKey"))}/Users`,
        params: readDateRange(input),
        phase: "execute",
      },
      context,
    );
  },
  get_widget_user_stats(input, context) {
    const widgetKey = encodeURIComponent(readRequiredString(input.widgetKey, "widgetKey"));
    const user = encodeURIComponent(readRequiredString(input.user, "user"));
    return requestNiftyimagesJson(
      {
        path: `/Widgets/${widgetKey}/Users/${user}`,
        params: readDateRange(input),
        phase: "execute",
      },
      context,
    );
  },
  list_widget_user_images(input, context) {
    const widgetKey = encodeURIComponent(readRequiredString(input.widgetKey, "widgetKey"));
    const user = encodeURIComponent(readRequiredString(input.user, "user"));
    return requestNiftyimagesJson(
      {
        path: `/Widgets/${widgetKey}/Images/${user}`,
        params: readDateRange(input),
        phase: "execute",
      },
      context,
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, niftyimagesActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: niftyimagesApiBaseUrl,
  auth: { type: "api_key_header", name: "ApiKey" },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestNiftyimagesJson(
      { path: "/Widgets", params: {}, phase: "validate" },
      { apiKey: input.apiKey, fetcher, signal },
    );
    if (!Array.isArray(payload)) {
      throw new ProviderRequestError(502, "NiftyImages returned an invalid widget list during credential validation");
    }
    return {
      profile: {
        accountId: `niftyimages:${createHash("sha256").update(input.apiKey).digest("hex").slice(0, 16)}`,
        displayName: "NiftyImages API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: niftyimagesApiBaseUrl,
        validationEndpoint: "/Widgets",
        widgetCount: payload.length,
      },
    };
  },
};

async function requestNiftyimagesJson(
  input: {
    path: string;
    params: Record<string, string | undefined>;
    phase: NiftyimagesRequestPhase;
  },
  context: NiftyimagesContext,
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal);
  try {
    const response = await context.fetcher(buildNiftyimagesUrl(input.path, input.params), {
      method: "GET",
      headers: {
        accept: "application/json",
        ApiKey: context.apiKey,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readNiftyimagesPayload(response);
    if (!response.ok) {
      throw mapNiftyimagesError(response.status, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "NiftyImages request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `NiftyImages request failed: ${error.message}` : "NiftyImages request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildNiftyimagesUrl(path: string, params: Record<string, string | undefined>): URL {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${niftyimagesApiBaseUrl}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function readNiftyimagesPayload(response: Response): Promise<unknown> {
  const text = await readProviderTextBody(response, "NiftyImages response", niftyimagesMaxResponseBytes);
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) {
      return text;
    }
    throw new ProviderRequestError(502, "NiftyImages returned invalid JSON");
  }
}

function mapNiftyimagesError(status: number, payload: unknown, phase: NiftyimagesRequestPhase): ProviderRequestError {
  const message = extractNiftyimagesErrorMessage(payload) ?? `NiftyImages request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message);
}

function extractNiftyimagesErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.Message) ??
    optionalString(record?.error) ??
    optionalString(record?.Error);
  if (message?.trim()) {
    return message.trim();
  }
  return Array.isArray(record?.errors)
    ? record.errors.find((error): error is string => typeof error === "string" && error.trim() !== "")
    : undefined;
}

function readDateRange(input: Record<string, unknown>): Record<string, string> {
  return compactObject({
    startDate: readOptionalString(input.startDate),
    endDate: readOptionalString(input.endDate),
  });
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value.trim();
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

function readOptionalIntegerString(value: unknown): string | undefined {
  return typeof value === "number" && Number.isInteger(value) ? String(value) : undefined;
}

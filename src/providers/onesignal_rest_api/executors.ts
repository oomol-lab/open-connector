import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "onesignal_rest_api";
const onesignalRestApiBaseUrl = "https://api.onesignal.com";
const onesignalValidationPath = "/notifications";

type OneSignalRequestPhase = "validate" | "execute";
type OneSignalActionHandler = (input: Record<string, unknown>, context: OneSignalContext) => Promise<unknown>;

interface OneSignalContext {
  apiKey: string;
  appId: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface OneSignalRequestInput {
  context: OneSignalContext;
  path: string;
  method: "GET" | "POST" | "DELETE";
  phase: OneSignalRequestPhase;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
}

export const onesignalRestApiActionHandlers: ProviderActionHandlers<"onesignal_rest_api", OneSignalActionHandler> = {
  create_push_notification(input, context) {
    ensureAppIdIsNotOverridden(input);
    ensureCreatePushNotificationBody(input);

    return requestOneSignalJson({
      context,
      path: "/notifications",
      method: "POST",
      query: {
        c: "push",
      },
      body: {
        app_id: context.appId,
        ...input,
      },
      phase: "execute",
    });
  },
  list_messages(input, context) {
    return requestOneSignalJson({
      context,
      path: "/notifications",
      method: "GET",
      query: compactObject({
        app_id: context.appId,
        limit: optionalInteger(input.limit),
        offset: optionalInteger(input.offset),
        kind: optionalInteger(input.kind),
        template_id: optionalString(input.template_id),
        time_offset: optionalString(input.time_offset),
      }),
      phase: "execute",
    });
  },
  get_message(input, context) {
    return requestOneSignalJson({
      context,
      path: `/notifications/${encodeURIComponent(requireMessageId(input))}`,
      method: "GET",
      query: {
        app_id: context.appId,
      },
      phase: "execute",
    });
  },
  cancel_message(input, context) {
    return requestOneSignalJson({
      context,
      path: `/notifications/${encodeURIComponent(requireMessageId(input))}`,
      method: "DELETE",
      query: {
        app_id: context.appId,
      },
      phase: "execute",
    });
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<OneSignalContext>({
  service,
  handlers: onesignalRestApiActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<OneSignalContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      appId: requireAppId(credential.metadata.appId ?? credential.values.appId),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const appId = requireAppId(input.values.appId);
    const context: OneSignalContext = {
      apiKey: input.apiKey,
      appId,
      fetcher,
      signal,
    };

    await requestOneSignalJson({
      context,
      path: onesignalValidationPath,
      method: "GET",
      query: {
        app_id: appId,
        limit: 1,
        offset: 0,
      },
      phase: "validate",
    });

    return {
      profile: {
        accountId: appId,
        displayName: "OneSignal App API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: onesignalRestApiBaseUrl,
        appId,
        validationEndpoint: onesignalValidationPath,
      },
    };
  },
};

async function requestOneSignalJson(input: OneSignalRequestInput): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(input.context.signal);

  try {
    const headers = new Headers({
      accept: "application/json",
      authorization: `Key ${input.context.apiKey}`,
      "user-agent": providerUserAgent,
    });
    if (input.body) {
      headers.set("content-type", "application/json");
    }

    const response = await input.context.fetcher(buildOneSignalUrl(input.path, input.query), {
      method: input.method,
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readOneSignalPayload(response);

    if (!response.ok) {
      throw createOneSignalError(response.status, payload, input.phase);
    }

    return normalizeOneSignalSuccessPayload(payload);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "OneSignal request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `OneSignal request failed: ${error.message}` : "OneSignal request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildOneSignalUrl(path: string, query: Record<string, string | number | boolean | undefined> = {}): URL {
  const url = new URL(path, onesignalRestApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function readOneSignalPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (!text) {
    return {};
  }

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new ProviderRequestError(502, "OneSignal returned malformed JSON");
    }
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function normalizeOneSignalSuccessPayload(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "OneSignal returned an invalid response body", payload);
  }
  return record;
}

function createOneSignalError(status: number, payload: unknown, _phase: OneSignalRequestPhase): ProviderRequestError {
  const message = readOneSignalErrorMessage(payload) ?? `OneSignal request failed with ${status}`;
  if (status === 401 || status === 403 || status === 404 || status === 400) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function readOneSignalErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const error = optionalString(record.error);
  if (error) {
    return error;
  }

  const errors = record.errors;
  if (Array.isArray(errors)) {
    const firstError = errors.find((value) => typeof value === "string");
    if (typeof firstError === "string" && firstError.trim()) {
      return firstError.trim();
    }
  }

  const nestedErrors = optionalRecord(errors);
  if (nestedErrors) {
    const firstValue = Object.values(nestedErrors)[0];
    if (typeof firstValue === "string" && firstValue.trim()) {
      return firstValue.trim();
    }
  }

  return optionalString(record.message);
}

function ensureCreatePushNotificationBody(input: Record<string, unknown>): void {
  if (!hasPushMessageBody(input)) {
    throw new ProviderRequestError(400, "create_push_notification requires contents or template_id");
  }

  if (countTargetingMethods(input) !== 1) {
    throw new ProviderRequestError(400, "create_push_notification requires exactly one targeting method");
  }
}

function hasPushMessageBody(input: Record<string, unknown>): boolean {
  const contents = optionalRecord(input.contents);
  if (contents && Object.keys(contents).length > 0) {
    return true;
  }
  return Boolean(optionalString(input.template_id));
}

function countTargetingMethods(input: Record<string, unknown>): number {
  const targetingMethods = [
    hasNonEmptyStringArray(input.included_segments),
    hasNonEmptyObject(input.include_aliases),
    hasNonEmptyStringArray(input.include_subscription_ids),
    hasNonEmptyObjectArray(input.filters),
  ];

  return targetingMethods.filter(Boolean).length;
}

function ensureAppIdIsNotOverridden(input: Record<string, unknown>): void {
  if ("app_id" in input) {
    throw new ProviderRequestError(
      400,
      "create_push_notification does not accept app_id because the connector injects it",
    );
  }
}

function requireAppId(value: unknown): string {
  const appId = optionalString(value);
  if (!appId) {
    throw new ProviderRequestError(400, "App ID is required");
  }
  return appId;
}

function requireMessageId(input: Record<string, unknown>): string {
  const messageId = optionalString(input.message_id);
  if (!messageId) {
    throw new ProviderRequestError(400, "message_id is required");
  }
  return messageId;
}

function hasNonEmptyStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.some((item) => Boolean(optionalString(item)));
}

function hasNonEmptyObject(value: unknown): boolean {
  const record = optionalRecord(value);
  return Boolean(record && Object.keys(record).length > 0);
}

function hasNonEmptyObjectArray(value: unknown): boolean {
  return Array.isArray(value) && value.some((item) => optionalRecord(item));
}

import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
  optionalStringArray,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
} from "../provider-runtime.ts";

const service = "mixmax";
const mixmaxApiBaseUrl = "https://api.mixmax.com";
const mixmaxValidationPath = "/v1/users/me";
const mixmaxRequestTimeoutMs = 30_000;
const mixmaxMaxResponseBytes = 10 * 1024 * 1024;

interface MixmaxContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type MixmaxQueryValue = string | number | boolean | string[] | undefined;
type MixmaxActionHandler = (input: Record<string, unknown>, context: MixmaxContext) => Promise<unknown>;

interface MixmaxRequestOptions {
  path: string;
  mode: "validate" | "execute";
  method?: string;
  query?: Record<string, MixmaxQueryValue>;
  body?: unknown;
}

export const mixmaxActionHandlers: ProviderActionHandlers<"mixmax", MixmaxActionHandler> = {
  list_sequences(input, context) {
    if (input.next !== undefined && input.previous !== undefined) {
      throw new ProviderRequestError(400, "Use either next or previous, not both.");
    }
    return requestMixmaxJson(
      {
        path: "/v1/sequences",
        query: compactObject({
          name: optionalString(input.name),
          expand: optionalString(input.expand),
          folder: optionalString(input.folder),
          limit: optionalNumber(input.limit),
          next: optionalString(input.next),
          previous: optionalString(input.previous),
          fields: optionalString(input.fields),
        }),
        mode: "execute",
      },
      context,
    );
  },
  list_sequence_recipients(input, context) {
    const sequenceId = requiredString(input.sequenceId, "sequenceId", providerInputError);
    const offset = optionalNumber(input.offset) ?? 0;
    const limit = optionalNumber(input.limit) ?? 50;
    if (offset + limit > 10_000) {
      throw new ProviderRequestError(400, "offset plus limit cannot exceed 10000.");
    }
    return requestMixmaxJson(
      {
        path: `/v1/sequences/${encodeURIComponent(sequenceId)}/recipients`,
        query: compactObject({
          analyticsFrom: optionalString(input.analyticsFrom),
          limit: optionalNumber(input.limit),
          offset: optionalNumber(input.offset),
          sortBy: optionalString(input.sortBy),
          sortDesc: optionalBoolean(input.sortDesc),
          includeVariables: optionalBoolean(input.includeVariables),
        }),
        mode: "execute",
      },
      context,
    );
  },
  add_sequence_recipients(input, context) {
    validateRecipients(input.recipients);
    const sequenceId = requiredString(input.sequenceId, "sequenceId", providerInputError);
    return requestMixmaxJson(
      {
        path: `/v1/sequences/${encodeURIComponent(sequenceId)}/recipients`,
        method: "POST",
        body: compactObject({
          recipients: input.recipients,
          scheduledAt: input.scheduledAt,
          enrich: optionalBoolean(input.enrich),
          allowMissingVariables: optionalBoolean(input.allowMissingVariables),
        }),
        mode: "execute",
      },
      context,
    );
  },
  search_sequence_recipients(input, context) {
    if (input.query === undefined && input.recipients === undefined) {
      throw new ProviderRequestError(400, "query or recipients is required.");
    }
    return requestMixmaxJson(
      {
        path: "/v1/sequences/search",
        query: compactObject({
          query: optionalString(input.query),
          recipients: optionalStringArray(input.recipients),
          sequenceId: optionalString(input.sequenceId),
          offset: optionalNumber(input.offset),
          limit: optionalNumber(input.limit),
        }),
        mode: "execute",
      },
      context,
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, mixmaxActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: mixmaxApiBaseUrl,
  auth: { type: "api_key_header", name: "X-API-Token" },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestMixmaxJson(
      { path: mixmaxValidationPath, mode: "validate" },
      { apiKey: input.apiKey, fetcher, signal },
    );
    const userId = optionalString(optionalRecord(payload)?._id);
    if (!userId) {
      throw new ProviderRequestError(502, "Mixmax returned a current-user response without _id");
    }
    return {
      profile: {
        accountId: `mixmax:user:${userId}`,
        displayName: "Mixmax API Token",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: mixmaxValidationPath,
        userId,
      },
    };
  },
};

async function requestMixmaxJson(input: MixmaxRequestOptions, context: MixmaxContext): Promise<unknown> {
  const url = new URL(input.path, mixmaxApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
    } else if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  const method = input.method ?? "GET";
  const timeout = createProviderTimeout(context.signal, mixmaxRequestTimeoutMs);
  try {
    const response = await context.fetcher(url, {
      method,
      headers: {
        accept: "application/json",
        "x-api-token": context.apiKey,
        ...(input.body !== undefined ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readMixmaxPayload(response);
    if (!response.ok) {
      throw mapMixmaxError(response, payload, input.mode);
    }
    if (payload === null) {
      throw new ProviderRequestError(502, "Mixmax returned an empty response body");
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, `Mixmax request timed out for ${method} ${url}`);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Mixmax request failed for ${method} ${url}: ${error.message}`
        : `Mixmax request failed for ${method} ${url}`,
    );
  } finally {
    timeout.cleanup();
  }
}

async function readMixmaxPayload(response: Response): Promise<unknown | null> {
  const text = await readProviderTextBody(response, "Mixmax response", mixmaxMaxResponseBytes);
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) {
      return { message: text };
    }
    throw new ProviderRequestError(502, "Mixmax returned invalid JSON");
  }
}

function mapMixmaxError(response: Response, payload: unknown, mode: "validate" | "execute"): ProviderRequestError {
  const object = optionalRecord(payload);
  const nestedError = optionalRecord(object?.error);
  const message =
    optionalString(object?.message) ??
    optionalString(nestedError?.message) ??
    optionalString(object?.error) ??
    `Mixmax request failed with status ${response.status}`;
  if (response.status === 401) {
    return new ProviderRequestError(mode === "validate" ? 400 : 401, message);
  }
  if ([400, 404, 409, 429].includes(response.status)) {
    return new ProviderRequestError(response.status === 409 ? 400 : response.status, message);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message);
}

function validateRecipients(value: unknown): void {
  if (!Array.isArray(value)) {
    return;
  }
  for (const recipientValue of value) {
    const recipient = optionalRecord(recipientValue);
    const variables = optionalRecord(recipient?.variables);
    if (recipient && variables && variables.email !== recipient.email && variables.Email !== recipient.email) {
      throw new ProviderRequestError(
        400,
        "Recipient variables must include email or Email matching the recipient email.",
      );
    }
  }
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

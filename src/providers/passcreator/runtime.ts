import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import {
  compactObject,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
  requiredStringArray,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export const passcreatorApiBaseUrl = "https://app.passcreator.com";
const passcreatorPassPath = "/api/v3/pass";
const passcreatorValidationPath = "/api/pass-template";
const passcreatorDefaultRequestTimeoutMs = 60_000;

export interface PasscreatorActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const passcreatorActionHandlers: ProviderActionHandlers<
  "passcreator",
  ProviderRuntimeHandler<PasscreatorActionContext>
> = {
  async list_pass_templates(_input, context) {
    const payload = await requestPasscreatorJson({
      url: new URL(passcreatorValidationPath, passcreatorApiBaseUrl),
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
    });
    return readResponseArray(payload, "Passcreator pass template response");
  },
  async get_pass_template_fields(input, context) {
    const templateId = requiredString(input.templateId, "templateId", inputError);
    const url = new URL(`/api/pass-template/${encodeURIComponent(templateId)}`, passcreatorApiBaseUrl);
    url.searchParams.set("zapierStyle", "true");
    const payload = await requestPasscreatorJson({
      url,
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
    });
    return readResponseArray(payload, "Passcreator pass template field response");
  },
  async create_pass(input, context) {
    const url = new URL(passcreatorPassPath, passcreatorApiBaseUrl);
    url.searchParams.set("async", "false");
    return requestPasscreatorJson({
      url,
      method: "POST",
      body: {
        data: requiredRecord(input.data, "data", inputError),
      },
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
    });
  },
  async list_passes(input, context) {
    const url = buildListPassesUrl(input);
    return requestPasscreatorJson({
      url,
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
    });
  },
};

export async function validatePasscreatorCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const templates = readResponseArray(
    await requestPasscreatorJson({
      url: new URL(passcreatorValidationPath, passcreatorApiBaseUrl),
      method: "GET",
      apiKey,
      fetcher,
      signal,
    }),
    "Passcreator validation response",
  );
  const firstTemplate = optionalRecord(templates[0]);

  return {
    profile: {
      accountId: "passcreator_api_key",
      displayName: "Passcreator API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: passcreatorApiBaseUrl,
      validationEndpoint: passcreatorValidationPath,
      accessibleTemplateCount: templates.length,
      firstTemplateName: optionalString(firstTemplate?.name),
    }),
  };
}

async function requestPasscreatorJson(input: {
  url: URL;
  method: "GET" | "POST";
  body?: Record<string, unknown>;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): Promise<unknown> {
  const timeoutHandle = createProviderTimeout(input.signal, passcreatorDefaultRequestTimeoutMs);

  try {
    const response = await input.fetcher(input.url, {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: input.apiKey,
        ...(input.body ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeoutHandle.signal,
    });
    const payload = await readPasscreatorPayload(response);

    if (!response.ok) {
      throw createPasscreatorError(response.status, payload);
    }
    assertSuccessfulPasscreatorPayload(payload);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeoutHandle.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Passcreator request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Passcreator request failed: ${error.message}` : "Passcreator request failed",
    );
  } finally {
    timeoutHandle.cleanup();
  }
}

function buildListPassesUrl(input: Record<string, unknown>) {
  const nextPage = optionalString(input.nextPage);
  if (nextPage) {
    if (
      input.pageSize !== undefined ||
      input.formatKeyAdditionalProperties !== undefined ||
      input.segmentId !== undefined ||
      input.query !== undefined ||
      input.fields !== undefined
    ) {
      throw new ProviderRequestError(
        400,
        "nextPage cannot be combined with pageSize, formatKeyAdditionalProperties, segmentId, query, or fields",
      );
    }
    return normalizePasscreatorNextPage(nextPage);
  }

  const url = new URL(passcreatorPassPath, passcreatorApiBaseUrl);
  const pageSize = optionalInteger(input.pageSize);
  if (input.pageSize !== undefined && (!pageSize || pageSize < 1)) {
    throw new ProviderRequestError(400, "pageSize must be a positive integer");
  }
  const formatKeyAdditionalProperties = optionalString(input.formatKeyAdditionalProperties);
  const segmentId = optionalString(input.segmentId);
  const query = optionalRecord(input.query);
  const fields = readOptionalStringArray(input.fields);

  if (segmentId && query) {
    throw new ProviderRequestError(400, "segmentId and query are alternative filter modes and cannot be combined");
  }

  if (pageSize !== undefined) {
    url.searchParams.set("pageSize", String(pageSize));
  }
  if (formatKeyAdditionalProperties) {
    url.searchParams.set("formatKeyAdditionalProperties", formatKeyAdditionalProperties);
  }
  if (segmentId) {
    url.searchParams.set("segmentId", segmentId);
  }
  if (query) {
    url.searchParams.set("query", Buffer.from(JSON.stringify(query)).toString("base64url"));
  }
  if (fields) {
    url.searchParams.set("fields", fields.join(","));
  }
  return url;
}

function normalizePasscreatorNextPage(value: string) {
  let candidate: URL;
  try {
    candidate = new URL(value);
  } catch {
    throw new ProviderRequestError(400, "nextPage must be a valid URL");
  }

  if (
    candidate.origin !== passcreatorApiBaseUrl ||
    candidate.pathname !== passcreatorPassPath ||
    candidate.username !== "" ||
    candidate.password !== "" ||
    candidate.hash !== ""
  ) {
    throw new ProviderRequestError(400, `nextPage must target ${passcreatorApiBaseUrl}${passcreatorPassPath}`);
  }

  const normalized = new URL(passcreatorPassPath, passcreatorApiBaseUrl);
  normalized.search = candidate.search;
  return normalized;
}

async function readPasscreatorPayload(response: Response) {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) {
      return { message: text.trim() };
    }
    throw new ProviderRequestError(502, "Passcreator returned invalid JSON");
  }
}

function assertSuccessfulPasscreatorPayload(payload: unknown) {
  const record = optionalRecord(payload);
  if (record?.success === false) {
    const reportedStatus =
      typeof record.statusCode === "number" && Number.isInteger(record.statusCode) ? record.statusCode : 200;
    throw createPasscreatorError(reportedStatus, payload);
  }
}

function createPasscreatorError(status: number, payload: unknown) {
  const message = extractPasscreatorErrorMessage(payload) ?? `Passcreator request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(status, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status >= 500 ? status : 502, message);
}

function extractPasscreatorErrorMessage(payload: unknown) {
  const record = optionalRecord(payload);
  const description = optionalString(record?.description);
  if (description) {
    return description;
  }
  const error = optionalString(record?.error);
  if (error) {
    return error;
  }

  const errors = record?.errors;
  if (!Array.isArray(errors)) {
    return optionalString(record?.message);
  }
  const messages = errors
    .map((error) => {
      if (typeof error === "string") {
        return error.trim();
      }
      const errorRecord = optionalRecord(error);
      return optionalString(errorRecord?.description) ?? optionalString(errorRecord?.message);
    })
    .filter((message): message is string => Boolean(message));
  return messages.length > 0 ? messages.join("; ") : undefined;
}

function readResponseArray(value: unknown, label: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} must be an array`);
  }
  return value;
}

function readOptionalStringArray(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  return requiredStringArray(value, "fields", inputError);
}

function inputError(message: string) {
  return new ProviderRequestError(400, message);
}

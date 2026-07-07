import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { FilloutActionName } from "./actions.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "fillout";
const filloutApiBaseUrl = "https://api.fillout.com";

type FilloutRequestPhase = "validate" | "execute";
type FilloutActionContext = ApiKeyProviderContext;
type FilloutActionHandler = (input: Record<string, unknown>, context: FilloutActionContext) => Promise<unknown>;

export const filloutActionHandlers: Record<FilloutActionName, FilloutActionHandler> = {
  list_forms(_input, context) {
    return listForms(context);
  },
  get_form_metadata(input, context) {
    return getFormMetadata(input, context);
  },
  list_submissions(input, context) {
    return listSubmissions(input, context);
  },
  get_submission(input, context) {
    return getSubmission(input, context);
  },
  create_submissions(input, context) {
    return createSubmissions(input, context);
  },
  delete_submission(input, context) {
    return deleteSubmission(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, filloutActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: filloutApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await filloutRequest({
      pathOrUrl: "/v1/api/forms",
      apiKey: input.apiKey,
      fetcher,
      signal,
      phase: "validate",
    });

    return {
      profile: {
        accountId: "api_key",
        displayName: "Fillout API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: filloutApiBaseUrl,
        validationEndpoint: "/v1/api/forms",
        formCount: readArrayPayload(payload, "forms").length,
      },
    };
  },
};

async function listForms(context: FilloutActionContext): Promise<unknown> {
  const payload = await filloutRequest({
    pathOrUrl: "/v1/api/forms",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    forms: readArrayPayload(payload, "forms"),
  };
}

async function getFormMetadata(input: Record<string, unknown>, context: FilloutActionContext): Promise<unknown> {
  const formId = readInputString(input.formId, "formId");
  const payload = await filloutRequest({
    pathOrUrl: `/v1/api/forms/${encodeURIComponent(formId)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    form: optionalRecord(payload) ?? {},
  };
}

async function listSubmissions(input: Record<string, unknown>, context: FilloutActionContext): Promise<unknown> {
  const formId = readInputString(input.formId, "formId");
  const url = new URL(`/v1/api/forms/${encodeURIComponent(formId)}/submissions`, filloutApiBaseUrl);

  for (const [key, value] of Object.entries(input)) {
    if (key !== "formId" && value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const payload = await filloutRequest({
    pathOrUrl: url,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const object = optionalRecord(payload) ?? {};

  return {
    submissions: readArrayPayload(object, "responses"),
    pagination: {
      totalResponses: readNonNegativeNumber(object.totalResponses),
      pageCount: readNonNegativeNumber(object.pageCount),
    },
  };
}

async function getSubmission(input: Record<string, unknown>, context: FilloutActionContext): Promise<unknown> {
  const formId = readInputString(input.formId, "formId");
  const submissionId = readInputString(input.submissionId, "submissionId");
  const payload = await filloutRequest({
    pathOrUrl: buildSubmissionUrl(formId, submissionId, input),
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const object = optionalRecord(payload) ?? {};

  return {
    submission: optionalRecord(object.submission) ?? object,
  };
}

async function createSubmissions(input: Record<string, unknown>, context: FilloutActionContext): Promise<unknown> {
  const formId = readInputString(input.formId, "formId");
  const payload = await filloutRequest({
    pathOrUrl: `/v1/api/forms/${encodeURIComponent(formId)}/submissions`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    init: {
      method: "POST",
      body: JSON.stringify({ submissions: input.submissions }),
    },
  });

  return {
    submissions: readArrayPayload(payload, "submissions", "responses"),
    raw: optionalRecord(payload) ?? {},
  };
}

async function deleteSubmission(input: Record<string, unknown>, context: FilloutActionContext): Promise<unknown> {
  const formId = readInputString(input.formId, "formId");
  const submissionId = readInputString(input.submissionId, "submissionId");
  const payload = await filloutRequest({
    pathOrUrl: `/v1/api/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(submissionId)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    init: {
      method: "DELETE",
    },
  });
  const object = optionalRecord(payload);

  return {
    deleted: true,
    submissionId: optionalString(object?.submissionId) ?? optionalString(object?.id) ?? null,
    raw: payload,
  };
}

function buildSubmissionUrl(formId: string, submissionId: string, input: Record<string, unknown>): URL {
  const url = new URL(
    `/v1/api/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(submissionId)}`,
    filloutApiBaseUrl,
  );
  if (input.includeEditLink !== undefined) {
    url.searchParams.set("includeEditLink", String(input.includeEditLink));
  }
  return url;
}

async function filloutRequest(input: {
  pathOrUrl: string | URL;
  apiKey: string;
  fetcher: typeof fetch;
  phase: FilloutRequestPhase;
  signal?: AbortSignal;
  init?: RequestInit;
}): Promise<unknown> {
  const url =
    typeof input.pathOrUrl === "string" ? new URL(input.pathOrUrl, filloutApiBaseUrl).toString() : input.pathOrUrl;
  try {
    const response = await input.fetcher(url, {
      method: input.init?.method ?? "GET",
      ...input.init,
      headers: filloutHeaders(input.apiKey, input.init?.headers),
      signal: input.signal,
    });
    const payload = await readFilloutPayload(response);
    if (!response.ok) {
      throw createFilloutError(response.status, response.statusText, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Fillout request failed: ${error.message}` : "Fillout request failed",
    );
  }
}

function filloutHeaders(apiKey: string, extraHeaders?: HeadersInit): Headers {
  const headers = new Headers(extraHeaders);
  headers.set("accept", "application/json");
  headers.set("authorization", `Bearer ${apiKey}`);
  headers.set("content-type", "application/json");
  headers.set("user-agent", providerUserAgent);
  return headers;
}

async function readFilloutPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createFilloutError(
  status: number,
  statusText: string,
  payload: unknown,
  phase: FilloutRequestPhase,
): ProviderRequestError {
  const message = extractFilloutMessage(payload) ?? statusText ?? "fillout request failed";
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function extractFilloutMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  return (
    optionalString(object.message) ??
    optionalString(object.error) ??
    optionalString(optionalRecord(object.error)?.message)
  );
}

function readArrayPayload(payload: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  const object = optionalRecord(payload);
  if (!object) {
    return [];
  }

  for (const key of keys) {
    const value = object[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function readInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readNonNegativeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

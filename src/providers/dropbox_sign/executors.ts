import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { DropboxSignActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "dropbox_sign";
export const dropboxSignApiBaseUrl = "https://api.hellosign.com/v3";

type DropboxSignRequestPhase = "validate" | "execute";
type DropboxSignActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const dropboxSignActionHandlers: Record<DropboxSignActionName, DropboxSignActionHandler> = {
  get_account(input, context) {
    return executeGetAccount(input, context);
  },
  list_signature_requests(input, context) {
    return executeListSignatureRequests(input, context);
  },
  get_signature_request(input, context) {
    return executeGetSignatureRequest(input, context);
  },
  list_templates(input, context) {
    return executeListTemplates(input, context);
  },
  get_template(input, context) {
    return executeGetTemplate(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, dropboxSignActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: dropboxSignApiBaseUrl,
  auth: { type: "api_key_basic", suffix: ":" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await dropboxSignRequest("/account", {
      apiKey: input.apiKey,
      fetcher,
      method: "GET",
      phase: "validate",
      signal,
    });
    const account = normalizeAccount(readWrappedObject(payload, "account"));
    return {
      profile: {
        accountId: account.accountId ? `dropbox_sign:${account.accountId}` : "dropbox_sign:api_key",
        displayName: account.emailAddress ?? account.accountId ?? "Dropbox Sign API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: dropboxSignApiBaseUrl,
        accountId: account.accountId ?? undefined,
        emailAddress: account.emailAddress ?? undefined,
        validationEndpoint: "/account",
      }),
    };
  },
};

async function executeGetAccount(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await dropboxSignRequest("/account", {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "GET",
    phase: "execute",
    signal: context.signal,
    query: compactObject({
      account_id: readOptionalTrimmedString(input.accountId),
      email_address: readOptionalTrimmedString(input.emailAddress),
    }),
  });

  return {
    account: normalizeAccount(readWrappedObject(payload, "account")),
  };
}

async function executeListSignatureRequests(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await dropboxSignRequest("/signature_request/list", {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "GET",
    phase: "execute",
    signal: context.signal,
    query: buildPageQuery(input),
  });
  const object = readResponseObject(payload);

  return {
    signatureRequests: readObjectArray(object.signature_requests).map(normalizeSignatureRequest),
    listInfo: normalizeListInfo(object.list_info),
    raw: object,
  };
}

async function executeGetSignatureRequest(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const signatureRequestId = readRequiredTrimmedString(input.signatureRequestId, "signatureRequestId");
  const payload = await dropboxSignRequest(`/signature_request/${encodeURIComponent(signatureRequestId)}`, {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "GET",
    phase: "execute",
    signal: context.signal,
  });

  return {
    signatureRequest: normalizeSignatureRequest(readWrappedObject(payload, "signature_request")),
  };
}

async function executeListTemplates(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await dropboxSignRequest("/template/list", {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "GET",
    phase: "execute",
    signal: context.signal,
    query: buildPageQuery(input),
  });
  const object = readResponseObject(payload);

  return {
    templates: readObjectArray(object.templates).map(normalizeTemplate),
    listInfo: normalizeListInfo(object.list_info),
    raw: object,
  };
}

async function executeGetTemplate(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const templateId = readRequiredTrimmedString(input.templateId, "templateId");
  const payload = await dropboxSignRequest(`/template/${encodeURIComponent(templateId)}`, {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "GET",
    phase: "execute",
    signal: context.signal,
  });

  return {
    template: normalizeTemplate(readWrappedObject(payload, "template")),
  };
}

async function dropboxSignRequest(
  path: string,
  input: {
    apiKey: string;
    fetcher: typeof fetch;
    method: "GET";
    phase: DropboxSignRequestPhase;
    query?: Record<string, string | number | undefined>;
    signal?: AbortSignal;
  },
) {
  const url = buildDropboxSignUrl(path);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: input.method,
      headers: dropboxSignHeaders(input.apiKey),
      signal: input.signal,
    });
    payload = await readDropboxSignPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Dropbox Sign request failed: ${error.message}` : "Dropbox Sign request failed",
    );
  }

  if (!response.ok) {
    throw createDropboxSignError(response, payload, input.phase);
  }

  return payload;
}

function dropboxSignHeaders(apiKey: string) {
  return {
    accept: "application/json",
    authorization: buildDropboxSignAuthorizationHeader(apiKey),
    "user-agent": providerUserAgent,
  };
}

export function buildDropboxSignAuthorizationHeader(apiKey: string) {
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}

function buildDropboxSignUrl(path: string) {
  const url = new URL(dropboxSignApiBaseUrl);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const basePath = url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;
  url.pathname = `${basePath}${normalizedPath}`;
  return url;
}

async function readDropboxSignPayload(response: Response) {
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

function createDropboxSignError(response: Response, payload: unknown, phase: DropboxSignRequestPhase) {
  const message = extractDropboxSignErrorMessage(payload) ?? response.statusText ?? "Dropbox Sign request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (response.status === 401 || response.status === 403) {
    return phase === "validate" ? new ProviderRequestError(400, message) : new ProviderRequestError(401, message);
  }

  return new ProviderRequestError(response.status || 502, message);
}

function extractDropboxSignErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  const error = optionalRecord(object.error);
  return (
    optionalString(error?.error_msg) ??
    optionalString(error?.message) ??
    optionalString(object.message) ??
    optionalString(object.error)
  );
}

function buildPageQuery(input: Record<string, unknown>) {
  return compactObject({
    account_id: readOptionalTrimmedString(input.accountId),
    page: optionalNumber(input.page),
    page_size: optionalNumber(input.pageSize),
    query: readOptionalTrimmedString(input.query),
  });
}

function normalizeAccount(account: Record<string, unknown>) {
  return {
    accountId: asNullableString(account.account_id),
    emailAddress: asNullableString(account.email_address),
    isLocked: asNullableBoolean(account.is_locked),
    isPaidSign: asNullableBoolean(account.is_paid_hs),
    isPaidFax: asNullableBoolean(account.is_paid_hf),
    callbackUrl: asNullableString(account.callback_url),
    roleCode: asNullableString(account.role_code),
    teamId: asNullableString(account.team_id),
    raw: account,
  };
}

function normalizeSignatureRequest(signatureRequest: Record<string, unknown>) {
  return {
    signatureRequestId: asNullableString(signatureRequest.signature_request_id),
    title: asNullableString(signatureRequest.title),
    subject: asNullableString(signatureRequest.subject),
    message: asNullableString(signatureRequest.message),
    isComplete: asNullableBoolean(signatureRequest.is_complete),
    isDeclined: asNullableBoolean(signatureRequest.is_declined),
    hasError: asNullableBoolean(signatureRequest.has_error),
    testMode: asNullableBoolean(signatureRequest.test_mode),
    createdAt: asNullableInteger(signatureRequest.created_at),
    expiresAt: asNullableInteger(signatureRequest.expires_at),
    raw: signatureRequest,
  };
}

function normalizeTemplate(template: Record<string, unknown>) {
  return {
    templateId: asNullableString(template.template_id),
    title: asNullableString(template.title),
    message: asNullableString(template.message),
    signerRoles: readObjectArray(template.signer_roles),
    ccRoles: readObjectArray(template.cc_roles),
    isCreator: asNullableBoolean(template.is_creator),
    canEdit: asNullableBoolean(template.can_edit),
    createdAt: asNullableInteger(template.created_at),
    raw: template,
  };
}

function normalizeListInfo(value: unknown) {
  const object = optionalRecord(value) ?? {};
  return {
    page: asNullableInteger(object.page),
    numPages: asNullableInteger(object.num_pages),
    numResults: asNullableInteger(object.num_results),
    pageSize: asNullableInteger(object.page_size),
  };
}

function readWrappedObject(payload: unknown, key: string) {
  const object = readResponseObject(payload);
  const value = object[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, `Dropbox Sign response is missing ${key}`);
  }
  return value as Record<string, unknown>;
}

function readResponseObject(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Dropbox Sign response must be an object");
  }
  return payload as Record<string, unknown>;
}

function readObjectArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item) => item && typeof item === "object" && !Array.isArray(item)) as Record<string, unknown>[];
}

function readRequiredTrimmedString(value: unknown, fieldName: string) {
  const trimmed = readOptionalTrimmedString(value);
  if (!trimmed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return trimmed;
}

function readOptionalTrimmedString(value: unknown) {
  const raw = optionalString(value);
  if (raw == null) {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed ? trimmed : undefined;
}

function asNullableString(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }
  return optionalString(value) ?? null;
}

function asNullableBoolean(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === "boolean" ? value : null;
}

function asNullableInteger(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }
  return Number.isInteger(value) ? value : null;
}

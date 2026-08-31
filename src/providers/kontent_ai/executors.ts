import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { optionalBoolean, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  isAbortLikeError,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "kontent_ai";
const kontentAiApiBaseUrl = "https://manage.kontent.ai/v2";
const kontentAiDefaultRequestTimeoutMs = 30_000;

type KontentAiPhase = "validate" | "execute";
type KontentAiIdentifierType = "id" | "codename" | "externalId";
type KontentAiActionHandler = (input: Record<string, unknown>, context: KontentAiActionContext) => Promise<unknown>;

interface KontentAiActionContext {
  apiKey: string;
  environmentId: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface KontentAiRequestResult {
  payload: unknown;
  continuationToken: string | null;
}

export const kontentAiActionHandlers: ProviderActionHandlers<"kontent_ai", KontentAiActionHandler> = {
  list_content_items(input, context) {
    return listKontentAiContentItems(input, context);
  },
  get_content_item(input, context) {
    return getKontentAiContentItem(input, context);
  },
  list_content_types(input, context) {
    return listKontentAiContentTypes(input, context);
  },
  get_content_type(input, context) {
    return getKontentAiContentType(input, context);
  },
  list_languages(input, context) {
    return listKontentAiLanguages(input, context);
  },
  get_language(input, context) {
    return getKontentAiLanguage(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<KontentAiActionContext>({
  service,
  handlers: kontentAiActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<KontentAiActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      environmentId: readCredentialEnvironmentId(credential.metadata.environmentId ?? credential.values.environmentId),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateKontentAiCredential(input.apiKey, input.values, fetcher, signal);
  },
};

async function validateKontentAiCredential(
  apiKey: string,
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
): Promise<CredentialValidationResult> {
  const environmentId = readCredentialEnvironmentId(values.environmentId);
  const path = buildEnvironmentPath(environmentId, "languages");
  await requestKontentAiJson({
    path,
    method: "GET",
    apiKey,
    fetcher,
    signal,
    phase: "validate",
  });

  return {
    profile: {
      accountId: `kontent_ai:${environmentId}`,
      displayName: `Kontent.ai ${environmentId}`,
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: kontentAiApiBaseUrl,
      environmentId,
      validationEndpoint: path,
    },
  };
}

async function listKontentAiContentItems(
  input: Record<string, unknown>,
  context: KontentAiActionContext,
): Promise<unknown> {
  const result = await requestKontentAiJson({
    path: buildEnvironmentPath(context.environmentId, "items"),
    method: "GET",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    continuationToken: optionalString(input.continuationToken),
  });
  const payload = requireRecord(result.payload, "Kontent.ai returned an invalid content item list");

  return {
    items: readArray(payload.items).map(normalizeKontentAiResource),
    continuationToken: result.continuationToken,
    raw: payload,
  };
}

async function getKontentAiContentItem(
  input: Record<string, unknown>,
  context: KontentAiActionContext,
): Promise<unknown> {
  const result = await requestKontentAiJson({
    path: buildIdentifierPath({
      environmentId: context.environmentId,
      family: "items",
      identifier: requiredString(input.identifier, "identifier", providerInputError),
      identifierType: readIdentifierType(input.identifierType),
    }),
    method: "GET",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const payload = requireRecord(result.payload, "Kontent.ai returned an invalid content item");

  return {
    item: normalizeKontentAiResource(payload),
    raw: payload,
  };
}

async function listKontentAiContentTypes(
  input: Record<string, unknown>,
  context: KontentAiActionContext,
): Promise<unknown> {
  const result = await requestKontentAiJson({
    path: buildEnvironmentPath(context.environmentId, "types"),
    method: "GET",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    continuationToken: optionalString(input.continuationToken),
  });
  const payload = requireRecord(result.payload, "Kontent.ai returned an invalid content type list");

  return {
    types: readArray(payload.types).map(normalizeKontentAiResource),
    continuationToken: result.continuationToken,
    raw: payload,
  };
}

async function getKontentAiContentType(
  input: Record<string, unknown>,
  context: KontentAiActionContext,
): Promise<unknown> {
  const result = await requestKontentAiJson({
    path: buildIdentifierPath({
      environmentId: context.environmentId,
      family: "types",
      identifier: requiredString(input.identifier, "identifier", providerInputError),
      identifierType: readIdentifierType(input.identifierType),
    }),
    method: "GET",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const payload = requireRecord(result.payload, "Kontent.ai returned an invalid content type");

  return {
    type: normalizeKontentAiResource(payload),
    raw: payload,
  };
}

async function listKontentAiLanguages(
  input: Record<string, unknown>,
  context: KontentAiActionContext,
): Promise<unknown> {
  const result = await requestKontentAiJson({
    path: buildEnvironmentPath(context.environmentId, "languages"),
    method: "GET",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    continuationToken: optionalString(input.continuationToken),
  });
  const payload = requireRecord(result.payload, "Kontent.ai returned an invalid language list");

  return {
    languages: readArray(payload.languages).map(normalizeKontentAiLanguage),
    continuationToken: result.continuationToken,
    raw: payload,
  };
}

async function getKontentAiLanguage(input: Record<string, unknown>, context: KontentAiActionContext): Promise<unknown> {
  const result = await requestKontentAiJson({
    path: buildIdentifierPath({
      environmentId: context.environmentId,
      family: "languages",
      identifier: requiredString(input.identifier, "identifier", providerInputError),
      identifierType: readIdentifierType(input.identifierType),
    }),
    method: "GET",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const payload = requireRecord(result.payload, "Kontent.ai returned an invalid language");

  return {
    language: normalizeKontentAiLanguage(payload),
    raw: payload,
  };
}

async function requestKontentAiJson(input: {
  path: string;
  method: "GET";
  apiKey: string;
  fetcher: typeof fetch;
  phase: KontentAiPhase;
  signal?: AbortSignal;
  continuationToken?: string;
}): Promise<KontentAiRequestResult> {
  const timeout = createProviderTimeout(input.signal, kontentAiDefaultRequestTimeoutMs);
  let response: Response;
  let payload: unknown;
  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${input.apiKey}`,
      "content-type": "application/json",
      "user-agent": providerUserAgent,
    };
    if (input.continuationToken) {
      headers["x-continuation"] = input.continuationToken;
    }

    response = await input.fetcher(buildKontentAiUrl(input.path), {
      method: input.method,
      headers,
      signal: timeout.signal,
    });
    payload = await readKontentAiPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(
        504,
        `Kontent.ai ${input.path} request timed out after ${Math.ceil(kontentAiDefaultRequestTimeoutMs / 1000)} seconds`,
      );
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Kontent.ai ${input.path} request failed: ${error.message}`
        : `Kontent.ai ${input.path} request failed`,
      error,
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createKontentAiError(response.status, payload, input.phase);
  }

  return {
    payload: payload ?? {},
    continuationToken:
      readPaginationContinuationToken(payload) ?? optionalString(response.headers.get("x-continuation")) ?? null,
  };
}

async function readKontentAiPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Kontent.ai returned invalid JSON");
  }
}

function createKontentAiError(status: number, payload: unknown, phase: KontentAiPhase): ProviderRequestError {
  const message = readKontentAiErrorMessage(payload) ?? `Kontent.ai request failed with ${status}`;
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 400 || status === 401 || status === 403 || status === 404) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status >= 400 ? status : 502, message, payload);
}

function readKontentAiErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const directMessage = optionalString(record.message);
  if (directMessage) {
    return directMessage;
  }

  const error = optionalRecord(record.error);
  const errorMessage = optionalString(error?.message);
  if (errorMessage) {
    return errorMessage;
  }

  const errors = Array.isArray(record.errors) ? record.errors : undefined;
  const firstError = optionalRecord(errors?.[0]);
  return optionalString(firstError?.message);
}

function readPaginationContinuationToken(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  const pagination = optionalRecord(record?.pagination);
  return optionalString(pagination?.continuation_token);
}

function readCredentialEnvironmentId(value: unknown): string {
  return requiredString(value, "environmentId", providerInputError);
}

function buildKontentAiUrl(path: string): string {
  return `${kontentAiApiBaseUrl}${path}`;
}

function buildEnvironmentPath(environmentId: string, family: "items" | "types" | "languages"): string {
  return `/projects/${encodeURIComponent(environmentId)}/${family}`;
}

function buildIdentifierPath(input: {
  environmentId: string;
  family: "items" | "types" | "languages";
  identifier: string;
  identifierType: KontentAiIdentifierType;
}): string {
  const basePath = buildEnvironmentPath(input.environmentId, input.family);
  const encodedIdentifier = encodeURIComponent(input.identifier);
  if (input.identifierType === "id") {
    return `${basePath}/${encodedIdentifier}`;
  }

  if (input.identifierType === "codename") {
    return `${basePath}/codename/${encodedIdentifier}`;
  }

  return `${basePath}/external-id/${encodedIdentifier}`;
}

function readIdentifierType(value: unknown): KontentAiIdentifierType {
  if (value === "id" || value === "codename" || value === "externalId") {
    return value;
  }

  throw new ProviderRequestError(400, "identifierType must be id, codename, or externalId");
}

function normalizeKontentAiResource(value: unknown): Record<string, unknown> {
  const record = requireRecord(value, "Kontent.ai returned an invalid resource object");
  return {
    id: optionalString(record.id) ?? null,
    name: optionalString(record.name) ?? null,
    codename: optionalString(record.codename) ?? null,
    externalId: optionalString(record.external_id) ?? null,
    raw: record,
  };
}

function normalizeKontentAiLanguage(value: unknown): Record<string, unknown> {
  const record = requireRecord(value, "Kontent.ai returned an invalid language object");
  return {
    id: optionalString(record.id) ?? null,
    name: optionalString(record.name) ?? null,
    codename: optionalString(record.codename) ?? null,
    externalId: optionalString(record.external_id) ?? null,
    isActive: optionalBoolean(record.is_active) ?? null,
    isDefault: optionalBoolean(record.is_default) ?? null,
    raw: record,
  };
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, message, value);
  }

  return record;
}

function readArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "Kontent.ai returned an invalid array", value);
  }

  return value;
}

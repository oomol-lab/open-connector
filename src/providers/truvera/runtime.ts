import type { CredentialValidationResult, ExecutionContext } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const truveraTestnetApiBaseUrl = "https://api-testnet.truvera.io";
const truveraProductionApiBaseUrl = "https://api.truvera.io";
const truveraProfilePath = "/data/profile";

type TruveraRequestPhase = "validate" | "execute";

export interface TruveraActionContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type TruveraActionHandler = (input: Record<string, unknown>, context: TruveraActionContext) => Promise<unknown>;

export const truveraActionHandlers: ProviderActionHandlers<"truvera", TruveraActionHandler> = {
  async get_profile(_input, context) {
    return {
      profile: parseProfile(
        await truveraRequestJson({
          apiBaseUrl: context.apiBaseUrl,
          path: truveraProfilePath,
          method: "GET",
          apiKey: context.apiKey,
          fetcher: context.fetcher,
          phase: "execute",
        }),
      ),
    };
  },
  async list_dids(input, context) {
    return {
      dids: parseDidList(
        await truveraRequestJson({
          apiBaseUrl: context.apiBaseUrl,
          path: "/dids",
          method: "GET",
          apiKey: context.apiKey,
          fetcher: context.fetcher,
          phase: "execute",
          query: compactStringRecord({
            offset: readOptionalInteger(input.offset, "offset")?.toString(),
            limit: readOptionalInteger(input.limit, "limit")?.toString(),
            type: readOptionalTrimmedString(input.type),
          }),
        }),
      ),
    };
  },
  async get_did(input, context) {
    return {
      didDocument: parseDidDocument(
        await truveraRequestJson({
          apiBaseUrl: context.apiBaseUrl,
          path: `/dids/${encodeURIComponent(readRequiredString(input.did, "did"))}`,
          method: "GET",
          apiKey: context.apiKey,
          fetcher: context.fetcher,
          phase: "execute",
        }),
      ),
    };
  },
  async create_did(input, context) {
    return parseJobStartedResult(
      await truveraRequestJson({
        apiBaseUrl: context.apiBaseUrl,
        path: "/dids",
        method: "POST",
        apiKey: context.apiKey,
        fetcher: context.fetcher,
        phase: "execute",
        body: compactObject({
          type: readOptionalTrimmedString(input.type),
          did: readOptionalTrimmedString(input.did),
          controller: readOptionalTrimmedString(input.controller),
          keyType: readOptionalTrimmedString(input.keyType),
          didcommServiceUrl: readOptionalTrimmedString(input.didcommServiceUrl),
          includeDidcommService: optionalBoolean(input.includeDidcommService),
        }),
      }),
    );
  },
  async delete_did(input, context) {
    return parseJobStartedResult(
      await truveraRequestJson({
        apiBaseUrl: context.apiBaseUrl,
        path: `/dids/${encodeURIComponent(readRequiredString(input.did, "did"))}`,
        method: "DELETE",
        apiKey: context.apiKey,
        fetcher: context.fetcher,
        phase: "execute",
        query: compactStringRecord({
          fromBlockchain: optionalBoolean(input.fromBlockchain)?.toString(),
        }),
      }),
    );
  },
  async list_credential_schemas(input, context) {
    return {
      schemas: parseSchemaList(
        await truveraRequestJson({
          apiBaseUrl: context.apiBaseUrl,
          path: "/schemas",
          method: "GET",
          apiKey: context.apiKey,
          fetcher: context.fetcher,
          phase: "execute",
          query: compactStringRecord({
            offset: readOptionalInteger(input.offset, "offset")?.toString(),
            limit: readOptionalInteger(input.limit, "limit")?.toString(),
            includeEcosystems: optionalBoolean(input.includeEcosystems)?.toString(),
          }),
        }),
      ),
    };
  },
  async get_credential_schema(input, context) {
    return {
      schema: parseSchemaSummary(
        await truveraRequestJson({
          apiBaseUrl: context.apiBaseUrl,
          path: `/schemas/${encodeURIComponent(readRequiredString(input.schemaId, "schemaId"))}`,
          method: "GET",
          apiKey: context.apiKey,
          fetcher: context.fetcher,
          phase: "execute",
        }),
      ),
    };
  },
  async create_credential_schema(input, context) {
    return parseJobStartedResult(
      await truveraRequestJson({
        apiBaseUrl: context.apiBaseUrl,
        path: "/schemas",
        method: "POST",
        apiKey: context.apiKey,
        fetcher: context.fetcher,
        phase: "execute",
        body: readRequiredObject(input.schema, "schema"),
      }),
    );
  },
  async delete_credential_schema(input, context) {
    return parseJobStartedResult(
      await truveraRequestJson({
        apiBaseUrl: context.apiBaseUrl,
        path: `/schemas/${encodeURIComponent(readRequiredString(input.schemaId, "schemaId"))}`,
        method: "DELETE",
        apiKey: context.apiKey,
        fetcher: context.fetcher,
        phase: "execute",
      }),
    );
  },
  async get_job(input, context) {
    return parseJob(
      await truveraRequestJson({
        apiBaseUrl: context.apiBaseUrl,
        path: `/jobs/${encodeURIComponent(readRequiredString(input.jobId, "jobId"))}`,
        method: "GET",
        apiKey: context.apiKey,
        fetcher: context.fetcher,
        phase: "execute",
      }),
    );
  },
};

export async function validateTruveraCredential(
  input: { apiKey: string; values: Record<string, string> },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const apiBaseUrl = resolveTruveraApiBaseUrl(input.values.apiBaseUrl);
  const payload = await truveraRequestJson({
    apiBaseUrl,
    path: truveraProfilePath,
    method: "GET",
    apiKey: input.apiKey,
    fetcher: options.fetcher,
    phase: "validate",
  });
  const profile = parseProfile(payload);
  return {
    profile: {
      accountId: profile.name || "truvera-api-key",
      displayName: profile.name || "Truvera API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl,
      validationEndpoint: truveraProfilePath,
      profileName: profile.name || undefined,
      profileImage: profile.image || undefined,
    }),
  };
}

export async function createTruveraContext(
  context: ExecutionContext,
  fetcher: typeof fetch,
): Promise<TruveraActionContext> {
  const credential = await context.getCredential("truvera");
  if (credential?.authType !== "api_key") {
    throw new ProviderRequestError(401, "Configure truvera API key credentials first.");
  }
  return {
    apiKey: credential.apiKey,
    apiBaseUrl: resolveTruveraApiBaseUrl(
      credential.values.apiBaseUrl ?? optionalString(credential.metadata.apiBaseUrl),
    ),
    fetcher,
    signal: context.signal,
  };
}

function resolveTruveraApiBaseUrl(value: unknown) {
  const candidate = optionalString(value)?.trim();
  if (!candidate) {
    return truveraTestnetApiBaseUrl;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new ProviderRequestError(400, "apiBaseUrl must be a valid URL");
  }

  if (parsed.protocol !== "https:") {
    throw new ProviderRequestError(400, "apiBaseUrl must use https");
  }

  const normalized = parsed.origin;
  if (normalized !== truveraTestnetApiBaseUrl && normalized !== truveraProductionApiBaseUrl) {
    throw new ProviderRequestError(400, "apiBaseUrl must be https://api-testnet.truvera.io or https://api.truvera.io");
  }

  return normalized;
}

async function truveraRequestJson(input: {
  apiBaseUrl: string;
  path: string;
  method: "GET" | "POST" | "DELETE";
  apiKey: string;
  fetcher: typeof fetch;
  phase: TruveraRequestPhase;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
}) {
  const url = buildTruveraUrl(input.apiBaseUrl, input.path, input.query);

  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: input.method,
      headers: truveraHeaders(input.apiKey, input.body ? { "content-type": "application/json" } : {}),
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
    });
    payload = await readTruveraPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `truvera request failed: ${error.message}` : "truvera request failed",
      error,
    );
  }

  if (!response.ok) {
    throw createTruveraError(response, payload, input.phase);
  }

  return payload;
}

function buildTruveraUrl(apiBaseUrl: string, path: string, query?: Record<string, string>) {
  const url = new URL(path, apiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value);
  }
  return url;
}

function truveraHeaders(apiKey: string, extraHeaders: Record<string, string>) {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
    "User-Agent": providerUserAgent,
    ...extraHeaders,
  };
}

async function readTruveraPayload(response: Response) {
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

function createTruveraError(response: Response, payload: unknown, phase: TruveraRequestPhase) {
  const message = readTruveraErrorMessage(payload) ?? response.statusText ?? "Truvera request failed";

  if (response.status === 402 || response.status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  }

  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message);
  }

  if (response.status === 400 || response.status === 404) {
    return new ProviderRequestError(response.status === 404 ? 404 : 400, message);
  }

  return new ProviderRequestError(response.status || 500, message);
}

function readTruveraErrorMessage(payload: unknown) {
  const record = optionalRecord(payload);
  const message = optionalString(record?.message);
  return message?.trim() || undefined;
}

function asProviderObject(value: unknown, context: string) {
  try {
    return requiredRecord(value, context);
  } catch (error) {
    const cause = error instanceof Error && error.message ? `: ${error.message}` : "";
    throw new ProviderRequestError(502, `${context} must be an object${cause}`);
  }
}

function parseProfile(payload: unknown) {
  const record = asProviderObject(payload, "Truvera profile");
  return {
    name: optionalString(record.name) ?? "",
    image: optionalString(record.image) ?? "",
  };
}

function parseDidList(payload: unknown) {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Truvera DID list must be an array");
  }

  return payload.map((item) => parseDidSummary(item));
}

function parseDidSummary(payload: unknown) {
  const record = asProviderObject(payload, "Truvera DID summary");
  return {
    id: normalizeNullableString(record.id),
    did: normalizeNullableString(record.did),
    type: normalizeNullableString(record.type),
    controller: normalizeNullableString(record.controller),
    credentialCount: normalizeNullableString(record.credentialCount),
    updatedLast: normalizeNullableString(record.updatedLast),
    profile: parseDidProfile(record.profile),
    keyId: normalizeNullableString(record.keyId),
    jobId: normalizeNullableString(record.jobId),
    trustRegistries: parseTrustRegistries(record.trustRegistries),
  };
}

function parseDidProfile(payload: unknown) {
  const record = optionalRecord(payload);
  if (!record) {
    return null;
  }

  return {
    name: normalizeNullableString(record.name),
    logo: normalizeNullableString(record.logo),
    description: normalizeNullableString(record.description),
  };
}

function parseTrustRegistries(payload: unknown) {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload.map((item) => {
    const record = asProviderObject(item, "Truvera trust registry");
    return {
      id: optionalString(record.id) ?? "",
      name: optionalString(record.name) ?? "",
      logoUrl: optionalString(record.logoUrl) ?? "",
    };
  });
}

function parseDidDocument(payload: unknown) {
  return asProviderObject(payload, "Truvera DID document");
}

function parseSchemaList(payload: unknown) {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Truvera schema list must be an array");
  }

  return payload.map((item) => parseSchemaSummary(item));
}

function parseSchemaSummary(payload: unknown) {
  const record = asProviderObject(payload, "Truvera schema summary");
  return {
    id: optionalString(record.id) ?? "",
    schema: parseNullableSchemaDefinition(record.schema),
    uri: normalizeNullableString(record.uri),
    created: normalizeNullableString(record.created),
    isOwner: normalizeNullableBoolean(record.isOwner),
    ownerName: normalizeNullableString(record.ownerName),
    ownerLogo: normalizeNullableString(record.ownerLogo),
  };
}

function parseNullableSchemaDefinition(payload: unknown) {
  const record = optionalRecord(payload);
  return record ?? null;
}

function parseJobStartedResult(payload: unknown) {
  const record = asProviderObject(payload, "Truvera job start result");
  return {
    jobId: readRequiredString(record.id, "job result id"),
    data: optionalRecord(record.data) ?? {},
  };
}

function parseJob(payload: unknown) {
  const record = asProviderObject(payload, "Truvera job");
  return {
    jobId: readRequiredString(record.id, "job id"),
    status: readRequiredString(record.status, "status"),
    result: optionalRecord(record.result) ?? {},
  };
}

function readRequiredString(value: unknown, fieldName: string) {
  const parsed = optionalString(value)?.trim();
  if (!parsed) {
    throw new ProviderRequestError(502, `${fieldName} must be a non-empty string`);
  }
  return parsed;
}

function readOptionalTrimmedString(value: unknown) {
  const parsed = optionalString(value)?.trim();
  return parsed || undefined;
}

function readOptionalInteger(value: unknown, fieldName: string) {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an integer`);
  }
  return value;
}

function readRequiredObject(value: unknown, fieldName: string) {
  try {
    return requiredRecord(value, "value");
  } catch {
    throw new ProviderRequestError(400, `${fieldName} must be an object`);
  }
}

function normalizeNullableString(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }
  return optionalString(value) ?? String(value);
}

function normalizeNullableBoolean(value: unknown) {
  return typeof value === "boolean" ? value : value == null ? null : Boolean(value);
}

function compactStringRecord(value: Record<string, string | undefined>): Record<string, string> | undefined {
  const compacted: Record<string, string> = {};
  for (const [key, child] of Object.entries(value)) {
    if (child !== undefined) {
      compacted[key] = child;
    }
  }

  return Object.keys(compacted).length > 0 ? compacted : undefined;
}

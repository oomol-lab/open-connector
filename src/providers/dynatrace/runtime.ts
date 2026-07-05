import type { CredentialValidationResult } from "../../core/types.ts";
import type { DynatraceActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl, queryParams } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export interface DynatraceContext {
  apiKey: string;
  environmentUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface DynatraceValidationCheck {
  path: string;
  query: Record<string, string | number | undefined>;
  scope: string;
}

interface DynatraceRequestOptions {
  apiKey: string;
  environmentUrl: string;
  path: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: DynatraceRequestPhase;
  query?: Record<string, string | number | undefined>;
}

const dynatraceDefaultRequestTimeoutMs = 30_000;
const dynatraceCredentialHelpUrl =
  "https://docs.dynatrace.com/docs/manage/identity-access-management/access-tokens-and-oauth-clients/access-tokens";
const validationChecks: DynatraceValidationCheck[] = [
  {
    path: "/api/v2/problems",
    query: { pageSize: 1 },
    scope: "problems.read",
  },
  {
    path: "/api/v2/entities",
    query: {
      pageSize: 1,
      entitySelector: 'type("HOST")',
    },
    scope: "entities.read",
  },
];

type DynatraceRequestPhase = "validate" | "execute";
type DynatraceActionHandler = (input: Record<string, unknown>, context: DynatraceContext) => Promise<unknown>;

export const dynatraceActionHandlers: Record<DynatraceActionName, DynatraceActionHandler> = {
  async list_problems(input, context) {
    const payload = await requestDynatraceJson({
      ...context,
      path: "/api/v2/problems",
      query: buildProblemListQuery(input),
      phase: "execute",
    });
    const record = readObjectPayload(payload);
    return {
      problems: readObjectArray(record.problems).map(normalizeProblem),
      totalCount: readNullableInteger(record.totalCount),
      pageSize: readNullableInteger(record.pageSize),
      nextPageKey: readNullableString(record.nextPageKey),
      raw: record,
    };
  },
  async list_entities(input, context) {
    const payload = await requestDynatraceJson({
      ...context,
      path: "/api/v2/entities",
      query: buildEntityListQuery(input),
      phase: "execute",
    });
    const record = readObjectPayload(payload);
    return {
      entities: readObjectArray(record.entities).map(normalizeEntity),
      totalCount: readNullableInteger(record.totalCount),
      pageSize: readNullableInteger(record.pageSize),
      nextPageKey: readNullableString(record.nextPageKey),
      raw: record,
    };
  },
  async get_entity(input, context) {
    const entityId = requiredString(input.entityId, "entityId");
    const payload = await requestDynatraceJson({
      ...context,
      path: `/api/v2/entities/${encodeURIComponent(entityId)}`,
      query: {
        fields: optionalString(input.fields),
      },
      phase: "execute",
    });
    const entity = readObjectPayload(payload);
    return {
      entity: normalizeEntity(entity),
      raw: entity,
    };
  },
};

export async function validateDynatraceCredential(
  apiKey: string,
  environmentUrlInput: string | undefined,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const environmentUrl = normalizeDynatraceEnvironmentUrl(environmentUrlInput);
  const grantedScopes: string[] = [];
  const validationEndpoints: string[] = [];
  const permissionErrors: ProviderRequestError[] = [];

  for (const check of validationChecks) {
    try {
      await requestDynatraceJson({
        apiKey,
        environmentUrl,
        path: check.path,
        query: check.query,
        fetcher,
        signal,
        phase: "validate",
      });
      grantedScopes.push(check.scope);
      validationEndpoints.push(check.path);
    } catch (error) {
      if (error instanceof ProviderRequestError && (error.status === 401 || error.status === 403)) {
        permissionErrors.push(error);
        continue;
      }
      throw error;
    }
  }

  if (grantedScopes.length === 0) {
    const permissionError = permissionErrors[0];
    throw (
      permissionError ??
      new ProviderRequestError(
        400,
        "Dynatrace API token must include at least one supported scope: problems.read or entities.read",
      )
    );
  }

  const accountLabel = readDynatraceAccountLabel(environmentUrl);
  return {
    profile: {
      accountId: `dynatrace:${accountLabel}`,
      displayName: accountLabel,
    },
    grantedScopes,
    metadata: {
      environmentUrl,
      validationEndpoints,
      credentialHelpUrl: dynatraceCredentialHelpUrl,
    },
  };
}

export function normalizeDynatraceEnvironmentUrl(input: string | undefined): string {
  const rawValue = input?.trim();
  if (!rawValue) {
    throw new ProviderRequestError(400, "environmentUrl is required");
  }

  const url = assertPublicHttpUrl(rawValue, {
    fieldName: "environmentUrl",
    createError: (message) => new ProviderRequestError(400, message),
  });
  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "environmentUrl must be an HTTPS URL");
  }
  url.username = "";
  url.password = "";
  url.pathname = readDynatraceManagedEnvironmentPath(url.pathname);
  url.search = "";
  url.hash = "";
  return trimTrailingSlash(url.toString());
}

async function requestDynatraceJson(options: DynatraceRequestOptions): Promise<unknown> {
  const url = new URL(`${options.environmentUrl}${options.path}`);
  for (const [key, value] of Object.entries(queryParams(options.query ?? {}))) {
    url.searchParams.set(key, value);
  }

  const timeout = createProviderTimeout(options.signal, dynatraceDefaultRequestTimeoutMs);
  try {
    const response = await options.fetcher(url, {
      method: "GET",
      headers: dynatraceHeaders(options.apiKey),
      signal: timeout.signal,
    });
    const payload = await readResponsePayload(response);
    if (!response.ok) {
      throw mapDynatraceError(response, payload, options.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Dynatrace request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Dynatrace request failed: ${error.message}` : "Dynatrace request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function dynatraceHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Api-Token ${apiKey}`,
    "user-agent": providerUserAgent,
  };
}

function buildProblemListQuery(input: Record<string, unknown>): Record<string, string | number | undefined> {
  return compactObject({
    problemSelector: optionalString(input.problemSelector),
    entitySelector: optionalString(input.entitySelector),
    nextPageKey: optionalString(input.nextPageKey),
    pageSize: optionalInteger(input.pageSize),
    from: optionalString(input.from),
    to: optionalString(input.to),
    fields: optionalString(input.fields),
  });
}

function buildEntityListQuery(input: Record<string, unknown>): Record<string, string | number | undefined> {
  return compactObject({
    entitySelector: optionalString(input.entitySelector),
    nextPageKey: optionalString(input.nextPageKey),
    pageSize: optionalInteger(input.pageSize),
    fields: optionalString(input.fields),
  });
}

function normalizeProblem(record: Record<string, unknown>): Record<string, unknown> {
  return {
    problemId: readNullableString(record.problemId),
    displayId: readNullableString(record.displayId),
    title: readNullableString(record.title),
    status: readNullableString(record.status),
    severityLevel: readNullableString(record.severityLevel),
    raw: record,
  };
}

function normalizeEntity(record: Record<string, unknown>): Record<string, unknown> {
  return {
    entityId: readNullableString(record.entityId),
    displayName: readNullableString(record.displayName),
    type: readNullableString(record.type),
    raw: record,
  };
}

function readDynatraceManagedEnvironmentPath(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "e" && segments[1]) {
    return `/e/${segments[1]}`;
  }
  return "";
}

function readDynatraceAccountLabel(environmentUrl: string): string {
  const url = new URL(environmentUrl);
  const pathname = trimTrailingSlash(url.pathname);
  return pathname ? `${url.host}${pathname}` : url.host;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNullableInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function readObjectPayload(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Dynatrace response must be a JSON object", payload);
  }
  return record;
}

function readObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is Record<string, unknown> => optionalRecord(item) !== undefined);
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Dynatrace response was not valid JSON");
  }
}

function mapDynatraceError(response: Response, payload: unknown, phase: DynatraceRequestPhase): ProviderRequestError {
  const message = readDynatraceErrorMessage(payload) ?? `Dynatrace request failed with ${response.status}`;
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(response.status || 500, message, payload);
}

function readDynatraceErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  const error = optionalRecord(record.error);
  const nestedMessage = optionalString(error?.message);
  if (nestedMessage) {
    return nestedMessage;
  }
  return optionalString(record.message);
}

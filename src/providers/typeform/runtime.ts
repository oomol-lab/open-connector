import type { BearerProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { TypeformActionName } from "./actions.ts";

import {
  compactObject,
  objectArray,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const typeformApiBaseUrl: string = "https://api.typeform.com";
const typeformValidationPath = "/me";
const typeformDefaultRequestTimeoutMs = 30_000;

type TypeformRequestPhase = "validate" | "execute";
type TypeformQueryValue = string | number | undefined;
type TypeformActionHandler = ProviderRuntimeHandler<BearerProviderContext>;

export const typeformActionHandlers: Record<TypeformActionName, TypeformActionHandler> = {
  async get_current_user(_input, context) {
    return {
      user: await requestTypeformObject({
        accessToken: context.accessToken,
        path: typeformValidationPath,
        fetcher: context.fetcher,
        phase: "execute",
        signal: context.signal,
      }),
    };
  },
  list_forms(input, context) {
    return requestTypeformList({
      accessToken: context.accessToken,
      path: "/forms",
      fetcher: context.fetcher,
      phase: "execute",
      query: compactObject({
        page: readOptionalPositiveInteger(input.page, "page"),
        search: optionalString(input.search),
        sort_by: optionalString(input.sortBy),
        order_by: optionalString(input.orderBy),
        page_size: readOptionalPositiveInteger(input.pageSize, "pageSize"),
        workspace_id: optionalString(input.workspaceId),
      }),
      signal: context.signal,
    });
  },
  async get_form(input, context) {
    const formId = requiredString(input.formId, "formId", badInput);
    return {
      form: await requestTypeformObject({
        accessToken: context.accessToken,
        path: `/forms/${encodeURIComponent(formId)}`,
        fetcher: context.fetcher,
        phase: "execute",
        notFoundAsInvalidInput: true,
        signal: context.signal,
      }),
    };
  },
  list_form_responses(input, context) {
    const formId = requiredString(input.formId, "formId", badInput);
    return requestTypeformList({
      accessToken: context.accessToken,
      path: `/forms/${encodeURIComponent(formId)}/responses`,
      fetcher: context.fetcher,
      phase: "execute",
      notFoundAsInvalidInput: true,
      query: compactObject({
        page_size: readOptionalPositiveInteger(input.pageSize, "pageSize"),
        since: optionalString(input.since),
        until: optionalString(input.until),
        after: optionalString(input.after),
        before: optionalString(input.before),
        query: optionalString(input.query),
        sort: optionalString(input.sort),
        fields: joinCommaSeparated(readOptionalStringArray(input.fields, "fields")),
        response_type: joinCommaSeparated(readOptionalStringArray(input.responseType, "responseType")),
        answered_fields: joinCommaSeparated(readOptionalStringArray(input.answeredFields, "answeredFields")),
        included_response_ids: joinCommaSeparated(
          readOptionalStringArray(input.includedResponseIds, "includedResponseIds"),
        ),
        excluded_response_ids: joinCommaSeparated(
          readOptionalStringArray(input.excludedResponseIds, "excludedResponseIds"),
        ),
      }),
      signal: context.signal,
    });
  },
  list_workspaces(input, context) {
    return requestTypeformList({
      accessToken: context.accessToken,
      path: "/workspaces",
      fetcher: context.fetcher,
      phase: "execute",
      query: compactObject({
        page: readOptionalPositiveInteger(input.page, "page"),
        search: optionalString(input.search),
        page_size: readOptionalPositiveInteger(input.pageSize, "pageSize"),
      }),
      signal: context.signal,
    });
  },
  async get_workspace(input, context) {
    const workspaceId = requiredString(input.workspaceId, "workspaceId", badInput);
    return {
      workspace: await requestTypeformObject({
        accessToken: context.accessToken,
        path: `/workspaces/${encodeURIComponent(workspaceId)}`,
        fetcher: context.fetcher,
        phase: "execute",
        notFoundAsInvalidInput: true,
        signal: context.signal,
      }),
    };
  },
};

export async function validateTypeformCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<{
  profile: {
    accountId: string;
    displayName: string;
    grantedScopes: string[];
  };
  metadata: Record<string, unknown>;
}> {
  return fetchTypeformCurrentAccount(apiKey, fetcher, signal);
}

export async function fetchTypeformCurrentAccount(
  accessToken: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<{
  profile: {
    accountId: string;
    displayName: string;
    grantedScopes: string[];
  };
  metadata: Record<string, unknown>;
}> {
  const user = await requestTypeformObject({
    accessToken,
    path: typeformValidationPath,
    fetcher,
    phase: "validate",
    signal,
  });

  return buildTypeformAccountProfile(user);
}

async function requestTypeformList(input: {
  accessToken: string;
  path: string;
  fetcher: ProviderFetch;
  phase: TypeformRequestPhase;
  query?: Record<string, TypeformQueryValue>;
  notFoundAsInvalidInput?: boolean;
  signal?: AbortSignal;
}): Promise<Record<string, unknown>> {
  const payload = await requestTypeformJson(input);
  const object = requireObject(payload, "Typeform list response");

  return {
    items: objectArray(object.items, "items", providerOutput),
    pageCount: requireNonNegativeInteger(object.page_count, "page_count"),
    totalItems: requireNonNegativeInteger(object.total_items, "total_items"),
  };
}

async function requestTypeformObject(input: {
  accessToken: string;
  path: string;
  fetcher: ProviderFetch;
  phase: TypeformRequestPhase;
  query?: Record<string, TypeformQueryValue>;
  notFoundAsInvalidInput?: boolean;
  signal?: AbortSignal;
}): Promise<Record<string, unknown>> {
  const payload = await requestTypeformJson(input);
  return requireObject(payload, "Typeform object response");
}

async function requestTypeformJson(input: {
  accessToken: string;
  path: string;
  fetcher: ProviderFetch;
  phase: TypeformRequestPhase;
  query?: Record<string, TypeformQueryValue>;
  notFoundAsInvalidInput?: boolean;
  signal?: AbortSignal;
}): Promise<unknown> {
  const url = new URL(input.path, typeformApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const timeoutHandle = createProviderTimeout(input.signal, typeformDefaultRequestTimeoutMs);

  try {
    const response = await input.fetcher(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${input.accessToken}`,
        "User-Agent": providerUserAgent,
      },
      signal: timeoutHandle.signal,
    });
    const responseText = await response.text();
    const payload = parseJsonObject(responseText);

    if (!response.ok) {
      throw mapTypeformError({
        status: response.status,
        phase: input.phase,
        payload: payload.value,
        notFoundAsInvalidInput: input.notFoundAsInvalidInput,
      });
    }

    if (payload.kind === "empty") {
      throw new ProviderRequestError(502, `typeform ${input.path} returned an empty response body`);
    }

    if (payload.kind === "invalid") {
      throw new ProviderRequestError(502, `typeform ${input.path} returned invalid JSON`);
    }

    return payload.value;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeoutHandle.didTimeout()) {
      throw new ProviderRequestError(504, "typeform request timed out");
    }

    const message = error instanceof Error && error.message ? error.message : "unknown Typeform error";
    throw new ProviderRequestError(504, `typeform request failed: ${message}`);
  } finally {
    timeoutHandle.cleanup();
  }
}

function parseJsonObject(value: string):
  | {
      kind: "empty";
      value: null;
    }
  | {
      kind: "json";
      value: unknown;
    }
  | {
      kind: "invalid";
      value: null;
    } {
  if (!value) {
    return {
      kind: "empty",
      value: null,
    };
  }

  try {
    return {
      kind: "json",
      value: JSON.parse(value) as unknown,
    };
  } catch {
    return {
      kind: "invalid",
      value: null,
    };
  }
}

function mapTypeformError(input: {
  status: number;
  phase: TypeformRequestPhase;
  payload: unknown;
  notFoundAsInvalidInput?: boolean;
}): ProviderRequestError {
  const message = extractTypeformErrorMessage(input.payload) ?? `typeform request failed with status ${input.status}`;

  if (input.status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (input.phase === "validate") {
    if (input.status === 401 || input.status === 403) {
      return new ProviderRequestError(400, message);
    }

    return new ProviderRequestError(input.status, message);
  }

  if (input.status === 401 || input.status === 403) {
    return new ProviderRequestError(401, message);
  }

  if (input.status === 400 || (input.status === 404 && input.notFoundAsInvalidInput)) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(input.status, message);
}

function extractTypeformErrorMessage(payload: unknown): string | undefined {
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  return optionalString(object.description) ?? optionalString(object.message) ?? optionalString(object.error);
}

function buildTypeformAccountProfile(user: Record<string, unknown>): {
  profile: {
    accountId: string;
    displayName: string;
    grantedScopes: string[];
  };
  metadata: Record<string, unknown>;
} {
  const account = optionalRecord(user.account);
  const accountId =
    optionalString(user.email) ?? optionalString(user.alias) ?? optionalString(account?.id) ?? "typeform-user";
  const displayName = optionalString(user.alias) ?? optionalString(user.email) ?? "Typeform User";

  return {
    profile: {
      accountId,
      displayName,
      grantedScopes: [],
    },
    metadata: compactObject({
      apiBaseUrl: typeformApiBaseUrl,
      validationEndpoint: typeformValidationPath,
      alias: optionalString(user.alias),
      email: optionalString(user.email),
      language: optionalString(user.language),
      accountId: optionalString(account?.id),
    }),
  };
}

function readOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }

  return value.map((item) => requiredString(item, fieldName, badInput));
}

function joinCommaSeparated(value: string[] | undefined): string | undefined {
  if (!value || value.length === 0) {
    return undefined;
  }
  return value.join(",");
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `invalid ${label}`);
  }
  return record;
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value == null) {
    return undefined;
  }

  const parsed = optionalInteger(value);
  if (parsed == null || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }

  return parsed;
}

function requireNonNegativeInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed == null || parsed < 0) {
    throw new ProviderRequestError(502, `invalid Typeform ${fieldName} value`);
  }
  return parsed;
}

function badInput(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function providerOutput(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}

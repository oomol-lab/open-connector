import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerUserAgent,
  readProviderTextBody,
  requiredInputString,
} from "../provider-runtime.ts";

export const salesloftApiBaseUrl = "https://api.salesloft.com";

type SalesloftActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface SalesloftRequestInput {
  path: string;
  apiKey: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
  query?: Record<string, unknown>;
}

interface SalesloftPayload {
  data?: unknown;
  metadata?: unknown;
  [key: string]: unknown;
}

export const salesloftActionHandlers: ProviderActionHandlers<"salesloft", SalesloftActionHandler> = {
  async get_current_user(_input, context) {
    const payload = await requestSalesloft({
      path: "/v2/me",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
    });

    return {
      user: readResponseObject(payload.data, "Salesloft user"),
      metadata: optionalRecord(payload.metadata) ?? null,
    };
  },
  async list_people(input, context) {
    const payload = await requestSalesloft({
      path: "/v2/people",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      query: buildListQuery(input),
    });

    return {
      people: readResponseObjectArray(payload.data, "Salesloft people"),
      metadata: optionalRecord(payload.metadata) ?? null,
    };
  },
  async get_person(input, context) {
    const payload = await requestSalesloft({
      path: `/v2/people/${encodeURIComponent(requiredInputString(input.id, "id"))}`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
    });

    return {
      person: readResponseObject(payload.data, "Salesloft person"),
      metadata: optionalRecord(payload.metadata) ?? null,
    };
  },
  async list_accounts(input, context) {
    const payload = await requestSalesloft({
      path: "/v2/accounts",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      query: buildListQuery(input),
    });

    return {
      accounts: readResponseObjectArray(payload.data, "Salesloft accounts"),
      metadata: optionalRecord(payload.metadata) ?? null,
    };
  },
  async get_account(input, context) {
    const payload = await requestSalesloft({
      path: `/v2/accounts/${encodeURIComponent(requiredInputString(input.id, "id"))}`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
    });

    return {
      account: readResponseObject(payload.data, "Salesloft account"),
      metadata: optionalRecord(payload.metadata) ?? null,
    };
  },
  async list_cadences(input, context) {
    const payload = await requestSalesloft({
      path: "/v2/cadences",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      query: buildListQuery(input),
    });

    return {
      cadences: readResponseObjectArray(payload.data, "Salesloft cadences"),
      metadata: optionalRecord(payload.metadata) ?? null,
    };
  },
  async get_cadence(input, context) {
    const payload = await requestSalesloft({
      path: `/v2/cadences/${encodeURIComponent(requiredInputString(input.id, "id"))}`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
    });

    return {
      cadence: readResponseObject(payload.data, "Salesloft cadence"),
      metadata: optionalRecord(payload.metadata) ?? null,
    };
  },
};

export async function validateSalesloftCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestSalesloft({
    path: "/v2/me",
    apiKey,
    fetcher,
    signal,
  });
  const user = readResponseObject(payload.data, "Salesloft user");
  const accountId = optionalString(user.guid) ?? String(user.id ?? "");
  const displayName =
    optionalString(user.name) ?? optionalString(user.email) ?? optionalString(user.guid) ?? "Salesloft API Key";

  return {
    profile: {
      accountId,
      displayName,
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: salesloftApiBaseUrl,
      validationEndpoint: "/v2/me",
      userId: user.id,
      userGuid: user.guid,
      userEmail: user.email,
      userName: user.name,
    }),
  };
}

async function requestSalesloft(input: SalesloftRequestInput): Promise<SalesloftPayload> {
  const url = new URL(`${salesloftApiBaseUrl}${input.path}`);
  if (input.query) {
    appendQueryObject(url, input.query);
  }

  const response = await input.fetcher(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${input.apiKey}`,
      "user-agent": providerUserAgent,
    },
    signal: input.signal,
  });

  const rawBody = await readProviderTextBody(response, "Salesloft response");
  const payload = parseSalesloftJson(rawBody, response.status);
  if (!response.ok) {
    throw mapSalesloftError(response.status, payload, rawBody);
  }

  return payload;
}

function buildListQuery(input: Record<string, unknown>): Record<string, unknown> {
  return {
    page: input.page,
    per_page: input.perPage,
    sort_by: input.sortBy,
    sort_direction: input.sortDirection,
    ...optionalRecord(input.filters),
  };
}

function appendQueryObject(url: URL, input: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(input)) {
    appendQueryValue(url, key, value);
  }
}

function appendQueryValue(url: URL, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      appendQueryValue(url, key, item);
    }
    return;
  }

  const objectValue = optionalRecord(value);
  if (objectValue) {
    for (const [childKey, childValue] of Object.entries(objectValue)) {
      appendQueryValue(url, `${key}[${childKey}]`, childValue);
    }
    return;
  }

  url.searchParams.append(key, String(value));
}

function parseSalesloftJson(rawBody: string, status: number): SalesloftPayload {
  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody) as SalesloftPayload;
  } catch (error) {
    throw new ProviderRequestError(
      status === 429 ? 429 : 500,
      `Salesloft returned invalid JSON (${status}): ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function mapSalesloftError(status: number, payload: SalesloftPayload, rawBody: string): ProviderRequestError {
  const message = readSalesloftErrorMessage(payload) ?? `Salesloft request failed with ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 422) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(500, rawBody ? message : `Salesloft request failed with ${status}`, payload);
}

function readSalesloftErrorMessage(payload: SalesloftPayload): string | undefined {
  if (typeof payload.error === "string") {
    return payload.error;
  }

  const error = optionalRecord(payload.error);
  if (error) {
    return optionalString(error.message) ?? optionalString(error.description) ?? optionalString(error.detail);
  }

  const errors = optionalRecord(payload.errors);
  if (errors) {
    for (const [field, value] of Object.entries(errors)) {
      if (Array.isArray(value) && value.length > 0) {
        return `${field}: ${value.map((item) => String(item)).join(", ")}`;
      }
      if (typeof value === "string") {
        return `${field}: ${value}`;
      }
    }
  }

  return optionalString(payload.message);
}

function readResponseObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(500, `${label} response did not include an object`, value);
  }
  return record;
}

function readResponseObjectArray(value: unknown, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(500, `${label} response did not include an array`, value);
  }

  return value.map((item) => readResponseObject(item, label));
}

import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError, runProviderRequest } from "../provider-runtime.ts";

export const toriiApiBaseUrl = "https://api.toriihq.com/v1.0";

const toriiValidationPath = "/orgs/my";

type ToriiPhase = "validate" | "execute";

interface ToriiRequestOptions {
  path: string;
  phase: ToriiPhase;
  query?: URLSearchParams;
  extraQuery?: Record<string, unknown>;
  apiVersion?: string;
}

export const toriiActionHandlers: ProviderActionHandlers<"torii", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async get_organization(_input, context) {
    const body = await requestToriiObject(
      {
        path: toriiValidationPath,
        phase: "execute",
      },
      context,
    );

    return {
      organization: requireProviderObject(body.org, "Torii organization response org"),
      raw: body,
    };
  },

  async list_apps(input, context) {
    const body = await requestToriiObject(
      {
        path: "/apps",
        query: buildQueryParams(input, ["fields", "aggs", "q", "sort", "filters", "size", "cursor", "includeLicenses"]),
        phase: "execute",
      },
      context,
    );

    return listResponse(body, "apps", "Torii apps list response");
  },

  async get_app(input, context) {
    const body = await requestToriiObject(
      {
        path: `/apps/${readRequiredInteger(input, "appId")}`,
        query: buildQueryParams(input, ["fields", "includeLicenses"]),
        phase: "execute",
      },
      context,
    );

    return {
      app: requireProviderObject(body.app, "Torii app response app"),
      raw: body,
    };
  },

  async list_users(input, context) {
    const body = await requestToriiObject(
      {
        path: "/users",
        query: buildQueryParams(input, [
          "email",
          "lifecycleStatus",
          "isDeletedInIdentitySources",
          "isExternal",
          "firstName",
          "lastName",
          "idUsers",
          "sort",
          "size",
          "cursor",
          "aggs",
          "fields",
          "q",
          "view",
          "filters",
        ]),
        phase: "execute",
      },
      context,
    );

    return listResponse(body, "users", "Torii users list response");
  },

  async get_user(input, context) {
    const body = await requestToriiObject(
      {
        path: `/users/${readRequiredInteger(input, "userId")}`,
        phase: "execute",
      },
      context,
    );

    return {
      user: requireProviderObject(body.user, "Torii user response user"),
      raw: body,
    };
  },

  async list_contracts(input, context) {
    const body = await requestToriiObject(
      {
        path: "/contracts",
        query: buildQueryParams(input, ["fields", "q", "sort", "size", "cursor", "aggs", "filters"]),
        extraQuery: optionalRecord(input.filterFields),
        apiVersion: optionalString(input.apiVersion),
        phase: "execute",
      },
      context,
    );

    return listResponse(body, "contracts", "Torii contracts list response");
  },

  async get_contract(input, context) {
    const body = await requestToriiObject(
      {
        path: `/contracts/${readRequiredInteger(input, "contractId")}`,
        query: buildQueryParams(input, ["fields"]),
        apiVersion: optionalString(input.apiVersion),
        phase: "execute",
      },
      context,
    );

    return {
      contract: requireProviderObject(body.contract, "Torii contract response contract"),
      raw: body,
    };
  },

  async list_transactions(input, context) {
    const body = await requestToriiObject(
      {
        path: "/transactions",
        query: buildQueryParams(input, ["idApp", "source", "q", "mappingStatus", "sort", "size", "cursor", "fields"]),
        phase: "execute",
      },
      context,
    );

    return listResponse(body, "transactions", "Torii transactions list response");
  },

  async list_workflows(input, context) {
    const body = await requestToriiObject(
      {
        path: "/workflows",
        query: buildQueryParams(input, ["type"]),
        phase: "execute",
      },
      context,
    );

    return {
      workflows: requireObjectArrayPayload(body.workflows, "Torii workflows list response"),
      raw: body,
    };
  },
};

export async function validateToriiCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const body = await requestToriiObject(
    {
      path: toriiValidationPath,
      phase: "validate",
    },
    { apiKey, fetcher, signal },
  );
  const org = requireProviderObject(body.org, "Torii organization response org");
  const companyName = optionalString(org.companyName);
  const domain = optionalString(org.domain);
  const organizationId = optionalNumber(org.id);

  return {
    profile: {
      accountId: organizationId !== undefined ? `torii:organization:${organizationId}` : "torii:api_key",
      displayName: companyName ?? domain ?? "Torii API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: toriiApiBaseUrl,
      validationEndpoint: toriiValidationPath,
      organizationId: organizationId ?? null,
      organizationDomain: domain ?? null,
    },
  };
}

async function requestToriiObject(
  options: ToriiRequestOptions,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<Record<string, unknown>> {
  return requireProviderObject(await requestToriiJson(options, context), "Torii response");
}

async function requestToriiJson(
  options: ToriiRequestOptions,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<unknown> {
  return runProviderRequest({ signal: context.signal, label: "Torii" }, async (signal) => {
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${context.apiKey}`,
      "user-agent": providerUserAgent,
    };
    if (options.apiVersion) {
      headers["x-api-version"] = options.apiVersion;
    }

    const response = await context.fetcher(buildToriiUrl(options), {
      method: "GET",
      headers,
      signal,
    });
    const payload = await readToriiPayload(response);

    if (!response.ok) {
      throw createToriiError(response.status, payload, options.phase);
    }

    return payload;
  });
}

function buildToriiUrl(options: { path: string; query?: URLSearchParams; extraQuery?: Record<string, unknown> }): URL {
  const relativePath = options.path.startsWith("/") ? options.path.slice(1) : options.path;
  const url = new URL(relativePath, `${toriiApiBaseUrl}/`);
  const query = options.query ? new URLSearchParams(options.query) : new URLSearchParams();

  for (const [key, value] of Object.entries(options.extraQuery ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, serializeQueryValue(value));
    }
  }

  if (query.size > 0) {
    url.search = query.toString();
  }

  return url;
}

function buildQueryParams(
  input: Record<string, unknown>,
  allowed: readonly (string | readonly [string, string])[],
): URLSearchParams | undefined {
  const query = new URLSearchParams();

  for (const field of allowed) {
    const inputKey = typeof field === "string" ? field : field[0];
    const outputKey = typeof field === "string" ? field : field[1];
    const value = input[inputKey];
    if (value !== undefined && value !== null && value !== "") {
      query.set(outputKey, serializeQueryValue(value));
    }
  }

  return query.size > 0 ? query : undefined;
}

function serializeQueryValue(value: unknown): string {
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

async function readToriiPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) {
      return text;
    }
    throw new ProviderRequestError(502, "invalid Torii JSON response");
  }
}

function createToriiError(status: number, payload: unknown, phase: ToriiPhase): ProviderRequestError {
  const message = extractToriiErrorMessage(payload) ?? `Torii request failed with status ${status}`;

  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status || 500, message, payload);
}

function extractToriiErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const nestedError = optionalRecord(record.error);

  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.detail) ??
    optionalString(nestedError?.message)
  );
}

function listResponse(body: Record<string, unknown>, key: string, label: string): Record<string, unknown> {
  return {
    [key]: requireObjectArrayPayload(body[key], label),
    count: optionalNumber(body.count) ?? null,
    total: optionalNumber(body.total) ?? null,
    nextCursor: optionalString(body.nextCursor) ?? null,
    raw: body,
  };
}

function readRequiredInteger(input: Record<string, unknown>, key: string): number {
  const value = input[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ProviderRequestError(400, `${key} is required`);
  }
  return value;
}

function requireProviderObject(payload: unknown, label: string): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ProviderRequestError(502, `${label} is invalid`);
  }

  return payload as Record<string, unknown>;
}

function requireObjectArrayPayload(payload: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `${label} is invalid`);
  }
  for (const item of payload) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ProviderRequestError(502, `${label} item is invalid`);
    }
  }

  return payload as Record<string, unknown>[];
}

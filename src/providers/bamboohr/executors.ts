import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { optionalInteger, optionalRecord, optionalString, recordOrEmpty, requiredString } from "../../core/cast.ts";
import {
  defineProviderProxy,
  defineProviderExecutors,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "bamboohr";

interface BamboohrContext {
  authorization: string;
  companyDomain: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface BamboohrAuthorization {
  authorization: string;
  companyDomain: string;
}

export const bamboohrActionHandlers: ProviderActionHandlers<"bamboohr", ProviderRuntimeHandler<BamboohrContext>> = {
  async get_company_information(_input, context) {
    const raw = await requestBamboohrJson({
      context,
      path: "/api/v1/company_information",
    });

    return {
      company: recordOrEmpty(raw),
      raw,
    };
  },

  async list_fields(_input, context) {
    const raw = await requestBamboohrJson({
      context,
      path: "/api/v1/meta/fields",
    });

    return {
      fields: Array.isArray(raw) ? raw : [],
      raw,
    };
  },

  async list_employees(input, context) {
    const raw = await requestBamboohrJson({
      context,
      path: "/api/v1/employees",
      query: {
        fields: joinFields(input.fields),
        "page[limit]": optionalInteger(input.limit),
        "page[after]": optionalString(input.after),
        "page[before]": optionalString(input.before),
      },
    });
    const body = recordOrEmpty(raw);

    return {
      employees: Array.isArray(body.data) ? body.data : [],
      meta: recordOrEmpty(body.meta),
      links: recordOrEmpty(body._links),
      raw,
    };
  },

  async get_employee(input, context) {
    const employeeId = requiredString(input.employeeId, "employeeId", providerInputError);
    const raw = await requestBamboohrJson({
      context,
      path: `/api/v1/employees/${encodeURIComponent(employeeId)}`,
      query: {
        fields: joinFields(input.fields),
        onlyCurrent: input.onlyCurrent === undefined ? undefined : Boolean(input.onlyCurrent),
      },
    });

    return {
      employee: recordOrEmpty(raw),
      raw,
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<BamboohrContext>({
  service,
  handlers: bamboohrActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<BamboohrContext> {
    const auth = await resolveBamboohrAuthorization(context);
    return {
      ...auth,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context): Promise<string> => {
    const auth = await resolveBamboohrAuthorization(context);
    return buildBamboohrApiBaseUrl(auth.companyDomain);
  },
  auth: { type: "none" },
  async customizeRequest({ context, headers }) {
    const auth = await resolveBamboohrAuthorization(context);
    headers.set("accept", "application/json");
    headers.set("authorization", auth.authorization);
    headers.set("user-agent", providerUserAgent);
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateBamboohrCredential(
      {
        authorization: buildBamboohrApiKeyAuthorization(input.apiKey),
        companyDomain: normalizeBamboohrCompanyDomain(input.values.companyDomain),
        grantedScopes: [],
      },
      fetcher,
      signal,
    );
  },
  oauth2(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateBamboohrCredential(
      {
        authorization: `${input.tokenType} ${input.accessToken}`,
        companyDomain: resolveBamboohrOAuthCompanyDomain(input.metadata),
        grantedScopes: readBamboohrGrantedScopes(input.metadata.scope, input.profile.grantedScopes),
      },
      fetcher,
      signal,
    );
  },
};

async function validateBamboohrCredential(
  auth: BamboohrAuthorization & { grantedScopes: string[] },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const raw = await requestBamboohrJson({
    context: {
      authorization: auth.authorization,
      companyDomain: auth.companyDomain,
      fetcher,
      signal,
    },
    path: "/api/v1/company_information",
  });
  const company = recordOrEmpty(raw);
  const label = readFirstString(company, ["displayName", "legalName", "name"]) ?? "BambooHR Account";

  return {
    profile: {
      accountId: auth.companyDomain,
      displayName: label,
    },
    grantedScopes: auth.grantedScopes,
    metadata: {
      companyDomain: auth.companyDomain,
      apiBaseUrl: buildBamboohrApiBaseUrl(auth.companyDomain),
    },
  };
}

async function resolveBamboohrAuthorization(context: ExecutionContext): Promise<BamboohrAuthorization> {
  const credential = await context.getCredential(service);
  if (credential?.authType === "oauth2") {
    return {
      authorization: `${credential.tokenType} ${credential.accessToken}`,
      companyDomain: resolveBamboohrOAuthCompanyDomain(credential.metadata),
    };
  }
  if (credential?.authType === "api_key") {
    return {
      authorization: buildBamboohrApiKeyAuthorization(credential.apiKey),
      companyDomain: readBamboohrCompanyDomain(credential.values.companyDomain ?? credential.metadata.companyDomain),
    };
  }
  throw new ProviderRequestError(401, "Configure BambooHR OAuth or API key credentials first.");
}

function resolveBamboohrOAuthCompanyDomain(metadata: Record<string, unknown>): string {
  const storedCompanyDomain = optionalString(metadata.companyDomain);
  if (storedCompanyDomain) {
    return normalizeBamboohrCompanyDomain(storedCompanyDomain);
  }
  return readBamboohrCompanyDomain(optionalRecord(metadata.oauthClientExtra)?.companyDomain);
}

function readBamboohrGrantedScopes(value: unknown, fallback: string[]): string[] {
  const scope = optionalString(value);
  return scope ? [...new Set(scope.split(/\s+/u).filter(Boolean))] : fallback;
}

function readBamboohrCompanyDomain(value: unknown): string {
  if (typeof value !== "string") {
    throw new ProviderRequestError(400, "bamboohr credential is missing companyDomain");
  }
  return normalizeBamboohrCompanyDomain(value);
}

function normalizeBamboohrCompanyDomain(value: unknown): string {
  if (typeof value !== "string") {
    throw new ProviderRequestError(400, "companyDomain must be a BambooHR company subdomain");
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    throw new ProviderRequestError(400, "companyDomain is required");
  }
  if (trimmed.includes("://") || trimmed.includes("/") || trimmed.includes(".")) {
    throw new ProviderRequestError(400, "companyDomain must be the BambooHR company subdomain, not a full URL");
  }
  if (!/^[a-z0-9](?:[a-z0-9_-]{0,61}[a-z0-9])?$/u.test(trimmed)) {
    throw new ProviderRequestError(400, "companyDomain must be a valid BambooHR company subdomain");
  }
  return trimmed;
}

function buildBamboohrApiBaseUrl(companyDomain: string): string {
  return `https://${normalizeBamboohrCompanyDomain(companyDomain)}.bamboohr.com`;
}

async function requestBamboohrJson(input: {
  context: Pick<BamboohrContext, "authorization" | "companyDomain" | "fetcher" | "signal">;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
}): Promise<unknown> {
  let response: Response;
  try {
    response = await input.context.fetcher(buildBamboohrUrl(input.context.companyDomain, input.path, input.query), {
      headers: buildBamboohrHeaders(input.context.authorization),
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      isAbortError(error) ? 504 : 502,
      error instanceof Error ? `BambooHR request failed: ${error.message}` : "BambooHR request failed",
    );
  }

  if (!response.ok) {
    await throwBamboohrError(response);
  }

  if (response.status === 204) {
    return {};
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ProviderRequestError(502, "BambooHR returned invalid JSON");
  }
}

function buildBamboohrUrl(
  companyDomain: string,
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
): URL {
  const url = new URL(path, buildBamboohrApiBaseUrl(companyDomain));
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function buildBamboohrHeaders(authorization: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization,
    "user-agent": providerUserAgent,
  };
}

function buildBamboohrApiKeyAuthorization(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:x`).toString("base64")}`;
}

async function throwBamboohrError(response: Response): Promise<never> {
  const message = await readBamboohrErrorMessage(response);
  if (response.status === 401 || response.status === 403) {
    throw new ProviderRequestError(response.status, message);
  }
  throw new ProviderRequestError(response.status, message);
}

async function readBamboohrErrorMessage(response: Response): Promise<string> {
  const headerMessage = response.headers.get("x-bamboohr-error-message");
  if (headerMessage) {
    return headerMessage;
  }

  const text = await response.text();
  if (text) {
    try {
      const body = JSON.parse(text) as unknown;
      const record = recordOrEmpty(body);
      return readFirstString(record, ["detail", "message", "error"]) ?? text;
    } catch {
      return text;
    }
  }

  return `BambooHR request failed with status ${response.status}`;
}

function joinFields(value: unknown): string | undefined {
  return Array.isArray(value) ? value.map((field) => String(field)).join(",") : undefined;
}

function readFirstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = optionalString(record[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

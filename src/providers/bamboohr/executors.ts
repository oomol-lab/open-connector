import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { BamboohrActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import { optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineProviderProxy,
  defineProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "bamboohr";

interface BamboohrContext extends ApiKeyProviderContext {
  companyDomain: string;
}

type BamboohrActionHandler = (input: Record<string, unknown>, context: BamboohrContext) => Promise<unknown>;

export const bamboohrActionHandlers: Record<BamboohrActionName, BamboohrActionHandler> = {
  async get_company_information(_input, context) {
    const raw = await requestBamboohrJson({
      context,
      path: "/api/v1/company_information",
    });

    return {
      company: asRecord(raw),
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
    const body = asRecord(raw);

    return {
      employees: Array.isArray(body.data) ? body.data : [],
      meta: asRecord(body.meta),
      links: asRecord(body._links),
      raw,
    };
  },

  async get_employee(input, context) {
    const employeeId = requiredString(input.employeeId, "employeeId", invalidInputError);
    const raw = await requestBamboohrJson({
      context,
      path: `/api/v1/employees/${encodeURIComponent(employeeId)}`,
      query: {
        fields: joinFields(input.fields),
        onlyCurrent: input.onlyCurrent === undefined ? undefined : Boolean(input.onlyCurrent),
      },
    });

    return {
      employee: asRecord(raw),
      raw,
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<BamboohrContext>({
  service,
  handlers: bamboohrActionHandlers,
  async createContext(context, fetcher): Promise<BamboohrContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      companyDomain: readBamboohrCompanyDomain(credential.values.companyDomain ?? credential.metadata.companyDomain),
      fetcher,
      signal: context.signal,
      transitFiles: context.transitFiles,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return buildBamboohrApiBaseUrl(credential.values.companyDomain ?? credential.metadata.companyDomain);
  },
  auth: { type: "api_key_basic", suffix: ":x" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const companyDomain = normalizeBamboohrCompanyDomain(input.values.companyDomain);
    const raw = await requestBamboohrJson({
      context: {
        apiKey: input.apiKey,
        companyDomain,
        fetcher,
        signal,
      },
      path: "/api/v1/company_information",
    });
    const company = asRecord(raw);
    const label = readFirstString(company, ["displayName", "legalName", "name"]) ?? "BambooHR Account";

    return {
      profile: {
        accountId: companyDomain,
        displayName: label,
      },
      grantedScopes: [],
      metadata: {
        companyDomain,
        apiBaseUrl: buildBamboohrApiBaseUrl(companyDomain),
      },
    };
  },
};

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
  return trimmed;
}

function buildBamboohrApiBaseUrl(companyDomain: string): string {
  return `https://${normalizeBamboohrCompanyDomain(companyDomain)}.bamboohr.com`;
}

async function requestBamboohrJson(input: {
  context: Pick<BamboohrContext, "apiKey" | "companyDomain" | "fetcher" | "signal">;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
}): Promise<unknown> {
  let response: Response;
  try {
    response = await input.context.fetcher(buildBamboohrUrl(input.context.companyDomain, input.path, input.query), {
      headers: buildBamboohrHeaders(input.context.apiKey),
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

function buildBamboohrHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Basic ${Buffer.from(`${apiKey}:x`).toString("base64")}`,
    "user-agent": providerUserAgent,
  };
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
      const record = asRecord(body);
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

function asRecord(value: unknown): Record<string, unknown> {
  return optionalRecord(value) ?? {};
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

function invalidInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

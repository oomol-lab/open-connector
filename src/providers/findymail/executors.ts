import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { FindymailActionName } from "./actions.ts";

import { optionalInteger, optionalNumber, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "findymail";
const findymailApiBaseUrl = "https://app.findymail.com";

type FindymailActionContext = ApiKeyProviderContext;
type FindymailActionHandler = (input: Record<string, unknown>, context: FindymailActionContext) => Promise<unknown>;

export const findymailActionHandlers: Record<FindymailActionName, FindymailActionHandler> = {
  get_credits(_input, context) {
    return getCredits(context);
  },
  verify_email(input, context) {
    return verifyEmail(input, context);
  },
  search_by_name(input, context) {
    return searchByName(input, context);
  },
  search_domain(input, context) {
    return searchDomain(input, context);
  },
  search_employees(input, context) {
    return searchEmployees(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, findymailActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: findymailApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await findymailRequest("/api/credits", {
      apiKey: input.apiKey,
      fetcher,
      signal,
      phase: "validate",
    });
    const object = optionalRecord(payload) ?? {};

    return {
      profile: {
        accountId: "api_key",
        displayName: "Findymail API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: findymailApiBaseUrl,
        validationEndpoint: "/api/credits",
        credits: pickOptionalNumber(object, "credits", "remaining"),
      },
    };
  },
};

async function getCredits(context: FindymailActionContext): Promise<unknown> {
  const payload = await findymailRequest("/api/credits", { ...context, phase: "execute" });
  const object = optionalRecord(payload) ?? {};

  return {
    credits: object,
    raw: object,
  };
}

async function verifyEmail(input: Record<string, unknown>, context: FindymailActionContext): Promise<unknown> {
  const payload = await findymailRequest("/api/verify", {
    ...context,
    phase: "execute",
    init: {
      method: "POST",
      body: JSON.stringify({
        email: readInputString(input.email, "email"),
      }),
    },
  });
  const object = optionalRecord(payload) ?? {};

  return {
    verification: object,
    raw: object,
  };
}

async function searchByName(input: Record<string, unknown>, context: FindymailActionContext): Promise<unknown> {
  const payload = await findymailRequest("/api/search/name", {
    ...context,
    phase: "execute",
    init: {
      method: "POST",
      body: JSON.stringify(buildNameSearchBody(input)),
    },
  });
  const object = optionalRecord(payload) ?? {};

  return {
    contact: optionalRecord(object.contact) ?? null,
    raw: object,
  };
}

async function searchDomain(input: Record<string, unknown>, context: FindymailActionContext): Promise<unknown> {
  const payload = await findymailRequest("/api/search/domain", {
    ...context,
    phase: "execute",
    init: {
      method: "POST",
      body: JSON.stringify({
        domain: readInputString(input.domain, "domain"),
      }),
    },
  });

  return {
    contacts: readArrayPayload(payload, "contacts", "data", "emails"),
    raw: payload,
  };
}

async function searchEmployees(input: Record<string, unknown>, context: FindymailActionContext): Promise<unknown> {
  const payload = await findymailRequest("/api/search/employees", {
    ...context,
    phase: "execute",
    init: {
      method: "POST",
      body: JSON.stringify(buildEmployeeSearchBody(input)),
    },
  });

  return {
    employees: readArrayPayload(payload, "employees", "contacts", "data"),
    raw: payload,
  };
}

async function findymailRequest(
  path: string,
  input: {
    apiKey: string;
    fetcher: typeof fetch;
    phase: "validate" | "execute";
    signal?: AbortSignal;
    init?: RequestInit;
  },
): Promise<unknown> {
  try {
    const response = await input.fetcher(`${findymailApiBaseUrl}${path}`, {
      ...input.init,
      headers: findymailHeaders(input.apiKey, input.init?.headers),
      signal: input.signal,
    });
    const payload = await readFindymailPayload(response);
    if (!response.ok) {
      throw mapFindymailError(response.status, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Findymail request failed: ${error.message}` : "Findymail request failed",
    );
  }
}

function findymailHeaders(apiKey: string, extraHeaders?: HeadersInit): Headers {
  const headers = new Headers(extraHeaders);
  headers.set("accept", "application/json");
  headers.set("authorization", `Bearer ${apiKey}`);
  headers.set("content-type", "application/json");
  headers.set("user-agent", providerUserAgent);
  return headers;
}

async function readFindymailPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function mapFindymailError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `Findymail request failed with ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 400 || status === 402 || status === 404) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  for (const key of ["message", "error", "detail"]) {
    const value = optionalString(object[key]);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function buildNameSearchBody(input: Record<string, unknown>): Record<string, unknown> {
  const name = optionalString(input.name);
  const firstName = optionalString(input.firstName);
  const lastName = optionalString(input.lastName);
  if (!name && (!firstName || !lastName)) {
    throw new ProviderRequestError(400, "search_by_name requires name or both firstName and lastName");
  }

  return {
    name: name ?? `${firstName} ${lastName}`,
    domain: readInputString(input.domain, "domain"),
  };
}

function buildEmployeeSearchBody(input: Record<string, unknown>): Record<string, unknown> {
  const domain = optionalString(input.domain);
  const companyName = optionalString(input.companyName);
  if (!domain && !companyName) {
    throw new ProviderRequestError(400, "search_employees requires domain or companyName");
  }

  return {
    ...(domain ? { domain } : {}),
    ...(companyName ? { company_name: companyName } : {}),
    ...(optionalInteger(input.limit) !== undefined ? { limit: optionalInteger(input.limit) } : {}),
  };
}

function readInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function pickOptionalNumber(object: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = optionalNumber(object[key]);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function readArrayPayload(payload: unknown, ...keys: string[]): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.map((item) => optionalRecord(item) ?? {});
  }

  const object = optionalRecord(payload) ?? {};
  for (const key of keys) {
    const value = object[key];
    if (Array.isArray(value)) {
      return value.map((item) => optionalRecord(item) ?? {});
    }
  }

  return [];
}

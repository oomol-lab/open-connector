import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { VitallyActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "vitally";
const vitallyEuBaseUrl = "https://rest.vitally-eu.io";
const vitallyRequestTimeoutMs = 30_000;

type VitallyRegion = "us" | "eu";
type VitallyRequestPhase = "validate" | "execute";

interface VitallyActionContext {
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type VitallyActionHandler = (input: Record<string, unknown>, context: VitallyActionContext) => Promise<unknown>;

interface VitallyRequestOptions extends VitallyActionContext {
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  phase: VitallyRequestPhase;
  body?: Record<string, unknown>;
  searchParams?: URLSearchParams;
}

export const vitallyActionHandlers: Record<VitallyActionName, VitallyActionHandler> = {
  list_accounts(input, context) {
    return listAccounts(input, context);
  },
  get_account(input, context) {
    return getAccount(input, context);
  },
  create_account(input, context) {
    return createAccount(input, context);
  },
  update_account(input, context) {
    return updateAccount(input, context);
  },
  delete_account(input, context) {
    return deleteAccount(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<VitallyActionContext>({
  service,
  handlers: vitallyActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<VitallyActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    const region = normalizeVitallyRegion(credential.values.region ?? credential.metadata.region);
    const subdomain = normalizeVitallySubdomain(credential.values.subdomain ?? credential.metadata.subdomain, region);
    return {
      apiKey: credential.apiKey,
      baseUrl: optionalString(credential.metadata.baseUrl) ?? buildVitallyBaseUrl({ region, subdomain }),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateVitallyCredential(input.apiKey, input.values, fetcher, signal);
  },
};

async function validateVitallyCredential(
  apiKey: string,
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<Awaited<ReturnType<NonNullable<CredentialValidators["apiKey"]>>>> {
  const region = normalizeVitallyRegion(values.region);
  const subdomain = normalizeVitallySubdomain(values.subdomain, region);
  const baseUrl = buildVitallyBaseUrl({ region, subdomain });
  const validationEndpoint = "/resources/accounts?limit=1";

  await requestVitally({
    apiKey,
    baseUrl,
    fetcher,
    signal,
    path: "/resources/accounts",
    method: "GET",
    searchParams: new URLSearchParams({ limit: "1" }),
    phase: "validate",
  });

  return {
    profile: {
      accountId: `vitally:${region}:${subdomain ?? "eu"}`,
      displayName: region === "eu" ? "Vitally EU" : `Vitally ${subdomain}`,
    },
    grantedScopes: [],
    metadata: compactObject({
      baseUrl,
      region,
      subdomain,
      validationEndpoint,
    }),
  };
}

async function listAccounts(input: Record<string, unknown>, context: VitallyActionContext): Promise<unknown> {
  const searchParams = new URLSearchParams();
  appendSearchParam(searchParams, "limit", input.limit);
  appendSearchParam(searchParams, "from", input.from);
  appendSearchParam(searchParams, "status", input.status);
  const payload = await requestVitally({
    ...context,
    path: "/resources/accounts",
    method: "GET",
    searchParams,
    phase: "execute",
  });
  const container = optionalRecord(payload) ?? {};
  const results = Array.isArray(container.results) ? container.results : [];

  return {
    accounts: results.map((item) => optionalRecord(item) ?? {}),
    next: optionalString(container.next) ?? null,
  };
}

async function getAccount(input: Record<string, unknown>, context: VitallyActionContext): Promise<unknown> {
  const payload = await requestVitally({
    ...context,
    path: `/resources/accounts/${encodePath(input.id)}`,
    method: "GET",
    phase: "execute",
  });
  return { account: optionalRecord(payload) ?? {} };
}

async function createAccount(input: Record<string, unknown>, context: VitallyActionContext): Promise<unknown> {
  const payload = await requestVitally({
    ...context,
    path: "/resources/accounts",
    method: "POST",
    body: compactObject({
      externalId: input.externalId,
      name: input.name,
      organizationId: input.organizationId,
      traits: input.traits,
    }),
    phase: "execute",
  });
  return { account: optionalRecord(payload) ?? {} };
}

async function updateAccount(input: Record<string, unknown>, context: VitallyActionContext): Promise<unknown> {
  const payload = await requestVitally({
    ...context,
    path: `/resources/accounts/${encodePath(input.id)}`,
    method: "PUT",
    body: compactObject({
      name: input.name,
      organizationId: input.organizationId,
      traits: input.traits,
    }),
    phase: "execute",
  });
  return { account: optionalRecord(payload) ?? {} };
}

async function deleteAccount(input: Record<string, unknown>, context: VitallyActionContext): Promise<unknown> {
  const payload = await requestVitally({
    ...context,
    path: `/resources/accounts/${encodePath(input.id)}`,
    method: "DELETE",
    phase: "execute",
  });
  return {
    deleted: true,
    raw: payload,
  };
}

async function requestVitally(input: VitallyRequestOptions): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal, vitallyRequestTimeoutMs);
  try {
    const url = new URL(input.path, input.baseUrl);
    if (input.searchParams) {
      for (const [key, value] of input.searchParams) {
        url.searchParams.set(key, value);
      }
    }

    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Basic ${Buffer.from(`${input.apiKey}:`).toString("base64")}`,
      "user-agent": providerUserAgent,
    };
    if (input.body !== undefined) {
      headers["content-type"] = "application/json";
    }

    const response = await input.fetcher(url, {
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      headers,
      method: input.method,
      signal: timeout.signal,
    });
    const payload = await readVitallyPayload(response);
    if (!response.ok) {
      throw mapVitallyError(response.status, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Vitally request timed out after 30 seconds");
    }
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "Vitally request failed");
  } finally {
    timeout.cleanup();
  }
}

async function readVitallyPayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function mapVitallyError(status: number, payload: unknown, phase: VitallyRequestPhase): ProviderRequestError {
  const message = readVitallyErrorMessage(payload) ?? `Vitally request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(502, message, payload);
}

function readVitallyErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload) {
    return payload;
  }
  const object = optionalRecord(payload);
  return object
    ? (optionalString(object.message) ?? optionalString(object.error) ?? optionalString(object.detail))
    : undefined;
}

function normalizeVitallyRegion(value: unknown): VitallyRegion {
  if (value == null || value === "") {
    return "us";
  }
  if (value === "us" || value === "eu") {
    return value;
  }
  throw new ProviderRequestError(400, "region must be either us or eu");
}

function normalizeVitallySubdomain(value: unknown, region: VitallyRegion): string | undefined {
  if (region === "eu") {
    return undefined;
  }
  const subdomain = optionalString(value)?.toLowerCase();
  if (!subdomain) {
    throw new ProviderRequestError(400, "subdomain is required when region is us");
  }
  if (subdomain.startsWith("http://") || subdomain.startsWith("https://")) {
    throw new ProviderRequestError(400, "subdomain must be only the Vitally REST API subdomain, not a full URL");
  }
  if (subdomain.includes("/") || subdomain.includes("?") || subdomain.includes("#")) {
    throw new ProviderRequestError(400, "subdomain contains unsupported URL characters");
  }
  if (!isSingleDnsLabel(subdomain)) {
    throw new ProviderRequestError(
      400,
      "subdomain must be a single DNS label containing only letters, numbers, or hyphens",
    );
  }
  return subdomain;
}

function buildVitallyBaseUrl(input: { region: VitallyRegion; subdomain?: string }): string {
  return input.region === "eu" ? vitallyEuBaseUrl : `https://${input.subdomain}.rest.vitally.io`;
}

function appendSearchParam(searchParams: URLSearchParams, key: string, value: unknown): void {
  if (value != null && value !== "") {
    searchParams.set(key, String(value));
  }
}

function encodePath(value: unknown): string {
  return encodeURIComponent(requiredString(value, "path value", (message) => new ProviderRequestError(400, message)));
}

function isSingleDnsLabel(value: string): boolean {
  if (value.length > 63 || value.startsWith("-") || value.endsWith("-")) {
    return false;
  }
  for (const char of value) {
    const code = char.charCodeAt(0);
    const isNumber = code >= 48 && code <= 57;
    const isLowercaseLetter = code >= 97 && code <= 122;
    if (!isNumber && !isLowercaseLetter && char !== "-") {
      return false;
    }
  }
  return true;
}

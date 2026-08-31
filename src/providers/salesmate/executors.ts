import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "salesmate";

type SalesmatePhase = "validate" | "execute";
type SalesmateMethod = "GET" | "POST" | "DELETE";
type SalesmateActionHandler = (input: Record<string, unknown>, context: SalesmateRequestContext) => Promise<unknown>;

interface SalesmateRequestContext {
  apiKey: string;
  linkName: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface SalesmateRequestInput {
  method: SalesmateMethod;
  path: string;
  body?: Record<string, unknown>;
  phase: SalesmatePhase;
}

export const salesmateActionHandlers: ProviderActionHandlers<"salesmate", SalesmateActionHandler> = {
  async create_company(input, context) {
    const payload = await requestSalesmateJson(
      { method: "POST", path: "/apis/company/v4", body: buildBodyWithCustomFields(input), phase: "execute" },
      context,
    );
    return { company: readPrimaryPayload(payload), raw: payload };
  },
  async get_company(input, context) {
    const companyId = readPositiveInteger(input.companyId, "companyId");
    const payload = await requestSalesmateJson(
      { method: "GET", path: `/apis/company/v4/${encodeURIComponent(String(companyId))}`, phase: "execute" },
      context,
    );
    return { company: readPrimaryPayload(payload), raw: payload };
  },
  async create_product(input, context) {
    const payload = await requestSalesmateJson(
      { method: "POST", path: "/apis/v1/products", body: compactObject(input), phase: "execute" },
      context,
    );
    return { product: readPrimaryPayload(payload), raw: payload };
  },
  async delete_product(input, context) {
    const productId = readPositiveInteger(input.productId, "productId");
    const payload = await requestSalesmateJson(
      { method: "DELETE", path: `/apis/v1/products/${encodeURIComponent(String(productId))}`, phase: "execute" },
      context,
    );
    return { success: readSuccessFlag(payload), raw: payload };
  },
  async list_modules(_input, context) {
    const payload = await requestSalesmateJson(
      { method: "GET", path: "/apis/module/v4/modules/internal_name", phase: "execute" },
      context,
    );
    return { modules: readObjectArrayPayload(payload), raw: payload };
  },
  async get_active_users(_input, context) {
    const payload = await requestSalesmateJson(
      { method: "GET", path: "/apis/core/v4/users?status=active", phase: "execute" },
      context,
    );
    return { users: readObjectArrayPayload(payload), raw: payload };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<SalesmateRequestContext>({
  service,
  handlers: salesmateActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<SalesmateRequestContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      linkName: readStoredLinkName(credential.values, credential.metadata),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateSalesmateCredential(input.apiKey, input.values, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return salesmateApiBaseUrl(readStoredLinkName(credential.values, credential.metadata));
  },
  auth: { type: "api_key_header", name: "accessToken" },
  customizeRequest({ headers, credential }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
    if (credential?.authType !== "api_key") {
      return;
    }
    headers.set("x-linkname", readStoredLinkName(credential.values, credential.metadata));
  },
});

async function validateSalesmateCredential(
  apiKey: string,
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const linkName = normalizeSalesmateLinkName(values.linkName);
  const payload = await requestSalesmateJson(
    { method: "GET", path: "/apis/core/v4/users?status=active", phase: "validate" },
    { apiKey, linkName, fetcher, signal },
  );
  const users = readObjectArrayPayload(payload);

  return {
    profile: {
      accountId: linkName,
      displayName: readUserLabel(users[0]) ?? linkName,
    },
    grantedScopes: [],
    metadata: {
      linkName,
      apiBaseUrl: salesmateApiBaseUrl(linkName),
      validationEndpoint: "/apis/core/v4/users?status=active",
    },
  };
}

function normalizeSalesmateLinkName(value: string | undefined): string {
  const trimmed = value?.trim().toLowerCase() ?? "";
  const withoutProtocol = trimmed.replace("https://", "").replace("http://", "").split("/")[0] ?? "";
  if (!withoutProtocol) throw new ProviderRequestError(400, "Salesmate linkName is required");
  return withoutProtocol.endsWith(".salesmate.io") ? withoutProtocol : `${withoutProtocol}.salesmate.io`;
}

function salesmateApiBaseUrl(linkName: string): string {
  return `https://${normalizeSalesmateLinkName(linkName)}`;
}

async function requestSalesmateJson(
  input: SalesmateRequestInput,
  context: SalesmateRequestContext,
): Promise<Record<string, unknown>> {
  return runProviderRequest({ signal: context.signal, label: "Salesmate" }, async (signal) => {
    const response = await context.fetcher(buildSalesmateUrl(input, context.linkName), {
      method: input.method,
      headers: buildSalesmateHeaders(context, Boolean(input.body)),
      body: input.body ? JSON.stringify(compactObject(input.body)) : undefined,
      signal,
    });
    const payload = await readSalesmatePayload(response);
    if (!response.ok) throw createSalesmateError(response.status, payload, input.phase);
    const payloadObject = optionalRecord(payload);
    if (!payloadObject) throw new ProviderRequestError(502, "Salesmate returned an invalid payload");
    return payloadObject;
  });
}

function buildSalesmateUrl(input: SalesmateRequestInput, linkName: string): URL {
  return new URL(input.path, `${salesmateApiBaseUrl(linkName)}/`);
}

function buildSalesmateHeaders(context: SalesmateRequestContext, hasBody: boolean): Record<string, string> {
  return compactObject({
    accept: "application/json",
    "content-type": hasBody ? "application/json" : undefined,
    "user-agent": providerUserAgent,
    accessToken: context.apiKey,
    "x-linkname": normalizeSalesmateLinkName(context.linkName),
  }) as Record<string, string>;
}

async function readSalesmatePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) throw new ProviderRequestError(502, "Salesmate returned malformed JSON");
    return { message: text };
  }
}

function createSalesmateError(status: number, payload: unknown, phase: SalesmatePhase): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `Salesmate request failed with HTTP ${status}`;
  if (status === 401 || status === 403) return new ProviderRequestError(400, message, payload);
  if (status === 404) return new ProviderRequestError(phase === "validate" ? 400 : 404, message, payload);
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (status >= 400 && status < 500 && phase === "execute") return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function buildBodyWithCustomFields(input: Record<string, unknown>): Record<string, unknown> {
  const { customFields, ...fields } = input;
  const customFieldObject = optionalRecord(customFields);
  return { ...compactObject(fields), ...(customFieldObject ?? {}) };
}

function readStoredLinkName(values: Record<string, string>, metadata: Record<string, unknown>): string {
  return normalizeSalesmateLinkName(optionalString(values.linkName) ?? optionalString(metadata.linkName));
}

function readPositiveInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return value;
}

function readPrimaryPayload(payload: Record<string, unknown>): Record<string, unknown> {
  for (const key of ["data", "record", "company", "product"] as const) {
    const object = optionalRecord(payload[key]);
    if (object) return object;
  }
  return payload;
}

function readObjectArrayPayload(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  for (const key of ["data", "Data", "users", "modules", "records"] as const) {
    const value = payload[key];
    if (Array.isArray(value)) return value.filter(isPlainObject) as Array<Record<string, unknown>>;
  }
  return [];
}

function readSuccessFlag(payload: Record<string, unknown>): boolean {
  if (typeof payload.success === "boolean") return payload.success;
  if (typeof payload.status === "boolean") return payload.status;
  if (typeof payload.status === "string") return ["success", "ok", "true"].includes(payload.status.toLowerCase());
  return true;
}

function readErrorMessage(payload: unknown): string | undefined {
  const object = optionalRecord(payload);
  if (!object) return undefined;
  for (const key of ["message", "error", "errorMessage", "detail"] as const) {
    const value = object[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function readUserLabel(user: Record<string, unknown> | undefined): string | undefined {
  if (!user) return undefined;
  return firstNonEmptyString(asString(user.name), asString(user.fullName), asString(user.email), asString(user.id));
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function firstNonEmptyString(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value !== undefined && value.length > 0);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

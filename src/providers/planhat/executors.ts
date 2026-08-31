import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalRawString,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
} from "../provider-runtime.ts";

const service = "planhat";
const apiBaseUrl = "https://api.planhat.com";
const maxResponseBytes = 10 * 1024 * 1024;

type PlanhatPhase = "validate" | "execute";

interface PlanhatRequest {
  method: "GET" | "POST" | "PUT";
  path: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  context: ApiKeyProviderContext;
  phase: PlanhatPhase;
}

type PlanhatActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const planhatActionHandlers: ProviderActionHandlers<"planhat", PlanhatActionHandler> = {
  async create_company(input, context) {
    return normalizeCompanyResult(
      await requestPlanhatJson({
        method: "POST",
        path: "/companies",
        body: buildCompanyBody(input),
        context,
        phase: "execute",
      }),
    );
  },
  async update_company(input, context) {
    const companyId = requiredString(input.companyId, "companyId", planhatInputError);
    return normalizeCompanyResult(
      await requestPlanhatJson({
        method: "PUT",
        path: `/companies/${encodeURIComponent(companyId)}`,
        body: buildCompanyBody(input),
        context,
        phase: "execute",
      }),
    );
  },
  async get_company(input, context) {
    const companyId = requiredString(input.companyId, "companyId", planhatInputError);
    return normalizeCompanyResult(
      await requestPlanhatJson({
        method: "GET",
        path: `/companies/${encodeURIComponent(companyId)}`,
        context,
        phase: "execute",
      }),
    );
  },
  async list_companies(input, context) {
    const raw = readArray(
      await requestPlanhatJson({
        method: "GET",
        path: "/companies",
        query: pickQuery(input, ["companyId", "limit", "offset", "sort", "select"]),
        context,
        phase: "execute",
      }),
      "Planhat returned invalid companies payload",
    );
    return { companies: raw.map(normalizeCompany), count: raw.length, raw };
  },
  async create_enduser(input, context) {
    return normalizeEnduserResult(
      await requestPlanhatJson({
        method: "POST",
        path: "/endusers",
        body: buildEnduserBody(input),
        context,
        phase: "execute",
      }),
    );
  },
  async update_enduser(input, context) {
    const enduserId = requiredString(input.enduserId, "enduserId", planhatInputError);
    return normalizeEnduserResult(
      await requestPlanhatJson({
        method: "PUT",
        path: `/endusers/${encodeURIComponent(enduserId)}`,
        body: buildEnduserBody(input),
        context,
        phase: "execute",
      }),
    );
  },
  async get_enduser(input, context) {
    const enduserId = requiredString(input.enduserId, "enduserId", planhatInputError);
    return normalizeEnduserResult(
      await requestPlanhatJson({
        method: "GET",
        path: `/endusers/${encodeURIComponent(enduserId)}`,
        context,
        phase: "execute",
      }),
    );
  },
  async list_endusers(input, context) {
    const raw = readArray(
      await requestPlanhatJson({
        method: "GET",
        path: "/endusers",
        query: pickQuery(input, ["companyId", "limit", "offset", "sort", "select", "archived", "email", "euId"]),
        context,
        phase: "execute",
      }),
      "Planhat returned invalid end users payload",
    );
    return { endusers: raw.map(normalizeEnduser), count: raw.length, raw };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, planhatActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: apiBaseUrl,
  auth: { type: "bearer" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestPlanhatJson({
      method: "GET",
      path: "/companies",
      query: { limit: 1 },
      context: { apiKey: input.apiKey, fetcher, signal },
      phase: "validate",
    });
    const companies = readArray(payload, "Planhat returned invalid companies payload");
    const firstCompany = companies[0];
    return {
      profile: {
        accountId: "planhat",
        displayName: "Planhat API Access Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl,
        validationEndpoint: "/companies",
        firstCompanyId: optionalString(firstCompany?._id),
        firstCompanyName: optionalString(firstCompany?.name),
      }),
    };
  },
};

async function requestPlanhatJson(request: PlanhatRequest): Promise<unknown> {
  const url = new URL(request.path, apiBaseUrl);
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value != null) {
      url.searchParams.set(key, String(value));
    }
  }
  const timeout = createProviderTimeout(request.context.signal);
  try {
    const response = await request.context.fetcher(url, {
      method: request.method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${request.context.apiKey}`,
        "user-agent": providerUserAgent,
        ...(request.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      signal: timeout.signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      throw createPlanhatError(response.status, response.statusText, payload, request.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Planhat request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Planhat request failed: ${error.message}` : "Planhat request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildCompanyBody(input: Record<string, unknown>): Record<string, unknown> {
  return {
    ...optionalRecord(input.properties),
    ...compactObject({
      name: input.name,
      owner: input.owner,
      coOwner: input.coOwner,
      externalId: input.externalId,
      sourceId: input.sourceId,
      phase: input.phase,
      status: input.status,
      domains: input.domains,
      tags: input.tags,
      description: input.description,
      address: input.address,
      country: input.country,
      city: input.city,
      zip: input.zip,
      phonePrimary: input.phonePrimary,
      web: input.web,
      custom: input.custom,
    }),
  };
}

function buildEnduserBody(input: Record<string, unknown>): Record<string, unknown> {
  return {
    ...optionalRecord(input.properties),
    ...compactObject({
      email: input.email,
      companyId: input.companyId,
      firstName: input.firstName,
      lastName: input.lastName,
      name: input.name,
      externalId: input.externalId,
      sourceId: input.sourceId,
      position: input.position,
      phone: input.phone,
      tags: input.tags,
      featured: input.featured,
      primary: input.primary,
      archived: input.archived,
      otherEmails: input.otherEmails,
      npsUnsubscribed: input.npsUnsubscribed,
      custom: input.custom,
    }),
  };
}

function normalizeCompanyResult(payload: unknown): Record<string, unknown> {
  const raw = readObject(payload, "Planhat returned invalid company payload");
  return { company: normalizeCompany(raw), raw };
}

function normalizeEnduserResult(payload: unknown): Record<string, unknown> {
  const raw = readObject(payload, "Planhat returned invalid end user payload");
  return { enduser: normalizeEnduser(raw), raw };
}

function normalizeCompany(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requiredProviderString(raw._id, "Planhat returned company without _id"),
    name: nullableRawString(raw.name),
    externalId: nullableRawString(raw.externalId),
    sourceId: nullableRawString(raw.sourceId),
    status: nullableRawString(raw.status),
    phase: nullableRawString(raw.phase),
    raw,
  };
}

function normalizeEnduser(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requiredProviderString(raw._id, "Planhat returned end user without _id"),
    email: nullableRawString(raw.email),
    name: nullableRawString(raw.name),
    firstName: nullableRawString(raw.firstName),
    lastName: nullableRawString(raw.lastName),
    companyId: nullableRawString(raw.companyId),
    companyName: nullableRawString(raw.companyName),
    externalId: nullableRawString(raw.externalId),
    sourceId: nullableRawString(raw.sourceId),
    raw,
  };
}

function pickQuery(input: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter((key) => input[key] !== undefined).map((key) => [key, input[key]]));
}

function readObject(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, message);
  }
  return record;
}

function readArray(value: unknown, message: string): Array<Record<string, unknown>> {
  return objectArray(value, message, () => new ProviderRequestError(502, message));
}

function requiredProviderString(value: unknown, message: string): string {
  const text = optionalRawString(value);
  if (!text?.trim()) {
    throw new ProviderRequestError(502, message);
  }
  return text;
}

function nullableRawString(value: unknown): string | null {
  return optionalRawString(value) ?? null;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await readProviderTextBody(response, "Planhat response", maxResponseBytes);
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createPlanhatError(
  status: number,
  statusText: string,
  payload: unknown,
  phase: PlanhatPhase,
): ProviderRequestError {
  const message = extractErrorMessage(payload) ?? statusText ?? "Planhat request failed";
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(status >= 500 || status < 400 ? 502 : status, message);
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }
  const record = optionalRecord(payload);
  for (const key of ["message", "error", "errors", "detail"]) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (Array.isArray(value) && value.length > 0) {
      return value.map(String).join(", ");
    }
  }
  return undefined;
}

function planhatInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message.endsWith(".") ? message.slice(0, -1) : message);
}

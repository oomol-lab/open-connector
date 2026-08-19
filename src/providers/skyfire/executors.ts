import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "skyfire";
const skyfireApiBaseUrl = "https://api.skyfire.xyz";
const skyfireValidationPath = "/api/v1/tokens/00000000-0000-0000-0000-000000000000/charges";

type SkyfireRequestPhase = "validate" | "execute";
type SkyfireActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const skyfireActionHandlers: ProviderActionHandlers<"skyfire", SkyfireActionHandler> = {
  get_all_services(_input, context) {
    return listServices("/api/v1/directory/services", context);
  },
  async get_service(input, context) {
    const serviceId = requiredInputString(input.serviceId, "serviceId");
    const payload = await requestSkyfireJson({
      path: `/api/v1/directory/services/${encodeURIComponent(serviceId)}`,
      context,
      phase: "execute",
    });

    return { service: normalizeServicePayload(payload, "Skyfire service response") };
  },
  get_services_by_agent(input, context) {
    const agentId = requiredInputString(input.agentId, "agentId");
    return listServices(`/api/v1/directory/agents/${encodeURIComponent(agentId)}/services`, context);
  },
  async create_token(input, context) {
    const payload = await requestSkyfireJson({
      path: "/api/v1/tokens",
      method: "POST",
      body: buildCreateTokenBody(input),
      context,
      phase: "execute",
    });

    return normalizeTokenPayload(payload);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, skyfireActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestSkyfireJson({
      path: skyfireValidationPath,
      context: { apiKey: input.apiKey, fetcher, signal },
      phase: "validate",
      accept404: true,
    });

    return {
      profile: { accountId: "api_key", displayName: "Skyfire API Key", grantedScopes: [] },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: skyfireApiBaseUrl,
        validationEndpoint: skyfireValidationPath,
      },
    };
  },
};

async function listServices(path: string, context: ApiKeyProviderContext): Promise<Record<string, unknown>> {
  const payload = await requestSkyfireJson({ path, context, phase: "execute" });
  const record = requiredProviderRecord(payload, "Skyfire services response");
  const data = requiredArray(record.data, "Skyfire services response data");
  return { services: data.map((item) => normalizeServicePayload(item, "Skyfire service")) };
}

function buildCreateTokenBody(input: Record<string, unknown>): Record<string, unknown> {
  validateCreateTokenInput(input);
  return compactObject({
    type: requiredInputString(input.type, "type"),
    buyerTag: optionalString(input.buyerTag),
    tokenAmount: optionalString(input.tokenAmount),
    sellerServiceId: optionalString(input.sellerServiceId),
    sellerDomainOrUrl: optionalString(input.sellerDomainOrUrl),
    expiresAt: optionalInteger(input.expiresAt),
    identityPermissions: optionalStringArray(input.identityPermissions),
  });
}

function validateCreateTokenInput(input: Record<string, unknown>): void {
  const type = input.type;
  if ((type === "pay" || type === "kya-pay") && typeof input.tokenAmount !== "string") {
    throw new ProviderRequestError(400, "tokenAmount is required when type is pay or kya-pay");
  }
  if (typeof input.sellerServiceId !== "string" && typeof input.sellerDomainOrUrl !== "string") {
    throw new ProviderRequestError(400, "sellerServiceId or sellerDomainOrUrl is required");
  }
  if (typeof input.sellerServiceId === "string" && typeof input.sellerDomainOrUrl === "string") {
    throw new ProviderRequestError(400, "sellerServiceId and sellerDomainOrUrl cannot both be set");
  }
  if (
    (type === "kya" || type === "kya-pay") &&
    input.identityPermissions !== undefined &&
    !Array.isArray(input.identityPermissions)
  ) {
    throw new ProviderRequestError(400, "identityPermissions must be an array when provided");
  }
}

async function requestSkyfireJson(input: {
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: SkyfireRequestPhase;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  accept404?: boolean;
}): Promise<unknown> {
  let response: Response;
  try {
    response = await input.context.fetcher(new URL(input.path, skyfireApiBaseUrl), {
      method: input.method ?? "GET",
      headers: skyfireHeaders(input.context.apiKey, input.body ? { "content-type": "application/json" } : {}),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Skyfire request failed: ${error.message}` : "Skyfire request failed",
    );
  }

  const payload = await readSkyfirePayload(response);
  if (response.ok || (input.accept404 && response.status === 404)) return payload;
  throw createSkyfireError(response, payload, input.phase);
}

function skyfireHeaders(apiKey: string, extraHeaders: Record<string, string>): Record<string, string> {
  return {
    accept: "application/json",
    "skyfire-api-key": apiKey,
    "user-agent": providerUserAgent,
    ...extraHeaders,
  };
}

async function readSkyfirePayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createSkyfireError(response: Response, payload: unknown, phase: SkyfireRequestPhase): ProviderRequestError {
  const message = extractSkyfireErrorMessage(payload) ?? response.statusText ?? "Skyfire request failed";
  if (response.status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && response.status === 401) return new ProviderRequestError(400, message, payload);
  if (phase === "execute" && response.status === 401) return new ProviderRequestError(401, message, payload);
  if ([400, 404, 422].includes(response.status)) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 500, message, payload);
}

function extractSkyfireErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload;
  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.code);
}

function normalizeServicePayload(payload: unknown, label: string): Record<string, unknown> {
  const record = requiredProviderRecord(payload, label);
  const requirement = optionalRecord(record.humanIdentityRequirement);
  return {
    id: requiredInputString(record.id, `${label}.id`),
    name: requiredInputString(record.name, `${label}.name`),
    description: nullableString(record.description),
    tags: optionalStringArray(record.tags) ?? [],
    type: requiredInputString(record.type, `${label}.type`),
    price: nullableString(record.price),
    priceModel: nullableString(record.priceModel),
    minimumTokenAmount: nullableString(record.minimumTokenAmount),
    maxTokenTTLSeconds: nullableInteger(record.maxTokenTTLSeconds),
    humanIdentityRequirement: {
      ...(optionalRecord(record.humanIdentityRequirement) ?? {}),
      identityLevels: optionalStringArray(requirement?.identityLevels) ?? [],
      organization: optionalStringArray(requirement?.organization) ?? [],
      individual: optionalStringArray(requirement?.individual) ?? [],
    },
    seller: normalizeSellerPayload(record.seller, `${label}.seller`),
    openApiSpecUrl: nullableString(record.openApiSpecUrl),
    acceptedTokens: optionalStringArray(record.acceptedTokens) ?? [],
    createdAt: requiredInputString(record.createdAt, `${label}.createdAt`),
    updatedAt: requiredInputString(record.updatedAt, `${label}.updatedAt`),
  };
}

function normalizeSellerPayload(payload: unknown, label: string): Record<string, unknown> {
  const record = requiredProviderRecord(payload, label);
  return {
    id: requiredInputString(record.id, `${label}.id`),
    name: requiredInputString(record.name, `${label}.name`),
  };
}

function normalizeTokenPayload(payload: unknown): Record<string, unknown> {
  if (typeof payload === "string") return { token: payload };
  const record = requiredProviderRecord(payload, "Skyfire token response");
  const token = optionalString(record.token) ?? optionalString(record.jwt) ?? optionalString(record.accessToken);
  if (!token) throw new ProviderRequestError(502, "Skyfire token response did not include a token", payload);
  return { token, raw: record };
}

function requiredProviderRecord(value: unknown, label: string): Record<string, unknown> {
  return requiredRecord(value, label, (message) => new ProviderRequestError(502, message));
}

function requiredArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, `${label} is not an array`);
  return value;
}

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function nullableString(value: unknown): string | null {
  return value == null ? null : (optionalString(value) ?? null);
}

function nullableInteger(value: unknown): number | null {
  return value == null ? null : (optionalInteger(value) ?? null);
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((item) => {
    const parsed = optionalString(item);
    return parsed ? [parsed] : [];
  });
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.skyfire.xyz",
  auth: { type: "api_key_header", name: "skyfire-api-key" },
});

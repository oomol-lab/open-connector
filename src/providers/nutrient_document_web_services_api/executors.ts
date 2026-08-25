import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
} from "../provider-runtime.ts";

const service = "nutrient_document_web_services_api";
const nutrientApiBaseUrl = "https://api.nutrient.io";
const nutrientRequestTimeoutMs = 30_000;
const nutrientMaxResponseBytes = 10 * 1024 * 1024;

type NutrientRequestPhase = "validate" | "execute";
interface NutrientContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type NutrientActionHandler = (input: Record<string, unknown>, context: NutrientContext) => Promise<unknown>;

export const nutrientDocumentWebServicesApiActionHandlers: ProviderActionHandlers<
  "nutrient_document_web_services_api",
  NutrientActionHandler
> = {
  async get_account_info(_input, context) {
    return {
      account: normalizeAccountInfo(
        await nutrientJsonRequest("/account/info", { method: "GET", phase: "execute" }, context),
      ),
    };
  },
  async analyze_build(input, context) {
    const payload = await nutrientJsonRequest(
      "/analyze_build",
      {
        method: "POST",
        phase: "execute",
        body: optionalRecord(input.instructions) ?? {},
      },
      context,
    );
    return normalizeAnalyzeBuild(payload);
  },
  async create_auth_token(input, context) {
    const payload = await nutrientJsonRequest(
      "/tokens",
      {
        method: "POST",
        phase: "execute",
        body: compactObject({
          allowedOperations: input.allowedOperations,
          allowedOrigins: input.allowedOrigins,
          expirationTime: input.expirationTime,
        }),
      },
      context,
    );
    const object = readObject(payload);
    return {
      id: optionalString(object.id) ?? "",
      accessToken: optionalString(object.accessToken) ?? "",
    };
  },
  async delete_auth_token(input, context) {
    await nutrientJsonRequest(
      "/tokens",
      {
        method: "DELETE",
        phase: "execute",
        body: { id: optionalString(input.tokenId) ?? "" },
      },
      context,
    );
    return { success: true };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  service,
  nutrientDocumentWebServicesApiActionHandlers,
  { skipDnsValidation: true },
);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: nutrientApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const account = normalizeAccountInfo(
      await nutrientJsonRequest(
        "/account/info",
        { method: "GET", phase: "validate" },
        { apiKey: input.apiKey, fetcher, signal },
      ),
    );
    return {
      profile: {
        displayName: account.subscriptionType
          ? `Nutrient DWS ${account.subscriptionType} account`
          : "Nutrient DWS API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: nutrientApiBaseUrl,
        validationEndpoint: "/account/info",
        signedIn: account.signedIn ?? undefined,
        subscriptionType: account.subscriptionType ?? undefined,
        totalCredits: account.usage.totalCredits ?? undefined,
        usedCredits: account.usage.usedCredits ?? undefined,
      }),
    };
  },
};

async function nutrientJsonRequest(
  path: string,
  input: {
    method: string;
    phase: NutrientRequestPhase;
    body?: Record<string, unknown>;
  },
  context: NutrientContext,
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, nutrientRequestTimeoutMs);
  try {
    const response = await context.fetcher(new URL(path, nutrientApiBaseUrl), {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
        ...(input.body ? { "content-type": "application/json" } : {}),
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readNutrientPayload(response);
    if (!response.ok) {
      throw mapNutrientError(response, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Nutrient DWS request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Nutrient DWS request failed: ${error.message}` : "Nutrient DWS request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readNutrientPayload(response: Response): Promise<unknown> {
  const text = await readProviderTextBody(response, "Nutrient DWS response", nutrientMaxResponseBytes);
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function mapNutrientError(response: Response, payload: unknown, phase: NutrientRequestPhase): ProviderRequestError {
  const message = extractNutrientErrorMessage(payload) || response.statusText || "Nutrient DWS request failed";
  const isAuthError = response.status === 401 || response.status === 403;
  return new ProviderRequestError(
    phase === "validate" && isAuthError ? 400 : response.status || 502,
    `Nutrient DWS request failed: ${message}`,
    payload,
  );
}

function extractNutrientErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const object = optionalRecord(payload);
  return optionalString(object?.details) ?? optionalString(object?.message) ?? optionalString(object?.error);
}

function normalizeAccountInfo(payload: unknown) {
  const object = readObject(payload);
  const usage = optionalRecord(object.usage);
  return {
    signedIn: optionalBoolean(object.signedIn) ?? null,
    subscriptionType: readSubscriptionType(object.subscriptionType),
    usage: {
      totalCredits: optionalNumber(usage?.totalCredits) ?? null,
      usedCredits: optionalNumber(usage?.usedCredits) ?? null,
    },
  };
}

function readSubscriptionType(value: unknown): "free" | "paid" | "enterprise" | null {
  return value === "free" || value === "paid" || value === "enterprise" ? value : null;
}

function normalizeAnalyzeBuild(payload: unknown) {
  const object = readObject(payload);
  return {
    cost: optionalNumber(object.cost) ?? null,
    requiredFeatures: normalizeRequiredFeatures(object.required_features),
    raw: object,
  };
}

function normalizeRequiredFeatures(value: unknown): Record<string, unknown[]> {
  const object = optionalRecord(value);
  if (!object) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(object).map(([key, child]) => [
      key,
      Array.isArray(child) ? child.map(normalizeRequiredFeatureItem) : [],
    ]),
  );
}

function normalizeRequiredFeatureItem(value: unknown) {
  const object = optionalRecord(value) ?? {};
  return {
    unitCost: optionalNumber(object.unit_cost) ?? null,
    unitType: optionalString(object.unit_type) ?? null,
    units: optionalNumber(object.units) ?? null,
    cost: optionalNumber(object.cost) ?? null,
    usage: Array.isArray(object.usage) ? object.usage.map(String) : [],
    raw: object,
  };
}

function readObject(value: unknown): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, "Nutrient DWS response must be an object");
  }
  return object;
}

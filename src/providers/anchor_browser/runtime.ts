import type { CredentialValidationResult } from "../../core/types.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const anchorBrowserApiBaseUrl = "https://api.anchorbrowser.io";
export const anchorBrowserValidationEndpoint = "/v1/billing";

type AnchorBrowserRequestPhase = "validate" | "execute";
type AnchorBrowserRequestInput = {
  method: "GET" | "POST";
  path: string;
  body?: Record<string, unknown>;
};

interface AnchorBrowserContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type AnchorBrowserActionHandler = (
  input: Record<string, unknown>,
  context: AnchorBrowserContext,
) => Promise<unknown>;

export const anchorBrowserActionHandlers: Record<string, AnchorBrowserActionHandler> = {
  async get_billing_info(_input, context) {
    const raw = await requestAnchorBrowserJson<Record<string, unknown>>(
      {
        method: "GET",
        path: anchorBrowserValidationEndpoint,
      },
      context,
      "execute",
    );
    return {
      billing: normalizeBillingPayload(raw),
      raw,
    };
  },

  async start_browser_session(input, context) {
    const raw = await requestAnchorBrowserJson<Record<string, unknown>>(
      {
        method: "POST",
        path: "/v1/sessions",
        body: compactObject({
          session: input.session,
          browser: input.browser,
          integrations: input.integrations,
          identities: input.identities,
        }),
      },
      context,
      "execute",
    );
    return {
      session: normalizeSession(raw),
      raw,
    };
  },

  async get_project_metadata(input, context) {
    const projectId = optionalString(input.projectId);
    if (!projectId) {
      throw new ProviderRequestError(400, "projectId is required");
    }

    const raw = await requestAnchorBrowserJson<Record<string, unknown>>(
      {
        method: "GET",
        path: `/v1/projects/${encodeURIComponent(projectId)}/metadata`,
      },
      context,
      "execute",
    );
    return {
      project: normalizeProjectMetadata(raw),
      raw,
    };
  },
};

export async function validateAnchorBrowserCredential(
  input: { apiKey: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = {
    apiKey: requireInputString(input.apiKey, "apiKey"),
    fetcher,
    signal,
  };
  const raw = await requestAnchorBrowserJson<Record<string, unknown>>(
    {
      method: "GET",
      path: anchorBrowserValidationEndpoint,
    },
    context,
    "validate",
  );
  const billing = normalizeBillingPayload(raw);

  return {
    profile: {
      accountId: billing.tier || "anchor_browser_api_key",
      displayName: buildAccountLabel(billing),
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: anchorBrowserApiBaseUrl,
      validationEndpoint: anchorBrowserValidationEndpoint,
      billingPeriod: billing.billing_period,
      tier: billing.tier,
      credits: billing.credits,
      creditsUsed: billing.credits_used,
      maxConcurrentBrowsers: billing.max_concurrent_browsers,
    }),
  };
}

async function requestAnchorBrowserJson<T>(
  input: AnchorBrowserRequestInput,
  context: AnchorBrowserContext,
  phase: AnchorBrowserRequestPhase,
) {
  let response: Response;
  try {
    response = await context.fetcher(new URL(input.path, anchorBrowserApiBaseUrl), {
      method: input.method,
      headers: anchorBrowserHeaders(context.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Anchor Browser request failed: ${error.message}` : "Anchor Browser request failed",
    );
  }

  const payload = await readAnchorBrowserPayload(response);
  if (!response.ok) {
    throw createAnchorBrowserError(response, payload, phase);
  }

  return payload as T;
}

function anchorBrowserHeaders(apiKey: string, hasBody: boolean) {
  return {
    accept: "application/json",
    ...(hasBody ? { "content-type": "application/json" } : {}),
    "user-agent": providerUserAgent,
    "anchor-api-key": apiKey,
  };
}

async function readAnchorBrowserPayload(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Anchor Browser returned invalid JSON");
  }
}

function createAnchorBrowserError(
  response: Response,
  payload: unknown,
  phase: AnchorBrowserRequestPhase,
) {
  const message =
    extractAnchorBrowserErrorMessage(payload) ?? `Anchor Browser request failed with status ${response.status}`;

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(response.status, message);
  }
  return new ProviderRequestError(response.status || 500, message);
}

function extractAnchorBrowserErrorMessage(payload: unknown) {
  const record = optionalRecord(payload);
  const error = record ? record.error : undefined;
  if (typeof error === "string") {
    return error;
  }
  const errorRecord = optionalRecord(error);
  return optionalString(errorRecord?.message) ?? optionalString(record?.message);
}

function normalizeBillingPayload(value: unknown) {
  const record = optionalRecord(value);
  const data = optionalRecord(record?.data) ?? record;
  if (!data) {
    throw new ProviderRequestError(502, "Anchor Browser billing response is missing data");
  }

  return {
    credits: requireNumber(data.credits, "credits"),
    credits_used: requireNumber(data.credits_used, "credits_used"),
    included_credits: requireNumber(data.included_credits, "included_credits"),
    billing_period: requireString(data.billing_period, "billing_period"),
    tier: requireString(data.tier, "tier"),
    gifts_balance: optionalNumber(data.gifts_balance) ?? null,
    max_concurrent_browsers: optionalNumber(data.max_concurrent_browsers) ?? null,
    cost_limit: data.cost_limit === null ? null : optionalNumber(data.cost_limit) ?? null,
  };
}

function normalizeSession(value: unknown) {
  const record = optionalRecord(value);
  const data = optionalRecord(record?.data);
  if (!data) {
    throw new ProviderRequestError(502, "Anchor Browser session response is missing data");
  }

  return {
    id: requireString(data.id, "id"),
    cdp_url: requireString(data.cdp_url, "cdp_url"),
    live_view_url: requireString(data.live_view_url, "live_view_url"),
  };
}

function normalizeProjectMetadata(value: unknown) {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "Anchor Browser project metadata response must be an object");
  }

  return {
    name: requireString(record.name, "name"),
    domain: requireString(record.domain, "domain"),
    logo_url: typeof record.logo_url === "string" ? record.logo_url : null,
  };
}

function buildAccountLabel(billing: ReturnType<typeof normalizeBillingPayload>) {
  return billing.tier ? `Anchor Browser ${billing.tier}` : "Anchor Browser API Key";
}

function requireInputString(value: unknown, fieldName: string) {
  return requiredString(value, fieldName, providerInputError);
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function requireString(value: unknown, fieldName: string) {
  if (typeof value !== "string") {
    throw new ProviderRequestError(502, `Anchor Browser response is missing ${fieldName}`);
  }
  return value;
}

function requireNumber(value: unknown, fieldName: string) {
  if (typeof value !== "number") {
    throw new ProviderRequestError(502, `Anchor Browser response is missing ${fieldName}`);
  }
  return value;
}

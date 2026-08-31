import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const metatextaiApiBaseUrl = "https://guard-api.metatext.ai";

type MetatextaiPhase = "validate" | "execute";
type MetatextaiActionHandler = (input: Record<string, unknown>, context: MetatextaiActionContext) => Promise<unknown>;

export interface MetatextaiActionContext {
  apiKey: string;
  applicationId: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

export const metatextaiActionHandlers: ProviderActionHandlers<"metatextai", MetatextaiActionHandler> = {
  async list_policies(_input, context) {
    return {
      policies: await metatextaiRequestJson({
        path: `/v1/applications/${encodeURIComponent(context.applicationId)}/policies`,
        method: "GET",
        context,
        phase: "execute",
      }),
    };
  },
  async create_policy(input, context) {
    return {
      policy: await metatextaiRequestJson({
        path: `/v1/applications/${encodeURIComponent(context.applicationId)}/policies`,
        method: "POST",
        context,
        phase: "execute",
        body: compactObject({
          name: optionalString(input.name),
          type: optionalString(input.type),
          target: Array.isArray(input.target) ? input.target : undefined,
          rule: optionalRecord(input.rule),
        }),
      }),
    };
  },
  async evaluate(input, context) {
    return {
      result: await metatextaiRequestJson({
        path: "/v1/evaluate",
        method: "POST",
        context,
        phase: "execute",
        body: compactObject({
          application: context.applicationId,
          messages: Array.isArray(input.messages) ? input.messages : undefined,
          policy_ids: Array.isArray(input.policyIds) ? input.policyIds : undefined,
          fail_fast: optionalBoolean(input.failFast),
          correction_enabled: optionalBoolean(input.correctionEnabled),
          override_response: optionalString(input.overrideResponse),
        }),
      }),
    };
  },
  async run_test_scan(input, context) {
    return {
      result: await metatextaiRequestJson({
        path: "/v1/tests/run-scan",
        method: "POST",
        context,
        phase: "execute",
        body: compactObject({
          application: context.applicationId,
          probes: Array.isArray(input.probes) ? input.probes : undefined,
        }),
      }),
    };
  },
};

export function createMetatextaiContext(
  apiKey: string,
  applicationId: unknown,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): MetatextaiActionContext {
  return {
    apiKey: requiredInputString(apiKey, "apiKey"),
    applicationId: requiredInputString(applicationId, "applicationId"),
    fetcher,
    signal,
  };
}

export async function validateMetatextaiCredential(
  apiKey: string,
  applicationId: unknown,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createMetatextaiContext(apiKey, applicationId, fetcher, signal);
  const policies = await metatextaiRequestJson({
    path: `/v1/applications/${encodeURIComponent(context.applicationId)}/policies`,
    method: "GET",
    context,
    phase: "validate",
  });

  return {
    profile: {
      accountId: context.applicationId,
      displayName: `MetatextAI · ${context.applicationId}`,
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: metatextaiApiBaseUrl,
      applicationId: context.applicationId,
      policyCount: Array.isArray(policies) ? policies.length : 0,
      validationEndpoint: "/v1/applications/{applicationId}/policies",
    },
  };
}

async function metatextaiRequestJson(input: {
  path: string;
  method: "GET" | "POST";
  context: MetatextaiActionContext;
  phase: MetatextaiPhase;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal);

  try {
    const response = await input.context.fetcher(buildUrl(input.path), {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readJsonResponse(response);

    if (!response.ok) {
      throw createMetatextaiError(response.status, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "MetatextAI request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `MetatextAI request failed: ${error.message}` : "MetatextAI request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(normalizedPath, `${metatextaiApiBaseUrl}/`).toString();
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "MetatextAI returned invalid JSON");
  }
}

function createMetatextaiError(status: number, payload: unknown, phase: MetatextaiPhase): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `MetatextAI request failed with ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  for (const key of ["message", "error", "detail"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return undefined;
}

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

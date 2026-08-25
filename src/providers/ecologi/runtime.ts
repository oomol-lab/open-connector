import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalBoolean, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const ecologiApiBaseUrl = "https://public.ecologi.com";

type EcologiRequestPhase = "validate" | "execute";
type EcologiActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const purchasePathByAction: Record<string, string> = {
  purchase_trees: "/impact/trees",
  purchase_local_trees: "/impact/local-trees",
  purchase_carbon_avoidance: "/impact/carbon",
  purchase_carbon_removal: "/impact/carbon-removal",
  purchase_habitat_restoration: "/impact/habitat-restoration",
};

const reportPathByAction: Record<string, string> = {
  get_tree_totals: "trees",
  get_carbon_offset_totals: "carbon-offset",
  get_carbon_removal_totals: "carbon-removal",
  get_habitat_restoration_totals: "habitat-restoration",
  get_total_impact: "impact",
};

export const ecologiActionHandlers: ProviderActionHandlers<"ecologi", EcologiActionHandler> = {
  purchase_trees(input, context) {
    return executePurchase("purchase_trees", input, context);
  },
  purchase_local_trees(input, context) {
    return executePurchase("purchase_local_trees", input, context);
  },
  purchase_carbon_avoidance(input, context) {
    return executePurchase("purchase_carbon_avoidance", input, context);
  },
  purchase_carbon_removal(input, context) {
    return executePurchase("purchase_carbon_removal", input, context);
  },
  purchase_habitat_restoration(input, context) {
    return executePurchase("purchase_habitat_restoration", input, context);
  },
  get_tree_totals(input, context) {
    return executeReport("get_tree_totals", input, context);
  },
  get_carbon_offset_totals(input, context) {
    return executeReport("get_carbon_offset_totals", input, context);
  },
  get_carbon_removal_totals(input, context) {
    return executeReport("get_carbon_removal_totals", input, context);
  },
  get_habitat_restoration_totals(input, context) {
    return executeReport("get_habitat_restoration_totals", input, context);
  },
  get_total_impact(input, context) {
    return executeReport("get_total_impact", input, context);
  },
};

export async function validateEcologiCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const normalizedApiKey = normalizeApiKey(apiKey);
  await requestEcologiJson({
    path: "/impact/trees",
    method: "POST",
    body: { number: 1, test: true },
    apiKey: normalizedApiKey,
    authenticated: true,
    fetcher,
    phase: "validate",
    signal,
  });

  const fingerprint = createHash("sha256").update(normalizedApiKey).digest("hex").slice(0, 16);
  return {
    profile: {
      accountId: `ecologi:api_key:${fingerprint}`,
      displayName: "Ecologi API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: ecologiApiBaseUrl,
      validationEndpoint: "/impact/trees",
    },
  };
}

async function executePurchase(
  actionName: string,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const path = purchasePathByAction[actionName];
  if (!path) {
    throw new ProviderRequestError(400, `unknown Ecologi purchase action: ${actionName}`);
  }

  validatePurchaseInput(actionName, input);
  return requestEcologiJson({
    path,
    method: "POST",
    body: compactObject({
      number: input.number,
      country: optionalString(input.country),
      units: optionalString(input.units),
      name: optionalString(input.name),
      test: optionalBoolean(input.test),
      recipientEmail: optionalString(input.recipientEmail),
    }),
    idempotencyKey: optionalString(input.idempotencyKey),
    apiKey: normalizeApiKey(context.apiKey),
    authenticated: true,
    fetcher: context.fetcher,
    phase: "execute",
    signal: context.signal,
  });
}

async function executeReport(
  actionName: string,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const suffix = reportPathByAction[actionName];
  if (!suffix) {
    throw new ProviderRequestError(400, `unknown Ecologi report action: ${actionName}`);
  }

  const username = optionalString(input.username);
  if (!username) {
    throw new ProviderRequestError(400, "username is required");
  }
  return requestEcologiJson({
    path: `/users/${encodeURIComponent(username)}/${suffix}`,
    method: "GET",
    authenticated: false,
    fetcher: context.fetcher,
    phase: "execute",
    signal: context.signal,
  });
}

async function requestEcologiJson(input: {
  path: string;
  method: "GET" | "POST";
  authenticated: boolean;
  fetcher: typeof fetch;
  phase: EcologiRequestPhase;
  apiKey?: string;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
  signal?: AbortSignal;
}): Promise<unknown> {
  const headers = new Headers({
    accept: "application/json",
    "content-type": "application/json",
    "user-agent": providerUserAgent,
  });
  if (input.authenticated) {
    headers.set("authorization", `Bearer ${normalizeApiKey(input.apiKey)}`);
  }
  if (input.idempotencyKey) {
    headers.set("Idempotency-Key", input.idempotencyKey);
  }

  let response: Response;
  try {
    response = await input.fetcher(`${ecologiApiBaseUrl}${input.path}`, {
      method: input.method,
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Ecologi request failed: ${error.message}` : "Ecologi request failed",
    );
  }

  const payload = await readEcologiPayload(response);
  if (!response.ok) {
    throw toEcologiError(response, payload, input.phase);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Ecologi returned an invalid JSON object");
  }
  return payload;
}

async function readEcologiPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function toEcologiError(response: Response, payload: unknown, phase: EcologiRequestPhase): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    `Ecologi request failed with ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(response.status === 404 ? 404 : 400, message);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message);
}

function validatePurchaseInput(actionName: string, input: Record<string, unknown>): void {
  for (const field of ["name", "idempotencyKey"]) {
    if (field in input && !optionalString(input[field])) {
      throw new ProviderRequestError(400, `${field} must not be blank`);
    }
  }

  if (actionName === "purchase_carbon_avoidance") {
    const minimum = input.units === "Tonnes" ? 0.001 : 1;
    if (typeof input.number === "number" && input.number < minimum) {
      throw new ProviderRequestError(400, `number must be at least ${minimum} for ${String(input.units)}`);
    }
  }

  if (actionName === "purchase_habitat_restoration") {
    if (typeof input.number === "number" && !Number.isInteger(input.number * 10)) {
      throw new ProviderRequestError(400, "number must use no more than one decimal place");
    }
  }
}

function normalizeApiKey(value: string | undefined): string {
  const apiKey = value?.trim();
  if (!apiKey) {
    throw new ProviderRequestError(400, "apiKey is required");
  }
  return apiKey;
}

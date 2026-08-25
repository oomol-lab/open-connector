import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const pingdomApiBaseUrl = "https://api.pingdom.com/api/3.1";

type PingdomActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const pingdomActionHandlers: ProviderActionHandlers<"pingdom", PingdomActionHandler> = {
  async list_checks(input, context) {
    const body = requiredRecord(await requestPingdomJson(context, "/checks", input), "Pingdom checks response");
    return {
      checks: requireArrayPayload(body.checks, "pingdom checks list response checks"),
      counts: optionalRecord(body.counts) ?? null,
    };
  },
  async get_check(input, context) {
    const checkId = requirePositiveInteger(input.check_id, "check_id");
    const body = requiredRecord(
      await requestPingdomJson(context, `/checks/${encodeURIComponent(String(checkId))}`, {
        include_teams: input.include_teams,
      }),
      "Pingdom check response",
    );
    return { check: requiredRecord(body.check, "Pingdom check") };
  },
  async list_probes(input, context) {
    const body = requiredRecord(await requestPingdomJson(context, "/probes", input), "Pingdom probes response");
    return {
      probes: requireArrayPayload(body.probes, "pingdom probes response probes"),
    };
  },
  async get_credits(_input, context) {
    const body = requiredRecord(await requestPingdomJson(context, "/credits"), "Pingdom credits response");
    return { credits: requiredRecord(body.credits, "Pingdom credits") };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("pingdom", pingdomActionHandlers);

export async function validatePingdomCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const body = requiredRecord(
    await requestPingdomJson({ apiKey, fetcher }, "/checks", { limit: 1 }, "validate"),
    "Pingdom checks response",
  );
  const checks = Array.isArray(body.checks) ? body.checks : [];
  const counts = optionalRecord(body.counts);
  return {
    profile: {
      accountId: "pingdom-api-token",
      displayName: "Pingdom API token",
      grantedScopes: [],
    },
    metadata: {
      apiBaseUrl: pingdomApiBaseUrl,
      validationEndpoint: "/checks?limit=1",
      checkCount: typeof counts?.total === "number" ? counts.total : checks.length,
    },
  };
}

async function requestPingdomJson(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  path: string,
  query: Record<string, unknown> = {},
  phase: "validate" | "execute" = "execute",
) {
  const url = new URL(path.replace(/^\//, ""), `${pingdomApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Pingdom request failed: ${error.message}` : "Pingdom request failed",
    );
  }

  const payload = await readPingdomPayload(response);
  if (!response.ok) {
    throw createPingdomError(response, payload, phase);
  }
  return payload;
}

async function readPingdomPayload(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) {
      return null;
    }
    throw new ProviderRequestError(502, "Invalid Pingdom JSON response");
  }
}

function createPingdomError(response: Response, payload: unknown, phase: "validate" | "execute") {
  const body = optionalRecord(payload);
  const error = optionalRecord(body?.error);
  const message =
    optionalString(error?.errormessage) ??
    optionalString(error?.statusdesc) ??
    response.statusText ??
    "Pingdom request failed";
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status >= 500) {
    return new ProviderRequestError(502, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function requirePositiveInteger(value: unknown, fieldName: string) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }
  throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
}

function requireArrayPayload(value: unknown, context: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Invalid ${context}`);
  }
  return value.map((item) => requiredRecord(item, context));
}

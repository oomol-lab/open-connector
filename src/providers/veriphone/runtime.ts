import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { VeriphoneActionName } from "./actions.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const veriphoneApiBaseUrl = "https://api.veriphone.io";

type VeriphoneRequestPhase = "validate" | "execute";
type VeriphoneActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface VeriphoneRequestInput {
  path: string;
  apiKey: string;
  fetcher: ProviderFetch;
  phase: VeriphoneRequestPhase;
  query?: Record<string, string | undefined>;
  signal?: AbortSignal;
}

export const veriphoneActionHandlers: Record<VeriphoneActionName, VeriphoneActionHandler> = {
  get_credits(_input, context) {
    return requestVeriphone({
      path: "/v2/credits",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });
  },
  verify_phone_number(input, context) {
    return requestVeriphone({
      path: "/v2/verify",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      query: {
        phone: optionalString(input.phone),
        default_country: optionalString(input.default_country),
      },
      signal: context.signal,
    });
  },
};

export async function validateVeriphoneCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestVeriphone({
    path: "/v2/credits",
    apiKey,
    fetcher,
    phase: "validate",
    signal,
  });
  const email = optionalString(payload.email);

  return {
    profile: {
      accountId: email ?? "veriphone-api-key",
      displayName: email ?? "Veriphone API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/v2/credits",
      apiBaseUrl: veriphoneApiBaseUrl,
      credits: optionalNumber(payload.credits),
      total_verified_phone_numbers: optionalNumber(payload.total_verified_phone_numbers),
      active: optionalBoolean(payload.active),
      email,
      country: optionalString(payload.country),
      counter: optionalNumber(payload.counter),
    }),
  };
}

async function requestVeriphone(input: VeriphoneRequestInput): Promise<Record<string, unknown>> {
  const url = new URL(input.path, veriphoneApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url.toString(), {
      method: "GET",
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: input.signal,
    });
    payload = await readVeriphonePayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Veriphone request failed: ${error.message}` : "Veriphone request failed",
    );
  }

  if (!response.ok) {
    throw createVeriphoneError(response, payload, input.phase);
  }

  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `veriphone response for ${input.path} was not a JSON object`);
  }
  return record;
}

async function readVeriphonePayload(response: Response): Promise<unknown> {
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

function createVeriphoneError(
  response: Response,
  payload: unknown,
  phase: VeriphoneRequestPhase,
): ProviderRequestError {
  const message =
    extractVeriphoneErrorMessage(payload) ?? response.statusText ?? `veriphone request failed with ${response.status}`;

  if (response.status === 429 || response.status === 402) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && response.status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status === 400) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 403) {
    return new ProviderRequestError(403, message, payload);
  }
  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractVeriphoneErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }

  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error) ?? optionalString(record?.status);
}

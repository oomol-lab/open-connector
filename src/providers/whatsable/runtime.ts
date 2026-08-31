import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
} from "../provider-runtime.ts";

export const whatsableApiBaseUrl = "https://dashboard.whatsable.app/api/whatsapp/messages/v2.0.0";

export const whatsableActionHandlers: ProviderActionHandlers<
  "whatsable",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  send_message(input, context) {
    return requestWhatsable(input, context, "execute");
  },
};

export async function validateWhatsableCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = { apiKey, fetcher, signal };
  const response = await sendWhatsable({ to: "invalid", text: "Credential validation" }, context);
  const payload = await parsePayload(response);
  if (response.ok || response.status !== 400 || errorMessage(payload) !== "Invalid phone number format") {
    throw whatsableError(response.status, payload, "validate");
  }
  return {
    profile: { displayName: "WhatsAble API Key" },
    grantedScopes: [],
    metadata: { apiBaseUrl: whatsableApiBaseUrl, validationEndpoint: "/send" },
  };
}

async function requestWhatsable(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  phase: "validate" | "execute",
): Promise<unknown> {
  const response = await sendWhatsable(input, context);
  const payload = await parsePayload(response);
  if (!response.ok) throw whatsableError(response.status, payload, phase);
  if (!optionalRecord(payload)) throw new ProviderRequestError(502, "WhatsAble returned an invalid response");
  return payload;
}

async function sendWhatsable(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<Response> {
  const timeout = createProviderTimeout(context.signal);
  try {
    return await context.fetcher(`${whatsableApiBaseUrl}/send`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: context.apiKey,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(compactObject(input)),
      signal: timeout.signal,
    });
  } catch {
    if (timeout.didTimeout()) throw new ProviderRequestError(504, "WhatsAble request timed out");
    throw new ProviderRequestError(502, "WhatsAble request failed");
  } finally {
    timeout.cleanup();
  }
}

function parsePayload(response: Response): Promise<unknown> {
  return readProviderJsonBody(response, {
    emptyBody: null,
    invalidJsonMessage: "WhatsAble returned invalid JSON",
    invalidJsonFallback: response.ok ? undefined : (text) => text,
  });
}

function whatsableError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = errorMessage(payload) ?? `WhatsAble request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message);
  if (status === 401 || status === 403) return new ProviderRequestError(phase === "validate" ? 400 : status, message);
  return new ProviderRequestError(status >= 500 ? status : 502, message);
}

function errorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") return optionalString(payload);
  return optionalString(optionalRecord(payload)?.message);
}

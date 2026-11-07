import type { OAuthClientConfig } from "../../oauth/oauth-client-config-service.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
export function etsyApiKey(clientConfig?: Partial<OAuthClientConfig>): string {
  const key = requiredInputString(clientConfig?.clientId, "Etsy Client ID (keystring)");
  const secret = requiredInputString(clientConfig?.secretExtra?.sharedSecret, "Etsy sharedSecret");
  return `${key}:${secret}`;
}

export async function readEtsyResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    if (response.ok) throw new ProviderRequestError(502, "Etsy returned invalid JSON", undefined, "provider_error");
  }
  if (!response.ok) {
    const body = optionalRecord(payload);
    const message = [
      optionalString(body?.error),
      optionalString(body?.error_description),
      optionalString(body?.message),
    ]
      .filter(Boolean)
      .join(": ");
    throw new ProviderRequestError(
      response.status,
      `Etsy request failed (HTTP ${response.status})${message ? `: ${message}` : ""}`,
      undefined,
      "provider_error",
    );
  }
  return requiredResponseRecord(payload, "Etsy response");
}

export async function requestEtsy(
  url: URL,
  accessToken: string,
  apiKey: string,
  fetcher: typeof fetch,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return runProviderRequest({ label: "Etsy" }, async (signal) => {
    const response = await fetcher(url, {
      method: body ? "POST" : "GET",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-api-key": apiKey,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal,
      redirect: "manual",
    });
    return readEtsyResponse(response);
  });
}

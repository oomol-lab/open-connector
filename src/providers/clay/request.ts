import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRawString, optionalRecord } from "../../core/cast.ts";
import {
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
export const baseUrl = "https://api.clay.com/public/v0";
export function encodeSegment(value: unknown): string {
  const segment = String(value);
  if (segment === "." || segment === "..") throw providerInputError("Invalid Clay resource ID");
  return encodeURIComponent(segment);
}
export function requestClay(
  context: ApiKeyProviderContext,
  path: string,
  body?: Record<string, unknown>,
  method: string = body === undefined ? "GET" : "POST",
): Promise<Record<string, unknown>> {
  return runProviderRequest({ label: "Clay", signal: context.signal }, async (signal) => {
    const response = await context.fetcher(`${baseUrl}${path}`, {
      method,
      headers: {
        "clay-api-key": context.apiKey,
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "Clay returned invalid JSON",
      invalidJsonFallback: response.ok ? undefined : () => null,
    });
    if (!response.ok) {
      const message = optionalRawString(optionalRecord(payload)?.message);
      throw new ProviderRequestError(
        response.status,
        message ? `Clay: ${message}` : `Clay request failed (HTTP ${response.status})`,
        undefined,
        "provider_error",
      );
    }
    return requiredResponseRecord(payload, "Clay");
  });
}

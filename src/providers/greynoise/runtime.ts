import type { ProviderActionHandlers, ProviderFetch } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { encodePathSegment, isIpv4Address } from "../../core/request.ts";
import {
  parseProviderJsonBodyText,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  readProviderErrorTextBody,
  readProviderTextBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";

export const greynoiseApiBaseUrl = "https://api.greynoise.io";

export interface GreynoiseRuntimeContext {
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type GreynoiseActionHandler = (input: Record<string, unknown>, context: GreynoiseRuntimeContext) => Promise<unknown>;

export const greynoiseActionHandlers: ProviderActionHandlers<"greynoise", GreynoiseActionHandler> = {
  async lookup_ip(input, context) {
    const ip = ipv4PathSegment(input.ip);
    return requiredResponseRecord(
      await requestGreynoise({ context, ip, path: `/v3/community/${ip}` }),
      "GreyNoise IP lookup",
    );
  },
};

/**
 * Accept an IPv4 address only, so a model-supplied hostname or IPv6 literal never
 * reaches the request path: the Community endpoint serves IPv4 addresses only.
 */
function ipv4PathSegment(value: unknown): string {
  const ip = requiredInputString(value, "ip");
  if (!isIpv4Address(ip)) {
    throw providerInputError("ip must be an IPv4 address such as 8.8.8.8.");
  }
  return encodePathSegment(ip);
}

interface GreynoiseRequest {
  context: GreynoiseRuntimeContext;
  ip: string;
  path: string;
}

async function requestGreynoise(request: GreynoiseRequest): Promise<unknown> {
  const url = new URL(`${greynoiseApiBaseUrl}${request.path}`);
  return runProviderRequest({ label: "GreyNoise", signal: request.context.signal }, async (signal) => {
    const response = await request.context.fetcher(url, {
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal,
    });
    if (response.status === 404) {
      const payload = parseProviderJsonBodyText(await readProviderErrorTextBody(response, "GreyNoise error response"), {
        emptyBody: {},
        invalidJsonMessage: "GreyNoise returned malformed JSON",
        invalidJsonFallback: () => ({}),
      });
      const record = optionalRecord(payload);
      if (record?.ip === request.ip && record.noise === false && record.riot === false)
        return {
          ...record,
          ip: request.ip,
          noise: false,
          riot: false,
          message:
            optionalString(record.message) ?? "IP not observed scanning the internet or contained in RIOT data set.",
        };
      throw new ProviderRequestError(
        404,
        optionalString(record?.message) ?? "GreyNoise lookup route returned 404",
        payload,
        "provider_error",
      );
    }
    if (!response.ok) {
      throw await readGreynoiseError(response);
    }
    return parseProviderJsonBodyText(await readProviderTextBody(response, "GreyNoise response"), {
      emptyBody: null,
      invalidJsonMessage: "GreyNoise returned malformed JSON",
    });
  });
}

/**
 * Map a GreyNoise error onto the runtime's status conventions. The Community endpoint
 * needs no credentials, so an authorization failure is not something reconnecting can fix.
 */
async function readGreynoiseError(response: Response): Promise<ProviderRequestError> {
  const payload = parseProviderJsonBodyText(await readProviderErrorTextBody(response, "GreyNoise error response"), {
    emptyBody: {},
    invalidJsonMessage: "GreyNoise returned malformed JSON",
    invalidJsonFallback: () => ({}),
  });
  const message =
    optionalString(optionalRecord(payload)?.message) ?? `GreyNoise request failed with HTTP ${response.status}`;
  const status = response.status;
  return new ProviderRequestError(
    status,
    message,
    withRetryAfterSeconds(response, payload),
    status === 429 ? "rate_limited" : "provider_error",
  );
}

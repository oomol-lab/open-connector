import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyActionRequest } from "../provider-runtime.ts";
import type { ProviderActionName } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  providerInputError,
  providerResponseError,
} from "../provider-runtime.ts";

export const coupontoolsApiBaseUrl = "https://api.coupontools.com";

interface CoupontoolsActionInput extends ApiKeyActionRequest {
  actionName: ProviderActionName<"coupontools">;
  input: Record<string, unknown>;
}

interface CoupontoolsCredentials {
  clientId: string;
  clientSecret: string;
}

interface CoupontoolsRequestInput extends CoupontoolsCredentials {
  path: string;
  body: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: "validate" | "execute";
}

export async function validateCoupontoolsCredential(
  input: CoupontoolsCredentials,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestCoupontoolsJson({
    path: "/v3/coupon/list",
    body: { only_active: true },
    ...input,
    fetcher,
    signal,
    phase: "validate",
  });
  return {
    profile: { displayName: "Coupontools API Client" },
    metadata: { apiBaseUrl: coupontoolsApiBaseUrl },
  };
}

export async function executeCoupontoolsAction(input: CoupontoolsActionInput, fetcher: typeof fetch): Promise<unknown> {
  const credentials = {
    clientId: input.apiKey,
    clientSecret: requireStoredClientSecret(input.values),
  };
  switch (input.actionName) {
    case "list_coupons": {
      const raw = await requestCoupontoolsJson({
        path: "/v3/coupon/list",
        body: compactObject(input.input),
        ...credentials,
        fetcher,
        phase: "execute",
      });
      return { coupons: requireCouponArray(raw.coupon_info), raw };
    }
    case "get_coupon": {
      const raw = await requestCoupontoolsJson({
        path: "/v3/coupon/info",
        body: compactObject({
          campaign: requiredInputString(input.input.campaign, "campaign"),
          show_usage_stats: input.input.show_usage_stats,
        }),
        ...credentials,
        fetcher,
        phase: "execute",
      });
      return {
        coupon: requiredResponseRecord(raw.coupon_info, "Coupontools coupon_info"),
        raw,
      };
    }
    case "create_single_use_url": {
      if (input.input.customvalcode != null && input.input.autovalcode != null) {
        throw providerInputError("customvalcode and autovalcode cannot be used together");
      }
      const raw = await requestCoupontoolsJson({
        path: "/v3/singleuse/create",
        body: compactObject({
          ...input.input,
          campaign: requiredInputString(input.input.campaign, "campaign"),
        }),
        ...credentials,
        fetcher,
        phase: "execute",
      });
      const singleUseUrl = optionalString(raw.single_use_url)?.trim();
      const singleUseCode = optionalString(raw.single_use_code)?.trim();
      if (!singleUseUrl || !singleUseCode) {
        throw providerResponseError("Coupontools response did not include single_use_url and single_use_code");
      }
      return {
        single_use_url: singleUseUrl,
        single_use_code: singleUseCode,
        raw,
      };
    }
  }
}

function requireCouponArray(value: unknown) {
  if (!Array.isArray(value)) {
    throw providerResponseError("Coupontools coupon_info must be an array");
  }
  return value;
}

async function requestCoupontoolsJson(input: CoupontoolsRequestInput) {
  return runProviderRequest({ label: "Coupontools", signal: input.signal }, async (signal) => {
    const response = await input.fetcher(`${coupontoolsApiBaseUrl}${input.path}`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-client-id": input.clientId,
        "x-client-secret": input.clientSecret,
      },
      body: JSON.stringify(input.body),
      signal,
    });
    const payload = await readCoupontoolsPayload(response);
    if (!response.ok || hasCoupontoolsError(payload)) {
      throw createCoupontoolsError(response.status, payload, input.phase);
    }
    return requiredResponseRecord(payload, "Coupontools response");
  });
}

async function readCoupontoolsPayload(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    throw providerResponseError("Coupontools returned an empty response");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw providerResponseError("Coupontools returned invalid JSON");
  }
}

function hasCoupontoolsError(payload: unknown) {
  const status = optionalRecord(optionalRecord(payload)?.status);
  const value = optionalString(status?.status)?.toUpperCase();
  return value != null && value != "OK";
}

function createCoupontoolsError(statusCode: number, payload: unknown, phase: "validate" | "execute") {
  const payloadRecord = optionalRecord(payload);
  const status = optionalRecord(payloadRecord?.status);
  const message =
    optionalString(status?.message)?.trim() ??
    optionalString(payloadRecord?.message)?.trim() ??
    `Coupontools request failed with status ${statusCode}`;
  if (statusCode == 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase == "validate" && 400 <= statusCode && statusCode < 500) {
    return providerInputError(message);
  }
  if (statusCode == 401 || statusCode == 403) {
    return new ProviderRequestError(statusCode, message);
  }
  if (400 <= statusCode && statusCode < 500) {
    return new ProviderRequestError(statusCode, message);
  }
  return new ProviderRequestError(statusCode >= 400 ? statusCode : 502, message);
}

function requireStoredClientSecret(values: Record<string, string> | undefined) {
  return requiredInputString(values?.clientSecret, "clientSecret");
}

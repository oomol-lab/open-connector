import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { BigpictureIoActionName } from "./actions.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const bigpictureCompanyApiBaseUrl = "https://company.bigpicture.io";
const bigpictureIpApiBaseUrl = "https://ip.bigpicture.io";
const bigpictureCompanyFindPath = "/v1/companies/find";
const bigpictureIpLookupPath = "/v2/companies/ip";
const bigpictureValidationIp = "204.4.143.118";
const bigpictureRequestTimeoutMs = 30_000;

type BigpictureRequestPhase = "validate" | "execute";
type BigpictureActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const bigpictureIoActionHandlers: Record<BigpictureIoActionName, BigpictureActionHandler> = {
  async find_company_by_domain(input, context) {
    const payload = await requestBigpictureJson({
      context,
      baseUrl: bigpictureCompanyApiBaseUrl,
      path: bigpictureCompanyFindPath,
      query: {
        domain: readRequiredString(input.domain, "domain"),
      },
      phase: "execute",
      allowAccepted: false,
    });

    return {
      company: requireBigpictureObject(payload, "company lookup response"),
    };
  },
  async find_company_by_ip(input, context) {
    const payload = await requestBigpictureJson({
      context,
      baseUrl: bigpictureIpApiBaseUrl,
      path: bigpictureIpLookupPath,
      query: {
        ip: readRequiredString(input.ip, "ip"),
      },
      phase: "execute",
      allowAccepted: false,
    });
    return requireBigpictureObject(payload, "IP lookup response");
  },
};

export async function validateBigpictureIoCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestBigpictureJson({
    context: {
      apiKey,
      fetcher,
      signal,
    },
    baseUrl: bigpictureIpApiBaseUrl,
    path: bigpictureIpLookupPath,
    query: {
      ip: bigpictureValidationIp,
    },
    phase: "validate",
    allowAccepted: false,
  });
  const lookup = requireBigpictureObject(payload, "IP lookup response");
  const company = optionalRecord(lookup.company);

  return {
    profile: {
      accountId: "bigpicture_io-api-key",
      displayName: "BigPicture.io API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      companyApiBaseUrl: bigpictureCompanyApiBaseUrl,
      ipApiBaseUrl: bigpictureIpApiBaseUrl,
      validationEndpoint: bigpictureIpLookupPath,
      validationIp: bigpictureValidationIp,
      validationCompanyName: optionalString(company?.name),
      validationConfidence: optionalNumber(lookup.confidence),
    }),
  };
}

async function requestBigpictureJson(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  baseUrl: string;
  path: string;
  query: Record<string, string>;
  phase: BigpictureRequestPhase;
  allowAccepted: boolean;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, bigpictureRequestTimeoutMs);

  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(buildBigpictureUrl(input.baseUrl, input.path, input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: input.context.apiKey,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    payload = await readBigpicturePayload(response);
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error) || isTimeoutLikeError(error)) {
      throw new ProviderRequestError(504, "BigPicture.io request timed out");
    }

    if (error instanceof ProviderRequestError) {
      throw error;
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `BigPicture.io request failed: ${error.message}` : "BigPicture.io request failed",
    );
  } finally {
    timeout.cleanup();
  }

  if (response.status === 202 && !input.allowAccepted) {
    throw new ProviderRequestError(
      409,
      "BigPicture.io accepted the company lookup for async processing. Retry the same request in a few minutes.",
      payload,
    );
  }

  if (!response.ok) {
    throw createBigpictureError(response.status, payload, input.phase);
  }

  return payload;
}

function buildBigpictureUrl(baseUrl: string, path: string, query: Record<string, string>): string {
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== "") {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function readBigpicturePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createBigpictureError(status: number, payload: unknown, phase: BigpictureRequestPhase): ProviderRequestError {
  const message = extractBigpictureErrorMessage(payload) ?? `BigPicture.io request failed with ${status || 500}`;

  if (status === 402 || status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && (status === 400 || status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }

  if (status === 400 || status === 404) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractBigpictureErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return optionalString(payload);
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  for (const key of ["message", "error", "detail"]) {
    const value = optionalString(record[key]);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function requireBigpictureObject(payload: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(payload);
  if (!object) {
    throw new ProviderRequestError(502, `BigPicture.io ${label} must be an object`);
  }
  return object;
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value.trim();
}

function isTimeoutLikeError(error: unknown): boolean {
  return error instanceof Error && error.name === "TimeoutError";
}

import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

export const venafiCloudBaseUrls = {
  us: "https://api.venafi.cloud",
  eu: "https://api.venafi.eu",
};
const requestTimeoutMs = 30_000;

interface VenafiCloudContext {
  apiKey: string;
  region: keyof typeof venafiCloudBaseUrls;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

export async function validateVenafiCloudCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", invalidInput);
  const region = readRegion(input.region);
  const preferences = await requestVenafiCloud({
    apiKey,
    region,
    path: "/v1/preferences",
    operation: "validate credentials",
    phase: "validate",
    fetcher,
    signal,
  });
  const data = optionalRecord(preferences) ?? {};
  const identity = optionalString(data.userId) ?? optionalString(data.username) ?? fingerprint(apiKey);
  return {
    profile: {
      accountId: `venafi-cloud:${region}:${identity}`,
      displayName:
        optionalString(data.username) ?? optionalString(data.email) ?? `Venafi Cloud (${region.toUpperCase()})`,
    },
    grantedScopes: [],
    metadata: { region, apiBaseUrl: venafiCloudBaseUrls[region] },
  };
}

const handlers: Record<string, ProviderRuntimeHandler<VenafiCloudContext>> = {
  async get_certificate(input, context) {
    const certificateId = requiredString(input.certificateId, "certificateId", invalidInput);
    return {
      certificate: await requestVenafiCloud({
        ...context,
        path: `/outagedetection/v1/certificates/${encodeURIComponent(certificateId)}`,
        operation: "get certificate",
        phase: "execute",
      }),
    };
  },
  async list_certificates(input, context) {
    const payload = await requestVenafiCloud({
      ...context,
      path: "/outagedetection/v1/certificates",
      query: {
        limit: stringifyInteger(input.limit),
        offset: stringifyInteger(input.offset),
        subject: optionalString(input.subject),
      },
      operation: "list certificates",
      phase: "execute",
    });
    const object = optionalRecord(payload);
    const certificates = Array.isArray(payload)
      ? payload
      : object && Array.isArray(object.certificates)
        ? object.certificates
        : [];
    return { certificates, total: optionalInteger(object?.total) ?? null };
  },
  async get_certificate_request(input, context) {
    const requestId = requiredString(input.certificateRequestId, "certificateRequestId", invalidInput);
    return {
      certificateRequest: await requestVenafiCloud({
        ...context,
        path: `/outagedetection/v1/certificaterequests/${encodeURIComponent(requestId)}`,
        operation: "get certificate request",
        phase: "execute",
      }),
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<VenafiCloudContext>({
  service: "venafitlsprotectcloud",
  handlers,
  skipDnsValidation: true,
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, "venafitlsprotectcloud");
    return { apiKey: credential.apiKey, region: readRegion(credential.values.region), fetcher, signal: context.signal };
  },
});

function readRegion(value: unknown): keyof typeof venafiCloudBaseUrls {
  if (value === undefined || value === "us" || value === "cloud") return "us";
  if (value === "eu") return "eu";
  throw new ProviderRequestError(400, "region must be us or eu");
}

async function requestVenafiCloud(input: {
  apiKey: string;
  region: keyof typeof venafiCloudBaseUrls;
  path: string;
  operation: string;
  phase: "validate" | "execute";
  fetcher: ProviderFetch;
  signal?: AbortSignal;
  query?: Record<string, string | undefined>;
}) {
  const url = new URL(input.path, venafiCloudBaseUrls[input.region]);
  for (const [key, value] of Object.entries(input.query ?? {}))
    if (value !== undefined) url.searchParams.set(key, value);
  const response = await input.fetcher(url, {
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "tppl-api-key": input.apiKey,
      "user-agent": providerUserAgent,
    },
    signal: input.signal ?? AbortSignal.timeout(requestTimeoutMs),
  });
  const payload = await readPayload(response);
  if (!response.ok) throw upstreamError(response.status, payload, input.operation, input.phase);
  return payload;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderRequestError(502, "Venafi returned a non-JSON response");
  }
}

function upstreamError(status: number, payload: unknown, operation: string, phase: "validate" | "execute") {
  const object = optionalRecord(payload);
  const message =
    optionalString(object?.message) ?? optionalString(object?.error) ?? `Venafi ${operation} failed with ${status}`;
  return new ProviderRequestError(
    status === 401 || status === 403 ? (phase === "validate" ? 400 : 401) : status,
    message,
  );
}

function stringifyInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? String(value) : undefined;
}

function fingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function invalidInput(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

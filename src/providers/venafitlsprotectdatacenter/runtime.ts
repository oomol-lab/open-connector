import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl, encodePathSegment, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  defineProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  requireCustomCredential,
} from "../provider-runtime.ts";

const requestTimeoutMs = 30_000;
interface Credentials {
  domain: string;
  clientId: string;
  username: string;
  password: string;
}
interface VenafiDatacenterContext {
  credentials: Credentials;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

export async function validateVenafiDatacenterCredential(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const credentials = readCredentials(values);
  await getAccessToken(credentials, fetcher, "validate", signal);
  const url = new URL(credentials.domain);
  return {
    profile: {
      accountId: `venafi-datacenter:${url.host}:${fingerprint(credentials.username)}`,
      displayName: `${credentials.username} at ${url.hostname}`,
    },
    grantedScopes: ["certificate:manage"],
    metadata: { domain: credentials.domain },
  };
}

const handlers: Record<string, ProviderRuntimeHandler<VenafiDatacenterContext>> = {
  async get_certificate(input, context) {
    const token = await getAccessToken(context.credentials, context.fetcher, "execute", context.signal);
    const id = requiredString(input.certificateId, "certificateId", invalidInput);
    return {
      certificate: await requestApi(
        context.credentials.domain,
        `/vedsdk/Certificates/${encodePathSegment(id)}`,
        token,
        context.fetcher,
        undefined,
        undefined,
        context.signal,
      ),
    };
  },
  async list_certificates(input, context) {
    const token = await getAccessToken(context.credentials, context.fetcher, "execute", context.signal);
    const limit = typeof input.limit === "number" ? String(input.limit) : undefined;
    const next = optionalString(input.next);
    const path = next ? normalizeCertificateListNext(next, context.credentials.domain) : "/vedsdk/Certificates";
    const payload = await requestApi(
      context.credentials.domain,
      path,
      token,
      context.fetcher,
      next ? undefined : { Limit: limit },
      undefined,
      context.signal,
    );
    const object = optionalRecord(payload) ?? {};
    const links = Array.isArray(object._links) ? object._links : [];
    const firstLink = optionalRecord(links[0]);
    return {
      certificates: Array.isArray(object.Certificates) ? object.Certificates : [],
      next: optionalString(firstLink?.Next) ?? null,
    };
  },
  async check_policy(input, context) {
    const token = await getAccessToken(context.credentials, context.fetcher, "execute", context.signal);
    const policyDn = requiredString(input.policyDn, "policyDn", invalidInput);
    return {
      policy: await requestApi(
        context.credentials.domain,
        "/vedsdk/Certificates/CheckPolicy",
        token,
        context.fetcher,
        undefined,
        { PolicyDN: policyDn },
        context.signal,
      ),
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<VenafiDatacenterContext>({
  service: "venafitlsprotectdatacenter",
  handlers,
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  async createContext(context, fetcher) {
    const credential = await requireCustomCredential(context, "venafitlsprotectdatacenter");
    return { credentials: readCredentials(credential.values), fetcher, signal: context.signal };
  },
});

function readCredentials(values: Record<string, string>): Credentials {
  return {
    domain: normalizeDomain(values.domain),
    clientId: requiredString(values.clientId, "clientId", invalidInput),
    username: requiredString(values.username, "username", invalidInput),
    password: requiredString(values.password, "password", invalidInput),
  };
}

function normalizeDomain(value: unknown) {
  const raw = requiredString(value, "domain", invalidInput);
  const url = assertPublicHttpUrl(raw, {
    fieldName: "domain",
    createError: invalidInput,
    allowPrivateNetwork: isPrivateNetworkAccessAllowed(),
  });
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash)
    throw invalidInput("domain must be an HTTPS origin without credentials, query, or fragment");
  return url.toString().replace(/\/$/, "");
}

function normalizeCertificateListNext(value: string, domain: string) {
  let url: URL;
  try {
    url = new URL(value, domain);
  } catch {
    throw invalidInput("next must be a valid URL");
  }
  if (url.origin !== new URL(domain).origin || url.pathname !== "/vedsdk/Certificates")
    throw invalidInput("next must target the configured Venafi certificate list endpoint");
  return url.toString();
}

async function getAccessToken(
  credentials: Credentials,
  fetcher: ProviderFetch,
  phase: "validate" | "execute",
  signal?: AbortSignal,
) {
  const payload = await guardedRequest(
    new URL("/vedauth/authorize/oauth", credentials.domain),
    fetcher,
    {
      method: "POST",
      body: JSON.stringify({
        client_id: credentials.clientId,
        username: credentials.username,
        password: credentials.password,
        scope: "certificate:manage",
      }),
    },
    phase,
    signal,
  );
  const token = optionalString(optionalRecord(payload)?.access_token);
  if (!token) throw new ProviderRequestError(502, "Venafi token response is missing access_token");
  return token;
}

async function requestApi(
  domain: string,
  path: string,
  token: string,
  fetcher: ProviderFetch,
  query?: Record<string, string | undefined>,
  body?: Record<string, unknown>,
  signal?: AbortSignal,
) {
  const url = new URL(path, domain);
  for (const [key, value] of Object.entries(query ?? {})) if (value !== undefined) url.searchParams.set(key, value);
  return guardedRequest(
    url,
    fetcher,
    {
      method: body ? "POST" : "GET",
      headers: { authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    },
    "execute",
    signal,
  );
}

async function guardedRequest(
  url: URL,
  fetcher: ProviderFetch,
  init: RequestInit,
  phase: "validate" | "execute",
  signal?: AbortSignal,
) {
  const response = await fetcher(url, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": providerUserAgent,
      ...init.headers,
    },
    signal: signal ?? AbortSignal.timeout(requestTimeoutMs),
  });
  const text = await response.text();
  let payload: unknown = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ProviderRequestError(502, "Venafi returned a non-JSON response");
    }
  }
  if (!response.ok) {
    const object = optionalRecord(payload);
    const message =
      optionalString(object?.message) ??
      optionalString(object?.error) ??
      `Venafi request failed with ${response.status}`;
    throw new ProviderRequestError(
      response.status === 401 || response.status === 403 ? (phase === "validate" ? 400 : 401) : response.status,
      message,
    );
  }
  return payload;
}

function fingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function invalidInput(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

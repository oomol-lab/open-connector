import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "saas_custom_domains";
const saasCustomDomainsApiBaseUrl = "https://app.saascustomdomains.com/api/v1";
const saasCustomDomainsApiUrl = new URL(saasCustomDomainsApiBaseUrl);

type SaasCustomDomainsPhase = "validate" | "execute";
type QueryValue = string | number | undefined;
type FormValue = string | number | boolean | undefined;
type SaasCustomDomainsActionHandler = (
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
) => Promise<unknown>;

export const saasCustomDomainsActionHandlers: ProviderActionHandlers<
  "saas_custom_domains",
  SaasCustomDomainsActionHandler
> = {
  list_accounts(_input, context) {
    return listAccounts(context, "execute");
  },
  list_upstreams(input, context) {
    return listUpstreams(input, context);
  },
  create_upstream(input, context) {
    return createUpstream(input, context);
  },
  get_upstream(input, context) {
    return getUpstream(input, context);
  },
  delete_upstream(input, context) {
    return deleteUpstream(input, context);
  },
  list_custom_domains(input, context) {
    return listCustomDomains(input, context);
  },
  create_custom_domain(input, context) {
    return createCustomDomain(input, context);
  },
  get_custom_domain(input, context) {
    return getCustomDomain(input, context);
  },
  delete_custom_domain(input, context) {
    return deleteCustomDomain(input, context);
  },
  verify_custom_domain_dns_records(input, context) {
    return verifyCustomDomainDnsRecords(input, context);
  },
  purge_custom_domain_http_cache(input, context) {
    return purgeCustomDomainHttpCache(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, saasCustomDomainsActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
    const result = await listAccounts({ apiKey, fetcher, signal }, "validate");
    const firstAccount = result.accounts[0];
    const firstAccountName = firstAccount ? optionalString(firstAccount.name) : undefined;
    const firstAccountUuid = firstAccount ? optionalString(firstAccount.uuid) : undefined;
    return {
      profile: {
        accountId: firstAccountUuid ?? "saas_custom_domains",
        displayName: firstAccountName ?? "SaaS Custom Domains API Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: saasCustomDomainsApiBaseUrl,
        authMethod: "bearer",
        validationEndpoint: "/accounts",
        accountCount: result.accounts.length,
        accountName: firstAccountName,
      }),
    };
  },
};

async function listAccounts(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: SaasCustomDomainsPhase,
): Promise<{ accounts: Array<Record<string, unknown>> }> {
  const payload = await requestSaasCustomDomainsJson({ method: "GET", path: "/accounts" }, context, phase);
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "SaaS Custom Domains accounts response was not an array");
  }
  return { accounts: payload.map((item) => requiredRecord(item, "account")) };
}

async function listUpstreams(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestSaasCustomDomainsJson(
    {
      method: "GET",
      path: `/accounts/${encodeURIComponent(readRequiredString(input.account_uuid, "account_uuid"))}/upstreams`,
      query: buildPaginationQuery(input, { host: optionalString(input.host) }),
    },
    context,
    "execute",
  );
  const record = requiredRecord(payload, "upstreams");
  return { upstreams: readDataArray(record, "upstreams"), pagination: readPagination(record) };
}

async function createUpstream(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  return {
    upstream: requiredRecord(
      await requestSaasCustomDomainsJson(
        {
          method: "POST",
          path: `/accounts/${encodeURIComponent(readRequiredString(input.account_uuid, "account_uuid"))}/upstreams`,
          form: compactObject({
            host: readRequiredString(input.host, "host"),
            tls: optionalBoolean(input.tls),
            port: optionalInteger(input.port),
            bubble_io: optionalBoolean(input.bubble_io),
            compression_enabled: optionalBoolean(input.compression_enabled),
            geocoding_enabled: optionalBoolean(input.geocoding_enabled),
            auth_token: optionalString(input.auth_token),
          }),
        },
        context,
        "execute",
      ),
      "upstream",
    ),
  };
}

async function getUpstream(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  return {
    upstream: requiredRecord(
      await requestSaasCustomDomainsJson({ method: "GET", path: buildUpstreamPath(input) }, context, "execute"),
      "upstream",
    ),
  };
}

async function deleteUpstream(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestSaasCustomDomainsJson(
    { method: "DELETE", path: buildUpstreamPath(input) },
    context,
    "execute",
  );
  return { message: readMessage(payload) };
}

async function listCustomDomains(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestSaasCustomDomainsJson(
    {
      method: "GET",
      path: `${buildUpstreamPath(input)}/custom_domains`,
      query: buildPaginationQuery(input, { host: optionalString(input.host) }),
    },
    context,
    "execute",
  );
  const record = requiredRecord(payload, "custom domains");
  return { custom_domains: readDataArray(record, "custom domains"), pagination: readPagination(record) };
}

async function createCustomDomain(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  return {
    custom_domain: requiredRecord(
      await requestSaasCustomDomainsJson(
        {
          method: "POST",
          path: `${buildUpstreamPath(input)}/custom_domains`,
          form: compactObject({
            host: readRequiredString(input.host, "host"),
            instructions_recipient: optionalString(input.instructions_recipient),
            prepend_path: optionalString(input.prepend_path),
            challenge_type: optionalString(input.challenge_type),
            redirect_to_www: optionalBoolean(input.redirect_to_www),
          }),
        },
        context,
        "execute",
      ),
      "custom_domain",
    ),
  };
}

async function getCustomDomain(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  return {
    custom_domain: requiredRecord(
      await requestSaasCustomDomainsJson({ method: "GET", path: buildCustomDomainPath(input) }, context, "execute"),
      "custom_domain",
    ),
  };
}

async function deleteCustomDomain(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestSaasCustomDomainsJson(
    { method: "DELETE", path: buildCustomDomainPath(input) },
    context,
    "execute",
  );
  return { message: readMessage(payload) };
}

async function verifyCustomDomainDnsRecords(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestSaasCustomDomainsJson(
    { method: "POST", path: `${buildCustomDomainPath(input)}/verify_dns_records` },
    context,
    "execute",
  );
  const record = requiredRecord(payload, "dns records response");
  return {
    message: readRequiredString(record.message, "message"),
    dns_status: readRequiredString(record.dns_status, "dns_status"),
    host: readRequiredString(record.host, "host"),
  };
}

async function purgeCustomDomainHttpCache(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestSaasCustomDomainsJson(
    { method: "POST", path: `${buildCustomDomainPath(input)}/purge_http_cache` },
    context,
    "execute",
  );
  return { message: readMessage(payload) };
}

async function requestSaasCustomDomainsJson(
  request: {
    method: "GET" | "POST" | "DELETE";
    path: string;
    query?: Record<string, QueryValue>;
    form?: Record<string, FormValue>;
  },
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: SaasCustomDomainsPhase,
): Promise<unknown> {
  const url = new URL(`${saasCustomDomainsApiUrl.pathname}${request.path}`, saasCustomDomainsApiUrl.origin);
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${context.apiKey}`,
    "user-agent": providerUserAgent,
  });
  let body: URLSearchParams | undefined;
  if (request.form) {
    body = new URLSearchParams();
    for (const [key, value] of Object.entries(request.form)) {
      if (value !== undefined) body.set(key, String(value));
    }
    headers.set("content-type", "application/x-www-form-urlencoded;charset=UTF-8");
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, { method: request.method, headers, body, signal: context.signal });
    payload = await readJsonPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `SaaS Custom Domains request failed: ${error.message}`
        : "SaaS Custom Domains request failed",
    );
  }

  if (!response.ok) throw buildSaasCustomDomainsError(response.status, payload, phase);
  return payload;
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "SaaS Custom Domains returned invalid JSON");
  }
}

function buildSaasCustomDomainsError(
  status: number,
  payload: unknown,
  phase: SaasCustomDomainsPhase,
): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `SaaS Custom Domains request failed with status ${status || 500}`;
  if (status === 401) return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  if (status >= 400 && status < 500) return new ProviderRequestError(status, message, payload);
  return new ProviderRequestError(status || 502, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  return record ? (optionalString(record.error) ?? optionalString(record.message)) : undefined;
}

function buildUpstreamPath(input: Record<string, unknown>): string {
  return `/accounts/${encodeURIComponent(readRequiredString(input.account_uuid, "account_uuid"))}/upstreams/${encodeURIComponent(readRequiredString(input.upstream_uuid, "upstream_uuid"))}`;
}

function buildCustomDomainPath(input: Record<string, unknown>): string {
  return `${buildUpstreamPath(input)}/custom_domains/${encodeURIComponent(readRequiredString(input.domain_uuid, "domain_uuid"))}`;
}

function buildPaginationQuery(
  input: Record<string, unknown>,
  extra: Record<string, QueryValue>,
): Record<string, QueryValue> {
  return compactObject({ ...extra, page: optionalInteger(input.page), per_page: optionalInteger(input.per_page) });
}

function readDataArray(record: Record<string, unknown>, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(record.data)) {
    throw new ProviderRequestError(502, `SaaS Custom Domains ${label} response did not include data`);
  }
  return record.data.map((item) => requiredRecord(item, label));
}

function readPagination(record: Record<string, unknown>): Record<string, unknown> {
  return requiredRecord(record.pagination, "SaaS Custom Domains response did not include pagination");
}

function readMessage(payload: unknown): string {
  const record = requiredRecord(payload, "SaaS Custom Domains response body was not an object");
  return readRequiredString(record.message, "message");
}

function requiredRecord(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, message);
  return record;
}

function readRequiredString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

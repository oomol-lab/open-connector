import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  readProviderJsonBody,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
const service = "cufinder";
const baseUrl = "https://api.cufinder.io/v3";
type Phase = "validate" | "execute";
type Handler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
const handlers: ProviderActionHandlers<"cufinder", Handler> = {
  find_company_domain(input, context) {
    return execute(
      "/companies/name-to-domain",
      { name: trim(input.name), country_code: upper(input.countryCode), address: trim(input.address) },
      context,
      (data, meta) => ({ domain: requireString(data.domain, "domain"), meta }),
    );
  },
  find_company_name(input, context) {
    return execute("/companies/domain-to-name", { domain: trim(input.domain) }, context, (data, meta) => ({
      name: requireString(data.name, "name"),
      meta,
    }));
  },
  enrich_company(input, context) {
    return execute("/companies/enrich", { query: trim(input.query) }, context, (data, meta) => ({
      company: requiredResponseRecord(data.company, "cufinder company"),
      meta,
    }));
  },
  enrich_person(input, context) {
    return execute(
      "/people/enrich-by-name",
      { full_name: trim(input.fullName), company: trim(input.company) },
      context,
      (data, meta) => ({ person: requiredResponseRecord(data.person, "cufinder person"), meta }),
    );
  },
  enrich_person_by_email(input, context) {
    return execute("/people/enrich-by-email", { email: trim(input.email) }, context, (data, meta) => ({
      person: requiredResponseRecord(data.person, "cufinder person"),
      meta,
    }));
  },
};
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await request(
      "/normalize/url",
      { value: "https://cufinder.io" },
      { apiKey: input.apiKey, fetcher, signal },
      "validate",
    );
    return {
      profile: { accountId: "cufinder-api-key", displayName: "CUFinder API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationEndpoint: "/normalize/url" },
    };
  },
};
async function execute(
  path: string,
  body: Record<string, unknown>,
  context: ApiKeyProviderContext,
  normalize: (data: Record<string, unknown>, meta: Record<string, unknown>) => unknown,
) {
  const payload = await request(path, body, context, "execute");
  return normalize(
    requiredResponseRecord(payload.data, "cufinder data"),
    requiredResponseRecord(payload.meta, "cufinder metadata"),
  );
}
async function request(
  path: string,
  body: Record<string, unknown>,
  context: ApiKeyProviderContext,
  phase: Phase,
): Promise<Record<string, unknown>> {
  return runProviderRequest({ signal: context.signal, label: "cufinder" }, async (signal) => {
    const response = await context.fetcher(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": context.apiKey,
      },
      body: JSON.stringify(compactObject(body)),
      signal,
    });
    const payload = requiredResponseRecord(
      await readProviderJsonBody(response, { emptyBody: {}, invalidJsonMessage: "cufinder returned malformed JSON" }),
      "cufinder response",
    );
    if (!response.ok || payload.success !== true) throw makeError(response.status, payload, phase);
    return payload;
  });
}
function makeError(status: number, payload: Record<string, unknown>, phase: Phase) {
  const error = optionalRecord(payload.error);
  const code = optionalString(error?.code);
  const message = optionalString(error?.message) ?? `cufinder request failed with status ${status}`;
  if (code === "unauthorized")
    return phase === "validate" ? providerInputError(message) : new ProviderRequestError(409, message, payload);
  if (code === "rate_limited") return new ProviderRequestError(429, message, payload);
  if (["invalid_request", "validation_failed", "not_found"].includes(code ?? "")) return providerInputError(message);
  if (code === "request_timeout") return new ProviderRequestError(504, message, payload);
  return new ProviderRequestError(status >= 400 ? status : 502, message, payload);
}
function trim(value: unknown) {
  return typeof value === "string" ? value.trim() : value;
}
function upper(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : value;
}
function requireString(value: unknown, field: string) {
  const result = optionalString(value);
  if (!result) throw providerResponseError(`cufinder data.${field} must be a string`);
  return result;
}

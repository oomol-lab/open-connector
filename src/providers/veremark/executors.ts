import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-executors.ts";

import {
  compactObject,
  looseArray,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { readProviderTextBody } from "../provider-runtime.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";
const service = "veremark",
  baseUrl = "https://api.veremark.com/external/v1";
type Handler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
const handlers: ProviderActionHandlers<"veremark", Handler> = {
  async list_criteria(_i, c) {
    return { criteria: looseArray(await request("/criteria/", c)).map(normalizeCriterion) };
  },
  async list_requests(i, c) {
    return {
      requests: looseArray(
        await request("/request/", c, "GET", undefined, {
          status_change_date_from: optionalString(i.statusChangeDateFrom),
        }),
      ).map(normalizeRequest),
    };
  },
  async get_request(i, c) {
    return {
      request: normalizeRequest(await request(`/request/${encodeURIComponent(requiredString(i.guid, "guid"))}`, c)),
    };
  },
  async create_request(i, c) {
    const candidate = optionalRecord(i.candidate) ?? {},
      job = optionalRecord(i.job) ?? {},
      webhook = optionalRecord(i.webhook);
    const body = compactObject({
      criteria_guid: requiredString(i.criteriaGuid, "criteriaGuid"),
      candidate: compactObject({
        first_name: requiredString(candidate.firstName, "candidate.firstName"),
        last_name: requiredString(candidate.lastName, "candidate.lastName"),
        email: requiredString(candidate.email, "candidate.email"),
        country_code: optionalString(candidate.countryCode),
        phone_number: optionalString(candidate.phoneNumber),
      }),
      job: compactObject({
        role: requiredString(job.role, "job.role"),
        external_id: optionalString(job.externalId),
        client: optionalString(job.client),
        additional_information: optionalString(job.additionalInformation),
      }),
      webhook: webhook
        ? compactObject({
            url: requiredString(webhook.url, "webhook.url"),
            method: requiredString(webhook.method, "webhook.method"),
            authentication_type: optionalString(webhook.authenticationType),
            credentials: optionalString(webhook.credentials),
          })
        : undefined,
      send_initial_candidate_email: i.sendInitialCandidateEmail,
      assigned_user_guid: optionalString(i.assignedUserGuid),
    });
    return { request: normalizeRequest(await request("/request/", c, "POST", body)) };
  },
};
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl,
  auth: { type: "api_key_authorization", prefix: "Token " },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const criteria = await handlers.list_criteria({}, { apiKey: input.apiKey, fetcher, signal });
    return {
      profile: { displayName: "Veremark API Token" },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: baseUrl,
        validationEndpoint: "/criteria/",
        criteriaCount: looseArray(optionalRecord(criteria)?.criteria).length,
      },
    };
  },
};
async function request(
  path: string,
  c: ApiKeyProviderContext,
  method = "GET",
  body?: Record<string, unknown>,
  query?: Record<string, string | undefined>,
): Promise<unknown> {
  const url = new URL(path.replace(/^\//u, ""), `${baseUrl}/`);
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) url.searchParams.set(k, v);
  const response = await c.fetcher(url, {
    method,
    headers: {
      accept: "application/json",
      authorization: `Token ${c.apiKey}`,
      "content-type": "application/json",
      "user-agent": providerUserAgent,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: c.signal,
  });
  const text = await readProviderTextBody(response, "Veremark response");
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new ProviderRequestError(502, "Veremark returned invalid JSON");
  }
  if (!response.ok) {
    const r = optionalRecord(payload);
    throw new ProviderRequestError(
      response.status,
      optionalString(r?.detail) ??
        optionalString(r?.message) ??
        optionalString(r?.error) ??
        `Veremark request failed with status ${response.status}`,
      payload,
    );
  }
  return payload;
}
function normalizeCriterion(value: unknown): unknown {
  const r = requiredRecord(value, "Veremark criterion");
  return {
    guid: requiredString(r.guid, "criterion guid"),
    name: requiredString(r.name, "criterion name"),
    country: optionalString(r.country) ?? null,
    checks: looseArray(r.checks),
    raw: r,
  };
}
function normalizeRequest(value: unknown): unknown {
  const r = requiredRecord(value, "Veremark request");
  return {
    guid: requiredString(r.guid, "request guid"),
    status: optionalString(r.status) ?? null,
    requestUrl: optionalString(r.request_url) ?? null,
    externalId: optionalString(r.external_id) ?? null,
    candidateGuid: optionalString(r.candidate_guid) ?? null,
    checks: looseArray(r.checks),
    raw: r,
  };
}

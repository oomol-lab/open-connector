import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

interface CloudflareEnvelope {
  success?: unknown;
  result?: unknown;
  errors?: unknown;
  messages?: unknown;
  result_info?: unknown;
}

export interface CloudflareEmailRoutingContext {
  email?: string;
  apiKey: string;
  accountId: string;
  zoneId: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface CloudflareRequest {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
}

const apiBaseUrl = "https://api.cloudflare.com/client/v4";

export const cloudflareEmailRoutingActionHandlers: Record<
  string,
  ProviderRuntimeHandler<CloudflareEmailRoutingContext>
> = {
  list_routing_rules(input, context) {
    return listRoutingRules(input, context);
  },
  create_routing_rule(input, context) {
    return mutateRoutingRule("POST", input, context);
  },
  update_routing_rule(input, context) {
    return mutateRoutingRule("PUT", input, context);
  },
  delete_routing_rule(input, context) {
    return deleteRoutingRule(input, context);
  },
  list_destination_addresses(input, context) {
    return listDestinationAddresses(input, context);
  },
};

export async function validateCloudflareEmailRoutingCredential(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = requireInputString(values.apiKey, "apiKey");
  if (apiKey.startsWith("cfat_") || apiKey.startsWith("cfpat_")) {
    throw new ProviderRequestError(
      400,
      "Cloudflare Email Routing does not accept cfat_ Account API Tokens; use a cfut_ User API Token with Email Routing permissions, or a Global API Key with the account email.",
    );
  }
  if (apiKey.startsWith("cfut_")) {
    const envelope = await requestCloudflare({ apiKey, fetcher, signal }, { path: "/user/tokens/verify" }, "validate");
    const verification = readObject(envelope.result, "cloudflare token verification");
    return {
      profile: { accountId: optionalString(verification.id), displayName: "Cloudflare Email Routing User API Token" },
      grantedScopes: [],
      metadata: { validationEndpoint: "/user/tokens/verify", tokenStatus: optionalString(verification.status) },
    };
  }
  const email = requireInputString(values.email, "email");
  const envelope = await requestCloudflare({ email, apiKey, fetcher, signal }, { path: "/user" }, "validate");
  const user = readObject(envelope.result, "cloudflare user");
  return {
    profile: {
      accountId: optionalString(user.id) ?? email,
      displayName: optionalString(user.email) ?? email,
    },
    grantedScopes: [],
    metadata: compactObject({ validationEndpoint: "/user", email: optionalString(user.email) }),
  };
}

async function listRoutingRules(
  input: Record<string, unknown>,
  context: CloudflareEmailRoutingContext,
): Promise<unknown> {
  const explicitAccount = optionalString(input.accountId);
  const zone = explicitAccount ? undefined : (optionalString(input.zoneId) ?? context.zoneId);
  const account = explicitAccount ?? context.accountId;
  const scope = explicitAccount
    ? `accounts/${encodeURIComponent(explicitAccount)}`
    : zone
      ? `zones/${encodeURIComponent(zone)}`
      : `accounts/${encodeURIComponent(requireInputString(account, "accountId"))}`;
  const envelope = await requestCloudflare(
    context,
    {
      path: `/${scope}/email/routing/rules`,
      query: { page: optionalInteger(input.page), per_page: optionalInteger(input.perPage) },
    },
    "execute",
  );
  return {
    rules: normalizeRuleList(envelope.result, "cloudflare routing rules"),
    resultInfo: normalizeResultInfo(envelope.result_info),
  };
}

async function mutateRoutingRule(
  method: "POST" | "PUT",
  input: Record<string, unknown>,
  context: CloudflareEmailRoutingContext,
): Promise<unknown> {
  const zone = encodeURIComponent(optionalString(input.zoneId) ?? requireInputString(context.zoneId, "zoneId"));
  const suffix = method === "PUT" ? `/${encodeURIComponent(requireInputString(input.ruleId, "ruleId"))}` : "";
  const bodyInput =
    method === "PUT"
      ? {
          ...input,
          actions: requireInputArray(input.actions, "actions"),
          matchers: requireInputArray(input.matchers, "matchers"),
        }
      : input;
  const envelope = await requestCloudflare(
    context,
    {
      method,
      path: `/zones/${zone}/email/routing/rules${suffix}`,
      body: buildRuleBody(bodyInput),
    },
    "execute",
  );
  return { rule: normalizeRule(envelope.result, "cloudflare routing rule") };
}

async function deleteRoutingRule(
  input: Record<string, unknown>,
  context: CloudflareEmailRoutingContext,
): Promise<unknown> {
  const zoneId = optionalString(input.zoneId) ?? requireInputString(context.zoneId, "zoneId");
  const id = requireInputString(input.ruleId, "ruleId");
  await requestCloudflare(
    context,
    { method: "DELETE", path: `/zones/${encodeURIComponent(zoneId)}/email/routing/rules/${encodeURIComponent(id)}` },
    "execute",
  );
  return { id, deleted: true };
}

async function listDestinationAddresses(
  input: Record<string, unknown>,
  context: CloudflareEmailRoutingContext,
): Promise<unknown> {
  const accountId = optionalString(input.accountId) ?? requireInputString(context.accountId, "accountId");
  const envelope = await requestCloudflare(
    context,
    {
      path: `/accounts/${encodeURIComponent(accountId)}/email/routing/addresses`,
      query: { page: optionalInteger(input.page), per_page: optionalInteger(input.perPage) },
    },
    "execute",
  );
  return {
    addresses: normalizeAddressList(envelope.result, "cloudflare destination addresses"),
    resultInfo: normalizeResultInfo(envelope.result_info),
  };
}

function buildRuleBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    actions: normalizeRecords(input.actions),
    matchers: normalizeRecords(input.matchers),
    enabled: optionalBoolean(input.enabled),
    name: optionalString(input.name),
    priority: optionalInteger(input.priority),
    source: optionalString(input.source),
  });
}

function requireInputArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0) throw new ProviderRequestError(400, `${field} is required`);
  return value;
}

async function requestCloudflare(
  context: { email?: string; apiKey: string; fetcher: ProviderFetch; signal?: AbortSignal },
  request: CloudflareRequest,
  phase: "validate" | "execute",
): Promise<CloudflareEnvelope> {
  const response = await context.fetcher(buildUrl(request.path, request.query), {
    method: request.method ?? "GET",
    headers: buildHeaders(context, request.body !== undefined),
    body: request.body ? JSON.stringify(request.body) : undefined,
    signal: context.signal,
  });
  const envelope = await readEnvelope(response);
  if (!response.ok || envelope.success === false) {
    throw normalizeError(response, envelope, phase);
  }
  return envelope;
}

function buildHeaders(context: { email?: string; apiKey: string }, hasBody: boolean): Record<string, string> {
  if (context.apiKey.startsWith("cfut_")) {
    return {
      accept: "application/json",
      authorization: `Bearer ${context.apiKey}`,
      "user-agent": providerUserAgent,
      ...(hasBody ? { "content-type": "application/json" } : {}),
    };
  }
  return {
    accept: "application/json",
    "x-auth-email": requireInputString(context.email, "email"),
    "x-auth-key": context.apiKey,
    "user-agent": providerUserAgent,
    ...(hasBody ? { "content-type": "application/json" } : {}),
  };
}

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(`${apiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(queryParams(query ?? {}))) url.searchParams.set(key, value);
  return url.toString();
}

async function readEnvelope(response: Response): Promise<CloudflareEnvelope> {
  const text = await response.text().catch(() => "");
  if (!text.trim())
    return { success: false, errors: [{ message: `cloudflare request failed with ${response.status}` }] };
  try {
    return JSON.parse(text) as CloudflareEnvelope;
  } catch {
    return { success: false, errors: [{ message: text }] };
  }
}

function normalizeError(
  response: Response,
  envelope: CloudflareEnvelope,
  phase: "validate" | "execute",
): ProviderRequestError {
  const message = readErrorMessage(envelope) ?? `cloudflare request failed with ${response.status}`;
  if (response.status === 429) return new ProviderRequestError(429, message);
  if (phase === "validate" && [400, 401, 403, 404].includes(response.status))
    return new ProviderRequestError(400, message);
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message);
}

function readErrorMessage(envelope: CloudflareEnvelope): string | undefined {
  for (const item of [
    ...(Array.isArray(envelope.errors) ? envelope.errors : []),
    ...(Array.isArray(envelope.messages) ? envelope.messages : []),
  ]) {
    const record = optionalRecord(item);
    const message = optionalString(record?.message);
    if (message) return message;
    for (const chainItem of Array.isArray(record?.error_chain) ? record.error_chain : []) {
      const chainMessage = optionalString(optionalRecord(chainItem)?.message);
      if (chainMessage) return chainMessage;
    }
  }
  return undefined;
}

function normalizeRuleList(value: unknown, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, `malformed ${label} response`);
  return value.map((item) => normalizeRule(item, label));
}

function normalizeAddressList(value: unknown, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, `malformed ${label} response`);
  return value.map((item) => normalizeAddress(item, label));
}

function normalizeRule(value: unknown, label: string): Record<string, unknown> {
  const object = readObject(value, label);
  return compactObject({
    id: optionalString(object.id),
    actions: normalizeRecords(object.actions),
    enabled: optionalBoolean(object.enabled),
    matchers: normalizeRecords(object.matchers),
    name: optionalString(object.name),
    priority: optionalInteger(object.priority),
    source: optionalString(object.source),
    zone: optionalRecord(object.zone),
  });
}

function normalizeAddress(value: unknown, label: string): Record<string, unknown> {
  const object = readObject(value, label);
  return compactObject({
    id: optionalString(object.id),
    email: optionalString(object.email),
    created: optionalString(object.created),
    modified: optionalString(object.modified),
    verified: optionalString(object.verified) ?? (object.verified === null ? null : undefined),
  });
}

function normalizeRecords(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((item) => {
    const record = optionalRecord(item);
    if (!record) throw new ProviderRequestError(502, "malformed cloudflare nested object");
    return compactObject(record);
  });
}

function normalizeResultInfo(value: unknown): Record<string, unknown> | undefined {
  const info = optionalRecord(value);
  return info
    ? compactObject({
        page: optionalInteger(info.page),
        perPage: optionalInteger(info.per_page),
        count: optionalInteger(info.count),
        totalCount: optionalInteger(info.total_count),
        totalPages: optionalInteger(info.total_pages),
      })
    : undefined;
}

function readObject(value: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) throw new ProviderRequestError(502, `malformed ${label} response`);
  return object;
}

function requireInputString(value: unknown, field: string): string {
  const text = optionalString(value);
  if (!text) throw new ProviderRequestError(400, `${field} is required`);
  return text;
}

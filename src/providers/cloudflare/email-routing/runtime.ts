import type { ProviderRuntimeHandler } from "../../provider-executors.ts";
import type { CloudflareEnvelope } from "../shared/client.ts";
import type { CloudflareContext } from "../shared/context.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
} from "../../../core/cast.ts";
import { queryParams } from "../../../core/request.ts";
import { requiredInputString, ProviderRequestError, providerUserAgent } from "../../provider-runtime.ts";
import { cloudflareApiBaseUrl } from "../shared/client.ts";
import { resolveActionAccount, withAccount } from "../shared/context.ts";
import { cloudflareResponseError, parseCloudflareResponseText } from "../shared/errors.ts";

interface CloudflareRequest {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
}

export const handlers: Record<string, ProviderRuntimeHandler<CloudflareContext>> = {
  list_routing_rules: listRoutingRules,
  create_routing_rule(input, context) {
    return mutateRoutingRule("POST", input, context);
  },
  update_routing_rule(input, context) {
    return mutateRoutingRule("PUT", input, context);
  },
  delete_routing_rule: deleteRoutingRule,
  list_destination_addresses: withAccount(listDestinationAddresses),
};

async function listRoutingRules(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
  if (input.zoneId !== undefined) requiredInputString(input.zoneId, "zoneId");
  else if (!optionalString(input.accountId) && context.zoneId) input = { ...input, zoneId: context.zoneId };
  else input = await resolveActionAccount(input, context);
  const explicitAccount = optionalString(input.accountId);
  const explicitZone = optionalString(input.zoneId);
  if (explicitAccount && explicitZone) {
    throw new ProviderRequestError(400, "accountId and zoneId are mutually exclusive");
  }
  const zone = explicitAccount ? undefined : (explicitZone ?? undefined);
  const account = explicitAccount ?? context.accountId;
  const scope = explicitAccount
    ? `accounts/${encodeURIComponent(explicitAccount)}`
    : zone
      ? `zones/${encodeURIComponent(zone)}`
      : `accounts/${encodeURIComponent(requiredInputString(account, "accountId"))}`;
  const envelope = await requestCloudflare(
    context,
    {
      path: `/${scope}/email/routing/rules`,
      query: {
        enabled: optionalBoolean(input.enabled),
        page: optionalInteger(input.page),
        per_page: optionalInteger(input.perPage),
      },
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
  context: CloudflareContext,
): Promise<unknown> {
  const zone = encodeURIComponent(requiredInputString(input.zoneId ?? context.zoneId, "zoneId"));
  const suffix = method === "PUT" ? `/${encodeURIComponent(requiredInputString(input.ruleId, "ruleId"))}` : "";
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

async function deleteRoutingRule(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
  const zoneId = requiredInputString(input.zoneId ?? context.zoneId, "zoneId");
  const id = requiredInputString(input.ruleId, "ruleId");
  await requestCloudflare(
    context,
    { method: "DELETE", path: `/zones/${encodeURIComponent(zoneId)}/email/routing/rules/${encodeURIComponent(id)}` },
    "execute",
  );
  return { id, deleted: true };
}

async function listDestinationAddresses(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
  const accountId = optionalString(input.accountId) ?? requiredInputString(context.accountId, "accountId");
  const envelope = await requestCloudflare(
    context,
    {
      path: `/accounts/${encodeURIComponent(accountId)}/email/routing/addresses`,
      query: {
        direction: optionalString(input.direction),
        verified: optionalBoolean(input.verified),
        page: optionalInteger(input.page),
        per_page: optionalInteger(input.perPage),
      },
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
    priority: optionalNumber(input.priority),
    source: optionalString(input.source),
    owner_worker_tag: optionalString(input.ownerWorkerTag),
  });
}

function requireInputArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0) throw new ProviderRequestError(400, `${field} is required`);
  return value;
}

async function requestCloudflare(
  context: CloudflareContext,
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
    throw cloudflareResponseError(response, envelope, phase);
  }
  return envelope;
}

function buildHeaders(context: CloudflareContext, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    ...(context.authHeaders ?? { authorization: `Bearer ${context.accessToken}` }),
    "user-agent": providerUserAgent,
  };
  if (hasBody) headers["content-type"] = "application/json";
  return headers;
}

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(`${cloudflareApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(queryParams(query ?? {}))) url.searchParams.set(key, value);
  return url.toString();
}

async function readEnvelope(response: Response): Promise<CloudflareEnvelope> {
  return parseCloudflareResponseText(await response.text());
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
    priority: optionalNumber(object.priority),
    source: optionalString(object.source),
    ownerWorkerTag: optionalString(object.owner_worker_tag),
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

import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  optionalBoolean,
  optionalInteger,
  optionalIntegerLike,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
  requiredStringArray,
} from "../../core/cast.ts";
import { compactJson, encodePathSegment, jsonObject } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortSignalError,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
} from "../provider-runtime.ts";

const vultrApiBaseUrl = "https://api.vultr.com/v2";
const requestTimeoutMs = 30_000;

type VultrRequestPhase = "validate" | "execute";

export const vultrActionHandlers: Record<string, ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async get_account(_input, context) {
    return { account: await getAccount(context, "execute") };
  },
  list_instances(input, context) {
    return listVultrCollection(input, context, "/instances", "instances", "instances", {
      label: optionalString(input.label),
      main_ip: optionalString(input.mainIp),
      region: optionalString(input.region),
      firewall_group_id: optionalString(input.firewallGroupId),
      hostname: optionalString(input.hostname),
      show_pending_charges: optionalBoolean(input.showPendingCharges),
    });
  },
  get_instance(input, context) {
    return getInstance(input, context);
  },
  create_instance(input, context) {
    return createInstance(input, context);
  },
  update_instance(input, context) {
    return updateInstance(input, context);
  },
  delete_instance(input, context) {
    return deleteInstance(input, context);
  },
  manage_instance_power(input, context) {
    return manageInstancePower(input, context);
  },
  list_regions(input, context) {
    return listVultrCollection(input, context, "/regions", "regions", "regions");
  },
  list_plans(input, context) {
    return listVultrCollection(input, context, "/plans", "plans", "plans", {
      type: optionalString(input.type),
      os: optionalString(input.operatingSystem),
    });
  },
  list_operating_systems(input, context) {
    return listVultrCollection(input, context, "/os", "os", "operatingSystems");
  },
  list_snapshots(input, context) {
    return listVultrCollection(input, context, "/snapshots", "snapshots", "snapshots", {
      description: optionalString(input.description),
    });
  },
  list_firewall_groups(input, context) {
    return listVultrCollection(input, context, "/firewalls", "firewall_groups", "firewallGroups");
  },
  list_domains(input, context) {
    return listVultrCollection(input, context, "/domains", "domains", "domains");
  },
  list_domain_records(input, context) {
    const domain = requiredString(input.domain, "domain", providerInputError);
    return listVultrCollection(input, context, `/domains/${encodePathSegment(domain)}/records`, "records", "records");
  },
};

export async function validateVultrCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const account = await getAccount({ apiKey, fetcher, signal }, "validate");
  const email = requiredString(account.email, "account.email", providerResponseError);
  const name = optionalString(account.name);
  const acls =
    account.acls === undefined ? [] : requiredStringArray(account.acls, "account.acls", providerResponseError);

  return {
    profile: {
      accountId: email,
      displayName: name ?? email,
    },
    grantedScopes: acls,
    metadata: jsonObject({
      validationEndpoint: "/account",
      email,
      name,
    }),
  };
}

async function getAccount(context: ApiKeyProviderContext, phase: VultrRequestPhase): Promise<Record<string, unknown>> {
  const payload = await requestVultrJson({
    apiKey: context.apiKey,
    path: "/account",
    fetcher: context.fetcher,
    signal: context.signal,
    phase,
  });
  return requireWrappedObject(payload, "account");
}

async function getInstance(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const instanceId = requiredString(input.instanceId, "instanceId", providerInputError);
  const payload = await requestVultrJson({
    apiKey: context.apiKey,
    path: `/instances/${encodePathSegment(instanceId)}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return { instance: requireWrappedObject(payload, "instance") };
}

async function createInstance(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestVultrJson({
    apiKey: context.apiKey,
    path: "/instances",
    method: "POST",
    body: {
      region: requiredString(input.region, "region", providerInputError),
      plan: requiredString(input.plan, "plan", providerInputError),
      os_id: optionalInteger(input.osId),
      iso_id: optionalString(input.isoId),
      snapshot_id: optionalString(input.snapshotId),
      app_id: optionalInteger(input.appId),
      image_id: optionalString(input.imageId),
      label: optionalString(input.label),
      hostname: optionalString(input.hostname),
      enable_ipv6: optionalBoolean(input.enableIpv6),
      disable_public_ipv4: optionalBoolean(input.disablePublicIpv4),
      backups: optionalString(input.backups),
      ddos_protection: optionalBoolean(input.ddosProtection),
      activation_email: optionalBoolean(input.activationEmail),
      firewall_group_id: optionalString(input.firewallGroupId),
      sshkey_id: readOptionalStringArray(input.sshKeyIds),
      attach_vpc: readOptionalStringArray(input.vpcIds),
      tags: readOptionalStringArray(input.tags),
      user_data: optionalString(input.userData),
      user_scheme: optionalString(input.userScheme),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return { instance: requireWrappedObject(payload, "instance") };
}

async function updateInstance(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const instanceId = requiredString(input.instanceId, "instanceId", providerInputError);
  const payload = await requestVultrJson({
    apiKey: context.apiKey,
    path: `/instances/${encodePathSegment(instanceId)}`,
    method: "PATCH",
    body: {
      label: optionalString(input.label),
      plan: optionalString(input.plan),
      backups: optionalString(input.backups),
      firewall_group_id: optionalString(input.firewallGroupId),
      enable_ipv6: optionalBoolean(input.enableIpv6),
      ddos_protection: optionalBoolean(input.ddosProtection),
      tags: readOptionalStringArray(input.tags),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return { instance: requireWrappedObject(payload, "instance") };
}

async function deleteInstance(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const instanceId = requiredString(input.instanceId, "instanceId", providerInputError);
  await requestVultrJson({
    apiKey: context.apiKey,
    path: `/instances/${encodePathSegment(instanceId)}`,
    method: "DELETE",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return { deleted: true, instanceId };
}

async function manageInstancePower(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const instanceId = requiredString(input.instanceId, "instanceId", providerInputError);
  const operation = requiredString(input.operation, "operation", providerInputError);
  if (operation !== "start" && operation !== "reboot" && operation !== "halt") {
    throw providerInputError("operation must be start, reboot, or halt");
  }
  await requestVultrJson({
    apiKey: context.apiKey,
    path: `/instances/${encodePathSegment(instanceId)}/${operation}`,
    method: "POST",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return { accepted: true, instanceId, operation };
}

async function listVultrCollection(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  path: string,
  upstreamKey: string,
  outputKey: string,
  filters: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const payload = await requestVultrJson({
    apiKey: context.apiKey,
    path,
    query: {
      per_page: readOptionalPerPage(input.perPage),
      cursor: optionalString(input.cursor),
      ...filters,
    },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return normalizeCollection(payload, upstreamKey, outputKey);
}

interface VultrRequestInput {
  apiKey: string;
  path: string;
  fetcher: ProviderFetch;
  phase: VultrRequestPhase;
  signal?: AbortSignal;
  query?: Record<string, unknown>;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
}

async function requestVultrJson(input: VultrRequestInput): Promise<unknown> {
  const response = await vultrFetch(input);
  const payload = await readProviderJsonBody(response, {
    emptyBody: null,
    invalidJsonMessage: "Vultr returned invalid JSON",
  });
  if (!response.ok) {
    throw createVultrError(response.status, payload, input.phase);
  }
  return payload;
}

async function vultrFetch(input: VultrRequestInput): Promise<Response> {
  const url = new URL(`${vultrApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const timeout = createProviderTimeout(input.signal, requestTimeoutMs);
  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${input.apiKey}`,
      "user-agent": providerUserAgent,
    };
    if (input.body !== undefined) {
      headers["content-type"] = "application/json";
    }
    return await input.fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(compactJson(input.body)),
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Vultr request timed out", error);
    }
    if (isAbortSignalError(input.signal, error)) {
      throw new ProviderRequestError(499, "Vultr request was cancelled", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Vultr request failed: ${error.message}` : "Vultr request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function createVultrError(status: number, payload: unknown, phase: VultrRequestPhase): ProviderRequestError {
  const message = extractVultrErrorMessage(payload) ?? `Vultr request failed with status ${status}`;
  if ((status === 401 || status === 403) && phase === "validate") {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function extractVultrErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return optionalString(payload);
  }
  const record = optionalRecord(payload);
  return optionalString(record?.error) ?? optionalString(record?.message);
}

function normalizeCollection(payload: unknown, upstreamKey: string, outputKey: string): Record<string, unknown> {
  const record = requiredRecord(payload, "Vultr response", providerResponseError);
  const items = requireResponseArray(record[upstreamKey], upstreamKey);
  return jsonObject({
    [outputKey]: items,
    meta: optionalRecord(record.meta),
  });
}

function requireWrappedObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = requiredRecord(value, "Vultr response", providerResponseError);
  return requiredRecord(record[fieldName], fieldName, providerResponseError);
}

function requireResponseArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw providerResponseError(`Vultr response missing ${fieldName}`);
  }
  return value.map((item) => requiredRecord(item, fieldName, providerResponseError));
}

function readOptionalPerPage(value: unknown): number | undefined {
  const perPage = optionalIntegerLike(value, "perPage", providerInputError);
  if (perPage === undefined) {
    return undefined;
  }
  if (perPage < 1 || perPage > 500) {
    throw providerInputError("perPage must be between 1 and 500");
  }
  return perPage;
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  return value === undefined ? undefined : requiredStringArray(value, "array value", providerInputError);
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function providerResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}

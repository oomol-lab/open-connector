import { Buffer } from "node:buffer";
import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const freshstatusApiBaseUrl = "https://public-api.freshstatus.io/api/v1/";
const requestTimeoutMs = 30_000;

interface FreshstatusCredential {
  apiKey: string;
  subdomain: string;
}

export interface FreshstatusContext extends FreshstatusCredential {
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface FreshstatusRequestInput {
  context: FreshstatusContext;
  path: string;
  phase: "validate" | "execute";
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
}

type FreshstatusHandler = (input: Record<string, unknown>, context: FreshstatusContext) => Promise<unknown>;

export const freshstatusActionHandlers: Record<string, FreshstatusHandler> = {
  async list_services(_input, context) {
    return normalizeList(await requestFreshstatus({ context, path: "services/", phase: "execute" }), "services");
  },
  async get_service(input, context) {
    const serviceId = requirePositiveInteger(input.serviceId, "serviceId");
    return {
      service: requireObject(
        await requestFreshstatus({ context, path: `services/${serviceId}/`, phase: "execute" }),
        "service",
      ),
    };
  },
  async create_service(input, context) {
    return {
      service: requireObject(
        await requestFreshstatus({
          context,
          path: "services/",
          method: "POST",
          body: buildServiceBody(input),
          phase: "execute",
        }),
        "service",
      ),
    };
  },
  async update_service(input, context) {
    const serviceId = requirePositiveInteger(input.serviceId, "serviceId");
    const body = buildServiceBody(input);
    requireMutableBody(body, "service");
    return {
      service: requireObject(
        await requestFreshstatus({
          context,
          path: `services/${serviceId}/`,
          method: "PATCH",
          body,
          phase: "execute",
        }),
        "service",
      ),
    };
  },
  async delete_service(input, context) {
    const serviceId = requirePositiveInteger(input.serviceId, "serviceId");
    await requestFreshstatus({
      context,
      path: `services/${serviceId}/`,
      method: "DELETE",
      phase: "execute",
    });
    return { deleted: true, serviceId };
  },
  async list_groups(_input, context) {
    return normalizeList(await requestFreshstatus({ context, path: "groups/", phase: "execute" }), "groups");
  },
  async get_group(input, context) {
    const groupId = requirePositiveInteger(input.groupId, "groupId");
    return {
      group: requireObject(
        await requestFreshstatus({ context, path: `groups/${groupId}/`, phase: "execute" }),
        "group",
      ),
    };
  },
  async create_group(input, context) {
    return {
      group: requireObject(
        await requestFreshstatus({
          context,
          path: "groups/",
          method: "POST",
          body: buildGroupBody(input),
          phase: "execute",
        }),
        "group",
      ),
    };
  },
  async update_group(input, context) {
    const groupId = requirePositiveInteger(input.groupId, "groupId");
    const body = buildGroupBody(input);
    requireMutableBody(body, "group");
    return {
      group: requireObject(
        await requestFreshstatus({
          context,
          path: `groups/${groupId}/`,
          method: "PATCH",
          body,
          phase: "execute",
        }),
        "group",
      ),
    };
  },
  async delete_group(input, context) {
    const groupId = requirePositiveInteger(input.groupId, "groupId");
    await requestFreshstatus({ context, path: `groups/${groupId}/`, method: "DELETE", phase: "execute" });
    return { deleted: true, groupId };
  },
};

export function resolveFreshstatusCredential(apiKey: string, subdomainInput: unknown): FreshstatusCredential {
  const rawSubdomain = requiredString(subdomainInput, "subdomain", invalidInput).toLowerCase();
  let subdomain = rawSubdomain;
  if (subdomain.startsWith("https://") || subdomain.startsWith("http://")) {
    try {
      const url = new URL(subdomain);
      subdomain = url.hostname.endsWith(".freshstatus.io") ? url.hostname.slice(0, -".freshstatus.io".length) : "";
    } catch {
      subdomain = "";
    }
  } else if (subdomain.endsWith(".freshstatus.io")) {
    subdomain = subdomain.slice(0, -".freshstatus.io".length);
  }
  subdomain = subdomain.replaceAll("/", "");
  if (!subdomain || subdomain.includes(".")) {
    throw new ProviderRequestError(400, "freshstatus subdomain is invalid");
  }
  return { apiKey, subdomain };
}

export async function validateFreshstatusCredential(
  credential: FreshstatusCredential,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<void> {
  await requestFreshstatus({
    context: { ...credential, fetcher, signal },
    path: "",
    phase: "validate",
  });
}

export function freshstatusAuthorization(credential: FreshstatusCredential): string {
  return `Basic ${Buffer.from(`${credential.apiKey}:${credential.subdomain}`).toString("base64")}`;
}

function buildServiceBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: optionalString(input.name),
    description: typeof input.description === "string" ? input.description : undefined,
    order: optionalInteger(input.order),
    group: input.groupId === null ? null : optionalInteger(input.groupId),
    display_options: mapDisplayOptions(input.displayOptions, {
      serviceStartDate: "service_start_date",
      uptimeHistoryEnabled: "uptime_history_enabled",
    }),
  });
}

function buildGroupBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: optionalString(input.name),
    description: typeof input.description === "string" ? input.description : undefined,
    order: optionalInteger(input.order),
    parent: input.parentId === null ? null : optionalInteger(input.parentId),
    display_options: mapDisplayOptions(input.displayOptions, {
      expandOnLoad: "expand_on_load",
      uptimeHistoryEnabled: "uptime_history_enabled",
    }),
  });
}

function mapDisplayOptions(value: unknown, mapping: Record<string, string>): Record<string, unknown> | undefined {
  const input = optionalRecord(value);
  if (!input) return undefined;
  const output: Record<string, unknown> = {};
  for (const [inputKey, outputKey] of Object.entries(mapping)) {
    output[outputKey] = optionalString(input[inputKey]);
  }
  return compactObject(output);
}

async function requestFreshstatus(input: FreshstatusRequestInput): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, requestTimeoutMs);
  try {
    const response = await input.context.fetcher(new URL(input.path, freshstatusApiBaseUrl), {
      method: input.method ?? "GET",
      headers: {
        authorization: freshstatusAuthorization(input.context),
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) throw createFreshstatusError(response.status, payload, input.phase);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Freshstatus request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Freshstatus request failed: ${error.message}` : "Freshstatus request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readPayload(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createFreshstatusError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.detail) ??
    optionalString(record?.message) ??
    (typeof payload === "string" ? payload : undefined) ??
    `Freshstatus request failed with HTTP ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (status === 400 || status === 404) return new ProviderRequestError(status, message, payload);
  return new ProviderRequestError(status >= 500 ? status : 502, message, payload);
}

function normalizeList(payload: unknown, field: "services" | "groups"): Record<string, unknown> {
  const record = requireObject(payload, `${field} list`);
  if (!Array.isArray(record.results)) {
    throw new ProviderRequestError(502, `Freshstatus ${field} list results must be an array`);
  }
  return {
    count: optionalInteger(record.count) ?? record.results.length,
    next: optionalString(record.next) ?? null,
    previous: optionalString(record.previous) ?? null,
    [field]: record.results,
  };
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, `Freshstatus ${label} response must be an object`);
  return record;
}

function requirePositiveInteger(value: unknown, field: string): number {
  const number = optionalInteger(value);
  if (number === undefined || number < 1) {
    throw new ProviderRequestError(400, `${field} must be a positive integer`);
  }
  return number;
}

function requireMutableBody(body: Record<string, unknown>, objectName: string): void {
  if (Object.keys(body).length === 0) {
    throw new ProviderRequestError(400, `at least one mutable ${objectName} field must be provided`);
  }
}

function invalidInput(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

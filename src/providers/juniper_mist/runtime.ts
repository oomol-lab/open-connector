import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString, optionalStringOrNull } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export const juniperMistDefaultApiBaseUrl = "https://api.mist.com/api/v1";

const juniperMistApiBasePath = "/api/v1";
const juniperMistAllowedApiOrigins = [
  "https://api.mist.com",
  "https://api.gc1.mist.com",
  "https://api.ac2.mist.com",
  "https://api.gc2.mist.com",
  "https://api.gc4.mist.com",
  "https://api.eu.mist.com",
  "https://api.gc3.mist.com",
  "https://api.ac6.mist.com",
  "https://api.gc6.mist.com",
  "https://api.ac5.mist.com",
  "https://api.gc5.mist.com",
  "https://api.gc7.mist.com",
];
const juniperMistDefaultRequestTimeoutMs = 30_000;

type JuniperMistPhase = "validate" | "execute";
type JuniperMistQueryValue = string | number | undefined;
type JuniperMistActionHandler = (input: Record<string, unknown>, context: JuniperMistActionContext) => Promise<unknown>;

export interface JuniperMistActionContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const juniperMistActionHandlers: ProviderActionHandlers<"juniper_mist", JuniperMistActionHandler> = {
  get_self(_input, context) {
    return getSelf(context);
  },
  list_org_sites(input, context) {
    return listOrgSites(input, context);
  },
  list_site_devices(input, context) {
    return listSiteDevices(input, context);
  },
};

export function resolveJuniperMistApiBaseUrl(value: unknown): string {
  const rawApiBaseUrl = optionalString(value);
  if (!rawApiBaseUrl) {
    return juniperMistDefaultApiBaseUrl;
  }

  const apiBaseUrl = parseJuniperMistApiBaseUrl(rawApiBaseUrl);
  const pathname = stripTrailingSlashes(apiBaseUrl.pathname);
  if (
    juniperMistAllowedApiOrigins.includes(apiBaseUrl.origin) &&
    (pathname === "" || pathname === juniperMistApiBasePath) &&
    !apiBaseUrl.search &&
    !apiBaseUrl.hash &&
    !apiBaseUrl.username &&
    !apiBaseUrl.password
  ) {
    return `${apiBaseUrl.origin}${juniperMistApiBasePath}`;
  }

  throw new ProviderRequestError(400, `Unsupported Juniper Mist API base URL: ${rawApiBaseUrl}`);
}

export async function validateJuniperMistCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiBaseUrl = resolveJuniperMistApiBaseUrl(input.values.apiBaseUrl);
  const self = normalizeSelf(
    await requestJuniperMistJson({
      path: "/self",
      query: {},
      apiKey: input.apiKey,
      apiBaseUrl,
      fetcher,
      signal,
      phase: "validate",
    }),
  );

  return {
    profile: {
      accountId: self.id ?? self.email ?? "juniper_mist",
      displayName: self.name ?? self.email ?? "Juniper Mist API Token",
    },
    grantedScopes: [],
    metadata: {
      validationEndpoint: "/self",
      apiBaseUrl,
      adminId: self.id ?? undefined,
      email: self.email ?? undefined,
      organizationCount: self.organizations.length,
      siteCount: self.sites.length,
    },
  };
}

async function getSelf(context: JuniperMistActionContext): Promise<unknown> {
  const payload = await requestJuniperMistJson({
    path: "/self",
    query: {},
    apiKey: context.apiKey,
    apiBaseUrl: context.apiBaseUrl,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    self: normalizeSelf(payload),
  };
}

async function listOrgSites(input: Record<string, unknown>, context: JuniperMistActionContext): Promise<unknown> {
  const payload = await requestJuniperMistJson({
    path: `/orgs/${encodeURIComponent(readRequiredString(input.orgId, "orgId"))}/sites`,
    query: {
      limit: optionalInteger(input.limit),
      page: optionalInteger(input.page),
    },
    apiKey: context.apiKey,
    apiBaseUrl: context.apiBaseUrl,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    sites: normalizeArray(payload, "sites").map((site) => normalizeOrgSite(site)),
  };
}

async function listSiteDevices(input: Record<string, unknown>, context: JuniperMistActionContext): Promise<unknown> {
  const payload = await requestJuniperMistJson({
    path: `/sites/${encodeURIComponent(readRequiredString(input.siteId, "siteId"))}/devices`,
    query: {
      type: optionalString(input.type),
      name: optionalString(input.name),
      limit: optionalInteger(input.limit),
      page: optionalInteger(input.page),
    },
    apiKey: context.apiKey,
    apiBaseUrl: context.apiBaseUrl,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    devices: normalizeArray(payload, "devices").map((device) => normalizeSiteDevice(device)),
  };
}

async function requestJuniperMistJson(input: {
  path: string;
  query: Record<string, JuniperMistQueryValue>;
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: JuniperMistPhase;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal, juniperMistDefaultRequestTimeoutMs);

  try {
    const response = await input.fetcher(buildJuniperMistUrl(input), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Token ${input.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readJuniperMistPayload(response);

    if (!response.ok) {
      throw createJuniperMistError(response.status, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Juniper Mist request timed out");
    }

    throw new ProviderRequestError(502, error instanceof Error ? error.message : "Juniper Mist request failed");
  } finally {
    timeout.cleanup();
  }
}

function buildJuniperMistUrl(input: {
  apiBaseUrl: string;
  path: string;
  query: Record<string, JuniperMistQueryValue>;
}): string {
  const url = new URL(`${input.apiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function readJuniperMistPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Juniper Mist returned invalid JSON");
  }
}

function createJuniperMistError(status: number, payload: unknown, phase: JuniperMistPhase): ProviderRequestError {
  const message = readJuniperMistErrorMessage(payload) ?? `Juniper Mist request failed (${status})`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status || 502, message);
}

function readJuniperMistErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.length > 0) {
    return payload;
  }
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  const detail = optionalString(object.detail);
  if (detail) {
    return detail;
  }
  const message = optionalString(object.message) ?? optionalString(object.error);
  return message || undefined;
}

function normalizeSelf(payload: unknown) {
  const object = readRequiredObject(payload, "self");
  const privileges = readPrivilegeArray(object);
  const firstName = optionalStringOrNull(object.first_name);
  const lastName = optionalStringOrNull(object.last_name);
  const explicitName = optionalStringOrNull(object.name);

  return {
    id: optionalStringOrNull(object.admin_id) ?? optionalStringOrNull(object.id),
    email: optionalStringOrNull(object.email),
    firstName,
    lastName,
    name: explicitName ?? joinName(firstName, lastName),
    privileges,
    organizations: normalizePrivilegeTargets(privileges, "org"),
    sites: normalizePrivilegeTargets(privileges, "site"),
    raw: object,
  };
}

function readPrivilegeArray(object: Record<string, unknown>): Record<string, unknown>[] {
  const privileges = object.privileges;
  if (Array.isArray(privileges)) {
    return privileges
      .map((item) => optionalRecord(item))
      .filter((item): item is Record<string, unknown> => item !== undefined);
  }
  return [];
}

function normalizePrivilegeTargets(privileges: Record<string, unknown>[], target: "org" | "site") {
  return privileges.flatMap((privilege) => {
    const scopeObject = optionalRecord(privilege[target]);
    if (target === "org" && !scopeObject && (privilege.site || privilege.site_id)) {
      return [];
    }
    const targetId = readTargetId(privilege, target);
    if (!targetId) {
      return [];
    }

    return [
      {
        id: targetId,
        name: readTargetName(privilege, scopeObject, target),
        ...(target === "site"
          ? {
              orgId: optionalStringOrNull(privilege.org_id) ?? optionalStringOrNull(scopeObject?.org_id),
            }
          : {}),
        privilege: optionalStringOrNull(privilege.privilege),
        role: optionalStringOrNull(privilege.role),
        raw: privilege,
      },
    ];
  });
}

function readTargetId(privilege: Record<string, unknown>, target: "org" | "site"): string | null {
  const scopeObject = optionalRecord(privilege[target]);
  if (target === "org") {
    return (
      optionalStringOrNull(privilege.org_id) ??
      optionalStringOrNull(scopeObject?.id) ??
      optionalStringOrNull(scopeObject?.org_id)
    );
  }
  return (
    optionalStringOrNull(privilege.site_id) ??
    optionalStringOrNull(scopeObject?.id) ??
    optionalStringOrNull(scopeObject?.site_id)
  );
}

function readTargetName(
  privilege: Record<string, unknown>,
  scopeObject: Record<string, unknown> | undefined,
  target: "org" | "site",
): string | null {
  if (target === "org") {
    return (
      optionalStringOrNull(privilege.org_name) ??
      optionalStringOrNull(scopeObject?.name) ??
      optionalStringOrNull(scopeObject?.org_name)
    );
  }
  return (
    optionalStringOrNull(privilege.site_name) ??
    optionalStringOrNull(scopeObject?.name) ??
    optionalStringOrNull(scopeObject?.site_name)
  );
}

function normalizeOrgSite(site: Record<string, unknown>) {
  return {
    id: readRequiredString(site.id, "site.id"),
    name: optionalStringOrNull(site.name),
    orgId: optionalStringOrNull(site.org_id),
    timezone: optionalStringOrNull(site.timezone),
    countryCode: optionalStringOrNull(site.country_code),
    address: optionalStringOrNull(site.address),
    latlng: optionalRecord(site.latlng) ?? null,
    raw: site,
  };
}

function normalizeSiteDevice(device: Record<string, unknown>) {
  return {
    id: optionalStringOrNull(device.id),
    name: optionalStringOrNull(device.name),
    mac: optionalStringOrNull(device.mac),
    serial: optionalStringOrNull(device.serial),
    model: optionalStringOrNull(device.model),
    type: optionalStringOrNull(device.type),
    siteId: optionalStringOrNull(device.site_id),
    orgId: optionalStringOrNull(device.org_id),
    status: optionalStringOrNull(device.status),
    raw: device,
  };
}

function normalizeArray(payload: unknown, fieldName: string): Record<string, unknown>[] {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `Juniper Mist ${fieldName} response must be an array`);
  }
  return payload.map((item) => readRequiredObject(item, fieldName));
}

function readRequiredObject(value: unknown, fieldName: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `Juniper Mist ${fieldName} response must be an object`);
  }
  return object;
}

function readRequiredString(value: unknown, fieldName: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(400, `Juniper Mist ${fieldName} is required`);
  }
  return stringValue;
}

function parseJuniperMistApiBaseUrl(value: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new ProviderRequestError(400, `Unsupported Juniper Mist API base URL: ${value}`);
  }
}

function stripTrailingSlashes(value: string): string {
  let result = value;
  while (result.endsWith("/")) {
    result = result.slice(0, -1);
  }
  return result;
}

function joinName(firstName: string | null, lastName: string | null): string | null {
  const name = [firstName, lastName].filter((part): part is string => Boolean(part)).join(" ");
  return name || null;
}

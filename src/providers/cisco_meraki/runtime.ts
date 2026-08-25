import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
} from "../provider-runtime.ts";

export const ciscoMerakiApiBaseUrl = "https://api.meraki.com/api/v1";

const ciscoMerakiRequestTimeoutMs = 30_000;

type CiscoMerakiRequestPhase = "validate" | "execute";

interface CiscoMerakiRequest {
  path: string;
  search?: URLSearchParams;
}

interface CiscoMerakiListResult {
  items: Record<string, unknown>[];
  link: string | null;
}

export const ciscoMerakiActionHandlers: ProviderActionHandlers<
  "cisco_meraki",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  async list_organizations(input, context) {
    const result = await requestCiscoMerakiList(
      {
        path: "/organizations",
        search: buildSearch(input, []),
      },
      context,
      "execute",
    );
    return {
      organizations: result.items,
      link: result.link,
      raw: result.items,
    };
  },
  async list_organization_networks(input, context) {
    const organizationId = requiredString(input.organizationId, "organizationId", inputError);
    const result = await requestCiscoMerakiList(
      {
        path: `/organizations/${encodeURIComponent(organizationId)}/networks`,
        search: buildSearch(input, ["organizationId"]),
      },
      context,
      "execute",
    );
    return {
      networks: result.items,
      link: result.link,
      raw: result.items,
    };
  },
  async list_organization_inventory_devices(input, context) {
    const organizationId = requiredString(input.organizationId, "organizationId", inputError);
    const result = await requestCiscoMerakiList(
      {
        path: `/organizations/${encodeURIComponent(organizationId)}/inventory/devices`,
        search: buildSearch(input, ["organizationId"]),
      },
      context,
      "execute",
    );
    return {
      devices: result.items,
      link: result.link,
      raw: result.items,
    };
  },
  async get_device(input, context) {
    const serial = requiredString(input.serial, "serial", inputError);
    const payload = await requestCiscoMeraki(
      {
        path: `/devices/${encodeURIComponent(serial)}`,
      },
      context,
      "execute",
    );
    const device = requiredRecord(payload, "device", responseError);
    return {
      device,
      raw: device,
    };
  },
};

export async function validateCiscoMerakiCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const result = await requestCiscoMerakiList(
    {
      path: "/organizations",
      search: new URLSearchParams({ perPage: "3" }),
    },
    {
      apiKey,
      fetcher,
      signal,
    },
    "validate",
  );
  const firstOrganization = result.items[0];
  const firstOrganizationName = optionalString(firstOrganization?.name);
  const firstOrganizationId = optionalString(firstOrganization?.id);
  return {
    profile: {
      accountId: firstOrganizationId,
      displayName: firstOrganizationName ? `Cisco Meraki: ${firstOrganizationName}` : "Cisco Meraki API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: ciscoMerakiApiBaseUrl,
      validationEndpoint: "/organizations?perPage=3",
      organizationCountInFirstPage: result.items.length,
    },
  };
}

async function requestCiscoMerakiList(
  request: CiscoMerakiRequest,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: CiscoMerakiRequestPhase,
): Promise<CiscoMerakiListResult> {
  const response = await requestCiscoMerakiResponse(request, context);
  const payload = await readCiscoMerakiPayload(response);
  if (!response.ok) {
    throw createCiscoMerakiError(response, payload, phase);
  }
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Cisco Meraki returned a non-array response");
  }
  return {
    items: payload.map((item) => requiredRecord(item, "list item", responseError)),
    link: response.headers.get("link"),
  };
}

async function requestCiscoMeraki(
  request: CiscoMerakiRequest,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: CiscoMerakiRequestPhase,
): Promise<unknown> {
  const response = await requestCiscoMerakiResponse(request, context);
  const payload = await readCiscoMerakiPayload(response);
  if (!response.ok) {
    throw createCiscoMerakiError(response, payload, phase);
  }
  return payload;
}

async function requestCiscoMerakiResponse(
  request: CiscoMerakiRequest,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<Response> {
  const url = new URL(request.path.startsWith("/") ? request.path.slice(1) : request.path, `${ciscoMerakiApiBaseUrl}/`);
  for (const [key, value] of request.search ?? []) {
    url.searchParams.append(key, value);
  }

  const timeout = createProviderTimeout(context.signal, ciscoMerakiRequestTimeoutMs);
  try {
    return await context.fetcher(url, {
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "X-Cisco-Meraki-API-Key": context.apiKey,
      },
      signal: timeout.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      timeout.didTimeout() ? 504 : 502,
      timeout.didTimeout()
        ? "Cisco Meraki request timed out"
        : error instanceof Error
          ? `Cisco Meraki request failed: ${error.message}`
          : "Cisco Meraki request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readCiscoMerakiPayload(response: Response): Promise<unknown> {
  return readProviderJsonBody(response, {
    emptyBody: {},
    invalidJsonMessage: `Cisco Meraki returned non-JSON response (${response.status})`,
    invalidJsonFallback: response.ok ? undefined : (text) => text,
  });
}

function createCiscoMerakiError(
  response: Response,
  payload: unknown,
  phase: CiscoMerakiRequestPhase,
): ProviderRequestError {
  const message =
    readCiscoMerakiErrorMessage(payload) ||
    response.statusText.trim() ||
    `Cisco Meraki API request failed with status ${response.status}`;
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 401 : response.status, message);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(response.status, message);
  }
  return new ProviderRequestError(response.status || 502, message);
}

function readCiscoMerakiErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const object = optionalRecord(payload);
  const errors = Array.isArray(object?.errors) ? object.errors : undefined;
  return (
    optionalString(errors?.[0]) ??
    optionalString(object?.message) ??
    optionalString(object?.error) ??
    optionalString(object?.detail)
  );
}

function buildSearch(input: Record<string, unknown>, omittedKeys: readonly string[]): URLSearchParams {
  const omitted = new Set(omittedKeys);
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (omitted.has(key) || value === undefined || value === null || value === "") {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        search.append(key, String(item));
      }
    } else {
      search.set(key, String(value));
    }
  }
  return search;
}

function inputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function responseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, `Cisco Meraki returned an invalid response: ${message}`);
}

import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
} from "../provider-runtime.ts";

const service = "serveravatar";
const serverAvatarApiBaseUrl = "https://api.serveravatar.com";
const serverAvatarRequestTimeoutMs = 30_000;

type ServerAvatarRequestPhase = "validate" | "execute";
type QueryValue = string | number | undefined;

type ServerAvatarActionHandler = (
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
) => Promise<Record<string, unknown>>;

interface ServerAvatarRequestInput {
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: ServerAvatarRequestPhase;
  query?: Record<string, QueryValue>;
}

export const serverAvatarActionHandlers: ProviderActionHandlers<"serveravatar", ServerAvatarActionHandler> = {
  list_organizations(_input, context) {
    return requestServerAvatarJson({
      path: "/organizations",
      context,
      phase: "execute",
    });
  },
  get_organization(input, context) {
    const organizationId = readPositiveInteger(input.organizationId, "organizationId");
    return requestServerAvatarJson({
      path: `/organizations/${organizationId}`,
      context,
      phase: "execute",
    });
  },
  list_servers(input, context) {
    const organizationId = readPositiveInteger(input.organizationId, "organizationId");
    return requestServerAvatarJson({
      path: `/organizations/${organizationId}/servers`,
      query: {
        pagination: 1,
        page: readOptionalPositiveInteger(input.page, "page"),
      },
      context,
      phase: "execute",
    });
  },
  list_applications(input, context) {
    const organizationId = readPositiveInteger(input.organizationId, "organizationId");
    return requestServerAvatarJson({
      path: `/organizations/${organizationId}/applications`,
      query: {
        page: readOptionalPositiveInteger(input.page, "page"),
      },
      context,
      phase: "execute",
    });
  },
  list_databases(input, context) {
    const organizationId = readPositiveInteger(input.organizationId, "organizationId");
    return requestServerAvatarJson({
      path: `/organizations/${organizationId}/databases`,
      query: {
        pagination: 1,
        page: readOptionalPositiveInteger(input.page, "page"),
        search: optionalString(input.search),
      },
      context,
      phase: "execute",
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, serverAvatarActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: serverAvatarApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestServerAvatarJson({
      path: "/organizations",
      context: { apiKey: input.apiKey, fetcher, signal },
      phase: "validate",
    });
    const organizations = payload.organizations;
    if (!Array.isArray(organizations)) {
      throw new ProviderRequestError(502, "ServerAvatar returned an invalid organizations response");
    }
    const firstOrganization = optionalRecord(organizations[0]);
    const organizationId = readPositiveIntegerOrUndefined(firstOrganization?.id);
    const organizationName = optionalString(firstOrganization?.name);
    return {
      profile: {
        accountId: organizationId === undefined ? "api_key" : `organization:${organizationId}`,
        displayName: organizationName ? `ServerAvatar ${organizationName}` : "ServerAvatar API Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: serverAvatarApiBaseUrl,
        validationEndpoint: "/organizations",
        organizationId,
        organizationName,
      }),
    };
  },
};

async function requestServerAvatarJson(input: ServerAvatarRequestInput): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(input.context.signal, serverAvatarRequestTimeoutMs);
  const url = new URL(input.path, serverAvatarApiBaseUrl);
  appendQuery(url, input.query);

  try {
    const response = await input.context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "ServerAvatar returned invalid JSON",
    });
    if (!response.ok) {
      throw mapServerAvatarError(response.status, payload, input.phase);
    }
    const record = optionalRecord(payload);
    if (!record) {
      throw new ProviderRequestError(502, "ServerAvatar returned an invalid JSON object");
    }
    return record;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "ServerAvatar request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `ServerAvatar request failed: ${error.message}` : "ServerAvatar request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function mapServerAvatarError(status: number, payload: unknown, phase: ServerAvatarRequestPhase): ProviderRequestError {
  const message =
    extractServerAvatarErrorMessage(payload) ??
    (phase === "validate" ? "ServerAvatar credential validation failed" : "ServerAvatar request failed");
  if (status === 401 || status === 403) {
    return new ProviderRequestError(401, message);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(502, message);
}

function extractServerAvatarErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error);
}

function appendQuery(url: URL, query: Record<string, QueryValue> | undefined): void {
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
}

function readPositiveInteger(value: unknown, fieldName: string): number {
  const parsed = readPositiveIntegerOrUndefined(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  return value === undefined ? undefined : readPositiveInteger(value, fieldName);
}

function readPositiveIntegerOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

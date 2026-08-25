import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { AppcircleActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export interface AppcircleCredentialCheck {
  providerAccountId?: string;
  accountLabel: string;
  providerScopes: string[];
  providerMetadata: Record<string, unknown>;
}

interface ApiKeyProviderActionInput {
  apiKey: string;
  actionName: string;
  input: Record<string, unknown>;
  providerMetadata?: Record<string, unknown>;
  values?: Record<string, string>;
}

export const appcircleApiBaseUrl = "https://api.appcircle.io";
const appcircleAuthTokenUrl = "https://auth.appcircle.io/auth/v1/api-key/token";

type AppcirclePhase = "validate" | "execute";
type AppcircleCredential = {
  secret: string;
  name: string;
  organizationId?: string;
};
type AppcircleActionHandler = (
  input: Record<string, unknown>,
  credential: AppcircleCredential,
  fetcher: typeof fetch,
) => Promise<unknown>;

export const appcircleActionHandlers: ProviderActionHandlers<"appcircle", AppcircleActionHandler> = {
  async list_organizations(input, credential, fetcher) {
    const payload = await requestAppcircleJson({
      path: "/identity/v1/organizations",
      query: compactObject({
        page: readOptionalPositiveInteger(input.page),
        perPage: readOptionalPositiveInteger(input.perPage),
        search: readOptionalString(input.search),
      }),
      credential,
      fetcher,
      phase: "execute",
    });
    return normalizeOrganizationList(payload);
  },
  async list_build_profiles(input, credential, fetcher) {
    return listProfiles("/build/v2/profiles", input, credential, fetcher);
  },
  async list_distribution_profiles(input, credential, fetcher) {
    return listProfiles("/distribution/v2/profiles", input, credential, fetcher);
  },
  async list_enterprise_store_profiles(input, credential, fetcher) {
    return listProfiles("/store/v2/profiles", input, credential, fetcher);
  },
};

export async function validateAppcircleCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<AppcircleCredentialCheck> {
  const credential = resolveAppcircleCredential(input);
  const accessToken = await exchangeAppcircleAccessToken(credential, fetcher, "validate");
  const payload = await requestAppcircleJsonWithToken({
    path: "/identity/v1/organizations",
    query: { perPage: 200 },
    accessToken,
    fetcher,
    phase: "validate",
  });
  const result = normalizeOrganizationList(payload);
  const selectedOrganization = credential.organizationId
    ? result.organizations.find((organization) => organization.id === credential.organizationId)
    : result.organizations[0];
  const organizationId = credential.organizationId ?? readOptionalString(selectedOrganization?.id);
  const organizationName = readOptionalString(selectedOrganization?.name);

  return {
    ...(organizationId ? { providerAccountId: `appcircle:${organizationId}` } : {}),
    accountLabel: organizationName ?? `Appcircle ${credential.name}`,
    providerScopes: [],
    providerMetadata: compactObject({
      apiKeyName: credential.name,
      organizationId,
      organizationName,
      authEndpoint: appcircleAuthTokenUrl,
      validationEndpoint: "/identity/v1/organizations",
    }),
  };
}

export async function executeAppcircleAction(
  input: ApiKeyProviderActionInput & {
    actionName: AppcircleActionName;
    input: Record<string, unknown>;
  },
  fetcher: typeof fetch,
): Promise<unknown> {
  const handler = appcircleActionHandlers[input.actionName];
  if (!handler) {
    throw new ProviderRequestError(400, `unknown appcircle action: ${input.actionName}`);
  }
  return handler(input.input, resolveAppcircleCredential(input), fetcher);
}

export async function exchangeAppcircleProxyAccessToken(
  apiKey: string,
  values: Record<string, string>,
  metadata: Record<string, unknown>,
  fetcher: typeof fetch,
): Promise<string> {
  return exchangeAppcircleAccessToken(
    resolveAppcircleCredential({ apiKey, values, providerMetadata: metadata }),
    fetcher,
    "execute",
  );
}

async function listProfiles(
  path: string,
  input: Record<string, unknown>,
  credential: AppcircleCredential,
  fetcher: typeof fetch,
) {
  const payload = await requestAppcircleJson({
    path,
    query: compactObject({
      Page: readOptionalPositiveInteger(input.page),
      Size: readOptionalPositiveInteger(input.size),
      search: readOptionalString(input.search),
    }),
    credential,
    fetcher,
    phase: "execute",
  });
  return normalizeProfileList(payload);
}

async function requestAppcircleJson(input: {
  path: string;
  query?: Record<string, string | number | undefined>;
  credential: AppcircleCredential;
  fetcher: typeof fetch;
  phase: AppcirclePhase;
}) {
  const accessToken = await exchangeAppcircleAccessToken(input.credential, input.fetcher, input.phase);
  return requestAppcircleJsonWithToken({
    path: input.path,
    query: input.query,
    accessToken,
    fetcher: input.fetcher,
    phase: input.phase,
  });
}

async function requestAppcircleJsonWithToken(input: {
  path: string;
  query?: Record<string, string | number | undefined>;
  accessToken: string;
  fetcher: typeof fetch;
  phase: AppcirclePhase;
}) {
  const url = new URL(`${appcircleApiBaseUrl}${input.path}`);
  for (const [name, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(name, String(value));
    }
  }
  const response = await input.fetcher(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${input.accessToken}`,
      "user-agent": providerUserAgent,
    },
  });
  const payload = await readAppcirclePayload(response);
  if (!response.ok) {
    throw mapAppcircleError(response.status, payload, input.phase);
  }
  return payload;
}

async function exchangeAppcircleAccessToken(
  credential: AppcircleCredential,
  fetcher: typeof fetch,
  phase: AppcirclePhase,
) {
  const form = new URLSearchParams({
    name: credential.name,
    secret: credential.secret,
  });
  if (credential.organizationId) {
    form.set("organizationId", credential.organizationId);
  }
  const response = await fetcher(appcircleAuthTokenUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": providerUserAgent,
    },
    body: form.toString(),
  });
  const payload = await readAppcirclePayload(response);
  if (!response.ok) {
    throw mapAppcircleError(response.status, payload, phase);
  }
  const accessToken = optionalString(optionalRecord(payload)?.access_token)?.trim();
  if (!accessToken) {
    throw new ProviderRequestError(
      phase === "validate" ? 400 : 502,
      "Appcircle token response is missing access_token",
    );
  }
  return accessToken;
}

function resolveAppcircleCredential(input: {
  apiKey?: string;
  apiKeyName?: unknown;
  organizationId?: unknown;
  values?: Record<string, string>;
  providerMetadata?: Record<string, unknown>;
}): AppcircleCredential {
  const secret = readRequiredString(
    requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message)),
    "apiKey",
  );
  const name = readRequiredString(
    input.apiKeyName ?? input.values?.apiKeyName ?? input.providerMetadata?.apiKeyName,
    "apiKeyName",
  );
  const organizationId = readOptionalString(
    input.organizationId ?? input.values?.organizationId ?? input.providerMetadata?.organizationId,
  );
  return { secret, name, organizationId };
}

function normalizeOrganizationList(payload: unknown) {
  const root = requireObject(payload, "Appcircle organization response must be an object");
  const organizations = requireObjectArray(root.data, "Appcircle organization response is missing data");
  return {
    organizations,
    page: readNullableInteger(root.page),
    perPage: readNullableInteger(root.perPage),
    total: readNullableInteger(root.total),
  };
}

function normalizeProfileList(payload: unknown) {
  if (Array.isArray(payload)) {
    return {
      profiles: requireObjectArray(payload, "Appcircle profile response contains invalid data"),
      page: null,
      size: null,
      totalCount: null,
    };
  }
  const root = requireObject(payload, "Appcircle profile response must be an object or array");
  const nestedData = optionalRecord(root.data);
  const profilesValue =
    (Array.isArray(root.profiles) ? root.profiles : undefined) ??
    (Array.isArray(root.data) ? root.data : undefined) ??
    (Array.isArray(root.items) ? root.items : undefined) ??
    (Array.isArray(nestedData?.profiles) ? nestedData.profiles : undefined) ??
    (Array.isArray(nestedData?.data) ? nestedData.data : undefined);
  const profiles = requireObjectArray(profilesValue, "Appcircle profile response is missing a profile array");
  return {
    profiles,
    page: readNullableInteger(root.page ?? nestedData?.page),
    size: readNullableInteger(root.size ?? root.perPage ?? nestedData?.size),
    totalCount: readNullableInteger(root.totalCount ?? root.total ?? nestedData?.totalCount ?? nestedData?.total),
  };
}

async function readAppcirclePayload(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function mapAppcircleError(status: number, payload: unknown, phase: AppcirclePhase) {
  const message = extractAppcircleErrorMessage(payload) ?? `Appcircle request failed (${status})`;
  if (status === 400) {
    return new ProviderRequestError(400, message);
  }
  if (status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message);
  }
  if (status === 403) {
    return new ProviderRequestError(403, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message);
}

function extractAppcircleErrorMessage(payload: unknown) {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }
  const object = optionalRecord(payload);
  return readOptionalString(object?.message ?? object?.error_description ?? object?.error ?? object?.detail);
}

function requireObject(value: unknown, message: string) {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, message);
  }
  return object;
}

function requireObjectArray(value: unknown, message: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, message);
  }
  return value.map((item) => requireObject(item, message));
}

function readRequiredString(value: unknown, fieldName: string) {
  const result = readOptionalString(value);
  if (!result) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return result;
}

function readOptionalString(value: unknown) {
  return optionalString(value)?.trim() || undefined;
}

function readOptionalPositiveInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function readNullableInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

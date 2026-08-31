import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, looseArray, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const paradymApiBaseUrl = "https://api.paradym.id";

type ParadymRequestMode = "validate" | "execute";
type ParadymActionContext = ApiKeyProviderContext;
type ParadymActionHandler = (input: Record<string, unknown>, context: ParadymActionContext) => Promise<unknown>;

export const paradymActionHandlers: ProviderActionHandlers<"paradym", ParadymActionHandler> = {
  list_projects(input, context) {
    return listProjects(input, context);
  },
  create_openid4vc_credential_offer(input, context) {
    return createOpenid4vcCredentialOffer(input, context);
  },
  get_openid4vc_issuance_session(input, context) {
    return getOpenid4vcIssuanceSession(input, context);
  },
  list_openid4vc_issuance_sessions(input, context) {
    return listOpenid4vcIssuanceSessions(input, context);
  },
  create_openid4vc_verification_request(input, context) {
    return createOpenid4vcVerificationRequest(input, context);
  },
  get_openid4vc_verification_session(input, context) {
    return getOpenid4vcVerificationSession(input, context);
  },
  list_openid4vc_verification_sessions(input, context) {
    return listOpenid4vcVerificationSessions(input, context);
  },
  list_sd_jwt_vc_credential_templates(input, context) {
    return listSdJwtVcCredentialTemplates(input, context);
  },
  list_mdoc_credential_templates(input, context) {
    return listMdocCredentialTemplates(input, context);
  },
  list_presentation_templates(input, context) {
    return listPresentationTemplates(input, context);
  },
  list_issued_credentials(input, context) {
    return listIssuedCredentials(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("paradym", paradymActionHandlers);

export async function validateParadymCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const result = await listProjects({}, { apiKey, fetcher }, "validate");
  const firstProject = result.projects[0];

  return {
    profile: {
      accountId: firstProject?.id ?? "paradym-api-key",
      displayName: firstProject?.name ? `Paradym ${firstProject.name}` : "Paradym API Key",
      grantedScopes: [],
    },
    metadata: compactObject({
      apiBaseUrl: paradymApiBaseUrl,
      validationEndpoint: "/v1/projects",
      projectCount: result.projects.length,
      firstProjectId: firstProject?.id,
      firstProjectName: firstProject?.name ?? undefined,
    }),
  };
}

async function listProjects(
  _input: Record<string, unknown>,
  context: ParadymActionContext,
  mode: ParadymRequestMode = "execute",
) {
  const payload = await requestParadymJson({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode,
    path: "/v1/projects",
  });
  const body = requireObjectPayload(payload, "Paradym projects response");
  const projects = readArrayField(readListField(body, "projects", "data"), "projects").map(normalizeProject);

  return {
    projects,
    raw: body,
  };
}

async function createOpenid4vcCredentialOffer(input: Record<string, unknown>, context: ParadymActionContext) {
  const projectId = requireString(input.projectId, "projectId");
  const payload = await requestParadymJson({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    method: "POST",
    path: `/v1/projects/${encodeURIComponent(projectId)}/openid4vc/issuance/offer`,
    body: {
      credentials: input.credentials,
    },
  });
  const offer = requireObjectPayload(payload, "Paradym credential offer response");

  return {
    offer: normalizeOffer(offer),
    raw: offer,
  };
}

async function getOpenid4vcIssuanceSession(input: Record<string, unknown>, context: ParadymActionContext) {
  const projectId = requireString(input.projectId, "projectId");
  const issuanceId = requireString(input.openId4VcIssuanceId, "openId4VcIssuanceId");
  const payload = await requestParadymJson({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    path: `/v1/projects/${encodeURIComponent(projectId)}/openid4vc/issuance/${encodeURIComponent(issuanceId)}`,
  });
  const issuance = requireObjectPayload(payload, "Paradym issuance session response");

  return {
    issuance: normalizeIssuanceSession(issuance),
    raw: issuance,
  };
}

async function listOpenid4vcIssuanceSessions(input: Record<string, unknown>, context: ParadymActionContext) {
  const projectId = requireString(input.projectId, "projectId");
  const payload = await requestParadymJson({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    path: `/v1/projects/${encodeURIComponent(projectId)}/openid4vc/issuance`,
    query: buildCursorQuery(input, ["filterStatus"]),
  });
  const body = requireObjectPayload(payload, "Paradym issuance session list response");
  const issuances = readArrayField(readListField(body, "issuances", "sessions", "data"), "issuances").map(
    normalizeIssuanceSession,
  );

  return {
    issuances,
    pagination: readPagination(body),
    raw: body,
  };
}

async function createOpenid4vcVerificationRequest(input: Record<string, unknown>, context: ParadymActionContext) {
  const projectId = requireString(input.projectId, "projectId");
  const payload = await requestParadymJson({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    method: "POST",
    path: `/v1/projects/${encodeURIComponent(projectId)}/openid4vc/verification/request`,
    body: compactObject({
      presentationTemplateId: input.presentationTemplateId,
      requireResponseEncryption: input.requireResponseEncryption,
    }),
  });
  const verification = requireObjectPayload(payload, "Paradym verification request response");

  return {
    verification: normalizeVerificationSession(verification),
    raw: verification,
  };
}

async function getOpenid4vcVerificationSession(input: Record<string, unknown>, context: ParadymActionContext) {
  const projectId = requireString(input.projectId, "projectId");
  const verificationId = requireString(input.openId4VcVerificationId, "openId4VcVerificationId");
  const payload = await requestParadymJson({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    path: `/v1/projects/${encodeURIComponent(projectId)}/openid4vc/verification/${encodeURIComponent(verificationId)}`,
  });
  const verification = requireObjectPayload(payload, "Paradym verification session response");

  return {
    verification: normalizeVerificationSession(verification),
    raw: verification,
  };
}

async function listOpenid4vcVerificationSessions(input: Record<string, unknown>, context: ParadymActionContext) {
  const projectId = requireString(input.projectId, "projectId");
  const payload = await requestParadymJson({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    path: `/v1/projects/${encodeURIComponent(projectId)}/openid4vc/verification`,
    query: buildCursorQuery(input, ["filterStatus", "filterPresentationTemplateId"]),
  });
  const body = requireObjectPayload(payload, "Paradym verification session list response");
  const verifications = readArrayField(readListField(body, "verifications", "sessions", "data"), "verifications").map(
    normalizeVerificationSession,
  );

  return {
    verifications,
    pagination: readPagination(body),
    raw: body,
  };
}

async function listSdJwtVcCredentialTemplates(input: Record<string, unknown>, context: ParadymActionContext) {
  return listTemplates(input, context, "templates/credentials/sd-jwt-vc");
}

async function listMdocCredentialTemplates(input: Record<string, unknown>, context: ParadymActionContext) {
  return listTemplates(input, context, "templates/credentials/mdoc");
}

async function listTemplates(input: Record<string, unknown>, context: ParadymActionContext, pathSegment: string) {
  const projectId = requireString(input.projectId, "projectId");
  const payload = await requestParadymJson({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    path: `/v1/projects/${encodeURIComponent(projectId)}/${pathSegment}`,
    query: buildCursorQuery(input, ["filterType", "searchName", "filterArchived", "filterRevocable"]),
  });
  const body = requireObjectPayload(payload, "Paradym template list response");

  return {
    templates: readArrayField(readListField(body, "templates", "data"), "templates"),
    pagination: readPagination(body),
    raw: body,
  };
}

async function listPresentationTemplates(input: Record<string, unknown>, context: ParadymActionContext) {
  const projectId = requireString(input.projectId, "projectId");
  const payload = await requestParadymJson({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    path: `/v1/projects/${encodeURIComponent(projectId)}/templates/presentations`,
    query: buildCursorQuery(input, ["searchName"]),
  });
  const body = requireObjectPayload(payload, "Paradym presentation template list response");

  return {
    templates: readArrayField(readListField(body, "templates", "data"), "templates"),
    pagination: readPagination(body),
    raw: body,
  };
}

async function listIssuedCredentials(input: Record<string, unknown>, context: ParadymActionContext) {
  const projectId = requireString(input.projectId, "projectId");
  const payload = await requestParadymJson({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    path: `/v1/projects/${encodeURIComponent(projectId)}/issuance`,
    query: buildCursorQuery(input, ["filterStatus", "filterFormat", "filterCredentialTemplateId", "filterExchange"]),
  });
  const body = requireObjectPayload(payload, "Paradym issued credential list response");

  return {
    credentials: readArrayField(readListField(body, "credentials", "data"), "credentials"),
    pagination: readPagination(body),
    raw: body,
  };
}

async function requestParadymJson(input: {
  apiKey: string;
  fetcher: typeof fetch;
  mode: ParadymRequestMode;
  path: string;
  method?: "GET" | "POST";
  query?: Record<string, unknown>;
  body?: unknown;
}) {
  const url = new URL(`${paradymApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const headers = {
    accept: "application/json",
    "content-type": "application/json",
    "user-agent": providerUserAgent,
    "X-Access-Token": input.apiKey,
  };

  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `Paradym ${input.mode} request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const payload = await readResponsePayload(response);
  if (!response.ok) {
    throw mapParadymError(response.status, payload, input.mode);
  }

  return unwrapParadymData(payload);
}

async function readResponsePayload(response: Response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function unwrapParadymData(payload: unknown) {
  const object = optionalRecord(payload);
  if (object && "data" in object && Object.keys(object).some((key) => key === "successful")) {
    return object.data;
  }
  return payload;
}

function mapParadymError(status: number, payload: unknown, mode: ParadymRequestMode) {
  const message = readErrorMessage(payload) ?? `Paradym API request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return mode === "validate" ? new ProviderRequestError(400, message) : new ProviderRequestError(401, message);
  }

  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message);
  }

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }

  return new ProviderRequestError(502, message);
}

function readErrorMessage(payload: unknown) {
  const body = optionalRecord(payload);
  if (!body) {
    return undefined;
  }

  const nestedError = optionalRecord(body.error);
  const firstJsonApiError = Array.isArray(body.errors) ? optionalRecord(body.errors[0]) : undefined;
  return (
    optionalString(firstJsonApiError?.detail) ??
    optionalString(firstJsonApiError?.message) ??
    optionalString(firstJsonApiError?.title) ??
    optionalString(body.message) ??
    optionalString(body.error) ??
    optionalString(nestedError?.message) ??
    optionalString(body.detail)
  );
}

function normalizeProject(value: unknown) {
  const project = requireObjectPayload(value, "Paradym project");
  return {
    id: requireString(project.id, "id"),
    name: asNullableString(project.name),
    description: asNullableString(project.description),
    tags: Array.isArray(project.tags) ? project.tags.map(String) : [],
    createdAt: asNullableString(project.createdAt),
    updatedAt: asNullableString(project.updatedAt),
    raw: project,
  };
}

function normalizeOffer(value: Record<string, unknown>) {
  const credentials = looseArray(value.credentials).map(normalizeCredential);
  return {
    id: requireString(value.id, "id"),
    status: asNullableString(value.status),
    offerUri: asNullableString(value.offerUri),
    offerQrUri: asNullableString(value.offerQrUri),
    credentialCount: credentials.length,
    createdAt: asNullableString(value.createdAt),
    updatedAt: asNullableString(value.updatedAt),
    expiresAt: asNullableString(value.expiresAt),
    error: asNullableObject(value.error),
    credentials,
    raw: value,
  };
}

function normalizeIssuanceSession(value: unknown) {
  const session = requireObjectPayload(value, "Paradym issuance session");
  return {
    id: requireString(session.id, "id"),
    status: optionalString(session.status) ?? "",
    offerUri: optionalString(session.offerUri) ?? "",
    offerQrUri: optionalString(session.offerQrUri) ?? "",
    credentials: looseArray(session.credentials).map(normalizeCredential),
    createdAt: asNullableString(session.createdAt),
    updatedAt: asNullableString(session.updatedAt),
    expiresAt: asNullableString(session.expiresAt),
    error: asNullableObject(session.error),
    raw: session,
  };
}

function normalizeVerificationSession(value: unknown) {
  const session = requireObjectPayload(value, "Paradym verification session");
  return {
    id: requireString(session.id, "id"),
    status: optionalString(session.status) ?? "",
    presentationTemplateId: optionalString(session.presentationTemplateId) ?? "",
    authorizationRequestUri: optionalString(session.authorizationRequestUri) ?? "",
    authorizationRequestQrUri: optionalString(session.authorizationRequestQrUri) ?? "",
    credentials: looseArray(session.credentials),
    createdAt: asNullableString(session.createdAt),
    updatedAt: asNullableString(session.updatedAt),
    expiresAt: asNullableString(session.expiresAt),
    error: asNullableObject(session.error),
    raw: session,
  };
}

function normalizeCredential(value: unknown) {
  const credential = requireObjectPayload(value, "Paradym credential");
  return {
    id: optionalString(credential.id) ?? "",
    status: optionalString(credential.status) ?? "",
    credentialTemplateId: optionalString(credential.credentialTemplateId) ?? "",
    format: optionalString(credential.format) ?? "",
    exchange: optionalString(credential.exchange) ?? "",
    revocable: typeof credential.revocable === "boolean" ? credential.revocable : false,
    raw: credential,
  };
}

function buildCursorQuery(input: Record<string, unknown>, extraKeys: string[]) {
  const extras = Object.fromEntries(extraKeys.map((key) => [mapParadymQueryKey(key), input[key]]));
  return compactObject({
    sort: input.sort,
    "filter[id]": input.filterId,
    "page[size]": input.pageSize,
    "page[after]": input.pageAfter,
    "page[before]": input.pageBefore,
    ...extras,
  });
}

function mapParadymQueryKey(key: string) {
  switch (key) {
    case "filterStatus":
      return "filter[status]";
    case "filterFormat":
      return "filter[format]";
    case "filterCredentialTemplateId":
      return "filter[credentialTemplateId]";
    case "filterExchange":
      return "filter[exchange]";
    case "filterPresentationTemplateId":
      return "filter[presentationTemplateId]";
    case "filterType":
      return "filter[type]";
    case "searchName":
      return "search[name]";
    case "filterArchived":
      return "filter[archived]";
    case "filterRevocable":
      return "filter[revocable]";
    default:
      return key;
  }
}

function readListField(body: Record<string, unknown>, ...fieldNames: string[]) {
  for (const fieldName of fieldNames) {
    const value = body[fieldName];
    if (value === undefined) {
      continue;
    }
    if (!Array.isArray(value)) {
      throw new ProviderRequestError(502, `Paradym response field ${fieldName} was not an array`);
    }
    return value;
  }

  throw new ProviderRequestError(502, `Paradym response missing one of: ${fieldNames.join(", ")}`);
}

function readPagination(body: Record<string, unknown>) {
  return asNullableObject(body.pagination ?? body.page ?? body.meta);
}

function readArrayField(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Paradym response missing ${fieldName} array`);
  }
  return value;
}

function requireObjectPayload(value: unknown, fieldName: string) {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `${fieldName} was not an object`);
  }
  return object;
}

function requireString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(502, `Paradym response missing ${fieldName}`);
  }
  return value;
}

function asNullableString(value: unknown) {
  return value === null || value === undefined ? null : (optionalString(value) ?? null);
}

function asNullableObject(value: unknown) {
  return value === null || value === undefined ? null : requireObjectPayload(value, "Paradym object");
}

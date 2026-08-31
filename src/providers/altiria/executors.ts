import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  createProviderFetch,
  createProviderTimeout,
  defineProviderExecutors,
  defineProviderProxy,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
  requireCustomCredential,
} from "../provider-runtime.ts";

const service = "altiria";
const altiriaRequestTimeoutMs = 30_000;
const altiriaMaxResponseBytes = 10 * 1024 * 1024;
const altiriaRestPath = "/api/rest";

interface AltiriaCredentialContext {
  username: string;
  apiPassword: string;
  dashboardHost: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface AltiriaRequestInput extends AltiriaCredentialContext {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  query?: Array<[string, string | number | undefined]>;
  body?: Record<string, unknown>;
  phase: "validate" | "execute";
}

type AltiriaActionHandler = (input: Record<string, unknown>, context: AltiriaCredentialContext) => Promise<unknown>;

interface AltiriaWrappedPayload {
  data?: unknown;
  meta?: unknown;
  error?: unknown;
}

export const altiriaActionHandlers: ProviderActionHandlers<"altiria", AltiriaActionHandler> = {
  send_sms(input, context) {
    return sendAltiriaSms(input, context);
  },
  get_sms(input, context) {
    return getAltiriaSms(input, context);
  },
  list_contacts(input, context) {
    return listAltiriaContacts(input, context);
  },
  get_contact(input, context) {
    return getAltiriaContact(input, context);
  },
  create_contact(input, context) {
    return createAltiriaContact(input, context);
  },
  update_contact(input, context) {
    return updateAltiriaContact(input, context);
  },
  delete_contact(input, context) {
    return deleteAltiriaContact(input, context);
  },
  list_groups(input, context) {
    return listAltiriaGroups(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<AltiriaCredentialContext>({
  service,
  handlers: altiriaActionHandlers,
  async createContext(context: ExecutionContext, fetcher): Promise<AltiriaCredentialContext> {
    const credential = await requireCustomCredential(context, service);
    return {
      ...resolveAltiriaCredential(credential.values),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireCustomCredential(context, service);
    return `${normalizeAltiriaDashboardHost(credential.values.dashboardHost)}${altiriaRestPath}`;
  },
  auth: { type: "none" },
  async customizeRequest({ context, headers }) {
    const credential = await requireCustomCredential(context, service);
    const resolved = resolveAltiriaCredential(credential.values);
    headers.set("authorization", basicAuthorization(resolved.username, resolved.apiPassword));
  },
});

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }) {
    const credential = resolveAltiriaCredential(input.values);
    await requestAltiria({
      ...credential,
      path: "/groups",
      query: [["limit", 1]],
      phase: "validate",
      fetcher,
      signal,
    });
    const url = new URL(credential.dashboardHost);
    const usernameHash = createHash("sha256").update(credential.username).digest("hex").slice(0, 16);
    return {
      profile: {
        accountId: `altiria:${url.host}:${usernameHash}`,
        displayName: `${credential.username} (${url.hostname})`,
      },
      grantedScopes: [],
      metadata: {
        dashboardHost: credential.dashboardHost,
        validationEndpoint: "/groups",
      },
    };
  },
};

async function sendAltiriaSms(input: Record<string, unknown>, context: AltiriaCredentialContext) {
  validateSendSmsRelations(input);
  const payload = await requestAltiria({
    ...context,
    method: "POST",
    path: "/sms",
    body: compactObject({
      to: trimStringArray(input.to),
      from: trimOptionalString(input.from),
      message: trimOptionalString(input.message),
      notificationUrl: input.notificationUrl,
      campaignName: trimOptionalString(input.campaignName),
      tags: trimStringArray(input.tags),
      certified: input.certified,
      splitParts: input.splitParts,
      flash: input.flash,
      sub: input.sub,
    }),
    phase: "execute",
  });
  const wrapped = asAltiriaWrappedPayload(payload);
  return {
    accepted: true,
    messages: readDataArray(wrapped).map(normalizeSms),
    raw: payload,
  };
}

async function getAltiriaSms(input: Record<string, unknown>, context: AltiriaCredentialContext) {
  const payload = await requestAltiria({
    ...context,
    path: `/sms/${encodeURIComponent(requireString(input.id, "id"))}`,
    phase: "execute",
  });
  const wrapped = asAltiriaWrappedPayload(payload);
  return {
    messages: readDataArray(wrapped).map(normalizeSms),
    raw: payload,
  };
}

async function listAltiriaContacts(input: Record<string, unknown>, context: AltiriaCredentialContext) {
  const payload = await requestAltiria({
    ...context,
    path: "/contacts",
    query: [
      ["limit", optionalInteger(input.limit)],
      ["page", optionalInteger(input.page)],
      ["include", normalizeInclude(input.include)],
    ],
    phase: "execute",
  });
  const wrapped = asAltiriaWrappedPayload(payload);
  return {
    contacts: readDataArray(wrapped).map(normalizeContact),
    meta: optionalRecord(wrapped.meta) ?? null,
    raw: payload,
  };
}

async function getAltiriaContact(input: Record<string, unknown>, context: AltiriaCredentialContext) {
  const payload = await requestAltiria({
    ...context,
    path: `/contacts/${encodeURIComponent(String(requireInteger(input.id, "id")))}`,
    query: [["include", normalizeInclude(input.include)]],
    phase: "execute",
  });
  const wrapped = asAltiriaWrappedPayload(payload);
  return {
    contact: normalizeContact(readDataObject(wrapped)),
    raw: payload,
  };
}

async function createAltiriaContact(input: Record<string, unknown>, context: AltiriaCredentialContext) {
  const payload = await requestAltiria({
    ...context,
    method: "POST",
    path: "/contacts",
    body: buildContactWriteBody(input),
    phase: "execute",
  });
  const wrapped = asAltiriaWrappedPayload(payload);
  return {
    contact: normalizeContact(readDataObject(wrapped)),
    raw: payload,
  };
}

async function updateAltiriaContact(input: Record<string, unknown>, context: AltiriaCredentialContext) {
  const payload = await requestAltiria({
    ...context,
    method: "PUT",
    path: `/contacts/${encodeURIComponent(String(requireInteger(input.id, "id")))}`,
    body: buildContactWriteBody(input),
    phase: "execute",
  });
  const wrapped = asAltiriaWrappedPayload(payload);
  return {
    contact: normalizeContact(readDataObject(wrapped)),
    raw: payload,
  };
}

async function deleteAltiriaContact(input: Record<string, unknown>, context: AltiriaCredentialContext) {
  await requestAltiria({
    ...context,
    method: "DELETE",
    path: `/contacts/${encodeURIComponent(String(requireInteger(input.id, "id")))}`,
    phase: "execute",
  });
  return { deleted: true };
}

async function listAltiriaGroups(input: Record<string, unknown>, context: AltiriaCredentialContext) {
  const payload = await requestAltiria({
    ...context,
    path: "/groups",
    query: [
      ["limit", optionalInteger(input.limit)],
      ["page", optionalInteger(input.page)],
    ],
    phase: "execute",
  });
  const wrapped = asAltiriaWrappedPayload(payload);
  return {
    groups: readDataArray(wrapped).map(normalizeGroup),
    meta: optionalRecord(wrapped.meta) ?? null,
    raw: payload,
  };
}

function resolveAltiriaCredential(input: Record<string, unknown>) {
  return {
    username: requireString(input.username, "username"),
    apiPassword: requireString(input.apiPassword, "apiPassword"),
    dashboardHost: normalizeAltiriaDashboardHost(input.dashboardHost),
  };
}

function normalizeAltiriaDashboardHost(value: unknown) {
  const rawValue = requireString(value, "dashboardHost");
  const url = assertPublicHttpUrl(rawValue, {
    fieldName: "dashboardHost",
    createError: providerInputError,
  });
  if (url.protocol !== "https:") {
    throw providerInputError("dashboardHost must use HTTPS");
  }
  if (url.username || url.password) {
    throw providerInputError("dashboardHost must not include credentials");
  }

  url.hash = "";
  url.search = "";
  url.pathname = "";
  const normalized = url.toString();
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

async function requestAltiria(input: AltiriaRequestInput) {
  const url = new URL(`${input.dashboardHost}${altiriaRestPath}${input.path}`);
  for (const [key, value] of input.query ?? []) {
    if (value != null) {
      url.searchParams.set(key, String(value));
    }
  }

  const timeout = createProviderTimeout(input.signal, altiriaRequestTimeoutMs);
  const fetcher = createProviderFetch({ fetch: input.fetcher });

  try {
    const response = await fetcher(url, {
      method: input.method ?? (input.body ? "POST" : "GET"),
      headers: {
        accept: "application/json",
        authorization: basicAuthorization(input.username, input.apiPassword),
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
      signal: timeout.signal,
    });

    if (response.status === 204) {
      return {};
    }

    const payload = await readAltiriaPayload(response);
    if (response.ok) {
      return payload;
    }

    throw createAltiriaHttpError(response.status, payload, input.phase);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Altiria request timed out");
    }

    const message =
      error instanceof Error && error.message.trim()
        ? `Altiria request failed: ${error.message}`
        : "Altiria request failed";
    throw new ProviderRequestError(502, message);
  } finally {
    timeout.cleanup();
  }
}

async function readAltiriaPayload(response: Response): Promise<unknown> {
  const text = await readProviderTextBody(response, "Altiria response", altiriaMaxResponseBytes);

  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Altiria returned invalid JSON");
  }
}

function createAltiriaHttpError(status: number, payload: unknown, phase: "validate" | "execute") {
  const message = readAltiriaErrorMessage(payload) ?? `Altiria request failed with ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message);
}

function readAltiriaErrorMessage(payload: unknown) {
  const object = optionalRecord(payload);
  const error = optionalRecord(object?.error);
  return (
    optionalString(error?.description) ??
    optionalString(error?.message) ??
    optionalString(object?.message) ??
    optionalString(object?.raw)
  );
}

function buildContactWriteBody(input: Record<string, unknown>) {
  if (input.email === undefined && input.phone === undefined && input.landline === undefined) {
    throw providerInputError("email, phone, or landline is required");
  }
  if ((input.phone !== undefined || input.landline !== undefined) && input.countryIso === undefined) {
    throw providerInputError("countryIso is required when phone or landline is specified");
  }
  if (input.groupsIds === undefined && input.groupsNames === undefined) {
    throw providerInputError("groupsIds or groupsNames is required");
  }

  return compactObject({
    email: input.email,
    phone: trimOptionalString(input.phone),
    landline: trimOptionalString(input.landline),
    countryIso: input.countryIso,
    groupsIds: input.groupsIds,
    groupsNames: trimStringArray(input.groupsNames),
    name: trimOptionalString(input.name),
    surname: trimOptionalString(input.surname),
    customFields: normalizeCustomFields(input.customFields),
  });
}

function normalizeInclude(value: unknown) {
  return Array.isArray(value) ? value.join(",") : undefined;
}

function asAltiriaWrappedPayload(payload: unknown): AltiriaWrappedPayload {
  return optionalRecord(payload) ?? {};
}

function readDataArray(payload: AltiriaWrappedPayload) {
  return Array.isArray(payload.data) ? payload.data : [];
}

function readDataObject(payload: AltiriaWrappedPayload) {
  return optionalRecord(payload.data) ?? {};
}

function normalizeSms(value: unknown) {
  const payload = optionalRecord(value) ?? {};
  return {
    id: optionalString(payload.id) ?? null,
    from: optionalString(payload.from) ?? null,
    to: optionalString(payload.to) ?? null,
    message: optionalString(payload.message) ?? null,
    campaignId: optionalInteger(payload.campaignId) ?? null,
    sendingId: optionalInteger(payload.sendingId) ?? null,
    isDelivered: optionalBoolean(payload.isDelivered) ?? null,
    isClicked: optionalBoolean(payload.isClicked) ?? null,
    raw: payload,
  };
}

function normalizeContact(value: unknown) {
  const payload = optionalRecord(value) ?? {};
  return {
    id: optionalInteger(payload.id) ?? null,
    email: optionalString(payload.email) ?? null,
    phone: optionalString(payload.phone) ?? null,
    landline: optionalString(payload.landline) ?? null,
    countryIso: optionalString(payload.countryIso) ?? null,
    name: optionalString(payload.name) ?? null,
    surname: optionalString(payload.surname) ?? null,
    createdAt: optionalString(payload.createdAt) ?? null,
    updatedAt: optionalString(payload.updatedAt) ?? null,
    raw: payload,
  };
}

function normalizeGroup(value: unknown) {
  const payload = optionalRecord(value) ?? {};
  return {
    id: optionalInteger(payload.id) ?? null,
    name: optionalString(payload.name) ?? null,
    raw: payload,
  };
}

function requireString(value: unknown, name: string) {
  const resolved = optionalString(value)?.trim();
  if (!resolved) {
    throw providerInputError(`${name} is required`);
  }
  return resolved;
}

function requireInteger(value: unknown, name: string) {
  const resolved = optionalInteger(value);
  if (resolved == null) {
    throw providerInputError(`${name} is required`);
  }
  return resolved;
}

function validateSendSmsRelations(input: Record<string, unknown>): void {
  const recipients = Array.isArray(input.to) ? input.to : [];
  if (input.tags !== undefined && input.campaignName === undefined) {
    throw providerInputError("campaignName is required when tags is specified");
  }
  if (Array.isArray(input.notificationUrl) && input.notificationUrl.length !== recipients.length) {
    throw providerInputError("notificationUrl must contain one URL per recipient");
  }
  if (Array.isArray(input.sub) && input.sub.length !== recipients.length) {
    throw providerInputError("sub must contain one object per recipient");
  }
}

function trimOptionalString(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

function trimStringArray(value: unknown): unknown {
  return Array.isArray(value) ? value.map(trimOptionalString) : value;
}

function normalizeCustomFields(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }
  return value.map((entry) => {
    const field = optionalRecord(entry);
    if (!field) {
      return entry;
    }
    return compactObject({
      ...field,
      key: trimOptionalString(field.key),
      value: trimOptionalString(field.value),
    });
  });
}

function basicAuthorization(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}
